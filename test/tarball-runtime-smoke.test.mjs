import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverAndLoadExtensions } from '@earendil-works/pi-coding-agent';
import { getWorkspacePackageDefs, repoRoot } from './workspace-package-helpers.mjs';

const piHostPeerPackages = new Set([
  '@earendil-works/pi-ai',
  '@earendil-works/pi-coding-agent',
  '@earendil-works/pi-tui',
  'typebox',
]);

const publishablePackages = [
  {
    label: 'root collection',
    manifestPath: 'package.json',
    packageRoot: repoRoot,
  },
  ...getWorkspacePackageDefs(),
];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function assertPiHostPeersAvailable(manifest) {
  for (const peerName of Object.keys(manifest.peerDependencies ?? {})) {
    assert.ok(
      piHostPeerPackages.has(peerName),
      `${manifest.name} declares peer ${peerName}, but the smoke fixture skips peer installation and Pi does not provide it`,
    );
    assert.doesNotThrow(
      () => import.meta.resolve(peerName),
      `${manifest.name} requires Pi host peer ${peerName}, but it is unavailable to the loader`,
    );
  }
}

function getRuntimeDeclarations(manifest) {
  const declarations = [];
  const pi = manifest.pi ?? {};

  if (Array.isArray(pi.extensions)) {
    declarations.push(...pi.extensions.map((entry) => ({ kind: 'extension', entry })));
  }

  if (Array.isArray(pi.skills)) {
    declarations.push(...pi.skills.map((entry) => ({ kind: 'skill', entry })));
  }

  return declarations;
}

function packPackage(packageDef, packDestination) {
  const args = ['pack', '--ignore-scripts', '--json', '--pack-destination', packDestination];
  if (packageDef.workspace) args.push('--workspace', packageDef.workspace);

  const stdout = execFileSync('npm', args, { cwd: repoRoot, encoding: 'utf8' });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.length, 1, `expected one npm pack result for ${packageDef.label}`);
  return path.join(packDestination, parsed[0].filename);
}

function getInstalledPackageDir(fixtureRoot, packageName) {
  return path.join(fixtureRoot, 'node_modules', ...packageName.split('/'));
}

function findSkillDirectories(entryPath) {
  if (!existsSync(entryPath) || !statSync(entryPath).isDirectory()) return [];

  return readdirSync(entryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(entryPath, entry.name, 'SKILL.md')))
    .map((entry) => path.join(entryPath, entry.name))
    .sort();
}

function registrationCount(extension) {
  return (
    extension.handlers.size +
    extension.tools.size +
    extension.messageRenderers.size +
    (extension.entryRenderers?.size ?? 0) +
    extension.commands.size +
    extension.flags.size +
    extension.shortcuts.size
  );
}

async function validateInstalledSkills(packageName, packageDir, declarations) {
  for (const { entry } of declarations.filter(({ kind }) => kind === 'skill')) {
    const entryPath = path.join(packageDir, entry.replace(/^\.\//, ''));
    assert.ok(existsSync(entryPath), `${packageName} installed skill entry is missing: ${entry}`);
    assert.ok(statSync(entryPath).isDirectory(), `${packageName} installed skill entry should be a directory: ${entry}`);

    const skillDirs = findSkillDirectories(entryPath);
    assert.ok(skillDirs.length > 0, `${packageName} installed skill entry should contain a SKILL.md directory: ${entry}`);

    for (const skillDir of skillDirs) {
      const skillDocPath = path.join(skillDir, 'SKILL.md');
      const skillDoc = await readFile(skillDocPath, 'utf8');
      assert.ok(
        skillDoc.trim().length > 0,
        `${packageName} installed skill doc should be non-empty: ${toPosix(path.relative(packageDir, skillDocPath))}`,
      );
    }
  }
}

// This intentionally installs and smokes every publishable runtime package rather
// than a representative subset. Each tarball gets its own node_modules tree so a
// dependency from another tested package cannot hide an undeclared import.
test('publishable tarballs install offline and Pi loads their declared runtime entries', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pi-extensions-tarball-smoke-'));

  try {
    const packDestination = path.join(tempRoot, 'tarballs');
    await mkdir(packDestination, { recursive: true });

    const packedPackages = publishablePackages.map((packageDef) => {
      const manifest = readJson(path.join(repoRoot, packageDef.manifestPath));
      assertPiHostPeersAvailable(manifest);
      return {
        manifest,
        tarballPath: packPackage(packageDef, packDestination),
      };
    });

    for (const { manifest, tarballPath } of packedPackages) {
      const fixtureRoot = path.join(tempRoot, 'fixture');
      const agentDir = path.join(fixtureRoot, 'agent');

      try {
        await mkdir(agentDir, { recursive: true });
        await writeFile(
          path.join(fixtureRoot, 'package.json'),
          `${JSON.stringify({ private: true, dependencies: { [manifest.name]: `file:${tarballPath}` } }, null, 2)}\n`,
        );

        execFileSync(
          'npm',
          [
            'install',
            '--offline',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            '--package-lock=false',
            '--legacy-peer-deps',
          ],
          { cwd: fixtureRoot, encoding: 'utf8', stdio: 'pipe' },
        );

        const packageDir = getInstalledPackageDir(fixtureRoot, manifest.name);
        const installedManifestPath = path.join(packageDir, 'package.json');
        assert.ok(existsSync(installedManifestPath), `${manifest.name} should be installed from its tarball`);

        const installedManifest = readJson(installedManifestPath);
        const declarations = getRuntimeDeclarations(installedManifest);
        const extensionEntries = declarations
          .filter(({ kind }) => kind === 'extension')
          .map(({ entry }) => path.join(packageDir, entry.replace(/^\.\//, '')));
        await validateInstalledSkills(installedManifest.name, packageDir, declarations);

        const loadResult = await discoverAndLoadExtensions(extensionEntries, fixtureRoot, agentDir);
        assert.deepEqual(
          loadResult.errors,
          [],
          `Pi loader errors for ${installedManifest.name}: ${loadResult.errors
            .map(({ path: errorPath, error }) => `${errorPath}: ${error}`)
            .join('; ')}`,
        );
        assert.equal(
          loadResult.extensions.length,
          extensionEntries.length,
          `${installedManifest.name} should load every declared installed extension entry`,
        );

        for (const extension of loadResult.extensions) {
          assert.ok(
            registrationCount(extension) > 0,
            `installed extension should register at least one handler, tool, renderer, command, flag, or shortcut: ${extension.path}`,
          );
        }
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
        assert.equal(existsSync(fixtureRoot), false, `expected ${manifest.name} fixture to clean up`);
      }
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    assert.equal(existsSync(tempRoot), false, 'expected tarball smoke fixtures to clean up');
  }
});
