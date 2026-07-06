import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { getWorkspacePackageDefs, repoRoot } from './workspace-package-helpers.mjs';

const packagePackCache = new Map();
const localModuleExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const packageLikeJavaScriptExtensions = new Map([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx', '.ts']],
  ['.mjs', ['.mts', '.ts']],
  ['.cjs', ['.cts', '.ts']],
]);

const publishablePackages = [
  {
    label: 'root',
    packageRoot: repoRoot,
    manifestPath: 'package.json',
  },
  ...getWorkspacePackageDefs(),
];

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function readManifest(packageDef) {
  return JSON.parse(readFileSync(path.join(repoRoot, packageDef.manifestPath), 'utf8'));
}

function collectDirectoryFiles(rootPath) {
  const files = [];

  function visit(currentPath) {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(toPosix(path.relative(rootPath, entryPath)));
      }
    }
  }

  visit(rootPath);
  return files;
}

function getDependencySections(manifest) {
  return ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
    .map((section) => [section, manifest[section] ?? {}]);
}

function getPublishedFiles(packageDef) {
  const cacheKey = packageDef.workspace ?? packageDef.label;
  if (packagePackCache.has(cacheKey)) return packagePackCache.get(cacheKey);

  const args = ['pack', '--dry-run', '--json'];
  if (packageDef.workspace) args.push('--workspace', packageDef.workspace);
  const stdout = execFileSync('npm', args, { cwd: repoRoot, encoding: 'utf8' });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.length, 1, `expected one npm pack result for ${packageDef.label}`);
  const files = new Set(parsed[0].files.map((file) => toPosix(file.path)));
  packagePackCache.set(cacheKey, files);
  return files;
}

function isInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

