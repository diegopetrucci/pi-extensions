import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const sourceExtensionDir = path.join(repoRoot, 'extensions', 'annotate-last-message');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pi-annotate-last-message-ui-'));
const compiledExtensionDir = path.join(tempRoot, 'compiled', 'annotate-last-message');

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

await mkdir(compiledExtensionDir, { recursive: true });
await writeFile(path.join(compiledExtensionDir, 'package.json'), '{"type":"module"}\n');

for (const sourceName of ['theme', 'ui']) {
  const sourcePath = path.join(sourceExtensionDir, `${sourceName}.ts`);
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
    `Failed to transpile ${sourceName}.ts: ${(result.diagnostics ?? [])
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n')}`,
  );
  await writeFile(path.join(compiledExtensionDir, `${sourceName}.js`), result.outputText);
}
await cp(path.join(sourceExtensionDir, 'web'), path.join(compiledExtensionDir, 'web'), { recursive: true });

const { buildAnnotateLastMessageHtml } = await import(pathToFileURL(path.join(compiledExtensionDir, 'ui.js')).href);
const appJs = await readFile(path.join(sourceExtensionDir, 'web', 'app.js'), 'utf8');

function extractEmbeddedData(html) {
  const match = html.match(/<script id="annotate-last-message-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'annotation data script should be present');
  return { raw: match[1], value: JSON.parse(match[1]) };
}

test('annotation HTML replaces placeholders in one pass without corrupting inline data', () => {
  const replacementTokens = "$$ | $& | $` | $'";
  const markerTokens = '__INLINE_DATA__ | __INLINE_JS__ | __INLINE_MD_RENDERER_JS__ | __INLINE_THEME__';
  const scriptText = "</script><script>alert('not executable')</script>";
  const data = {
    text: [replacementTokens, markerTokens, 'Unicode: café • 日本語 • 🚀', scriptText].join('\n'),
    lines: [{ number: 1, text: `${replacementTokens} ${markerTokens}` }],
    sections: [
      {
        id: 'section-1',
        index: 0,
        startLine: 1,
        endLine: 1,
        preview: scriptText,
        text: `${markerTokens} ${replacementTokens}`,
      },
    ],
  };

  const html = buildAnnotateLastMessageHtml(data);
  const embedded = extractEmbeddedData(html);

  assert.deepEqual(embedded.value, data);
  assert.match(embedded.raw, /\\u003c\/script\\u003e/);
  assert.match(embedded.raw, /\\u0026/);
  assert.equal(embedded.raw.includes('</script>'), false);
  assert.equal(embedded.raw.includes('<script>'), false);
  assert.ok(html.includes(markerTokens), 'literal template markers in message data should survive');
  assert.equal(html.includes('"__INLINE_DATA__"'), false, 'the data placeholder should be replaced');
  assert.doesNotMatch(html, /<script>\s*__INLINE_MD_RENDERER_JS__\s*<\/script>/, 'the renderer placeholder should be replaced');
  assert.doesNotMatch(html, /<script>\s*__INLINE_JS__\s*<\/script>/, 'the application placeholder should be replaced');
  assert.doesNotMatch(html, /<style id="tlh-theme-vars">__INLINE_THEME__<\/style>/, 'the theme placeholder should be replaced');
  assert.ok(html.includes(appJs), 'the inline application script should be embedded unchanged');
});

test('annotation HTML injects the active theme without importing global runtime state', () => {
  const data = {
    text: 'Hello',
    lines: [{ number: 1, text: 'Hello' }],
    sections: [],
  };
  const html = buildAnnotateLastMessageHtml(data, {
    appearance: 'light',
    colors: {
      text: { kind: 'rgb', r: 31, g: 35, b: 40 },
      mdHeading: { kind: 'rgb', r: 18, g: 171, b: 52 },
    },
    fg() {
      throw new Error('missing token');
    },
    bg() {
      throw new Error('missing background token');
    },
  });
  const match = html.match(/<style id="tlh-theme-vars">([\s\S]*?)<\/style>/);
  assert.ok(match, 'theme variables should be embedded in a dedicated style block');
  assert.match(match[1], /--color-scheme: light;/);
  assert.match(match[1], /--mdHeading: #12ab34;/);
  assert.match(match[1], /--text: #1f2328;/);
});

test('annotation HTML keeps the original page title', () => {
  const html = buildAnnotateLastMessageHtml({
    text: 'Hello',
    lines: [{ number: 1, text: 'Hello' }],
    sections: [],
  });

  assert.match(html, /<title>annotate last message<\/title>/);
  assert.doesNotMatch(html, /<title>TLH annotate last message<\/title>/);
});
