import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { getWorkspacePackageDefs, repoRoot } from './workspace-package-helpers.mjs';

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
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

function resolvePackageEntry(packageDef, entry) {
  return path.join(packageDef.packageRoot, entry.replace(/^\.\//, ''));
}

function getRootCollectionRuntimeDeclarations() {
  const rootManifest = readJson('package.json');
  return getRuntimeDeclarations(rootManifest)
    .map(({ kind, entry }) => `${kind}:${entry.replace(/^\.\//, '')}`)
    .sort();
}

function getExpectedRootCollectionRuntimeDeclarations() {
  const declarations = [];

  for (const packageDef of getWorkspacePackageDefs()) {
    const manifest = readJson(packageDef.manifestPath);
    for (const { kind, entry } of getRuntimeDeclarations(manifest)) {
      const absoluteEntry = resolvePackageEntry(packageDef, entry);
      const relativeEntry = toPosix(path.relative(repoRoot, absoluteEntry));
      declarations.push(`${kind}:${relativeEntry}`);
    }
  }

  return declarations.sort();
}

function getRootReadmeExtensionEntries() {
  return [...readText('README.md').matchAll(/^- \[`([^`]+)`\]\(\.\/extensions\/[^)]+\):/gm)].map((match) => match[1]);
}

test('workspace package manifests keep directory, publish, and runtime metadata consistent', () => {
  const packageNames = new Set();

  for (const packageDef of getWorkspacePackageDefs()) {
    const packageDir = path.basename(packageDef.packageRoot);
    const manifest = readJson(packageDef.manifestPath);
    const runtimeDeclarations = getRuntimeDeclarations(manifest);
    const runtimeKinds = new Set(runtimeDeclarations.map(({ kind }) => kind));

    assert.equal(manifest.name, `@diegopetrucci/pi-${packageDir}`);
    assert.match(manifest.version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
    assert.equal(manifest.repository?.directory, `extensions/${packageDir}`);
    assert.deepEqual(manifest.publishConfig, { access: 'public' });
    assert.ok(Array.isArray(manifest.files), `${packageDir} should declare published files`);
    assert.ok(manifest.files.includes('README.md'), `${packageDir} should publish its README`);
    assert.ok(
      manifest.files.includes('.pi-fleet-tested-version'),
      `${packageDir} should publish its .pi-fleet-tested-version marker`,
    );
    assert.ok(existsSync(path.join(packageDef.packageRoot, 'README.md')), `${packageDir} README.md should exist`);
    assert.ok(
      existsSync(path.join(packageDef.packageRoot, '.pi-fleet-tested-version')),
      `${packageDir} .pi-fleet-tested-version should exist`,
    );
    assert.ok(runtimeDeclarations.length > 0, `${packageDir} should declare at least one pi runtime entry`);
    assert.equal(runtimeKinds.size, 1, `${packageDir} should declare either extensions or skills, not a mixture`);

    for (const { entry } of runtimeDeclarations) {
      assert.ok(existsSync(resolvePackageEntry(packageDef, entry)), `${packageDir} runtime entry should exist: ${entry}`);
    }

    assert.ok(!packageNames.has(manifest.name), `duplicate workspace package name: ${manifest.name}`);
    packageNames.add(manifest.name);
  }
});

test('root collection manifest includes every workspace runtime declaration exactly once', () => {
  assert.deepEqual(getRootCollectionRuntimeDeclarations(), getExpectedRootCollectionRuntimeDeclarations());
});

test('workspace package READMEs include matching standalone install instructions and reload guidance', () => {
  for (const packageDef of getWorkspacePackageDefs()) {
    const manifest = readJson(packageDef.manifestPath);
    const packageDir = path.basename(packageDef.packageRoot);
    const readme = readText(path.join(path.dirname(packageDef.manifestPath), 'README.md'));

    assert.match(
      readme,
      new RegExp(`pi install npm:${manifest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      `${packageDir} README should document its standalone npm package install command`,
    );
    assert.match(readme, /Then reload pi:\s*```text\s*\/reload/si, `${packageDir} README should explain how to reload pi`);
  }
});

test('root README keeps the extension list alphabetical and install docs aligned with published packages', () => {
  const rootReadme = readText('README.md');
  const listedExtensions = getRootReadmeExtensionEntries();
  const workspaceDirs = getWorkspacePackageDefs().map((packageDef) => path.basename(packageDef.packageRoot)).sort();
  const documentedInstallTargets = [...rootReadme.matchAll(/pi install npm:(@diegopetrucci\/pi[-a-z]+)/g)].map((match) => match[1]);

  assert.ok(listedExtensions.length > 0, 'expected README to list workspace extensions');
  assert.deepEqual(listedExtensions, [...listedExtensions].sort((left, right) => left.localeCompare(right)));
  assert.deepEqual([...listedExtensions].sort(), workspaceDirs);
  assert.ok(documentedInstallTargets.includes('@diegopetrucci/pi-extensions'));
  assert.ok(
    documentedInstallTargets.some((target) => target !== '@diegopetrucci/pi-extensions' && target.startsWith('@diegopetrucci/pi-')),
    'expected README to show at least one standalone package install command',
  );
  assert.match(rootReadme, /Then reload pi:\s*```text\s*\/reload/si);
});

test('workspace READMEs that credit copied upstream sources include concrete attribution links', () => {
  const upstreamCreditPattern = /\b(?:adapted from|copied from|ported from|started from the original)\b/i;
  const githubUrlPattern = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i;

  for (const packageDef of getWorkspacePackageDefs()) {
    const packageDir = path.basename(packageDef.packageRoot);
    const readme = readText(path.join(path.dirname(packageDef.manifestPath), 'README.md'));

    if (!upstreamCreditPattern.test(readme)) continue;

    assert.match(
      readme,
      githubUrlPattern,
      `${packageDir} README should link to the upstream source it credits`,
    );

    if (readme.includes('[LICENSE](./LICENSE)')) {
      assert.ok(existsSync(path.join(packageDef.packageRoot, 'LICENSE')), `${packageDir} should ship the LICENSE file it references`);
    }
  }
});
