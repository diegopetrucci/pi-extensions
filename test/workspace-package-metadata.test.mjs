import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

const expectedNodeEngine = '>=22.19.0';
const explicitEsmLowRiskCohort = new Set([
  'brrr',
  'claude-fast',
  'confirm-destructive',
  'context-cap',
  'dirty-repo-guard',
  'gnosis',
  'inline-bash',
  'notify',
  'openai-fast',
  'permission-gate',
  'quiet-tools',
  'todo',
]);
const explicitEsmComplexCohort = new Set([
  'agent-workflow-audit',
  'code-reviewer',
  'context-inspector',
  'contrarian',
  'git-footer',
  'librarian',
  'minimal-footer',
  'oracle',
  'review',
  'triage-comments',
]);
const documentedNonExecutableWorkspacePackages = new Set(['illustrations-to-explain-things']);

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

const standaloneOnlyWorkspacePackages = new Set(['git-footer']);

function isStandaloneOnlyWorkspacePackage(packageDef) {
  return standaloneOnlyWorkspacePackages.has(path.basename(packageDef.packageRoot));
}

// Deliberate exception: this extension intentionally claims the unscoped npm name
// `pi-dynamic-context-pruning` rather than the usual `@diegopetrucci/pi-<dir>` scoped
// name; see extensions/dynamic-context-pruning/README.md for the rationale.
const unscopedWorkspacePackages = new Map([['dynamic-context-pruning', 'pi-dynamic-context-pruning']]);

function getExpectedPackageName(packageDir) {
  return unscopedWorkspacePackages.get(packageDir) ?? `@diegopetrucci/pi-${packageDir}`;
}

function getExpectedRootCollectionRuntimeDeclarations() {
  const declarations = [];

  for (const packageDef of getWorkspacePackageDefs()) {
    if (isStandaloneOnlyWorkspacePackage(packageDef)) continue;

    const manifest = readJson(packageDef.manifestPath);
    for (const { kind, entry } of getRuntimeDeclarations(manifest)) {
      const absoluteEntry = resolvePackageEntry(packageDef, entry);
      const relativeEntry = toPosix(path.relative(repoRoot, absoluteEntry));
      declarations.push(`${kind}:${relativeEntry}`);
    }
  }

  return declarations.sort();
}

