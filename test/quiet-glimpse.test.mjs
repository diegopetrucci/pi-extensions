import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pi-quiet-glimpse-'));
const fakeHostPath = path.join(tempRoot, 'fake-glimpse-host.mjs');
const nonExecutableHostPath = path.join(tempRoot, 'non-executable-host');

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

await writeFile(
  fakeHostPath,
  `
    import { createInterface } from 'node:readline';
    setTimeout(() => process.stdout.write(JSON.stringify({ type: 'ready' }) + '\\n'), 40);
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    lines.on('line', (line) => {
      const message = JSON.parse(line);
      if (message.type === 'html') {
        process.stdout.write(JSON.stringify({ type: 'message', data: { type: 'fixture-terminal' } }) + '\\n');
        setTimeout(() => process.stdout.write('malformed protocol output\\n'), 10);
        setTimeout(() => {
          process.stdout.write(JSON.stringify({ type: 'closed' }) + '\\n');
          process.exit(0);
        }, 30);
      }
    });
  `,
);
await writeFile(nonExecutableHostPath, 'not executable\n');

async function compileQuietGlimpse(sourceRelativePath, name) {
  const packageRoot = path.join(tempRoot, name);
  const modulePath = path.join(packageRoot, 'quiet-glimpse.js');
  const sourcePath = path.join(repoRoot, sourceRelativePath);
  const source = await readFile(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  assert.deepEqual(result.diagnostics ?? [], []);
  await mkdir(path.join(packageRoot, 'node_modules', 'glimpseui'), { recursive: true });
  await writeFile(path.join(packageRoot, 'package.json'), '{"type":"module"}\n');
  await writeFile(modulePath, result.outputText);
  await writeFile(
    path.join(packageRoot, 'node_modules', 'glimpseui', 'package.json'),
    '{"name":"glimpseui","type":"module","exports":"./index.js"}\n',
  );
  await writeFile(
    path.join(packageRoot, 'node_modules', 'glimpseui', 'index.js'),
    `export function getNativeHostInfo() {
      const override = process.env.PI_QUIET_GLIMPSE_TEST_HOST;
      return override ? { path: override } : { path: process.execPath, extraArgs: [${JSON.stringify(fakeHostPath)}] };
    }\n`,
  );
  return import(pathToFileURL(modulePath).href);
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for fake Glimpse state.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

for (const [name, source] of [
  ['annotate-git-diff', 'extensions/annotate-git-diff/quiet-glimpse.ts'],
  ['annotate-last-message', 'extensions/annotate-last-message/quiet-glimpse.ts'],
]) {
  test(`${name} buffers native failures and keeps late error events non-fatal`, { concurrency: false }, async () => {
    const { openQuietGlimpse } = await compileQuietGlimpse(source, name);
    const window = await openQuietGlimpse('<html>fixture</html>');
    let terminalMessage = null;
    let observedErrors = 0;
    const onError = () => {
      observedErrors += 1;
    };

    window.on('error', onError);
    window.on('message', (message) => {
      terminalMessage = message;
      window.removeListener('error', onError);
    });

    await waitFor(() => terminalMessage != null);
    await waitFor(() => window.failure != null && window.closed);

    assert.deepEqual(terminalMessage, { type: 'fixture-terminal' });
    assert.match(window.failure.message, /Malformed glimpse protocol line/);
    assert.equal(observedErrors, 0, 'the caller listener was removed before the late protocol failure');
    assert.equal(window.closed, true);

    process.env.PI_QUIET_GLIMPSE_TEST_HOST = nonExecutableHostPath;
    let spawnFailureWindow;
    try {
      spawnFailureWindow = await openQuietGlimpse('<html>spawn failure</html>');
    } finally {
      delete process.env.PI_QUIET_GLIMPSE_TEST_HOST;
    }
    await waitFor(() => spawnFailureWindow.failure != null && spawnFailureWindow.closed);
    assert.match(spawnFailureWindow.failure.message, /EACCES|permission denied|spawn/i);
    assert.equal(spawnFailureWindow.closed, true);
  });
}
