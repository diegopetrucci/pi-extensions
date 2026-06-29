import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(testDir, '..');

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function readJson(jsonPath) {
  return JSON.parse(readFileSync(jsonPath, 'utf8'));
}

function getWorkspacePatterns(rootManifest) {
  if (Array.isArray(rootManifest.workspaces)) return rootManifest.workspaces;
  if (rootManifest.workspaces && Array.isArray(rootManifest.workspaces.packages)) {
    return rootManifest.workspaces.packages;
  }

  return [];
}

function listChildDirectories(directoryPath) {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) return [];

  return readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directoryPath, entry.name));
}

function collectDescendantDirectories(directoryPath) {
  const directories = [directoryPath];

  for (const childDirectory of listChildDirectories(directoryPath)) {
    directories.push(...collectDescendantDirectories(childDirectory));
  }

  return directories;
}

function expandWorkspacePattern(pattern) {
  const normalizedPattern = pattern.replaceAll('\\', '/').replace(/\/+$/, '');
  if (!normalizedPattern) return [];

  const segments = normalizedPattern.split('/').filter(Boolean);
  let candidates = [repoRoot];

  for (const segment of segments) {
    if (segment === '**') {
      candidates = candidates.flatMap((candidate) => collectDescendantDirectories(candidate));
      continue;
    }

    if (segment === '*') {
      candidates = candidates.flatMap((candidate) => listChildDirectories(candidate));
      continue;
    }

    candidates = candidates
      .map((candidate) => path.join(candidate, segment))
      .filter((candidate) => existsSync(candidate) && statSync(candidate).isDirectory());
  }

  return candidates;
}

export function getWorkspacePackageManifestPaths() {
  const rootManifest = readJson(path.join(repoRoot, 'package.json'));
  const manifestPaths = new Set();

  for (const pattern of getWorkspacePatterns(rootManifest)) {
    for (const workspaceDirectory of expandWorkspacePattern(pattern)) {
      const manifestPath = path.join(workspaceDirectory, 'package.json');
      if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) continue;
      manifestPaths.add(toPosix(path.relative(repoRoot, manifestPath)));
    }
  }

  return [...manifestPaths].sort();
}

export function getWorkspacePackageDefs() {
  const packageDefs = getWorkspacePackageManifestPaths().map((manifestPath) => {
    const packageRoot = path.join(repoRoot, path.dirname(manifestPath));
    const manifest = readJson(path.join(repoRoot, manifestPath));

    assert.equal(typeof manifest.name, 'string', `${manifestPath} should declare a package name`);
    assert.ok(manifest.name.length > 0, `${manifestPath} should not have an empty package name`);

    return {
      label: manifest.name,
      manifestPath,
      packageRoot,
      workspace: manifest.name,
    };
  });

  assert.ok(packageDefs.length > 0, 'expected at least one workspace package');
  return packageDefs;
}
