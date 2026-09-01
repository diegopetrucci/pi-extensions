import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { defaultCreateTagSnapshot, gzipPayloadEqual, PUBLIC_REGISTRY, publishRelease } from '../scripts/publish-release.mjs';

async function json(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function text(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

async function fixture(t) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'publish-release-'));
  const root = path.join(tempRoot, 'repo');
  const snapshot = path.join(tempRoot, 'tag');
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const evidence = [
    ['plain-addon', '1.2.3'],
    ['@example/feature', '1.2.3'],
    ['@example/umbrella', '1.2.3'],
  ];
  const releaseDoc = `Release v1.2.3 helper coverage.\n\n## Packages\n\n- \`plain-addon@1.2.3\`\n- \`@example/feature@1.2.3\`\n- \`@example/umbrella@1.2.3\`\n\n<!-- prepare-release:packages ${JSON.stringify(evidence)} -->\n`;

  for (const base of [root, snapshot]) {
    await json(path.join(base, 'package.json'), {
      name: '@example/umbrella',
      version: '1.2.3',
      workspaces: ['packages/*'],
      files: ['README.md', 'index.js'],
      dependencies: { 'plain-addon': '1.2.3', '@example/feature': '1.2.3' },
      publishConfig: { access: 'public' },
    });
    await json(path.join(base, 'packages/plain-addon/package.json'), {
      name: 'plain-addon',
      version: '1.2.3',
      files: ['index.js', 'README.md'],
      publishConfig: { access: 'public' },
    });
    await json(path.join(base, 'packages/feature/package.json'), {
      name: '@example/feature',
      version: '1.2.3',
      files: ['index.js', 'README.md'],
      dependencies: { 'plain-addon': '1.2.3' },
      publishConfig: { access: 'public' },
    });
    await text(path.join(base, 'README.md'), '# umbrella\n');
    await text(path.join(base, 'index.js'), 'export default 1;\n');
    await text(path.join(base, 'packages/plain-addon/index.js'), 'export default "plain";\n');
    await text(path.join(base, 'packages/plain-addon/README.md'), '# plain\n');
    await text(path.join(base, 'packages/feature/index.js'), 'export default "feature";\n');
    await text(path.join(base, 'packages/feature/README.md'), '# feature\n');
  }

  await text(path.join(root, 'docs/github-release-v1.2.3.md'), releaseDoc);
  await text(path.join(snapshot, 'docs/github-release-v1.2.3.md'), releaseDoc);
  return { root, snapshot };
}

function packResponse(name, shasum, integrity, files) {
  const filename = `${name.replace(/^@/, '').replaceAll('/', '-')}-1.2.3.tgz`;
  return JSON.stringify([{ name, filename, shasum, integrity, size: 100 + name.length, unpackedSize: 200 + name.length, files }]);
}

async function cloneSnapshot(snapshot) {
  const target = await mkdtemp(path.join(os.tmpdir(), 'publish-release-tag-clone-'));
  await cp(snapshot, target, { recursive: true });
  return target;
}

function githubEnv(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: 'diegopetrucci/pi-extensions',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'diegopetrucci/pi-extensions/.github/workflows/publish.yml@refs/heads/main',
    GITHUB_SHA: 'deadbeef',
    RUNNER_ENVIRONMENT: 'github-hosted',
    NPM_RELEASE_ENVIRONMENT: 'npm-release',
    RELEASE_TAG: 'v1.2.3',
    RELEASE_CONFIRMATION: 'v1.2.3',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example/oidc',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-request-token',
    ...overrides,
  };
}