function getRootReadmeExtensionSections() {
  const sections = [];
  let currentSection = null;

  for (const line of readText('README.md').split(/\r?\n/)) {
    const sectionMatch = line.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      currentSection = { heading: sectionMatch[1], entries: [] };
      sections.push(currentSection);
      continue;
    }

    const entryMatch = line.match(/^- +\[`([^`]+)`\]\(\.\/extensions\/[^)]+\):/);
    if (!entryMatch) continue;

    assert.ok(currentSection, `README extension entry should appear under a section heading: ${entryMatch[1]}`);
    currentSection.entries.push(entryMatch[1]);
  }

  return sections.filter((section) => section.entries.length > 0);
}

test('workspace package manifests keep directory, publish, runtime, and Node metadata consistent', () => {
  const packageNames = new Set();

  for (const packageDef of getWorkspacePackageDefs()) {
    const packageDir = path.basename(packageDef.packageRoot);
    const manifest = readJson(packageDef.manifestPath);
    const runtimeDeclarations = getRuntimeDeclarations(manifest);
    const runtimeKinds = new Set(runtimeDeclarations.map(({ kind }) => kind));

    assert.equal(manifest.name, getExpectedPackageName(packageDir));
    assert.match(manifest.version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
    assert.equal(manifest.repository?.directory, `extensions/${packageDir}`);
    assert.deepEqual(manifest.publishConfig, { access: 'public' });
    assert.deepEqual(manifest.engines, { node: expectedNodeEngine });
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

test('root package uses the tracked strict tsconfig and the shared Node minimum', () => {
  const manifest = readJson('package.json');
  const tsconfig = readJson('tsconfig.json');

  assert.equal(manifest.scripts?.typecheck, 'tsc -p tsconfig.json');
  assert.deepEqual(manifest.engines, { node: expectedNodeEngine });
  assert.equal(tsconfig.compilerOptions?.target, 'ES2022');
  assert.equal(tsconfig.compilerOptions?.module, 'NodeNext');
  assert.equal(tsconfig.compilerOptions?.moduleResolution, 'NodeNext');
  assert.equal(tsconfig.compilerOptions?.allowImportingTsExtensions, true);
  assert.equal(tsconfig.compilerOptions?.strict, true);
  assert.equal(tsconfig.compilerOptions?.noEmit, true);
  assert.deepEqual(tsconfig.include, ['**/*.ts']);
  assert.ok(Array.isArray(tsconfig.exclude) && tsconfig.exclude.includes('.tickets'));
});

test('CI validates the exact minimum Node release and current supported LTS', () => {
  const workflow = readText('.github/workflows/ci.yml');

  assert.match(workflow, /node-version:\s*\n\s*- 22\.19\.0\s*\n\s*- 24/);
  assert.match(workflow, /name: Validate \(Node \$\{\{ matrix\.node-version \}\}\)/);
});

test('all executable TypeScript workspace packages declare explicit ESM metadata while skill-only packages stay exempt', () => {
  for (const packageDef of getWorkspacePackageDefs()) {
    const packageDir = path.basename(packageDef.packageRoot);
    const manifest = readJson(packageDef.manifestPath);
    const runtimeDeclarations = getRuntimeDeclarations(manifest);
    const hasExecutableTypeScriptEntry = runtimeDeclarations.some(
      ({ kind, entry }) => kind === 'extension' && /\.ts$/u.test(entry),
    );
    const expectedType = hasExecutableTypeScriptEntry ? 'module' : undefined;

    assert.equal(
      manifest.type,
      expectedType,
      `${packageDir} should ${expectedType ? '' : 'not '}declare explicit ESM metadata`,
    );

    if (!hasExecutableTypeScriptEntry) {
      assert.ok(
        documentedNonExecutableWorkspacePackages.has(packageDir),
        `${packageDir} should remain a documented non-executable workspace exception`,
      );
      assert.deepEqual(
        runtimeDeclarations.map(({ kind }) => kind),
        ['skill'],
        `${packageDir} should stay skill-only while exempt from explicit ESM metadata`,
      );
    }
  }
});

test('low-risk explicit ESM extension entries import without typeless package warnings', () => {
  const entryPaths = getWorkspacePackageDefs()
    .filter((packageDef) => explicitEsmLowRiskCohort.has(path.basename(packageDef.packageRoot)))
    .flatMap((packageDef) => {
      const manifest = readJson(packageDef.manifestPath);
      return getRuntimeDeclarations(manifest)
        .filter(({ kind }) => kind === 'extension')
        .map(({ entry }) => resolvePackageEntry(packageDef, entry));
    });

  const loaderScript = [
    'import { pathToFileURL } from "node:url";',
    `const entryPaths = ${JSON.stringify(entryPaths)};`,
    'for (const entryPath of entryPaths) {',
    '  await import(pathToFileURL(entryPath).href);',
    '}',
  ].join('\n');

  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', loaderScript], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `direct entry import check failed with stderr:\n${result.stderr || '<empty>'}\nstdout:\n${result.stdout || '<empty>'}`,
  );
  assert.doesNotMatch(
    result.stderr,
    /MODULE_TYPELESS_PACKAGE_JSON/,
    `expected low-risk explicit ESM entry imports to avoid typeless package warnings, got:\n${result.stderr || '<empty>'}`,
  );
});

test('complex explicit ESM extension entries import without typeless package warnings', () => {
  const entryPaths = getWorkspacePackageDefs()
    .filter((packageDef) => explicitEsmComplexCohort.has(path.basename(packageDef.packageRoot)))
    .flatMap((packageDef) => {
      const manifest = readJson(packageDef.manifestPath);
      return getRuntimeDeclarations(manifest)
        .filter(({ kind }) => kind === 'extension')
        .map(({ entry }) => resolvePackageEntry(packageDef, entry));
    });

  const loaderScript = [
    'import { pathToFileURL } from "node:url";',
    `const entryPaths = ${JSON.stringify(entryPaths)};`,
    'for (const entryPath of entryPaths) {',
    '  await import(pathToFileURL(entryPath).href);',
    '}',
  ].join('\n');

  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', loaderScript], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `complex entry import check failed with stderr:\n${result.stderr || '<empty>'}\nstdout:\n${result.stdout || '<empty>'}`,
  );
  assert.doesNotMatch(
    result.stderr,
    /MODULE_TYPELESS_PACKAGE_JSON/,
    `expected complex explicit ESM entry imports to avoid typeless package warnings, got:\n${result.stderr || '<empty>'}`,
  );
});

test('root collection manifest includes every non-standalone workspace runtime declaration exactly once', () => {
  assert.deepEqual(getRootCollectionRuntimeDeclarations(), getExpectedRootCollectionRuntimeDeclarations());

  for (const packageDef of getWorkspacePackageDefs().filter(isStandaloneOnlyWorkspacePackage)) {
    const manifest = readJson(packageDef.manifestPath);
    const readme = readText(path.join(path.dirname(packageDef.manifestPath), 'README.md'));

    assert.match(
      readme,
      /standalone-only and is not auto-loaded by the `@diegopetrucci\/pi-extensions` collection package/i,
      `${path.basename(packageDef.packageRoot)} README should document its root collection exception`,
    );

    for (const { kind, entry } of getRuntimeDeclarations(manifest)) {
      const absoluteEntry = resolvePackageEntry(packageDef, entry);
      const relativeEntry = `${kind}:${toPosix(path.relative(repoRoot, absoluteEntry))}`;
      assert.ok(
        !getRootCollectionRuntimeDeclarations().includes(relativeEntry),
        `${path.basename(packageDef.packageRoot)} runtime entry should remain standalone-only: ${relativeEntry}`,
      );
    }
  }
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

test('root README keeps grouped extension lists alphabetical and install docs aligned with published packages', () => {
  const rootReadme = readText('README.md');
  const readmeSections = getRootReadmeExtensionSections();
  const listedExtensions = readmeSections.flatMap((section) => section.entries);
  const workspaceDirs = getWorkspacePackageDefs().map((packageDef) => path.basename(packageDef.packageRoot)).sort();
  const documentedInstallTargets = [...rootReadme.matchAll(/pi install npm:(@diegopetrucci\/pi[-a-z]+)/g)].map((match) => match[1]);

  assert.ok(listedExtensions.length > 0, 'expected README to list workspace extensions');

  for (const section of readmeSections) {
    assert.deepEqual(
      section.entries,
      [...section.entries].sort((left, right) => left.localeCompare(right)),
      `README section should list extensions alphabetically: ${section.heading}`,
    );
  }

  assert.equal(new Set(listedExtensions).size, listedExtensions.length, 'expected README extension entries to be unique');
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
