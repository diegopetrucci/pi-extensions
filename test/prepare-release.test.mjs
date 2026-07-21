import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareRelease, PUBLIC_REGISTRY } from '../scripts/prepare-release.mjs';

async function json(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prepare-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await json(path.join(root, 'package.json'), { name: '@example/umbrella', version: '1.0.0', workspaces: ['packages/*'], dependencies: { 'plain-addon': '1.0.0' } });
  await json(path.join(root, 'packages/a/package.json'), { name: '@example/a', version: '1.0.0', dependencies: { 'plain-addon': '1.0.0' }, peerDependencies: { 'plain-addon': '1.0.0' }, devDependencies: { 'plain-addon': '1.0.0' } });
  await json(path.join(root, 'packages/b/package.json'), { name: 'plain-addon', version: '1.0.0' });
  await json(path.join(root, 'package-lock.json'), { name: '@example/umbrella', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: '@example/umbrella', version: '1.0.0' }, 'packages/a': { name: '@example/a', version: '1.0.0' }, 'packages/b': { name: 'plain-addon', version: '1.0.0' } } });
  const input = { releaseVersion: '1.1.0', versions: { '@example/umbrella': '1.1.0', '@example/a': '1.1.0', 'plain-addon': '1.1.0' }, fleetMarkers: { 'plain-addon': '0.80.6' } };
  await json(path.join(root, 'release.json'), input);
  return { root, input };
}