function mockRunner({ root, snapshot, dirtyByPackage = {}, publishedSpecs = new Set(), postPublishVisibilityMisses = {}, registryError, registryDistOverrides = {}, registryPackPayloadOverrides = {}, registryPackDirectories = [], packOverrides = {}, releaseOverrides = {}, remoteTag = 'deadbeef', calls = [] }) {
  const artifacts = new Map();
  const remainingPostPublishMisses = new Map();
  return async (file, args, options = {}) => {
    calls.push({ file, args: [...args], cwd: options.cwd, env: options.env, replaceEnv: options.replaceEnv });
    if (file === 'git') {
      if (args[0] === 'rev-parse') return { code: 0, stdout: 'deadbeef\n', stderr: '' };
      if (args[0] === 'ls-remote') return { code: 0, stdout: `${remoteTag}\trefs/tags/v1.2.3^{}\n`, stderr: '' };
      if (args[0] === 'merge-base') return { code: 0, stdout: '', stderr: '' };
      if (args[0] === 'status') {
        const packagePath = args.at(-1).includes('packages/feature') ? '@example/feature' : args.at(-1).includes('packages/plain-addon') ? 'plain-addon' : '@example/umbrella';
        return { code: 0, stdout: dirtyByPackage[packagePath] ?? '', stderr: '' };
      }
      throw new Error(`Unexpected git command: ${args.join(' ')}`);
    }
    if (file === 'gh') {
      const body = await readFile(path.join(root, 'docs/github-release-v1.2.3.md'), 'utf8');
      return {
        code: 0,
        stdout: JSON.stringify({ tagName: 'v1.2.3', isDraft: false, isPrerelease: false, publishedAt: '2026-01-01T00:00:00Z', url: 'https://example.test/releases/v1.2.3', body, ...releaseOverrides }),
        stderr: '',
      };
    }
    if (file !== 'npm') throw new Error(`Unexpected command: ${file}`);
    if (args[0] === 'view') {
      const spec = args[1];
      if (args[2] === 'dist-tags.latest') {
        const published = [...publishedSpecs].find((candidate) => candidate.startsWith(`${spec}@`));
        return { code: 0, stdout: JSON.stringify(published?.slice(published.lastIndexOf('@') + 1) ?? '1.2.3'), stderr: '' };
      }
      if (registryError) return { code: 1, stdout: '', stderr: registryError };
      if (publishedSpecs.has(spec)) {
        const remainingMisses = remainingPostPublishMisses.get(spec) ?? 0;
        if (remainingMisses > 0) {
          remainingPostPublishMisses.set(spec, remainingMisses - 1);
          return { code: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 Not Found' };
        }
        const dist = registryDistOverrides[spec] ?? (() => {
          const version = spec.slice(spec.lastIndexOf('@') + 1);
          return { shasum: `${spec.replace(`@${version}`, '')}:same`, integrity: `sha512-${spec.replace(`@${version}`, '')}:same` };
        })();
        return { code: 0, stdout: JSON.stringify(dist), stderr: '' };
      }
      return { code: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 Not Found' };
    }
    if (args[0] === 'publish') {
      const spec = artifacts.get(args[1]);
      assert.ok(spec, `unknown packed artifact ${args[1]}`);
      assert.deepEqual(args.slice(2), ['--ignore-scripts', '--access', 'public', '--tag', 'latest', `--registry=${PUBLIC_REGISTRY}`]);
      publishedSpecs.add(spec);
      remainingPostPublishMisses.set(spec, postPublishVisibilityMisses[spec] ?? 0);
      return { code: 0, stdout: 'published\n', stderr: '' };
    }
    if (args[0] === 'pack' && !args[1].startsWith('-')) {
      const spec = args[1];
      assert.deepEqual(args.slice(2), ['--json', '--ignore-scripts', '--pack-destination', args[5], `--registry=${PUBLIC_REGISTRY}`]);
      assert.equal(options.cwd, root);
      assert.equal(options.replaceEnv, true);
      assert.equal(options.env.NPM_CONFIG_USERCONFIG.endsWith('user.npmrc'), true);
      assert.equal(options.env.NPM_CONFIG_GLOBALCONFIG.endsWith('global.npmrc'), true);
      const versionSeparator = spec.lastIndexOf('@');
      const name = spec.slice(0, versionSeparator);
      const destination = args[args.indexOf('--pack-destination') + 1];
      registryPackDirectories.push(destination);
      const response = packResponse(name, 'registry:other', 'sha512-registry:other', []);
      const filename = JSON.parse(response)[0].filename;
      await mkdir(destination, { recursive: true });
      const payload = registryPackPayloadOverrides[spec] ?? `${name}\n`;
      await writeFile(path.join(destination, filename), gzipSync(payload, { level: 1 }));
      return { code: 0, stdout: response, stderr: '' };
    }
    assert.equal(args[0], 'pack');
    assert.deepEqual(args.slice(0, 3), ['pack', '--json', '--ignore-scripts']);
    assert.equal(args[3], '--pack-destination');
    assert.equal(args[5], `--registry=${PUBLIC_REGISTRY}`);
    const manifest = JSON.parse(await readFile(path.join(options.cwd, 'package.json'), 'utf8'));
    const packageRoot = path.resolve(options.cwd);
    const scope = packageRoot.startsWith(path.resolve(root)) ? 'current' : 'snapshot';
    const fileMap = {
      '@example/umbrella': [{ path: 'README.md', size: 10 }, { path: 'index.js', size: 17 }, { path: 'package.json', size: 99 }],
      'plain-addon': [{ path: 'README.md', size: 8 }, { path: 'index.js', size: 24 }, { path: 'package.json', size: 88 }],
      '@example/feature': [{ path: 'README.md', size: 10 }, { path: 'index.js', size: 26 }, { path: 'package.json', size: 91 }],
      '@example/zebra': [{ path: 'README.md', size: 8 }, { path: 'index.js', size: 24 }, { path: 'package.json', size: 88 }],
      '@example/ångstrom': [{ path: 'README.md', size: 11 }, { path: 'index.js', size: 27 }, { path: 'package.json', size: 92 }],
    };
    const shasum = packOverrides[`${scope}:${manifest.name}`]?.shasum ?? `${manifest.name}:same`;
    const integrity = packOverrides[`${scope}:${manifest.name}`]?.integrity ?? `sha512-${manifest.name}:same`;
    const response = packResponse(manifest.name, shasum, integrity, fileMap[manifest.name]);
    const filename = JSON.parse(response)[0].filename;
    await mkdir(args[4], { recursive: true });
    const artifactPath = path.join(args[4], filename);
    await writeFile(artifactPath, gzipSync(`${manifest.name}\n`, { level: 9 }));
    artifacts.set(artifactPath, `${manifest.name}@${manifest.version}`);
    return { code: 0, stdout: response, stderr: '' };
  };
}

test('dry-run verifies evidence against the tag without npm auth and never executes npm publish', async (t) => {
  const { root, snapshot } = await fixture(t);
  const calls = [];
  const result = await publishRelease({
    cwd: root,
    version: 'v1.2.3',
    dryRun: true,
    run: mockRunner({ root, snapshot, publishedSpecs: new Set(['plain-addon@1.2.3']), calls }),
    createTagSnapshot: async () => cloneSnapshot(snapshot),
  });

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.authMode, 'none');
  assert.equal(result.tagCommit, 'deadbeef');
  assert.deepEqual(result.planned.map(({ name, action }) => `${name}:${action}`), [
    'plain-addon:skip',
    '@example/feature:publish',
    '@example/umbrella:publish',
  ]);
  assert.deepEqual(result.skipped, ['plain-addon@1.2.3']);
  assert.deepEqual(result.published, []);
  assert.equal(calls.some(({ file, args }) => file === 'npm' && args[0] === 'publish'), false);
});

test('workspace-only evidence is allowed when it preserves dependency order', async (t) => {
  const { root, snapshot } = await fixture(t);
  const evidence = [['plain-addon', '1.2.3'], ['@example/feature', '1.2.3']];
  const releaseDoc = `Workspace-only release.\n\n<!-- prepare-release:packages ${JSON.stringify(evidence)} -->\n`;
  await text(path.join(root, 'docs/github-release-v1.2.3.md'), releaseDoc);
  await text(path.join(snapshot, 'docs/github-release-v1.2.3.md'), releaseDoc);
  const calls = [];
  const result = await publishRelease({
    cwd: root,
    version: 'v1.2.3',
    dryRun: true,
    run: mockRunner({ root, snapshot, calls }),
    createTagSnapshot: async () => cloneSnapshot(snapshot),
  });

  assert.deepEqual(result.planned.map(({ name }) => name), ['plain-addon', '@example/feature']);
  assert.equal(result.planned.some(({ umbrella }) => umbrella), false);
  assert.equal(calls.some(({ file, args }) => file === 'npm' && args[0] === 'publish'), false);
});

test('workspace publish ordering uses raw code-point sorting like prepare-release', async (t) => {
  const { root, snapshot } = await fixture(t);
  const rootManifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const snapshotManifest = JSON.parse(await readFile(path.join(snapshot, 'package.json'), 'utf8'));
  rootManifest.dependencies = { '@example/zebra': '1.2.3', '@example/ångstrom': '1.2.3' };
  snapshotManifest.dependencies = { '@example/zebra': '1.2.3', '@example/ångstrom': '1.2.3' };
  await json(path.join(root, 'package.json'), rootManifest);
  await json(path.join(snapshot, 'package.json'), snapshotManifest);

  await rm(path.join(root, 'packages/plain-addon'), { recursive: true, force: true });
  await rm(path.join(root, 'packages/feature'), { recursive: true, force: true });
  await rm(path.join(snapshot, 'packages/plain-addon'), { recursive: true, force: true });
  await rm(path.join(snapshot, 'packages/feature'), { recursive: true, force: true });

  for (const base of [root, snapshot]) {
    await json(path.join(base, 'packages/zebra/package.json'), {
      name: '@example/zebra',
      version: '1.2.3',
      files: ['index.js', 'README.md'],
      publishConfig: { access: 'public' },
    });
    await text(path.join(base, 'packages/zebra/index.js'), 'export default "zebra";\n');
    await text(path.join(base, 'packages/zebra/README.md'), '# zebra\n');
    await json(path.join(base, 'packages/angstrom/package.json'), {
      name: '@example/ångstrom',
      version: '1.2.3',
      files: ['index.js', 'README.md'],
      publishConfig: { access: 'public' },
    });
    await text(path.join(base, 'packages/angstrom/index.js'), 'export default "angstrom";\n');
    await text(path.join(base, 'packages/angstrom/README.md'), '# angstrom\n');
  }

  const evidence = [['@example/zebra', '1.2.3'], ['@example/ångstrom', '1.2.3'], ['@example/umbrella', '1.2.3']];
  const releaseDoc = `Code-point order release.\n\n<!-- prepare-release:packages ${JSON.stringify(evidence)} -->\n`;
  await text(path.join(root, 'docs/github-release-v1.2.3.md'), releaseDoc);
  await text(path.join(snapshot, 'docs/github-release-v1.2.3.md'), releaseDoc);

  const result = await publishRelease({
    cwd: root,
    version: 'v1.2.3',
    dryRun: true,
    run: mockRunner({ root, snapshot }),
    createTagSnapshot: async () => cloneSnapshot(snapshot),
  });

  assert.deepEqual(result.planned.map(({ name }) => name), ['@example/zebra', '@example/ångstrom', '@example/umbrella']);
});

test('GitHub OIDC live mode skips exact published versions, publishes verified tarballs root-last, and isolates npm config', async (t) => {
  const { root, snapshot } = await fixture(t);
  const calls = [];
  const result = await publishRelease({
    cwd: root,
    version: 'v1.2.3',
    githubActions: true,
    env: githubEnv(),
    run: mockRunner({ root, snapshot, publishedSpecs: new Set(['plain-addon@1.2.3']), calls }),
    sleep: async () => {},
    createTagSnapshot: async () => cloneSnapshot(snapshot),
  });

  assert.equal(result.authMode, 'github-oidc');
  assert.deepEqual(result.published, ['@example/feature@1.2.3', '@example/umbrella@1.2.3']);
  const publishCalls = calls.filter(({ file, args }) => file === 'npm' && args[0] === 'publish');
  assert.equal(publishCalls.length, 2);
  assert.ok(publishCalls.every(({ args }) => args[1].endsWith('.tgz')));
  assert.ok(publishCalls.every(({ cwd }) => cwd === root));
  assert.ok(publishCalls.every(({ env, replaceEnv }) => replaceEnv && env.NPM_CONFIG_USERCONFIG && env.NPM_CONFIG_GLOBALCONFIG));
  assert.ok(publishCalls.every(({ env }) => !env.NPM_TOKEN && !env.NODE_AUTH_TOKEN));
});

test('GitHub OIDC live mode gives post-publish propagation a bounded ten-minute window', async (t) => {
  const { root, snapshot } = await fixture(t);
  const sleeps = [];
  const result = await publishRelease({
    cwd: root,
    version: 'v1.2.3',
    githubActions: true,
    env: githubEnv(),
    run: mockRunner({
      root,
      snapshot,
      publishedSpecs: new Set(['plain-addon@1.2.3']),
      postPublishVisibilityMisses: { '@example/feature@1.2.3': 120 },
    }),
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    createTagSnapshot: async () => cloneSnapshot(snapshot),
  });

  assert.deepEqual(result.published, ['@example/feature@1.2.3', '@example/umbrella@1.2.3']);
  assert.equal(sleeps.length, 120);
  assert.ok(sleeps.every((milliseconds) => milliseconds === 5_000));

  const { root: timeoutRoot, snapshot: timeoutSnapshot } = await fixture(t);
  const timeoutSleeps = [];
  await assert.rejects(
    publishRelease({
      cwd: timeoutRoot,
      version: 'v1.2.3',
      githubActions: true,
      env: githubEnv(),
      run: mockRunner({
        root: timeoutRoot,
        snapshot: timeoutSnapshot,
        publishedSpecs: new Set(['plain-addon@1.2.3']),
        postPublishVisibilityMisses: { '@example/feature@1.2.3': 121 },
      }),
      sleep: async (milliseconds) => timeoutSleeps.push(milliseconds),
      createTagSnapshot: async () => cloneSnapshot(timeoutSnapshot),
    }),
    /Published package did not become visible: @example\/feature@1\.2\.3/,
  );
  assert.equal(timeoutSleeps.length, 120);
  assert.ok(timeoutSleeps.every((milliseconds) => milliseconds === 5_000));
});

test('unsafe evidence order and dirty publishable paths hard-fail before publish', async (t) => {
  const { root, snapshot } = await fixture(t);
  const badOrderDoc = 'Bad order\n\n<!-- prepare-release:packages [["@example/feature","1.2.3"],["plain-addon","1.2.3"],["@example/umbrella","1.2.3"]] -->\n';
  await text(path.join(root, 'docs/github-release-v1.2.3.md'), badOrderDoc);
  await text(path.join(snapshot, 'docs/github-release-v1.2.3.md'), badOrderDoc);
  await assert.rejects(
    publishRelease({ cwd: root, version: 'v1.2.3', dryRun: true, run: mockRunner({ root, snapshot }), createTagSnapshot: async () => cloneSnapshot(snapshot) }),
    /unsafe publish order/,
  );

  const { root: cleanRoot, snapshot: cleanSnapshot } = await fixture(t);
  await assert.rejects(
    publishRelease({
      cwd: cleanRoot,
      version: 'v1.2.3',
      dryRun: true,
      run: mockRunner({ root: cleanRoot, snapshot: cleanSnapshot, dirtyByPackage: { '@example/feature': ' M packages/feature/index.js\n' } }),
      createTagSnapshot: async () => cloneSnapshot(cleanSnapshot),
    }),
    /Publishable paths are dirty for @example\/feature/,
  );
});

test('content mismatches and legacy GitHub Actions npm credentials abort safely', async (t) => {
  const { root, snapshot } = await fixture(t);
  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      dryRun: true,
      run: mockRunner({
        root,
        snapshot,
        packOverrides: {
          'current:@example/feature': { shasum: 'feature-current', integrity: 'sha512-feature-current' },
          'snapshot:@example/feature': { shasum: 'feature-tag', integrity: 'sha512-feature-tag' },
        },
      }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /does not match v1\.2\.3/,
  );
  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      dryRun: true,
      githubActions: true,
      env: githubEnv({ NPM_TOKEN: 'forbidden' }),
      run: mockRunner({ root, snapshot }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /refuses legacy npm credential variables: NPM_TOKEN/,
  );
});

test('missing or malformed managed evidence fails before registry or publishing commands', async (t) => {
  const { root, snapshot } = await fixture(t);
  const calls = [];
  await rm(path.join(root, 'docs/github-release-v1.2.3.md'));
  await assert.rejects(
    publishRelease({ cwd: root, version: 'v1.2.3', dryRun: true, run: mockRunner({ root, snapshot, calls }), createTagSnapshot: async () => cloneSnapshot(snapshot) }),
    /Missing release document/,
  );
  assert.equal(calls.length, 0);

  const { root: malformedRoot, snapshot: malformedSnapshot } = await fixture(t);
  const malformedCalls = [];
  await text(path.join(malformedRoot, 'docs/github-release-v1.2.3.md'), 'Release body\n\n<!-- prepare-release:packages [["plain-addon"]] -->\n');
  await assert.rejects(
    publishRelease({ cwd: malformedRoot, version: 'v1.2.3', dryRun: true, run: mockRunner({ root: malformedRoot, snapshot: malformedSnapshot, calls: malformedCalls }), createTagSnapshot: async () => cloneSnapshot(malformedSnapshot) }),
    /Checkout release document does not match release tag v1\.2\.3/,
  );
  assert.equal(malformedCalls.some(({ file }) => file === 'npm'), false);
});

test('changed narrative, changed evidence, or omitted checkout evidence fails closed against the tagged release document', async (t) => {
  const { root: narrativeRoot, snapshot: narrativeSnapshot } = await fixture(t);
  const narrativePath = path.join(narrativeRoot, 'docs/github-release-v1.2.3.md');
  const unchangedEvidence = await readFile(narrativePath, 'utf8');
  await text(narrativePath, unchangedEvidence.replace('Release v1.2.3 helper coverage.', 'Edited release narrative.'));
  await assert.rejects(
    publishRelease({
      cwd: narrativeRoot,
      version: 'v1.2.3',
      dryRun: true,
      run: mockRunner({ root: narrativeRoot, snapshot: narrativeSnapshot }),
      createTagSnapshot: async () => cloneSnapshot(narrativeSnapshot),
    }),
    /Checkout release document does not match release tag v1\.2\.3/,
  );

  const { root, snapshot } = await fixture(t);
  await text(
    path.join(root, 'docs/github-release-v1.2.3.md'),
    'Changed checkout evidence\n\n<!-- prepare-release:packages [["plain-addon","1.2.3"],["@example/umbrella","1.2.3"]] -->\n',
  );
  await assert.rejects(
    publishRelease({ cwd: root, version: 'v1.2.3', dryRun: true, run: mockRunner({ root, snapshot }), createTagSnapshot: async () => cloneSnapshot(snapshot) }),
    /Checkout release document does not match release tag v1\.2\.3/,
  );

  const { root: missingEvidenceRoot, snapshot: missingEvidenceSnapshot } = await fixture(t);
  await text(path.join(missingEvidenceRoot, 'docs/github-release-v1.2.3.md'), 'Checkout prose without marker\n');
  await assert.rejects(
    publishRelease({
      cwd: missingEvidenceRoot,
      version: 'v1.2.3',
      dryRun: true,
      run: mockRunner({ root: missingEvidenceRoot, snapshot: missingEvidenceSnapshot }),
      createTagSnapshot: async () => cloneSnapshot(missingEvidenceSnapshot),
    }),
    /Checkout release document does not match release tag v1\.2\.3/,
  );
});

test('matching hashes or canonical tar payloads skip exact versions, while missing or mismatched content fails closed', async (t) => {
  const { root, snapshot } = await fixture(t);
  const skipped = await publishRelease({
    cwd: root,
    version: 'v1.2.3',
    dryRun: true,
    run: mockRunner({ root, snapshot, publishedSpecs: new Set(['plain-addon@1.2.3']) }),
    createTagSnapshot: async () => cloneSnapshot(snapshot),
  });
  assert.deepEqual(skipped.skipped, ['plain-addon@1.2.3']);

  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      dryRun: true,
      run: mockRunner({
        root,
        snapshot,
        publishedSpecs: new Set(['plain-addon@1.2.3']),
        registryDistOverrides: { 'plain-addon@1.2.3': { shasum: 'plain-addon:same' } },
      }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /missing dist\.integrity/,
  );

  const registryPackDirectories = [];
  const recompressed = await publishRelease({
    cwd: root,
    version: 'v1.2.3',
    dryRun: true,
    run: mockRunner({
      root,
      snapshot,
      publishedSpecs: new Set(['plain-addon@1.2.3']),
      registryDistOverrides: { 'plain-addon@1.2.3': { shasum: 'plain-addon:other', integrity: 'sha512-plain-addon:other' } },
      registryPackDirectories,
    }),
    createTagSnapshot: async () => cloneSnapshot(snapshot),
  });
  assert.deepEqual(recompressed.skipped, ['plain-addon@1.2.3']);
  assert.equal(registryPackDirectories.length, 1);
  await assert.rejects(stat(registryPackDirectories[0]), /ENOENT/);

  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      dryRun: true,
      run: mockRunner({
        root,
        snapshot,
        publishedSpecs: new Set(['plain-addon@1.2.3']),
        registryDistOverrides: { 'plain-addon@1.2.3': { shasum: 'plain-addon:other', integrity: 'sha512-plain-addon:other' } },
        registryPackPayloadOverrides: { 'plain-addon@1.2.3': 'tampered\n' },
      }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /registry dist metadata mismatch for plain-addon@1\.2\.3/,
  );
});

test('gzipPayloadEqual ignores encoding differences but rejects different, malformed, or bounded-overflow payloads', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'publish-release-gzip-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const mib = 1024 * 1024;
  const compressedLimit = 8 * mib;
  const payloadLimit = 16 * mib;
  const expected = path.join(directory, 'expected.tgz');
  const recompressed = path.join(directory, 'recompressed.tgz');
  const different = path.join(directory, 'different.tgz');
  const malformed = path.join(directory, 'malformed.tgz');
  const compressedLimitExpected = path.join(directory, 'compressed-limit-expected.tgz');
  const compressedLimitExceeded = path.join(directory, 'compressed-limit-exceeded.tgz');
  const payloadLimitLeft = path.join(directory, 'payload-limit-left.tgz');
  const payloadLimitRight = path.join(directory, 'payload-limit-right.tgz');
  await writeFile(expected, gzipSync('same payload', { level: 9 }));
  await writeFile(recompressed, gzipSync('same payload', { level: 1 }));
  await writeFile(different, gzipSync('different payload', { level: 9 }));
  await writeFile(malformed, 'not gzip');

  const compressedLimitPayload = Buffer.alloc(compressedLimit + 1);
  const smallEncoding = gzipSync(compressedLimitPayload, { level: 9 });
  const oversizedEncoding = gzipSync(compressedLimitPayload, { level: 0 });
  assert.ok(smallEncoding.length < compressedLimit);
  assert.ok(oversizedEncoding.length > compressedLimit);
  await writeFile(compressedLimitExpected, smallEncoding);
  await writeFile(compressedLimitExceeded, oversizedEncoding);

  const expandedPayload = gzipSync(Buffer.alloc(payloadLimit + 1), { level: 1 });
  assert.ok(expandedPayload.length < compressedLimit);
  await writeFile(payloadLimitLeft, expandedPayload);
  await writeFile(payloadLimitRight, expandedPayload);

  assert.equal(await gzipPayloadEqual(expected, recompressed), true);
  assert.equal(await gzipPayloadEqual(expected, different), false);
  assert.equal(await gzipPayloadEqual(expected, malformed), false);
  assert.equal(await gzipPayloadEqual(compressedLimitExpected, compressedLimitExceeded), false);
  assert.equal(await gzipPayloadEqual(payloadLimitLeft, payloadLimitRight), false);
});

