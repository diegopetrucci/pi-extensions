#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzipPayloadEqual } from './gzip-payload.mjs';

export { gzipPayloadEqual } from './gzip-payload.mjs';

const execFileAsync = promisify(execFile);
export const PUBLIC_REGISTRY = 'https://registry.npmjs.org';
export const TRUSTED_REPOSITORY = 'diegopetrucci/pi-extensions';
export const TRUSTED_WORKFLOW = 'publish.yml';
export const TRUSTED_ENVIRONMENT = 'npm-release';
const DEPENDENCY_SECTIONS = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'];
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const RELEASE_VERSION_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function compareByCodePoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function defaultRun(file, args, options = {}) {
  try {
    const result = await execFileAsync(file, args, {
      cwd: options.cwd,
      input: options.input,
      encoding: 'utf8',
      env: options.replaceEnv ? options.env : { ...process.env, ...options.env },
      maxBuffer: 20 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error) };
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function findRoot(start) {
  let current = path.resolve(start);
  while (true) {
    const manifestPath = path.join(current, 'package.json');
    if (await exists(manifestPath)) {
      const manifest = await readJson(manifestPath);
      if (manifest.workspaces) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Could not find a workspace root from ${start}`);
    current = parent;
  }
}

async function findFilesNamed(base, target) {
  const matches = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const child = path.join(base, entry.name);
    if (entry.isDirectory()) matches.push(...(await findFilesNamed(child, target)));
    else if (entry.name === target) matches.push(child);
  }
  return matches;
}

function releaseVersion(version) {
  return version.slice(1);
}

function normalizeReleaseBody(value) {
  return value.replaceAll('\r\n', '\n').replace(/\n$/, '');
}

function hasLegacyNpmCredential(name) {
  const normalized = name.toLowerCase();
  if (['node_auth_token', 'npm_token', 'npm_auth_token', 'npm_config_otp', '_auth', '_authtoken'].includes(normalized)) return true;
  return normalized.startsWith('npm_config_') && /(auth|token|otp|password|username)/.test(normalized);
}

function assertNoLegacyNpmCredentials(env) {
  const names = Object.keys(env).filter((name) => env[name] && hasLegacyNpmCredential(name));
  if (names.length > 0) throw new Error(`GitHub OIDC publishing refuses legacy npm credential variables: ${names.sort().join(', ')}`);
}

function isolatedNpmEnvironment(env, userConfig, globalConfig) {
  const clean = { ...env };
  for (const name of Object.keys(clean)) {
    if (hasLegacyNpmCredential(name) || ['npm_config_userconfig', 'npm_config_globalconfig'].includes(name.toLowerCase())) delete clean[name];
  }
  clean.NPM_CONFIG_USERCONFIG = userConfig;
  clean.NPM_CONFIG_GLOBALCONFIG = globalConfig;
  return clean;
}

function workspacePatterns(manifest) {
  if (Array.isArray(manifest.workspaces)) return manifest.workspaces;
  if (Array.isArray(manifest.workspaces?.packages)) return manifest.workspaces.packages;
  return [];
}

async function walkDirectories(base) {
  const result = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git') continue;
    const child = path.join(base, entry.name);
    result.push(child, ...(await walkDirectories(child)));
  }
  return result;
}

function globRegex(pattern) {
  const escaped = pattern.replaceAll('\\', '/').replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\u0000').replaceAll('*', '[^/]*').replaceAll('\u0000', '.*');
  return new RegExp(`^${escaped.replace(/\/$/, '')}$`);
}

export async function discoverPackages(root) {
  const rootManifest = await readJson(path.join(root, 'package.json'));
  const directories = await walkDirectories(root);
  const matches = [];
  for (const pattern of workspacePatterns(rootManifest)) {
    const regex = globRegex(pattern);
    for (const directory of directories) {
      const relative = path.relative(root, directory).split(path.sep).join('/');
      if (!regex.test(relative) || !(await exists(path.join(directory, 'package.json')))) continue;
      matches.push(directory);
    }
  }
  const packages = [{ name: rootManifest.name, root, relative: '.', manifest: rootManifest, umbrella: true }];
  for (const directory of [...new Set(matches)].sort()) {
    const manifest = await readJson(path.join(directory, 'package.json'));
    if (!manifest.name || !manifest.version) throw new Error(`${path.relative(root, directory)}/package.json needs name and version`);
    packages.push({ name: manifest.name, root: directory, relative: path.relative(root, directory).split(path.sep).join('/'), manifest, umbrella: false });
  }
  return packages;
}

function parseEvidence(content, filePath) {
  const match = content.match(/<!-- prepare-release:packages (\[[^\n]*\]) -->/);
  if (!match) throw new Error(`Release document lacks managed package evidence: ${filePath}`);
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    throw new Error(`Release document has malformed managed package evidence: ${filePath}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`Release document has empty managed package evidence: ${filePath}`);
  const seen = new Set();
  return parsed.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error(`Release document evidence entry ${index + 1} is invalid: ${filePath}`);
    const [name, version] = entry;
    if (typeof name !== 'string' || name.length === 0 || typeof version !== 'string' || !EXACT_VERSION_RE.test(version)) {
      throw new Error(`Release document evidence entry ${index + 1} is invalid: ${filePath}`);
    }
    if (seen.has(name)) throw new Error(`Release document evidence repeats ${name}: ${filePath}`);
    seen.add(name);
    return { name, version };
  });
}

function evidenceOrder(packagesByName, evidence) {
  return evidence.map(({ name }) => {
    const pkg = packagesByName.get(name);
    if (!pkg) throw new Error(`Release evidence references an unknown package: ${name}`);
    return pkg;
  });
}

function releaseOrder(selected) {
  const selectedNames = new Set(selected.map((pkg) => pkg.name));
  const outgoing = new Map(selected.map((pkg) => [pkg.name, new Set()]));
  const indegree = new Map(selected.map((pkg) => [pkg.name, 0]));
  for (const pkg of selected) {
    const internalDependencies = new Set(
      DEPENDENCY_SECTIONS.flatMap((section) => Object.keys(pkg.manifest[section] ?? {}))
        .filter((dependency) => selectedNames.has(dependency)),
    );
    for (const dependency of internalDependencies) {
      outgoing.get(dependency).add(pkg.name);
      indegree.set(pkg.name, indegree.get(pkg.name) + 1);
    }
  }
  const ordered = [];
  while (ordered.length < selected.length) {
    const available = selected.filter((pkg) => !ordered.includes(pkg) && indegree.get(pkg.name) === 0 && !pkg.umbrella)
      .sort((a, b) => compareByCodePoint(a.name, b.name));
    if (available.length === 0) {
      const umbrella = selected.find((pkg) => pkg.umbrella && !ordered.includes(pkg) && indegree.get(pkg.name) === 0);
      if (!umbrella) throw new Error('Internal package dependency cycle detected');
      available.push(umbrella);
    }
    for (const pkg of available) {
      ordered.push(pkg);
      for (const dependent of outgoing.get(pkg.name) ?? []) indegree.set(dependent, indegree.get(dependent) - 1);
    }
  }
  const umbrella = ordered.find((pkg) => pkg.umbrella);
  return umbrella ? [...ordered.filter((pkg) => !pkg.umbrella), umbrella] : ordered;
}

function assertEvidenceOrder(selected, evidence) {
  const expected = releaseOrder(selected).map((pkg) => pkg.name);
  const actual = evidence.map(({ name }) => name);
  if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
    throw new Error(`Release evidence has an unsafe publish order. Expected ${expected.join(', ')}`);
  }
  const rootIndex = selected.findIndex((pkg) => pkg.umbrella);
  if (rootIndex !== -1 && rootIndex !== selected.length - 1) throw new Error('Release evidence must publish the root package last when selected');
}

