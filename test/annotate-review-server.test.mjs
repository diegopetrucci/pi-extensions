import assert from 'node:assert/strict';
import { request } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const sourceExtensionDir = path.join(repoRoot, 'extensions', 'annotate-git-diff');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pi-annotate-review-server-'));
const compiledExtensionDir = path.join(tempRoot, 'compiled', 'annotate-git-diff');

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

async function transpileModule(sourceName, outputName) {
  const sourcePath = path.join(sourceExtensionDir, sourceName);
  const source = await readFile(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  assert.deepEqual(
    result.diagnostics ?? [],
    [],
    `Failed to transpile ${sourceName}: ${(result.diagnostics ?? [])
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n')}`,
  );
  await writeFile(path.join(compiledExtensionDir, outputName), result.outputText);
}

await mkdir(compiledExtensionDir, { recursive: true });
await writeFile(path.join(compiledExtensionDir, 'package.json'), '{"type":"module"}\n');
await transpileModule('ui.ts', 'ui.js');
await transpileModule('review-server.ts', 'review-server.js');
await cp(path.join(sourceExtensionDir, 'web'), path.join(compiledExtensionDir, 'web'), { recursive: true });

const reviewServerModule = await import(pathToFileURL(path.join(compiledExtensionDir, 'review-server.js')).href);
const { buildReviewHtml } = await import(pathToFileURL(path.join(compiledExtensionDir, 'ui.js')).href);
const {
  resolveMonacoVsDirectory,
  resolveReviewUiAssetPaths,
  resolveTailwindBrowserPath,
  startReviewUiServer,
} = reviewServerModule;

async function createPackageLayout(name) {
  const layoutRoot = path.join(tempRoot, name);
  const packageDir = path.join(layoutRoot, 'node_modules', '@example', 'review-extension');
  const extensionDir = path.join(packageDir, 'extensions', 'annotate-git-diff');
  const tailwindPath = path.join(layoutRoot, 'node_modules', '@tailwindcss', 'browser', 'dist', 'index.global.js');
  const tailwindPackagePath = path.join(layoutRoot, 'node_modules', '@tailwindcss', 'browser', 'package.json');
  const monacoVsDirectory = path.join(layoutRoot, 'node_modules', 'monaco-editor', 'min', 'vs');
  const monacoPackagePath = path.join(layoutRoot, 'node_modules', 'monaco-editor', 'package.json');
  const monacoLoaderPath = path.join(monacoVsDirectory, 'loader.js');
  const editorCssPath = path.join(monacoVsDirectory, 'editor', 'editor.main.css');
  const workerPath = path.join(monacoVsDirectory, 'base', 'worker', 'workerMain.js');

  await mkdir(extensionDir, { recursive: true });
  await mkdir(path.dirname(tailwindPath), { recursive: true });
  await mkdir(path.dirname(editorCssPath), { recursive: true });
  await mkdir(path.dirname(workerPath), { recursive: true });
  await writeFile(tailwindPath, 'globalThis.__TAILWIND_FIXTURE__ = true;\n');
  await writeFile(tailwindPackagePath, JSON.stringify({ name: '@tailwindcss/browser', version: '4.3.2' }));
  await writeFile(monacoPackagePath, JSON.stringify({ name: 'monaco-editor', version: '0.52.2' }));
  await writeFile(monacoLoaderPath, 'globalThis.__MONACO_LOADER_FIXTURE__ = true;\n');
  await writeFile(editorCssPath, '.monaco-fixture { color: green; }\n');
  await writeFile(workerPath, 'globalThis.__MONACO_WORKER_FIXTURE__ = true;\n');

  return {
    layoutRoot,
    extensionDir,
    tailwindPath,
    monacoVsDirectory,
    monacoLoaderPath,
    editorCssPath,
    workerPath,
  };
}

function rawRequest(url, { method = 'GET', host } = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request(url, { method, headers: host ? { Host: host } : undefined }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolveRequest({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', rejectRequest);
    req.end();
  });
}

const reviewData = {
  repoRoot: '/repo/<script>not executable</script>',
  files: [],
  commits: [],
  branchBaseRef: 'origin/main',
  branchMergeBaseSha: 'abc123',
  repositoryHasHead: true,
};

test('review HTML preserves replacement tokens in data and pinned runtime assets', async () => {
  const replacementTokens = "literal:$&|prefix:$`|suffix:$'";
  const escapedJsonTokens = "literal:$\\u0026|prefix:$`|suffix:$'";
  const placeholderTokens = '__INLINE_ASSET_CONFIG__|__INLINE_TAILWIND_JS__|__INLINE_MONACO_LOADER_JS__|__INLINE_JS__';
  const runtimeFixture = `${replacementTokens}|${placeholderTokens}`;
  const actualTailwind = await readFile(path.join(repoRoot, 'node_modules/@tailwindcss/browser/dist/index.global.js'), 'utf8');
  const actualMonacoLoader = await readFile(path.join(repoRoot, 'node_modules/monaco-editor/min/vs/loader.js'), 'utf8');
  assert.ok(actualTailwind.includes('$`'), 'the pinned Tailwind bundle should retain the replacement-token regression fixture');

  const html = buildReviewHtml(
    { ...reviewData, repoRoot: `/repo/${replacementTokens}/${placeholderTokens}` },
    {
      tailwindBrowserJs: `${runtimeFixture}\n${actualTailwind}`,
      monacoLoaderJs: `${runtimeFixture}\n${actualMonacoLoader}`,
      monacoVsBaseUrl: `http://127.0.0.1:1234/token/${replacementTokens}/${placeholderTokens}`,
    },
  );

  assert.ok(html.includes(`${runtimeFixture}\n${actualTailwind}`));
  assert.ok(html.includes(`${runtimeFixture}\n${actualMonacoLoader}`));
  assert.ok(html.includes(`/repo/${escapedJsonTokens}/${placeholderTokens}`));
  assert.ok(html.includes(`http://127.0.0.1:1234/token/${escapedJsonTokens}/${placeholderTokens}`));
});

test('review asset discovery walks from extension packages to independently installed runtime dependencies', async () => {
  const layout = await createPackageLayout('asset-layout');
  const paths = resolveReviewUiAssetPaths(layout.extensionDir);

  assert.equal(paths.tailwindBrowserPath, await realpath(layout.tailwindPath));
  assert.equal(paths.monacoLoaderPath, await realpath(layout.monacoLoaderPath));
  assert.equal(paths.monacoVsDirectory, await realpath(layout.monacoVsDirectory));

  const repositoryPaths = resolveReviewUiAssetPaths(sourceExtensionDir);
  assert.equal(
    repositoryPaths.tailwindBrowserPath,
    await realpath(path.join(repoRoot, 'node_modules/@tailwindcss/browser/dist/index.global.js')),
  );
  assert.equal(repositoryPaths.monacoVsDirectory, await realpath(path.join(repoRoot, 'node_modules/monaco-editor/min/vs')));
});

test('Tailwind and Monaco discovery failures remain independent and actionable', async () => {
  const missingTailwindDir = path.join(tempRoot, 'missing-tailwind', 'package');
  const missingMonacoDir = path.join(tempRoot, 'missing-monaco', 'package');
  await mkdir(missingTailwindDir, { recursive: true });
  await mkdir(path.join(tempRoot, 'missing-tailwind', 'node_modules', 'monaco-editor', 'min', 'vs'), { recursive: true });
  await mkdir(path.join(tempRoot, 'missing-monaco', 'node_modules', '@tailwindcss', 'browser', 'dist'), { recursive: true });
  await writeFile(
    path.join(tempRoot, 'missing-monaco', 'node_modules', '@tailwindcss', 'browser', 'dist', 'index.global.js'),
    'tailwind',
  );

  assert.throws(
    () => resolveTailwindBrowserPath(missingTailwindDir),
    /Unable to locate packaged @tailwindcss\/browser runtime/,
  );
  assert.throws(
    () => resolveMonacoVsDirectory(missingMonacoDir),
    /Unable to locate packaged monaco-editor runtime/,
  );
});

test('asset discovery rejects incompatible dependency versions', async () => {
  const layout = await createPackageLayout('incompatible-layout');
  const tailwindManifest = path.join(layout.layoutRoot, 'node_modules', '@tailwindcss', 'browser', 'package.json');
  const monacoManifest = path.join(layout.layoutRoot, 'node_modules', 'monaco-editor', 'package.json');

  await writeFile(tailwindManifest, JSON.stringify({ name: '@tailwindcss/browser', version: '5.0.0' }));
  assert.throws(() => resolveTailwindBrowserPath(layout.extensionDir), /expected \^4\.3\.2/);

  await writeFile(tailwindManifest, JSON.stringify({ name: '@tailwindcss/browser', version: '4.3.2' }));
  await writeFile(monacoManifest, JSON.stringify({ name: 'monaco-editor', version: '0.53.0' }));
  assert.throws(() => resolveMonacoVsDirectory(layout.extensionDir), /expected 0\.52\.2/);
});

test('review UI server uses a tokenized loopback origin, serves the Monaco graph, rejects unsafe requests, and disposes', async () => {
  const layout = await createPackageLayout('server-layout');
  const outsideAsset = path.join(layout.layoutRoot, 'outside.js');
  await writeFile(outsideAsset, 'outside secret\n');
  try {
    await symlink(outsideAsset, path.join(layout.monacoVsDirectory, 'linked-outside.js'));
  } catch {
    // Traversal checks below remain portable when Windows does not permit symlinks.
  }

  const token = 'reviewtoken0123456789abcdef012345';
  const server = await startReviewUiServer(reviewData, { extensionDir: layout.extensionDir, token });
  assert.match(server.url, new RegExp(`^http://127\\.0\\.0\\.1:\\d+/${token}/$`));
  assert.ok(server.html.includes(`location.replace(${JSON.stringify(server.url)})`));
  assert.equal(server.html.includes(layout.layoutRoot), false, 'bootstrap HTML must not disclose filesystem paths');

  const page = await rawRequest(server.url);
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.match(page.headers['content-security-policy'], /default-src 'none'/);
  assert.match(page.headers['content-security-policy'], /base-uri 'none'/);
  assert.match(page.headers['content-security-policy'], /form-action 'none'/);
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.ok(page.body.includes('globalThis.__TAILWIND_FIXTURE__ = true;'));
  assert.ok(page.body.includes('globalThis.__MONACO_LOADER_FIXTURE__ = true;'));
  assert.ok(page.body.includes(`${server.url}vs`));
  assert.ok(page.body.includes('\\u003cscript\\u003enot executable\\u003c/script\\u003e'));
  assert.equal(page.body.includes(layout.layoutRoot), false, 'served review HTML must not disclose filesystem paths');

  const [loader, css, worker, head] = await Promise.all([
    rawRequest(`${server.url}vs/loader.js`),
    rawRequest(`${server.url}vs/editor/editor.main.css`),
    rawRequest(`${server.url}vs/base/worker/workerMain.js`),
    rawRequest(`${server.url}vs/loader.js`, { method: 'HEAD' }),
  ]);
  assert.deepEqual(
    [loader.status, css.status, worker.status, head.status],
    [200, 200, 200, 200],
  );
  assert.match(loader.headers['content-type'], /^text\/javascript/);
  assert.match(css.headers['content-type'], /^text\/css/);
  assert.match(worker.body, /MONACO_WORKER_FIXTURE/);
  assert.equal(head.body, '');

  const badHost = await rawRequest(server.url, { host: 'attacker.invalid' });
  const wrongToken = await rawRequest(server.url.replace(token, 'reviewtoken9876543210abcdef987654'));
  const post = await rawRequest(server.url, { method: 'POST' });
  const traversal = await rawRequest(`${server.url}vs/%2e%2e/outside.js`);
  const linkedOutside = await rawRequest(`${server.url}vs/linked-outside.js`);
  assert.equal(badHost.status, 403);
  assert.equal(wrongToken.status, 404);
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
  assert.equal(traversal.status, 404);
  assert.equal(linkedOutside.status, 404);

  server.dispose();
  server.dispose();
  await assert.rejects(rawRequest(server.url));
});
