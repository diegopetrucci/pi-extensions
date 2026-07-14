#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const PUBLIC_REGISTRY = 'https://registry.npmjs.org';
const DEPENDENCY_SECTIONS = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'];

export async function defaultRun(file, args, options = {}) {
  try {
    const result = await execFileAsync(file, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      env: { ...process.env, npm_config_ignore_scripts: 'true' },
      maxBuffer: 20 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error) };
  }
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
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

function parsePack(stdout, label) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error(`Invalid npm pack JSON for ${label}`); }
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error(`Expected one npm pack result for ${label}`);
  const pack = parsed[0];
  return { shasum: pack.shasum, size: pack.size, unpackedSize: pack.unpackedSize, fileCount: pack.entryCount ?? pack.files?.length ?? 0 };
}

function isExactNotFound(result) {
  if (result.code === 0) return false;
  const codes = [...result.stderr.matchAll(/(?:npm\s+(?:(?:error|ERR!)\s+)?code\s+|["']code["']\s*:\s*["'])(E\d+)/gim)].map((match) => match[1].toUpperCase());
  return codes.length > 0 && codes.every((code) => code === 'E404') && !/\b(?!404\b)[45]\d\d\b/.test(result.stderr);
}

async function checked(run, file, args, options, label) {
  const result = await run(file, args, options);
  if (result.code !== 0) throw new Error(`${label} failed (${result.code}): ${result.stderr.trim()}`);
  return result;
}

async function inspectPackage(pkg, run) {
  const args = ['pack', '--dry-run', '--json', '--ignore-scripts', `--registry=${PUBLIC_REGISTRY}`];
  const localResult = await checked(run, 'npm', args, { cwd: pkg.root }, `local pack for ${pkg.name}`);
  const local = parsePack(localResult.stdout, pkg.name);
  const baselineResult = await run('npm', [...args, `${pkg.name}@${pkg.manifest.version}`], { cwd: pkg.root });
  if (isExactNotFound(baselineResult)) return { ...pkg, originalVersion: pkg.manifest.version, changed: true, baseline: 'absent', pack: local };
  if (baselineResult.code !== 0) throw new Error(`registry baseline for ${pkg.name} failed (${baselineResult.code}): ${baselineResult.stderr.trim()}`);
  const baseline = parsePack(baselineResult.stdout, `${pkg.name}@${pkg.manifest.version}`);
  return { ...pkg, originalVersion: pkg.manifest.version, changed: local.shasum !== baseline.shasum, baseline: baseline.shasum, pack: local };
}

async function assertTargetUnpublished(pkg, version, run) {
  const spec = `${pkg.name}@${version}`;
  const result = await run('npm', ['view', spec, 'version', '--json', `--registry=${PUBLIC_REGISTRY}`], { cwd: pkg.root });
  if (isExactNotFound(result)) return;
  if (result.code !== 0) throw new Error(`registry target check for ${spec} failed (${result.code}): ${result.stderr.trim()}`);
  throw new Error(`Target version is already published: ${spec}`);
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
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (available.length === 0) {
      const umbrella = selected.find((pkg) => pkg.umbrella && !ordered.includes(pkg) && indegree.get(pkg.name) === 0);
      if (!umbrella) throw new Error('Internal package dependency cycle detected');
      available.push(umbrella);
    }
    for (const pkg of available) {
      ordered.push(pkg);
      for (const dependent of outgoing.get(pkg.name)) indegree.set(dependent, indegree.get(dependent) - 1);
    }
  }
  const umbrella = ordered.find((pkg) => pkg.umbrella);
  return umbrella ? [...ordered.filter((pkg) => !pkg.umbrella), umbrella] : ordered;
}

function packageLines(ordered, versions) {
  return ordered.map((pkg) => `- \`${pkg.name}@${versions[pkg.name]}\``).join('\n');
}