function parsePack(stdout, label) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Invalid npm pack JSON for ${label}`);
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error(`Expected one npm pack result for ${label}`);
  const pack = parsed[0];
  const files = Array.isArray(pack.files)
    ? pack.files.map((file) => ({ path: file.path, size: file.size ?? null, mode: file.mode ?? null })).sort((a, b) => a.path.localeCompare(b.path))
    : [];
  return {
    filename: typeof pack.filename === 'string' ? pack.filename : null,
    shasum: typeof pack.shasum === 'string' ? pack.shasum : null,
    integrity: typeof pack.integrity === 'string' ? pack.integrity : null,
    size: pack.size ?? null,
    unpackedSize: pack.unpackedSize ?? null,
    files,
  };
}

function packEqual(left, right) {
  const comparable = ({ artifactPath: _artifactPath, ...pack }) => pack;
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

async function checked(run, file, args, options, label) {
  const result = await run(file, args, options);
  if (result.code !== 0) throw new Error(`${label} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`);
  return result;
}

async function packArtifact(pkg, run, destination) {
  await mkdir(destination, { recursive: true });
  const result = await checked(
    run,
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', destination, `--registry=${PUBLIC_REGISTRY}`],
    { cwd: pkg.root },
    `local pack for ${pkg.name}`,
  );
  const pack = parsePack(result.stdout, pkg.name);
  if (!pack.filename) throw new Error(`npm pack did not report a filename for ${pkg.name}`);
  const artifactPath = path.join(destination, pack.filename);
  if (!(await exists(artifactPath))) throw new Error(`npm pack did not create the expected artifact for ${pkg.name}: ${artifactPath}`);
  return { ...pack, artifactPath };
}

async function assertCleanPublishablePaths(root, pkg, pack, run) {
  const paths = pack.files.map((file) => path.posix.join(pkg.relative === '.' ? '' : pkg.relative, file.path)).filter(Boolean);
  if (paths.length === 0) throw new Error(`No publishable files detected for ${pkg.name}`);
  const result = await run('git', ['status', '--porcelain', '--', ...paths], { cwd: root });
  if (result.code !== 0) throw new Error(`git status failed while checking publishable paths for ${pkg.name}: ${result.stderr.trim() || result.stdout.trim()}`);
  if (result.stdout.trim()) throw new Error(`Publishable paths are dirty for ${pkg.name}: ${result.stdout.trim()}`);
}

function isExactNotFound(result) {
  if (result.code === 0) return false;
  const stderr = `${result.stderr}\n${result.stdout}`;
  const codes = [...stderr.matchAll(/(?:npm\s+(?:(?:error|ERR!)\s+)?code\s+|["']code["']\s*:\s*["'])(E[0-9A-Z]+)/gim)].map((match) => match[1].toUpperCase());
  const hasOnly404Codes = codes.length > 0 && codes.every((code) => code === 'E404');
  const hasOnlyTargetCodes = codes.length > 0 && codes.every((code) => code === 'ETARGET') && /No matching version found/i.test(stderr);
  return (hasOnly404Codes || hasOnlyTargetCodes) && !/\b(?!404\b)[45]\d\d\b/.test(stderr);
}

function parsePublishedDist(spec, stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`registry dist check for ${spec} returned invalid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`registry dist check for ${spec} returned invalid metadata`);
  }
  if (typeof parsed.shasum !== 'string' || parsed.shasum.length === 0) {
    throw new Error(`registry dist check for ${spec} is missing dist.shasum`);
  }
  if (typeof parsed.integrity !== 'string' || parsed.integrity.length === 0) {
    throw new Error(`registry dist check for ${spec} is missing dist.integrity`);
  }
  return { shasum: parsed.shasum, integrity: parsed.integrity };
}

