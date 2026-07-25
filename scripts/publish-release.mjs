#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const PUBLIC_REGISTRY = 'https://registry.npmjs.org';
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
      env: { ...process.env, ...options.env },
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

function workspacePatterns(manifest) {
  if (Array.isArray(manifest.workspaces)) return manifest.workspaces;
  if (Array.isArray(manifest.workspaces?.packages)) return manifest.workspaces.packages;
  return [];
}

async function walkDirectories(base) {
  const { readdir } = await import('node:fs/promises');
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
    shasum: typeof pack.shasum === 'string' ? pack.shasum : null,
    integrity: typeof pack.integrity === 'string' ? pack.integrity : null,
    size: pack.size ?? null,
    unpackedSize: pack.unpackedSize ?? null,
    files,
  };
}

function packEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function checked(run, file, args, options, label) {
  const result = await run(file, args, options);
  if (result.code !== 0) throw new Error(`${label} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`);
  return result;
}

async function packSummary(pkg, run) {
  const result = await checked(run, 'npm', ['pack', '--dry-run', '--json', '--ignore-scripts', `--registry=${PUBLIC_REGISTRY}`], { cwd: pkg.root }, `local pack for ${pkg.name}`);
  return parsePack(result.stdout, pkg.name);
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

async function checkPublishedVersion(pkg, version, run, root) {
  const spec = `${pkg.name}@${version}`;
  const result = await run('npm', ['view', spec, 'version', '--json', `--registry=${PUBLIC_REGISTRY}`], { cwd: root });
  if (isExactNotFound(result)) return false;
  if (result.code !== 0) throw new Error(`registry target check for ${spec} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`registry target check for ${spec} returned invalid JSON`);
  }
  if (parsed !== version) throw new Error(`registry target check for ${spec} returned unexpected version data`);
  return true;
}

async function checkPublicAuth(root, run) {
  const result = await run('npm', ['whoami', `--registry=${PUBLIC_REGISTRY}`], { cwd: root });
  if (result.code !== 0) throw new Error(`npm public registry authentication check failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`);
  const user = result.stdout.trim();
  if (!user) throw new Error('npm public registry authentication check returned an empty username');
  return user;
}

export async function defaultConfirm({ version, planned, skipped, stdin = process.stdin, stdout = process.stdout }) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error(`Refusing to publish ${version} without an interactive terminal confirmation`);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(`About to publish ${planned} package(s) for ${version} to ${PUBLIC_REGISTRY} and skip ${skipped} already-published exact version(s).\n`);
    const answer = await rl.question(`Type ${version} to continue: `);
    return answer.trim() === version;
  } finally {
    rl.close();
  }
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
  run = defaultRun,
  confirm = defaultConfirm,
  createTagSnapshot = defaultCreateTagSnapshot,
} = {}) {
  if (!RELEASE_VERSION_RE.test(version ?? '')) throw new Error('Expected a v-prefixed release version such as v0.1.60');
  const root = await findRoot(cwd);
  const evidencePath = path.join(root, 'docs', `github-release-${version}.md`);
  if (!(await exists(evidencePath))) throw new Error(`Missing release document: ${path.relative(root, evidencePath)}`);
  const evidence = parseEvidence(await readFile(evidencePath, 'utf8'), path.relative(root, evidencePath));
  await checked(run, 'git', ['rev-parse', '--verify', `${version}^{commit}`], { cwd: root }, `verify release tag ${version}`);

  let snapshotRoot;
  try {
    snapshotRoot = await createTagSnapshot(root, version, run);
    const currentPackages = await discoverPackages(root);
    const snapshotPackages = await discoverPackages(snapshotRoot);
    const currentByName = new Map(currentPackages.map((pkg) => [pkg.name, pkg]));
    const snapshotByName = new Map(snapshotPackages.map((pkg) => [pkg.name, pkg]));
    const selected = evidenceOrder(currentByName, evidence);
    assertEvidenceOrder(selected, evidence);

    for (const { name, version: expectedVersion } of evidence) {
      const current = currentByName.get(name);
      const snapshot = snapshotByName.get(name);
      if (!snapshot) throw new Error(`Release tag ${version} is missing package ${name}`);
      if (current.manifest.version !== expectedVersion) throw new Error(`Current manifest version mismatch for ${name}: expected ${expectedVersion}, found ${current.manifest.version}`);
      if (snapshot.manifest.version !== expectedVersion) throw new Error(`Release tag ${version} version mismatch for ${name}: expected ${expectedVersion}, found ${snapshot.manifest.version}`);
      const currentPack = await packSummary(current, run);
      await assertCleanPublishablePaths(root, current, currentPack, run);
      const snapshotPack = await packSummary(snapshot, run);
      if (!packEqual(currentPack, snapshotPack)) throw new Error(`Current publishable content for ${name}@${expectedVersion} does not match ${version}`);
    }

    const authUser = await checkPublicAuth(root, run);
    const plan = [];
    for (const { name, version: expectedVersion } of evidence) {
      const pkg = currentByName.get(name);
      const alreadyPublished = await checkPublishedVersion(pkg, expectedVersion, run, root);
      plan.push({ name, version: expectedVersion, relative: pkg.relative, umbrella: pkg.umbrella, action: alreadyPublished ? 'skip' : 'publish' });
    }

    const skipped = plan.filter((entry) => entry.action === 'skip');
    const toPublish = plan.filter((entry) => entry.action === 'publish');
    if (!dryRun && toPublish.length > 0) {
      const confirmed = await confirm({ version, planned: toPublish.length, skipped: skipped.length });
      if (!confirmed) throw new Error(`Publish cancelled for ${version}`);
      for (const entry of toPublish) {
        const pkg = currentByName.get(entry.name);
        await checked(run, 'npm', ['publish', '--ignore-scripts', '--access', 'public', `--registry=${PUBLIC_REGISTRY}`], { cwd: pkg.root }, `publish ${entry.name}@${entry.version}`);
      }
    }

    return {
      version,
      mode: dryRun ? 'dry-run' : 'publish',
      registry: PUBLIC_REGISTRY,
      authUser,
      planned: plan,
      published: dryRun ? [] : toPublish.map(({ name, version: publishedVersion }) => `${name}@${publishedVersion}`),
      skipped: skipped.map(({ name, version: skippedVersion }) => `${name}@${skippedVersion}`),
    };
  } finally {
    if (snapshotRoot) await rm(snapshotRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  let dryRun = false;
  const positionals = [];
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown argument: ${arg}`);
    else positionals.push(arg);
  }
  if (positionals.length !== 1) throw new Error('Usage: publish-release.mjs <vX.Y.Z> [--dry-run]');
  return { version: positionals[0], dryRun };
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