function isTypeOnlyImportClause(importClause) {
  if (!importClause) return false;
  if (importClause.isTypeOnly) return true;
  if (importClause.name) return false;
  if (!importClause.namedBindings) return false;
  if (ts.isNamespaceImport(importClause.namedBindings)) return false;
  return importClause.namedBindings.elements.length > 0 &&
    importClause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function collectStaticModuleSpecifiers(sourceText, filePath) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifiers = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function collectRuntimeModuleSpecifiers(sourceText, filePath) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifiers = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      if (!isTypeOnlyImportClause(node.importClause)) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      if (!node.isTypeOnly) specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function resolveLocalModule(importerPath, specifier) {
  const basePath = path.resolve(path.dirname(importerPath), specifier);
  const ext = path.extname(basePath);
  const candidates = ext
    ? [
        basePath,
        ...(packageLikeJavaScriptExtensions.get(ext) ?? []).map((sourceExtension) =>
          `${basePath.slice(0, -ext.length)}${sourceExtension}`,
        ),
      ]
    : [
        basePath,
        ...localModuleExtensions.map((extension) => `${basePath}${extension}`),
        ...localModuleExtensions.map((extension) => path.join(basePath, `index${extension}`)),
      ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    if (!statSync(candidate).isFile()) continue;
    return candidate;
  }

  return undefined;
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

function getStandaloneExtensionEntries(manifest) {
  return getRuntimeDeclarations(manifest)
    .filter(({ kind }) => kind === 'extension')
    .map(({ entry }) => entry);
}

function resolveStandaloneLocalModule(packageDef, importerPath, importerLabel, specifier, resolutionLabel) {
  const targetBase = path.resolve(path.dirname(importerPath), specifier);
  assert.ok(
    isInside(packageDef.packageRoot, targetBase),
    `${packageDef.label} standalone publishable sources must not import outside the package root: ${importerLabel} -> ${specifier}`,
  );

  const resolvedFile = resolveLocalModule(importerPath, specifier);
  assert.ok(resolvedFile, `${packageDef.label} could not resolve ${resolutionLabel} ${specifier} from ${importerLabel}`);
  return resolvedFile;
}

function assertStandaloneStaticImportsStayWithinPackageRoot(packageDef, manifest) {
  const visitedFiles = new Set();
  const toVisit = [...getStandaloneExtensionEntries(manifest)];

  while (toVisit.length > 0) {
    const declaredEntry = toVisit.pop();
    const normalizedEntry = toPosix(declaredEntry.replace(/^\.\//, ''));
    if (visitedFiles.has(normalizedEntry)) continue;

    const absoluteEntry = path.join(packageDef.packageRoot, normalizedEntry);
    assert.ok(existsSync(absoluteEntry), `${packageDef.label} runtime file is missing: ${normalizedEntry}`);
    visitedFiles.add(normalizedEntry);

    const sourceText = readFileSync(absoluteEntry, 'utf8');
    for (const specifier of collectStaticModuleSpecifiers(sourceText, absoluteEntry)) {
      if (!specifier.startsWith('.')) continue;

      const resolvedFile = resolveStandaloneLocalModule(
        packageDef,
        absoluteEntry,
        normalizedEntry,
        specifier,
        'local static import/export',
      );

      toVisit.push(toPosix(path.relative(packageDef.packageRoot, resolvedFile)));
    }
  }
}

function collectStandaloneRuntimeFiles(packageDef, manifest) {
  const runtimeFiles = new Set();
  const visitedFiles = new Set();
  const toVisit = [...getStandaloneExtensionEntries(manifest)];

  while (toVisit.length > 0) {
    const declaredEntry = toVisit.pop();
    const normalizedEntry = toPosix(declaredEntry.replace(/^\.\//, ''));
    if (visitedFiles.has(normalizedEntry)) continue;

    const absoluteEntry = path.join(packageDef.packageRoot, normalizedEntry);
    assert.ok(existsSync(absoluteEntry), `${packageDef.label} runtime file is missing: ${normalizedEntry}`);
    visitedFiles.add(normalizedEntry);
    runtimeFiles.add(normalizedEntry);

    const sourceText = readFileSync(absoluteEntry, 'utf8');
    for (const specifier of collectRuntimeModuleSpecifiers(sourceText, absoluteEntry)) {
      if (!specifier.startsWith('.')) continue;

      const resolvedFile = resolveStandaloneLocalModule(
        packageDef,
        absoluteEntry,
        normalizedEntry,
        specifier,
        'local runtime import',
      );

      const normalizedResolved = toPosix(path.relative(packageDef.packageRoot, resolvedFile));
      runtimeFiles.add(normalizedResolved);
      toVisit.push(normalizedResolved);
    }
  }

  return runtimeFiles;
}

test('publishable manifests do not use workspace protocol dependencies', () => {
  for (const packageDef of publishablePackages) {
    const manifest = readManifest(packageDef);
    for (const [sectionName, dependencies] of getDependencySections(manifest)) {
      for (const [dependencyName, version] of Object.entries(dependencies)) {
        assert.notEqual(
          typeof version === 'string' ? version.trim().startsWith('workspace:') : false,
          true,
          `${packageDef.label} manifest must not publish workspace: dependency ${dependencyName} in ${sectionName}`,
        );
      }
    }
  }
});

test('standalone publishable extensions do not import files outside their package roots', () => {
  for (const packageDef of publishablePackages.filter((candidate) => candidate.workspace)) {
    assertStandaloneStaticImportsStayWithinPackageRoot(packageDef, readManifest(packageDef));
  }
});

test('root package pack output excludes repo-only extension scripts and docs directories', () => {
  const rootPackageDef = publishablePackages.find((candidate) => candidate.label === 'root');
  const packedFiles = getPublishedFiles(rootPackageDef);

  const repoOnlyPathPattern = /^extensions\/[^/]+\/(scripts|docs)\//;
  const offendingFiles = [...packedFiles].filter((file) => repoOnlyPathPattern.test(file));

  assert.deepEqual(
    offendingFiles,
    [],
    `root package must not publish repo-only extension scripts/ or docs/ files: ${offendingFiles.join(', ')}`,
  );
});

test('publishable package files allowlists include declared runtime files', () => {
  for (const packageDef of publishablePackages) {
    const manifest = readManifest(packageDef);
    const packedFiles = getPublishedFiles(packageDef);

    for (const { entry } of getRuntimeDeclarations(manifest)) {
      const normalizedEntry = toPosix(entry.replace(/^\.\//, ''));
      const absoluteEntry = path.join(packageDef.packageRoot, normalizedEntry);
      assert.ok(existsSync(absoluteEntry), `${packageDef.label} runtime declaration is missing on disk: ${normalizedEntry}`);

      const stats = statSync(absoluteEntry);
      if (stats.isDirectory()) {
        for (const nestedFile of collectDirectoryFiles(absoluteEntry)) {
          const publishedPath = toPosix(path.join(normalizedEntry, nestedFile));
          assert.ok(
            packedFiles.has(publishedPath),
            `${packageDef.label} published files must include runtime directory file ${publishedPath}`,
          );
        }
      } else {
        assert.ok(
          packedFiles.has(normalizedEntry),
          `${packageDef.label} published files must include runtime file ${normalizedEntry}`,
        );
      }
    }

    if (!packageDef.workspace) continue;

    for (const runtimeFile of collectStandaloneRuntimeFiles(packageDef, manifest)) {
      assert.ok(
        packedFiles.has(runtimeFile),
        `${packageDef.label} published files must include local runtime import ${runtimeFile}`,
      );
    }
  }
});