async function publishedPayloadMatches(spec, expectedPack, run, root) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'publish-release-registry-pack-'));
  try {
    const result = await checked(
      run,
      'npm',
      ['pack', spec, '--json', '--ignore-scripts', '--pack-destination', tempRoot, `--registry=${PUBLIC_REGISTRY}`],
      { cwd: root },
      `download published tarball for ${spec}`,
    );
    const publishedPack = parsePack(result.stdout, spec);
    if (!publishedPack.filename) return false;
    const publishedPath = path.join(tempRoot, publishedPack.filename);
    if (!(await exists(publishedPath))) return false;
    return await gzipPayloadEqual(expectedPack.artifactPath, publishedPath);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function checkPublishedVersion(pkg, version, expectedPack, run, root) {
  const spec = `${pkg.name}@${version}`;
  const result = await run('npm', ['view', spec, 'dist', '--json', `--registry=${PUBLIC_REGISTRY}`], { cwd: root });
  if (isExactNotFound(result)) return false;
  if (result.code !== 0) throw new Error(`registry dist check for ${spec} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`);
  const publishedDist = parsePublishedDist(spec, result.stdout);
  if (publishedDist.shasum !== expectedPack.shasum || publishedDist.integrity !== expectedPack.integrity) {
    // npm can wrap identical tar bytes in different gzip encodings across Node runtimes.
    if (await publishedPayloadMatches(spec, expectedPack, run, root)) return true;
    throw new Error(`registry dist metadata mismatch for ${spec}: expected tagged pack hashes for ${version}`);
  }
  return true;
}

async function verifyRemoteTag(root, version, localCommit, run) {
  const result = await checked(
    run,
    'git',
    ['ls-remote', '--tags', 'origin', `refs/tags/${version}`, `refs/tags/${version}^{}`],
    { cwd: root },
    `verify remote release tag ${version}`,
  );
  const lines = result.stdout.trim().split('\n').filter(Boolean).map((line) => line.split(/\s+/, 2));
  const peeled = lines.find(([, ref]) => ref === `refs/tags/${version}^{}`)?.[0];
  const direct = lines.find(([, ref]) => ref === `refs/tags/${version}`)?.[0];
  const remoteCommit = peeled ?? direct;
  if (!remoteCommit) throw new Error(`Remote release tag ${version} does not exist on origin`);
  if (remoteCommit !== localCommit) throw new Error(`Local and origin release tags disagree for ${version}: ${localCommit} != ${remoteCommit}`);
}

async function verifyTagOnMain(root, version, run) {
  const result = await run('git', ['merge-base', '--is-ancestor', `${version}^{commit}`, 'origin/main'], { cwd: root });
  if (result.code !== 0) throw new Error(`Release tag ${version} is not an ancestor of origin/main`);
}

async function verifyGitHubRelease(root, version, expectedBody, run) {
  const result = await checked(
    run,
    'gh',
    ['release', 'view', version, '--repo', TRUSTED_REPOSITORY, '--json', 'tagName,isDraft,isPrerelease,publishedAt,url,body'],
    { cwd: root },
    `verify GitHub release ${version}`,
  );
  let release;
  try {
    release = JSON.parse(result.stdout);
  } catch {
    throw new Error(`GitHub release check for ${version} returned invalid JSON`);
  }
  if (release.tagName !== version || release.isDraft || !release.publishedAt) throw new Error(`GitHub release ${version} is missing, draft, or unpublished`);
  if (Boolean(release.isPrerelease) !== releaseVersion(version).includes('-')) throw new Error(`GitHub release ${version} has inconsistent prerelease status`);
  if (normalizeReleaseBody(release.body ?? '') !== normalizeReleaseBody(expectedBody)) {
    throw new Error(`GitHub release body does not match docs/github-release-${version}.md`);
  }
  return release.url;
}

async function assertGitHubActionsContext(root, version, dryRun, run, env) {
  const required = {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: TRUSTED_REPOSITORY,
    GITHUB_REF: 'refs/heads/main',
    RUNNER_ENVIRONMENT: 'github-hosted',
    NPM_RELEASE_ENVIRONMENT: TRUSTED_ENVIRONMENT,
    RELEASE_TAG: version,
    RELEASE_CONFIRMATION: version,
  };
  for (const [name, expected] of Object.entries(required)) {
    if (env[name] !== expected) throw new Error(`GitHub Actions publishing requires ${name}=${expected}`);
  }
  const expectedWorkflowRef = `${TRUSTED_REPOSITORY}/.github/workflows/${TRUSTED_WORKFLOW}@refs/heads/main`;
  if (env.GITHUB_WORKFLOW_REF !== expectedWorkflowRef) throw new Error(`GitHub Actions publishing requires GITHUB_WORKFLOW_REF=${expectedWorkflowRef}`);
  if (!dryRun && (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)) {
    throw new Error('GitHub OIDC publishing requires id-token: write');
  }
  assertNoLegacyNpmCredentials(env);
  const npmrcFiles = await findFilesNamed(root, '.npmrc');
  if (npmrcFiles.length > 0) throw new Error(`GitHub OIDC publishing refuses repository npm configuration: ${npmrcFiles.map((file) => path.relative(root, file)).join(', ')}`);
  const head = (await checked(run, 'git', ['rev-parse', 'HEAD'], { cwd: root }, 'verify GitHub checkout HEAD')).stdout.trim();
  const main = (await checked(run, 'git', ['rev-parse', 'origin/main'], { cwd: root }, 'verify origin/main')).stdout.trim();
  if (env.GITHUB_SHA !== head || head !== main) throw new Error(`GitHub Actions publishing requires GITHUB_SHA, HEAD, and origin/main to match`);
}

async function checkLatestTag(pkg, version, run, root) {
  const result = await checked(
    run,
    'npm',
    ['view', pkg.name, 'dist-tags.latest', '--json', `--registry=${PUBLIC_REGISTRY}`],
    { cwd: root },
    `latest dist-tag check for ${pkg.name}`,
  );
  let latest;
  try {
    latest = JSON.parse(result.stdout);
  } catch {
    throw new Error(`latest dist-tag check for ${pkg.name} returned invalid JSON`);
  }
  if (latest !== version) throw new Error(`latest dist-tag mismatch for ${pkg.name}: expected ${version}, found ${latest}`);
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function verifyPublishedWithRetry(pkg, version, expectedPack, run, root, sleep, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (await checkPublishedVersion(pkg, version, expectedPack, run, root)) {
        await checkLatestTag(pkg, version, run, root);
        return;
      }
    } catch (error) {
      if (attempt === attempts) throw error;
    }
    if (attempt < attempts) await sleep(5_000);
  }
  throw new Error(`Published package did not become visible: ${pkg.name}@${version}`);
}