function mockRunner(root, { local = {}, baseline = {}, target = {}, registryError, installError, staleTopLevel = false, calls = [] } = {}) {
  return async (file, args, options = {}) => {
    calls.push({ file, args: [...args], cwd: options.cwd });
    assert.equal(file, 'npm');
    assert.ok(args.some((arg) => arg === `--registry=${PUBLIC_REGISTRY}`));
    assert.ok(!args.includes('publish'), 'release preparation must never execute npm publish');
    if (args[0] === 'install') {
      assert.deepEqual(args, ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', `--registry=${PUBLIC_REGISTRY}`]);
      const lockPath = path.join(root, 'package-lock.json');
      const lock = JSON.parse(await readFile(lockPath, 'utf8'));
      for (const key of Object.keys(lock.packages)) {
        const manifestPath = key ? path.join(root, key, 'package.json') : path.join(root, 'package.json');
        lock.packages[key].version = JSON.parse(await readFile(manifestPath, 'utf8')).version;
      }
      lock.version = staleTopLevel ? '0.0.0' : lock.packages[''].version;
      await json(lockPath, lock);
      if (installError) return { code: 1, stdout: '', stderr: installError };
      return { code: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'view') {
      const spec = args[1];
      if (registryError) return { code: 1, stdout: '', stderr: registryError };
      if (target[spec] === 'published') return { code: 0, stdout: JSON.stringify(spec.split('@').at(-1)), stderr: '' };
      return { code: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 Not Found' };
    }
    assert.equal(args[0], 'pack');
    assert.ok(args.includes('--dry-run') && args.includes('--json') && args.includes('--ignore-scripts'));
    const spec = args.find((arg) => !arg.startsWith('-') && arg !== 'pack');
    let name;
    let shasum;
    if (spec) {
      name = spec.startsWith('@') ? spec.slice(0, spec.lastIndexOf('@')) : spec.slice(0, spec.lastIndexOf('@'));
      if (baseline[name] === 'absent') return { code: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 Not Found' };
      shasum = baseline[name] ?? `same:${name}`;
    } else {
      const manifest = JSON.parse(await readFile(path.join(options.cwd, 'package.json'), 'utf8'));
      name = manifest.name;
      shasum = local[name] ?? `same:${name}`;
    }
    return { code: 0, stdout: JSON.stringify([{ name, shasum, size: 100 + name.length, unpackedSize: 200 + name.length, files: [{ path: 'package.json' }, { path: 'index.js' }] }]), stderr: '' };
  };
}

const changedHashes = {
  '@example/umbrella': 'changed-root-artifact',
  '@example/a': 'changed-a-artifact',
  'plain-addon': 'changed-unscoped-artifact',
};

test('dry-run selects packages by pack artifacts, includes root overlap, orders the DAG, and is stable', async (t) => {
  const { root } = await fixture(t);
  const calls = [];
  const run = mockRunner(root, { local: changedHashes, calls });
  const before = await readFile(path.join(root, 'package.json'), 'utf8');
  const first = await prepareRelease({ cwd: path.join(root, 'packages/a'), inputPath: '../../release.json', run });
  const second = await prepareRelease({ cwd: root, inputPath: 'release.json', run });
  assert.deepEqual(first, second);
  assert.equal(first.mode, 'dry-run');
  assert.deepEqual(first.packages.map(({ name }) => name), ['plain-addon', '@example/a', '@example/umbrella']);
  assert.ok(first.packages.every(({ size, unpackedSize, fileCount }) => size > 0 && unpackedSize > size && fileCount === 2));
  assert.ok(first.documents.every(({ action }) => action === 'would-create'));
  assert.equal(await readFile(path.join(root, 'package.json'), 'utf8'), before);
  assert.ok(calls.every(({ args }) => !args.includes('publish') && !args.some((arg) => /token|commit|tag|push|release/.test(arg))));
});

test('registry target collisions and non-404 errors hard-fail', async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(
    prepareRelease({ cwd: root, inputPath: 'release.json', run: mockRunner(root, { local: { '@example/a': 'changed' }, target: { '@example/a@1.1.0': 'published' } }) }),
    /already published: @example\/a@1\.1\.0/,
  );
  await assert.rejects(
    prepareRelease({ cwd: root, inputPath: 'release.json', run: mockRunner(root, { local: { '@example/a': 'changed' }, registryError: 'npm error code E500\nserver unavailable' }) }),
    /registry target check.*E500/,
  );
});

test('write mode synchronizes selected versions and lock entries, writes optional markers, and preserves prose on rerun', async (t) => {
  const { root } = await fixture(t);
  const humanDoc = path.join(root, 'docs/github-release-v1.1.0.md');
  await mkdir(path.dirname(humanDoc), { recursive: true });
  const evidence = '<!-- prepare-release:packages [["plain-addon","1.1.0"],["@example/a","1.1.0"],["@example/umbrella","1.1.0"]] -->';
  await writeFile(humanDoc, `Human summary.\n\n## Highlights\n\nKeep this prose.\n\n## Packages\n\nHand edited.\n\n## Install\n\nUse tlh.\n\n${evidence}\n`);
  const calls = [];
  const run = mockRunner(root, { local: changedHashes, calls });
  const first = await prepareRelease({ cwd: root, inputPath: 'release.json', write: true, run });
  const prose = await readFile(humanDoc, 'utf8');
  const second = await prepareRelease({ cwd: root, inputPath: 'release.json', write: true, run });
  assert.equal(await readFile(humanDoc, 'utf8'), prose);
  assert.equal(prose.startsWith('Human summary.'), true);
  assert.match(prose, /## Highlights[\s\S]*## Packages[\s\S]*## Install/);
  assert.doesNotMatch(prose, /^# GitHub release body/m);
  assert.equal(first.documents.find(({ path: p }) => p.includes('github-release')).action, 'preserved');
  assert.ok(second.documents.every(({ action }) => action === 'preserved'));
  for (const relative of ['package.json', 'packages/a/package.json', 'packages/b/package.json']) {
    assert.equal(JSON.parse(await readFile(path.join(root, relative), 'utf8')).version, '1.1.0');
  }
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  assert.deepEqual(Object.values(lock.packages).map(({ version }) => version), ['1.1.0', '1.1.0', '1.1.0']);
  assert.equal(await readFile(path.join(root, 'packages/b/.pi-fleet-tested-version'), 'utf8'), '0.80.6\n');
  assert.equal(calls.filter(({ args }) => args[0] === 'install').length, 2);
});

test('new absent baseline is changed and exact versions are mandatory', async (t) => {
  const { root, input } = await fixture(t);
  delete input.versions['plain-addon'];
  await json(path.join(root, 'release.json'), input);
  await assert.rejects(
    prepareRelease({ cwd: root, inputPath: 'release.json', run: mockRunner(root, { baseline: { 'plain-addon': 'absent' } }) }),
    /Changed package plain-addon needs an exact target version/,
  );
});

test('npm pack ETARGET no matching version output is treated as an absent baseline', async (t) => {
  const { root, input } = await fixture(t);
  delete input.versions['plain-addon'];
  await json(path.join(root, 'release.json'), input);
  const run = mockRunner(root);
  await assert.rejects(
    prepareRelease({
      cwd: root,
      inputPath: 'release.json',
      run: async (file, args, options) => {
        if (args[0] === 'pack' && args.some((arg) => arg === 'plain-addon@1.0.0')) {
          return { code: 1, stdout: '', stderr: 'npm error code ETARGET\nnpm error notarget No matching version found for plain-addon@1.0.0.' };
        }
        return run(file, args, options);
      },
    }),
    /Changed package plain-addon needs an exact target version/,
  );
});

test('selected root rejects a mismatched explicit releaseVersion before document validation, while unchanged root keeps independent releaseVersion', async (t) => {
  const { root, input } = await fixture(t);
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs/github-release-v9.9.9.md'), 'stale document without marker\n');
  input.releaseVersion = '9.9.9';
  await json(path.join(root, 'release.json'), input);
  await assert.rejects(
    prepareRelease({ cwd: root, inputPath: 'release.json', run: mockRunner(root, { local: changedHashes }) }),
    /Explicit releaseVersion 9\.9\.9 must match selected root target @example\/umbrella@1\.1\.0/,
  );

  const workspaceOnlyInput = {
    releaseVersion: '4.5.6',
    versions: { '@example/a': '1.1.0' },
  };
  await json(path.join(root, 'workspace-only.json'), workspaceOnlyInput);
  const summary = await prepareRelease({ cwd: root, inputPath: 'workspace-only.json', run: mockRunner(root, { local: { '@example/a': 'changed-a-artifact' } }) });
  assert.equal(summary.releaseVersion, '4.5.6');
  assert.deepEqual(summary.packages.map(({ name }) => name), ['@example/a']);
  assert.ok(summary.documents.every(({ path: filePath }) => filePath.includes('v4.5.6')));
});

test('ambiguous or mixed 404 output hard-fails and an empty selection is rejected', async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(
    prepareRelease({ cwd: root, inputPath: 'release.json', run: mockRunner(root, { local: { '@example/a': 'changed' }, registryError: 'npm error code E404\nnpm error code E500\n404 Not Found' }) }),
    /registry target check.*E404.*E500/s,
  );
  await assert.rejects(
    prepareRelease({ cwd: root, inputPath: 'release.json', run: mockRunner(root) }),
    /No changed packages were detected/,
  );
});

test('changed inputs cannot reuse stale managed document evidence or mutate manifests', async (t) => {
  const { root, input } = await fixture(t);
  const run = mockRunner(root, { local: changedHashes });
  await prepareRelease({ cwd: root, inputPath: 'release.json', write: true, run });
  const generatedBody = await readFile(path.join(root, 'docs/github-release-v1.1.0.md'), 'utf8');
  assert.match(generatedBody, /^Release v1\.1\.0 includes the package set listed below\.\n\n## Highlights[\s\S]*## Packages[\s\S]*## Install/);
  assert.doesNotMatch(generatedBody, /^<!--/);
  const checklist = await readFile(path.join(root, 'docs/publish-checklist-v1.1.0.md'), 'utf8');
  assert.match(checklist, /## Agent-safe follow-up actions\n\n- \[ \] commit release prep changes outside this tool\n- \[ \] tag the release outside this tool\n- \[ \] push the branch and tag outside this tool\n- \[ \] create the GitHub release outside this tool/);
  assert.match(checklist, /## Human-only release actions\n\n- \[ \] publish selected packages manually \(this tool cannot publish\)/);
  assert.doesNotMatch(checklist, /Human-only release actions[\s\S]*commit, tag, push, and create the GitHub release/s);
  const manifestPath = path.join(root, 'packages/a/package.json');
  const before = await readFile(manifestPath);
  input.versions['@example/a'] = '1.2.0';
  await json(path.join(root, 'release.json'), input);
  await assert.rejects(
    prepareRelease({ cwd: root, inputPath: 'release.json', write: true, run }),
    /stale package evidence/,
  );
  assert.deepEqual(await readFile(manifestPath), before);
});

test('install failure rolls back manifests, lockfile, markers, and newly-created documents', async (t) => {
  const { root } = await fixture(t);
  const tracked = ['package.json', 'packages/a/package.json', 'packages/b/package.json', 'package-lock.json'];
  const before = new Map(await Promise.all(tracked.map(async (relative) => [relative, await readFile(path.join(root, relative))])));
  await assert.rejects(
    prepareRelease({ cwd: root, inputPath: 'release.json', write: true, run: mockRunner(root, { local: changedHashes, installError: 'install exploded' }) }),
    /lockfile synchronization failed.*install exploded/,
  );
  for (const [relative, content] of before) assert.deepEqual(await readFile(path.join(root, relative)), content);
  await assert.rejects(readFile(path.join(root, 'packages/b/.pi-fleet-tested-version')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(root, 'docs/github-release-v1.1.0.md')), { code: 'ENOENT' });
});

test('stale top-level lock version fails post-install verification and rolls back exactly', async (t) => {
  const { root } = await fixture(t);
  const manifestBefore = await readFile(path.join(root, 'package.json'));
  const lockBefore = await readFile(path.join(root, 'package-lock.json'));
  await assert.rejects(
    prepareRelease({ cwd: root, inputPath: 'release.json', write: true, run: mockRunner(root, { local: changedHashes, staleTopLevel: true }) }),
    /Top-level lock version does not match/,
  );
  assert.deepEqual(await readFile(path.join(root, 'package.json')), manifestBefore);
  assert.deepEqual(await readFile(path.join(root, 'package-lock.json')), lockBefore);
  await assert.rejects(readFile(path.join(root, 'docs/release-notes-v1.1.0.md')), { code: 'ENOENT' });
});