function packageEvidence(ordered, versions) {
  return JSON.stringify(ordered.map((pkg) => [pkg.name, versions[pkg.name]]));
}

function scaffolds(version, ordered, versions) {
  const packages = packageLines(ordered, versions);
  const marker = `<!-- prepare-release:packages ${packageEvidence(ordered, versions)} -->`;
  return new Map([
    [`release-notes-v${version}.md`, `# Release notes — v${version}\n\n## Highlights\n\n<!-- Describe verified user-facing changes. -->\n\n## Packaging\n\n${packages}\n\n## Validation\n\n<!-- Record evidence only after commands have completed. -->\n\n${marker}\n`],
    [`github-release-v${version}.md`, `Release v${version} includes the package set listed below.\n\n## Highlights\n\n<!-- Add verified highlights. -->\n\n## Packages\n\n${packages}\n\n## Install\n\n\`\`\`bash\npi install npm:${ordered.at(-1)?.name ?? ''}\n\`\`\`\n\n${marker}\n`],
    [`announcement-v${version}.md`, `# Announcement drafts — v${version}\n\n## Short\n\n<!-- Draft after release facts are verified. -->\n\n## Packages\n\n${packages}\n\n${marker}\n`],
    [`publish-checklist-v${version}.md`, `# Publish checklist — v${version}\n\n## Target package versions\n\n${ordered.map((pkg) => `- [ ] \`${pkg.name}@${versions[pkg.name]}\``).join('\n')}\n\n## Validation evidence\n\n- [ ] record completed checks here\n- [ ] confirm no staged files\n\n## Human-only release actions\n\n- [ ] publish selected packages manually (this tool cannot publish)\n- [ ] commit, tag, push, and create the GitHub release outside this tool\n\n${marker}\n`],
  ]);
}

async function validateExistingDocument(filePath, expectedEvidence) {
  if (!(await exists(filePath))) return;
  const content = await readFile(filePath, 'utf8');
  const match = content.match(/<!-- prepare-release:packages (\[[^\n]*\]) -->/);
  if (!match) throw new Error(`Existing release document lacks managed package evidence: ${filePath}`);
  if (match[1] !== expectedEvidence) throw new Error(`Existing release document has stale package evidence: ${filePath}`);
}

async function snapshotPaths(paths) {
  const snapshots = new Map();
  for (const filePath of new Set(paths)) snapshots.set(filePath, await exists(filePath) ? await readFile(filePath) : null);
  return snapshots;
}