test('current and tagged manifest version mismatches fail closed', async (t) => {
  const { root, snapshot } = await fixture(t);
  const currentManifestPath = path.join(root, 'packages/feature/package.json');
  const currentManifest = JSON.parse(await readFile(currentManifestPath, 'utf8'));
  currentManifest.version = '1.2.4';
  await json(currentManifestPath, currentManifest);
  await assert.rejects(
    publishRelease({ cwd: root, version: 'v1.2.3', dryRun: true, run: mockRunner({ root, snapshot }), createTagSnapshot: async () => cloneSnapshot(snapshot) }),
    /Current manifest version mismatch for @example\/feature: expected 1\.2\.3, found 1\.2\.4/,
  );

  const { root: taggedRoot, snapshot: taggedSnapshot } = await fixture(t);
  const taggedManifestPath = path.join(taggedSnapshot, 'packages/feature/package.json');
  const taggedManifest = JSON.parse(await readFile(taggedManifestPath, 'utf8'));
  taggedManifest.version = '1.2.2';
  await json(taggedManifestPath, taggedManifest);
  await assert.rejects(
    publishRelease({ cwd: taggedRoot, version: 'v1.2.3', dryRun: true, run: mockRunner({ root: taggedRoot, snapshot: taggedSnapshot }), createTagSnapshot: async () => cloneSnapshot(taggedSnapshot) }),
    /Release tag v1\.2\.3 version mismatch for @example\/feature: expected 1\.2\.3, found 1\.2\.2/,
  );
});