export async function defaultCreateTagSnapshot(root, tag, run) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'publish-release-tag-'));
  const archivePath = path.join(tempRoot, 'tag.tar');
  try {
    await checked(run, 'git', ['archive', '--format=tar', `--output=${archivePath}`, tag], { cwd: root }, `git archive for ${tag}`);
    await checked(run, 'tar', ['-xf', archivePath, '-C', tempRoot], { cwd: root }, `extract tag snapshot for ${tag}`);
    return tempRoot;
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function publishRelease({
  cwd = process.cwd(),
  version,
  dryRun = false,
  githubActions = false,
  run = defaultRun,
  createTagSnapshot = defaultCreateTagSnapshot,
  sleep = defaultSleep,
  env = process.env,
} = {}) {
  if (!RELEASE_VERSION_RE.test(version ?? '')) throw new Error('Expected a v-prefixed release version such as v0.1.60');
  if (releaseVersion(version).includes('-')) throw new Error('Prerelease publishing requires an explicit non-latest dist-tag and is not yet supported');
  if (!dryRun && !githubActions) throw new Error('Live publishing is allowed only through the trusted GitHub Actions workflow');
  const root = await findRoot(cwd);
  const evidencePath = path.join(root, 'docs', `github-release-${version}.md`);
  if (!(await exists(evidencePath))) throw new Error(`Missing release document: ${path.relative(root, evidencePath)}`);
  const currentEvidenceContent = await readFile(evidencePath);
  if (githubActions) await assertGitHubActionsContext(root, version, dryRun, run, env);
  const localCommit = (
    await checked(run, 'git', ['rev-parse', '--verify', `${version}^{commit}`], { cwd: root }, `verify release tag ${version}`)
  ).stdout.trim();
  await verifyRemoteTag(root, version, localCommit, run);
  await verifyTagOnMain(root, version, run);

  let snapshotRoot;
  let artifactRoot;
  let npmConfigRoot;
  try {
    artifactRoot = await mkdtemp(path.join(os.tmpdir(), 'publish-release-artifacts-'));
    npmConfigRoot = await mkdtemp(path.join(os.tmpdir(), 'publish-release-npm-config-'));
    const userConfig = path.join(npmConfigRoot, 'user.npmrc');
    const globalConfig = path.join(npmConfigRoot, 'global.npmrc');
    await writeFile(userConfig, `registry=${PUBLIC_REGISTRY}\n`, { mode: 0o600 });
    await writeFile(globalConfig, '', { mode: 0o600 });
    const npmEnv = isolatedNpmEnvironment(env, userConfig, globalConfig);
    const npmRun = (file, args, options = {}) => run(
      file,
      args,
      file === 'npm' ? { ...options, env: npmEnv, replaceEnv: true } : options,
    );

    snapshotRoot = await createTagSnapshot(root, version, run);
    const snapshotEvidencePath = path.join(snapshotRoot, 'docs', `github-release-${version}.md`);
    if (!(await exists(snapshotEvidencePath))) throw new Error(`Release tag ${version} is missing release document: docs/github-release-${version}.md`);
    const snapshotEvidenceContent = await readFile(snapshotEvidencePath);
    const snapshotEvidence = parseEvidence(snapshotEvidenceContent.toString('utf8'), path.relative(snapshotRoot, snapshotEvidencePath));
    if (!currentEvidenceContent.equals(snapshotEvidenceContent)) {
      throw new Error(`Checkout release document does not match release tag ${version}`);
    }
    const releaseUrl = await verifyGitHubRelease(root, version, snapshotEvidenceContent.toString('utf8'), run);

    const currentPackages = await discoverPackages(root);
    const snapshotPackages = await discoverPackages(snapshotRoot);
    const currentByName = new Map(currentPackages.map((pkg) => [pkg.name, pkg]));
    const snapshotByName = new Map(snapshotPackages.map((pkg) => [pkg.name, pkg]));
    const selected = evidenceOrder(currentByName, snapshotEvidence);
    assertEvidenceOrder(selected, snapshotEvidence);
    const selectedRoot = selected.find((pkg) => pkg.umbrella);
    if (selectedRoot && selectedRoot.manifest.version !== releaseVersion(version)) {
      throw new Error(`Selected root version must match release tag ${version}: found ${selectedRoot.manifest.version}`);
    }

    const snapshotPacks = new Map();
    const currentPacks = new Map();
    for (const [index, { name, version: expectedVersion }] of snapshotEvidence.entries()) {
      const current = currentByName.get(name);
      const snapshot = snapshotByName.get(name);
      if (!snapshot) throw new Error(`Release tag ${version} is missing package ${name}`);
      if (current.manifest.version !== expectedVersion) throw new Error(`Current manifest version mismatch for ${name}: expected ${expectedVersion}, found ${current.manifest.version}`);
      if (snapshot.manifest.version !== expectedVersion) throw new Error(`Release tag ${version} version mismatch for ${name}: expected ${expectedVersion}, found ${snapshot.manifest.version}`);
      const currentPack = await packArtifact(current, npmRun, path.join(artifactRoot, `current-${index}`));
      await assertCleanPublishablePaths(root, current, currentPack, run);
      const snapshotPack = await packArtifact(snapshot, npmRun, path.join(artifactRoot, `snapshot-${index}`));
      currentPacks.set(name, currentPack);
      snapshotPacks.set(name, snapshotPack);
      if (!packEqual(currentPack, snapshotPack)) throw new Error(`Current publishable content for ${name}@${expectedVersion} does not match ${version}`);
    }

    const plan = [];
    for (const { name, version: expectedVersion } of snapshotEvidence) {
      const pkg = currentByName.get(name);
      const expectedPack = snapshotPacks.get(name);
      const alreadyPublished = await checkPublishedVersion(pkg, expectedVersion, expectedPack, npmRun, root);
      if (alreadyPublished) await checkLatestTag(pkg, expectedVersion, npmRun, root);
      plan.push({
        name,
        version: expectedVersion,
        relative: pkg.relative,
        umbrella: pkg.umbrella,
        shasum: expectedPack.shasum,
        integrity: expectedPack.integrity,
        size: expectedPack.size,
        action: alreadyPublished ? 'skip' : 'publish',
      });
    }

    const skipped = plan.filter((entry) => entry.action === 'skip');
    const toPublish = plan.filter((entry) => entry.action === 'publish');
    if (!dryRun && toPublish.length > 0) {
      for (const entry of toPublish) {
        const pkg = currentByName.get(entry.name);
        const artifact = currentPacks.get(entry.name);
        await checked(
          npmRun,
          'npm',
          ['publish', artifact.artifactPath, '--ignore-scripts', '--access', 'public', '--tag', 'latest', `--registry=${PUBLIC_REGISTRY}`],
          { cwd: root },
          `publish ${entry.name}@${entry.version}`,
        );
        await verifyPublishedWithRetry(pkg, entry.version, snapshotPacks.get(entry.name), npmRun, root, sleep);
      }
    }

    return {
      version,
      mode: dryRun ? 'dry-run' : 'publish',
      registry: PUBLIC_REGISTRY,
      authMode: githubActions ? 'github-oidc' : 'none',
      tagCommit: localCommit,
      releaseUrl,
      planned: plan,
      published: dryRun ? [] : toPublish.map(({ name, version: publishedVersion }) => `${name}@${publishedVersion}`),
      skipped: skipped.map(({ name, version: skippedVersion }) => `${name}@${skippedVersion}`),
    };
  } finally {
    if (npmConfigRoot) await rm(npmConfigRoot, { recursive: true, force: true });
    if (artifactRoot) await rm(artifactRoot, { recursive: true, force: true });
    if (snapshotRoot) await rm(snapshotRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  let dryRun = false;
  let githubActions = false;
  const positionals = [];
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--github-actions') githubActions = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown argument: ${arg}`);
    else positionals.push(arg);
  }
  if (positionals.length !== 1) throw new Error('Usage: publish-release.mjs <vX.Y.Z> [--dry-run] [--github-actions]');
  return { version: positionals[0], dryRun, githubActions };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  publishRelease(parseArgs(process.argv.slice(2)))
    .then((summary) => console.log(`${JSON.stringify(summary, null, 2)}\n`))
    .catch((error) => {
      console.error(`publish-release: ${error.message}`);
      process.exitCode = 1;
    });
}