async function restoreSnapshots(snapshots) {
  for (const [filePath, content] of snapshots) {
    if (content === null) await rm(filePath, { force: true });
    else { await mkdir(path.dirname(filePath), { recursive: true }); await writeFile(filePath, content); }
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function verifyLock(root, allPackages) {
  const lock = await readJson(path.join(root, 'package-lock.json'));
  const rootVersion = (await readJson(path.join(root, 'package.json'))).version;
  if (lock.version !== rootVersion) throw new Error(`Top-level lock version does not match root package@${rootVersion}`);
  if (lock.packages?.['']?.version !== rootVersion) throw new Error(`Root lock entry does not match root package@${rootVersion}`);
  for (const pkg of allPackages) {
    const key = pkg.umbrella ? '' : pkg.relative;
    const expected = (await readJson(path.join(pkg.root, 'package.json'))).version;
    if (lock.packages?.[key]?.version !== expected) throw new Error(`Lock entry ${key || '<root>'} does not match ${pkg.name}@${expected}`);
  }
}

export async function prepareRelease({ cwd = process.cwd(), inputPath, write = false, run = defaultRun } = {}) {
  if (!inputPath) throw new Error('An explicit JSON input path is required');
  const root = await findRoot(cwd);
  const input = await readJson(path.resolve(cwd, inputPath));
  if (!input || typeof input.versions !== 'object' || Array.isArray(input.versions)) throw new Error('Input must contain a versions object');
  const allPackages = await discoverPackages(root);
  const known = new Set(allPackages.map((pkg) => pkg.name));
  for (const name of Object.keys(input.versions)) if (!known.has(name)) throw new Error(`Unknown package in versions: ${name}`);
  const inspected = [];
  for (const pkg of allPackages) inspected.push(await inspectPackage(pkg, run));
  const changed = inspected.filter((pkg) => pkg.changed);
  if (changed.length === 0) throw new Error('No changed packages were detected');
  for (const pkg of changed) {
    const target = input.versions[pkg.name];
    if (typeof target !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(target)) throw new Error(`Changed package ${pkg.name} needs an exact target version`);
    await assertTargetUnpublished(pkg, target, run);
  }
  const selected = releaseOrder(changed);
  const rootPackage = selected.find((pkg) => pkg.umbrella);
  const releaseVersion = input.releaseVersion ?? (rootPackage && input.versions[rootPackage.name]);
  if (!releaseVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseVersion)) throw new Error('Input needs an exact releaseVersion when the root package is unchanged');
  const docsDir = path.resolve(root, input.docsDir ?? 'docs');
  const scaffoldEntries = [...scaffolds(releaseVersion, selected, input.versions)];
  const expectedEvidence = packageEvidence(selected, input.versions);
  const documentStatus = [];
  for (const [name] of scaffoldEntries) {
    const filePath = path.join(docsDir, name);
    await validateExistingDocument(filePath, expectedEvidence);
    documentStatus.push({ path: path.relative(root, filePath), action: await exists(filePath) ? 'preserved' : write ? 'created' : 'would-create' });
  }
  if (write) {
    const manifestPaths = selected.map((pkg) => path.join(pkg.root, 'package.json'));
    const markerPaths = selected.filter((pkg) => input.fleetMarkers?.[pkg.name] !== undefined).map((pkg) => path.join(pkg.root, '.pi-fleet-tested-version'));
    const documentPaths = scaffoldEntries.map(([name]) => path.join(docsDir, name));
    const snapshots = await snapshotPaths([...manifestPaths, path.join(root, 'package-lock.json'), ...markerPaths, ...documentPaths]);
    try {
      for (const [name, content] of scaffoldEntries) {
        const filePath = path.join(docsDir, name);
        if (!(await exists(filePath))) { await mkdir(docsDir, { recursive: true }); await writeFile(filePath, content, 'utf8'); }
      }
      for (const pkg of selected) {
        pkg.manifest.version = input.versions[pkg.name];
        await writeJson(path.join(pkg.root, 'package.json'), pkg.manifest);
        const marker = input.fleetMarkers?.[pkg.name];
        if (marker !== undefined) await writeFile(path.join(pkg.root, '.pi-fleet-tested-version'), `${marker}\n`, 'utf8');
      }
      await checked(run, 'npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', `--registry=${PUBLIC_REGISTRY}`], { cwd: root }, 'lockfile synchronization');
      await verifyLock(root, allPackages);
    } catch (error) {
      await restoreSnapshots(snapshots);
      throw error;
    }
  }
  return {
    mode: write ? 'write' : 'dry-run', registry: PUBLIC_REGISTRY, releaseVersion,
    packages: selected.map((pkg, index) => ({ order: index + 1, name: pkg.name, from: pkg.originalVersion, target: input.versions[pkg.name], relative: pkg.relative, size: pkg.pack.size, unpackedSize: pkg.pack.unpackedSize, fileCount: pkg.pack.fileCount })),
    documents: documentStatus,
  };
}

function parseArgs(argv) {
  let inputPath; let write = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') inputPath = argv[++index];
    else if (argv[index] === '--write') write = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return { inputPath, write };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  prepareRelease(parseArgs(process.argv.slice(2))).then((summary) => console.log(`${JSON.stringify(summary, null, 2)}\n`)).catch((error) => { console.error(`prepare-release: ${error.message}`); process.exitCode = 1; });
}