test('ambiguous registry failures and local live mode never publish', async (t) => {
  const { root, snapshot } = await fixture(t);
  const registryCalls = [];
  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      dryRun: true,
      run: mockRunner({ root, snapshot, registryError: 'npm error code E404\nnpm error code E500\n404 Not Found', calls: registryCalls }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /registry dist check.*E404.*E500/s,
  );
  assert.equal(registryCalls.some(({ file, args }) => file === 'npm' && args[0] === 'publish'), false);

  const localCalls = [];
  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      run: mockRunner({ root, snapshot, calls: localCalls }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /Live publishing is allowed only through the trusted GitHub Actions workflow/,
  );
  assert.equal(localCalls.length, 0);
});

test('GitHub Actions mode requires the trusted main workflow and live OIDC permission', async (t) => {
  const { root, snapshot } = await fixture(t);
  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      dryRun: true,
      githubActions: true,
      env: githubEnv({ GITHUB_REF: 'refs/heads/feature' }),
      run: mockRunner({ root, snapshot }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /requires GITHUB_REF=refs\/heads\/main/,
  );
  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      githubActions: true,
      env: githubEnv({ ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' }),
      run: mockRunner({ root, snapshot }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /requires id-token: write/,
  );
});

test('remote tag, public GitHub release body, and repository npm config are fail-closed', async (t) => {
  const { root, snapshot } = await fixture(t);
  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      dryRun: true,
      run: mockRunner({ root, snapshot, remoteTag: 'different' }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /Local and origin release tags disagree/,
  );
  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      dryRun: true,
      run: mockRunner({ root, snapshot, releaseOverrides: { body: 'edited release body' } }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /GitHub release body does not match/,
  );
  await text(path.join(root, '.npmrc'), '//registry.npmjs.org/:_authToken=forbidden\n');
  await assert.rejects(
    publishRelease({
      cwd: root,
      version: 'v1.2.3',
      dryRun: true,
      githubActions: true,
      env: githubEnv(),
      run: mockRunner({ root, snapshot }),
      createTagSnapshot: async () => cloneSnapshot(snapshot),
    }),
    /refuses repository npm configuration: \.npmrc/,
  );
});

test('trusted publish workflow keeps verification unprivileged and gates serialized OIDC publishing', async () => {
  const workflow = await readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /concurrency:\n  group: npm-release\n  cancel-in-progress: false/);
  assert.match(workflow, /verify:[\s\S]*?permissions:\n      contents: read[\s\S]*?--dry-run --github-actions/);
  assert.doesNotMatch(workflow.match(/verify:[\s\S]*?\n  publish:/)?.[0] ?? '', /id-token: write/);
  assert.match(workflow, /publish:[\s\S]*?environment:\n      name: npm-release[\s\S]*?id-token: write[\s\S]*?--github-actions/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|registry-url:/);
});

test('defaultCreateTagSnapshot removes its temp directory when archive or extract fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'publish-release-default-snapshot-root-'));
  try {
    let archiveOutputPath;
    const archiveFailure = async (_file, args) => {
      if (args[0] === 'archive') {
        archiveOutputPath = args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
        return { code: 1, stdout: '', stderr: 'archive failed' };
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    };
    await assert.rejects(defaultCreateTagSnapshot(root, 'v1.2.3', archiveFailure), /git archive for v1\.2\.3 failed/);
    await assert.rejects(stat(path.dirname(archiveOutputPath)), /ENOENT/);

    let extractOutputPath;
    const extractFailure = async (_file, args) => {
      if (args[0] === 'archive') {
        extractOutputPath = args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
        await writeFile(extractOutputPath, 'tar');
        return { code: 0, stdout: '', stderr: '' };
      }
      if (args[0] === '-xf') return { code: 1, stdout: '', stderr: 'tar failed' };
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    };
    await assert.rejects(defaultCreateTagSnapshot(root, 'v1.2.3', extractFailure), /extract tag snapshot for v1\.2\.3 failed/);
    await assert.rejects(stat(path.dirname(extractOutputPath)), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
