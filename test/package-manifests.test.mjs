import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const extensionsDir = path.join(repoRoot, 'extensions');

test('workspace package manifests are present and parse as JSON', async () => {
  const entries = await readdir(extensionsDir, { withFileTypes: true });
  const packageFiles = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(extensionsDir, entry.name, 'package.json'));

  assert.ok(packageFiles.length > 0, 'expected at least one workspace package');

  for (const packageFile of packageFiles) {
    const manifest = JSON.parse(await readFile(packageFile, 'utf8'));
    assert.equal(typeof manifest.name, 'string', `${packageFile} should declare a package name`);
    assert.ok(manifest.name.length > 0, `${packageFile} should not have an empty package name`);
  }
});
