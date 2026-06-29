import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { getWorkspacePackageManifestPaths, repoRoot } from './workspace-package-helpers.mjs';

test('workspace package manifests are present and parse as JSON', async () => {
  const manifestPaths = getWorkspacePackageManifestPaths();

  assert.ok(manifestPaths.length > 0, 'expected at least one workspace package');

  for (const manifestPath of manifestPaths) {
    const packageFile = path.join(repoRoot, manifestPath);
    const manifest = JSON.parse(await readFile(packageFile, 'utf8'));
    assert.equal(typeof manifest.name, 'string', `${manifestPath} should declare a package name`);
    assert.ok(manifest.name.length > 0, `${manifestPath} should not have an empty package name`);
  }
});
