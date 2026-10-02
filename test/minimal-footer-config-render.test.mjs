import assert from 'node:assert/strict';
import fs, { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { CONFIG_DIR_NAME } from '@earendil-works/pi-coding-agent';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleCache = new Map();
const transpileRoot = await mkdtemp(path.join(repoRoot, '.tmp-minimal-footer-config-render-'));

after(async () => {
  await rm(transpileRoot, { recursive: true, force: true });
});

function resolveRelativeTsImport(fromFile, specifier) {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = specifier.endsWith('.ts')
    ? [basePath]
    : [`${basePath}.ts`, path.join(basePath, 'index.ts')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(`Could not resolve local TypeScript import ${specifier} from ${fromFile}`);
}

function rewriteRelativeImportSpecifiers(outputText, specifiers) {
  let rewritten = outputText;
  for (const specifier of specifiers) {
    const replacement = specifier.endsWith('.ts')
      ? `${specifier.slice(0, -3)}.mjs`
      : `${specifier}.mjs`;
    rewritten = rewritten.replaceAll(`"${specifier}"`, `"${replacement}"`);
    rewritten = rewritten.replaceAll(`'${specifier}'`, `'${replacement}'`);
  }
  return rewritten;
}

async function transpileTsModule(absolutePath, seen = new Set()) {
  if (seen.has(absolutePath)) return;
  seen.add(absolutePath);

  const relativePath = path.relative(repoRoot, absolutePath);
  const outputPath = path.join(transpileRoot, relativePath).replace(/\.ts$/, '.mjs');
  const sourceText = await readFile(absolutePath, 'utf8');
  const relativeSpecifiers = [];

  for (const importedFile of ts.preProcessFile(sourceText, true, true).importedFiles) {
    const specifier = importedFile.fileName;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
    relativeSpecifiers.push(specifier);
    await transpileTsModule(resolveRelativeTsImport(absolutePath, specifier), seen);
  }

  const transpiled = ts.transpileModule(sourceText, {
    fileName: absolutePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  const diagnostics = transpiled.diagnostics ?? [];
  assert.equal(
    diagnostics.length,
    0,
    diagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n'),
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rewriteRelativeImportSpecifiers(transpiled.outputText, relativeSpecifiers));
}

async function importTsModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const cached = moduleCache.get(absolutePath);
  if (cached) return cached;

  await transpileTsModule(absolutePath);
  const outputPath = path.join(transpileRoot, relativePath).replace(/\.ts$/, '.mjs');
  const loaded = await import(pathToFileURL(outputPath).href);
  moduleCache.set(absolutePath, loaded);
  return loaded;
}

const minimalFooterModule = await importTsModule('extensions/minimal-footer/index.ts');
const minimalFooterExtension = minimalFooterModule.default;
const { loadConfig, renderFooterLines } = minimalFooterModule.__testing;

function setEnv(t, key, value) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });
}

function setupTempDirs(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'minimal-footer-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const projectDir = path.join(rootDir, 'workspace', 'sample-repo');
  const nestedDir = path.join(projectDir, 'packages', 'app', 'src');

  mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  mkdirSync(path.join(projectDir, CONFIG_DIR_NAME), { recursive: true });
  mkdirSync(nestedDir, { recursive: true });

  setEnv(t, 'PI_CODING_AGENT_DIR', agentDir);
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  return { agentDir, projectDir, nestedDir };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function captureConsoleError(run) {
  const messages = [];
  const original = console.error;
  console.error = (...args) => {
    messages.push(args.map(String).join(' '));
  };

  try {
    return { result: run(), messages };
  } finally {
    console.error = original;
  }
}

const plainTheme = {
  fg(_color, text) {
    return text;
  },
};

function fakeCodexToken(accountId) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
  })}.fixture-signature`;
}

function writeFakeCodexCredential(agentDir, accountId) {
  writeJson(path.join(agentDir, 'auth.json'), {
    'openai-codex': {
      type: 'oauth',
      access: fakeCodexToken(accountId),
      refresh: 'fixture-refresh',
      expires: 4_000_000_000_000,
      accountId,
    },
  });
}

function createFooterHarness({
  projectDir,
  model,
  sessionManager = {},
  oauth = true,
  codexAccountId = 'fixture-account',
}) {
  const handlers = new Map();
  const footerState = { footer: undefined };
  const authCalls = [];
  let currentCodexAccountId = codexAccountId;
  const context = {
    cwd: projectDir,
    model,
    sessionManager,
    isProjectTrusted() {
      return false;
    },
    getContextUsage() {
      return { percent: 10, tokens: 100 };
    },
    modelRegistry: {
      isUsingOAuth() {
        return oauth;
      },
      async getProviderAuth(providerId) {
        authCalls.push(providerId);
        const apiKey = providerId === 'openai-codex'
          ? fakeCodexToken(currentCodexAccountId)
          : `fixture-${providerId}`;
        return { auth: { apiKey } };
      },
    },
    ui: {
      setFooter(factory) {
        footerState.footer = factory(
          { requestRender() {} },
          plainTheme,
          {
            onBranchChange() {
              return () => {};
            },
            getGitBranch() {
              return 'main';
            },
          },
        );
      },
    },
  };
  const pi = {
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    registerCommand() {},
    getThinkingLevel() {
      return 'off';
    },
  };
  minimalFooterExtension(pi);
  return {
    authCalls,
    context,
    footerState,
    handlers,
    setCodexAccountId(accountId) {
      currentCodexAccountId = accountId;
    },
  };
}

function usageResponse(usedPercent) {
  return {
    ok: true,
    async json() {
      return {
        rate_limit: {
          primary_window: {
            used_percent: usedPercent,
            limit_window_seconds: 18_000,
          },
        },
      };
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function withAuthReadCounter(run) {
  const originalReadFileSync = fs.readFileSync;
  const authReads = [];
  fs.readFileSync = (filePath, ...args) => {
    if (path.basename(String(filePath)) === 'auth.json') authReads.push(String(filePath));
    return originalReadFileSync(filePath, ...args);
  };
  syncBuiltinESMExports();
  try {
    return await run(authReads);
  } finally {
    fs.readFileSync = originalReadFileSync;
    syncBuiltinESMExports();
  }
}

async function withFakeUsageClock(run) {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const intervals = [];
  globalThis.setInterval = (callback, ms, ...args) => {
    const handle = {
      callback: () => callback(...args),
      cleared: false,
      ms,
    };
    intervals.push(handle);
    return handle;
  };
  globalThis.clearInterval = (handle) => {
    if (handle) handle.cleared = true;
  };
  try {
    return await run(intervals);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
}

test('minimal-footer loadConfig prefers trusted project config over global config and ignores untrusted project overrides', (t) => {
  const { agentDir, projectDir, nestedDir } = setupTempDirs(t);

  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    context: {
      showPercent: false,
      dumbZone: {
        thresholdTokens: 150000,
        label: 'GLOBAL ZONE',
        color: 'warning',
      },
    },
    codexUsage: {
      requestTimeoutMs: 2222,
      windows: {
        primary: { label: 'work' },
        secondary: { enabled: false, label: 'week' },
      },
    },
    experimentalMarker: {
      label: 'exp',
      color: 'accent',
    },
    gitStatus: {
      enabled: false,
      refreshIntervalMs: 12345,
      gitTimeoutMs: 654,
      ghTimeoutMs: 987,
    },
  });

  writeJson(path.join(projectDir, CONFIG_DIR_NAME, 'minimal-footer.json'), {
    context: {
      showPercent: true,
      dumbZone: {
        enabled: false,
        thresholdTokens: 275000,
        label: 'PROJECT ZONE',
      },
    },
    codexUsage: {
      windows: {
        secondary: { enabled: true, label: '7day' },
      },
    },
    experimentalMarker: {
      enabled: false,
    },
    gitStatus: {
      enabled: true,
      gitTimeoutMs: 1111,
    },
  });

  const trustedConfig = loadConfig({
    cwd: nestedDir,
    isProjectTrusted() {
      return true;
    },
  });

  assert.deepEqual(trustedConfig, {
    context: {
      showPercent: true,
      dumbZone: {
        enabled: false,
        thresholdTokens: 275000,
        label: 'PROJECT ZONE',
        color: 'warning',
      },
    },
    codexUsage: {
      enabled: true,
      cacheTtlMs: 300000,
      requestTimeoutMs: 2222,
      windows: {
        primary: {
          enabled: true,
          label: 'work',
        },
        secondary: {
          enabled: true,
          label: '7day',
        },
      },
    },
    experimentalMarker: {
      enabled: false,
      label: 'exp',
      color: 'accent',
    },
    gitStatus: {
      enabled: true,
      refreshIntervalMs: 12345,
      gitTimeoutMs: 1111,
      ghTimeoutMs: 987,
    },
  });

  const untrustedConfig = loadConfig({
    cwd: nestedDir,
    isProjectTrusted() {
      return false;
    },
  });

  assert.deepEqual(untrustedConfig, {
    context: {
      showPercent: false,
      dumbZone: {
        enabled: true,
        thresholdTokens: 150000,
        label: 'GLOBAL ZONE',
        color: 'warning',
      },
    },
    codexUsage: {
      enabled: true,
      cacheTtlMs: 300000,
      requestTimeoutMs: 2222,
      windows: {
        primary: {
          enabled: true,
          label: 'work',
        },
        secondary: {
          enabled: false,
          label: 'week',
        },
      },
    },
    experimentalMarker: {
      enabled: true,
      label: 'exp',
      color: 'accent',
    },
    gitStatus: {
      enabled: false,
      refreshIntervalMs: 12345,
      gitTimeoutMs: 654,
      ghTimeoutMs: 987,
    },
  });
});

test('minimal-footer loadConfig falls back when project config is malformed or contains invalid values', (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  const projectConfigPath = path.join(projectDir, CONFIG_DIR_NAME, 'minimal-footer.json');

  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    context: {
      showPercent: false,
      dumbZone: {
        enabled: false,
        thresholdTokens: 123456,
        label: 'GLOBAL',
        color: 'accent',
      },
    },
    codexUsage: {
      enabled: false,
      cacheTtlMs: 999,
      requestTimeoutMs: 2222,
      windows: {
        primary: { enabled: false, label: 'five' },
        secondary: { enabled: true, label: 'seven' },
      },
    },
    experimentalMarker: {
      enabled: false,
      label: 'global-exp',
      color: 'text',
    },
    gitStatus: {
      enabled: false,
      refreshIntervalMs: 4444,
      gitTimeoutMs: 555,
      ghTimeoutMs: 666,
    },
  });

  writeFileSync(projectConfigPath, '{ this is not valid json\n');
  const malformed = captureConsoleError(() =>
    loadConfig({
      cwd: projectDir,
      isProjectTrusted() {
        return true;
      },
    }),
  );

  assert.equal(malformed.messages.length, 1);
  assert.match(malformed.messages[0], /Warning: Could not parse .*minimal-footer\.json:/);
  assert.deepEqual(malformed.result, {
    context: {
      showPercent: false,
      dumbZone: {
        enabled: false,
        thresholdTokens: 123456,
        label: 'GLOBAL',
        color: 'accent',
      },
    },
    codexUsage: {
      enabled: false,
      cacheTtlMs: 999,
      requestTimeoutMs: 2222,
      windows: {
        primary: {
          enabled: false,
          label: 'five',
        },
        secondary: {
          enabled: true,
          label: 'seven',
        },
      },
    },
    experimentalMarker: {
      enabled: false,
      label: 'global-exp',
      color: 'text',
    },
    gitStatus: {
      enabled: false,
      refreshIntervalMs: 4444,
      gitTimeoutMs: 555,
      ghTimeoutMs: 666,
    },
  });

  writeJson(projectConfigPath, {
    context: {
      showPercent: 'yes',
      dumbZone: {
        enabled: 'no',
        thresholdTokens: -5,
        label: '   ',
        color: 'magenta',
      },
    },
    codexUsage: {
      enabled: 'true',
      cacheTtlMs: -1,
      requestTimeoutMs: 0,
      windows: {
        primary: { enabled: 'no', label: '   ' },
        secondary: { enabled: 'nope', label: 7 },
      },
    },
    experimentalMarker: {
      enabled: 'on',
      label: '',
      color: 'purple',
    },
    gitStatus: {
      enabled: 'y',
      refreshIntervalMs: 0,
      gitTimeoutMs: -1,
      ghTimeoutMs: 'soon',
    },
  });

  assert.deepEqual(
    loadConfig({
      cwd: projectDir,
      isProjectTrusted() {
        return true;
      },
    }),
    malformed.result,
  );
});

test('minimal-footer never sends direct OpenAI ChatGPT OAuth to legacy usage and ignores late Codex data', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account');

  const handlers = new Map();
  const footerState = { footer: undefined };
  const tui = { requestRender() {} };
  const footerData = {
    onBranchChange() {
      return () => {};
    },
    getGitBranch() {
      return 'main';
    },
  };
  let oauth = true;
  const authCalls = [];
  const context = {
    cwd: projectDir,
    model: { provider: 'openai', api: 'openai-responses', id: 'gpt-6-astra' },
    sessionManager: {},
    isProjectTrusted() {
      return false;
    },
    getContextUsage() {
      return { percent: 10, tokens: 100 };
    },
    modelRegistry: {
      isUsingOAuth() {
        return oauth;
      },
      async getProviderAuth(providerId) {
        authCalls.push(providerId);
        return { auth: { apiKey: fakeCodexToken('fixture-account') } };
      },
    },
    ui: {
      setFooter(factory) {
        footerState.footer = factory(tui, plainTheme, footerData);
      },
    },
  };
  const pi = {
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    registerCommand() {},
    getThinkingLevel() {
      return 'off';
    },
  };
  minimalFooterExtension(pi);

  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  let rejectLegacyFetch = false;
  let resolveLegacyFetch;
  globalThis.fetch = async (url) => {
    fetchCalls.push(url);
    if (rejectLegacyFetch) throw new Error('fixture unauthorized');
    return new Promise((resolve) => {
      resolveLegacyFetch = resolve;
    });
  };

  try {
    await handlers.get('session_start')({}, context);
    await Promise.resolve();
    assert.equal(fetchCalls.length, 0, 'direct OpenAI OAuth must not call legacy WHAM');
    assert.match(footerState.footer.render(80).join('\n'), /usage unsupported/);

    context.model = {
      provider: 'openai-codex',
      api: 'openai-codex-responses',
      id: 'gpt-5.5',
    };
    await handlers.get('model_select')({}, context);
    await Promise.resolve();
    assert.equal(fetchCalls.length, 1);

    context.model = {
      provider: 'openai',
      api: 'openai-responses',
      id: 'gpt-6-astra',
    };
    await handlers.get('model_select')({}, context);
    assert.match(footerState.footer.render(80).join('\n'), /usage unsupported/);

    resolveLegacyFetch?.({
      ok: true,
      async json() {
        return {
          rate_limit: {
            primary_window: { used_percent: 1, limit_window_seconds: 18_000 },
          },
        };
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const rendered = footerState.footer.render(80).join('\n');
    assert.match(rendered, /usage unsupported/);
    assert.doesNotMatch(rendered, /5h 1%/);

    rejectLegacyFetch = true;
    context.model = {
      provider: 'openai-codex',
      api: 'openai-codex-responses',
      id: 'gpt-5.5',
    };
    await handlers.get('model_select')({}, context);
    await new Promise((resolve) => setImmediate(resolve));
    const unavailable = footerState.footer.render(80).join('\n');
    assert.match(unavailable, /usage unavailable/);
    assert.doesNotMatch(unavailable, /5h 1%/);
    assert.deepEqual(authCalls, ['openai-codex', 'openai-codex']);
  } finally {
    globalThis.fetch = originalFetch;
    footerState.footer?.dispose();
  }
});

test('minimal-footer caches Codex account identity outside repeated footer renders', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account-a');

  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    codexAccountId: 'fixture-account-a',
  });
  const request = deferred();
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return request.promise;
  };

  try {
    await withAuthReadCounter(async (authReads) => {
      await harness.handlers.get('session_start')({}, harness.context);
      await flushAsync();
      assert.equal(fetchCalls.length, 1);
      assert.equal(fetchCalls[0].init.headers['ChatGPT-Account-Id'], 'fixture-account-a');
      assert.ok(authReads.length >= 1, 'the lifecycle refresh should resolve the fixture account');

      request.resolve(usageResponse(12));
      await flushAsync();
      await flushAsync();
      authReads.length = 0;

      for (let index = 0; index < 20; index += 1) {
        assert.match(harness.footerState.footer.render(80).join('\n'), /5h 12%/);
      }
      assert.deepEqual(authReads, [], 'repeated renders must not read the credential file');
    });
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer invalidates a Codex snapshot when the OAuth account switches', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account-a');

  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    codexAccountId: 'fixture-account-a',
  });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = deferred();
    requests.push({ init, request });
    return request.promise;
  };

  try {
    await harness.handlers.get('session_start')({}, harness.context);
    await flushAsync();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].init.headers['ChatGPT-Account-Id'], 'fixture-account-a');
    requests[0].request.resolve(usageResponse(12));
    await flushAsync();
    await flushAsync();
    assert.match(harness.footerState.footer.render(80).join('\n'), /5h 12%/);

    writeFakeCodexCredential(agentDir, 'fixture-account-b');
    harness.setCodexAccountId('fixture-account-b');
    await harness.handlers.get('model_select')({}, harness.context);
    await flushAsync();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].init.headers['ChatGPT-Account-Id'], 'fixture-account-b');
    assert.doesNotMatch(
      harness.footerState.footer.render(80).join('\n'),
      /5h 12%/,
      'the previous account snapshot must be hidden while the new account loads',
    );

    requests[1].request.resolve(usageResponse(34));
    await flushAsync();
    await flushAsync();
    assert.match(harness.footerState.footer.render(80).join('\n'), /5h 34%/);
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer detects auth-only Codex account changes on one bounded timer and disposes it', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
    codexUsage: { cacheTtlMs: 25 },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account-a');

  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    codexAccountId: 'fixture-account-a',
  });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = deferred();
    requests.push({ init, request });
    return request.promise;
  };

  try {
    await withFakeUsageClock(async (intervals) => {
      await harness.handlers.get('session_start')({}, harness.context);
      await flushAsync();
      assert.equal(intervals.length, 1);
      assert.equal(intervals[0].ms, 25);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].init.headers['ChatGPT-Account-Id'], 'fixture-account-a');

      requests[0].request.resolve(usageResponse(12));
      await flushAsync();
      await flushAsync();
      assert.match(harness.footerState.footer.render(80).join('\n'), /5h 12%/);

      intervals[0].callback();
      await flushAsync();
      assert.equal(requests.length, 1, 'an unchanged identity tick must not fetch usage');

      writeFakeCodexCredential(agentDir, 'fixture-account-b');
      harness.setCodexAccountId('fixture-account-b');
      // No model_select, turn_end, or session event is emitted for this
      // account-only login change in Pi 0.99.
      intervals[0].callback();
      await flushAsync();
      await flushAsync();
      assert.equal(requests.length, 2);
      assert.equal(requests[1].init.headers['ChatGPT-Account-Id'], 'fixture-account-b');
      intervals[0].callback();
      await flushAsync();
      assert.equal(requests.length, 2, 'one session timer must not duplicate an in-flight refresh');
      assert.doesNotMatch(
        harness.footerState.footer.render(80).join('\n'),
        /5h 12%/,
        'the timer must clear the old account while the replacement loads',
      );

      requests[1].request.resolve(usageResponse(34));
      await flushAsync();
      await flushAsync();
      assert.match(harness.footerState.footer.render(80).join('\n'), /5h 34%/);

      await harness.handlers.get('session_shutdown')({}, harness.context);
      assert.equal(intervals[0].cleared, true);

      await harness.handlers.get('session_start')({}, harness.context);
      await flushAsync();
      assert.equal(intervals.length, 2, 'replacement sessions receive one new usage timer');
      assert.equal(requests.length, 3);
      assert.equal(requests[2].init.headers['ChatGPT-Account-Id'], 'fixture-account-b');
      requests[2].request.resolve(usageResponse(35));
      await flushAsync();
      await flushAsync();

      harness.footerState.footer.dispose();
      assert.equal(intervals[1].cleared, true);
      intervals[0].callback();
      intervals[1].callback();
      await flushAsync();
      assert.equal(requests.length, 3, 'disposed timers cannot start another usage request');
    });
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer uses a five-minute identity check without caching usage results at zero TTL', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
    codexUsage: { cacheTtlMs: 0 },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account-a');
  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    codexAccountId: 'fixture-account-a',
  });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = deferred();
    requests.push({ init, request });
    return request.promise;
  };

  try {
    await withFakeUsageClock(async (intervals) => {
      await harness.handlers.get('session_start')({}, harness.context);
      await flushAsync();
      assert.equal(intervals.length, 1);
      assert.equal(intervals[0].ms, 5 * 60 * 1000);
      assert.equal(requests.length, 1, 'session start performs the initial lifecycle refresh');
      requests[0].request.resolve(usageResponse(8));
      await flushAsync();
      await flushAsync();

      intervals[0].callback();
      await flushAsync();
      assert.equal(requests.length, 1, 'an unchanged zero-TTL identity tick must not fetch usage');

      writeFakeCodexCredential(agentDir, 'fixture-account-b');
      harness.setCodexAccountId('fixture-account-b');
      intervals[0].callback();
      await flushAsync();
      assert.equal(requests.length, 2, 'an account change triggers the safe refresh path');
      assert.equal(requests[1].init.headers['ChatGPT-Account-Id'], 'fixture-account-b');
      requests[1].request.resolve(usageResponse(19));
      await flushAsync();
      await flushAsync();

      await harness.handlers.get('turn_start')({}, harness.context);
      await flushAsync();
      assert.equal(requests.length, 3, 'zero TTL keeps turn-boundary usage refreshes uncached');
      requests[2].request.resolve(usageResponse(20));
      await flushAsync();
      await flushAsync();

      await harness.handlers.get('turn_end')({}, harness.context);
      await flushAsync();
      assert.equal(requests.length, 4, 'turn end also refreshes when result caching is disabled');
      requests[3].request.resolve(usageResponse(21));
      await flushAsync();
      await flushAsync();
    });
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer clamps huge cache TTL identity scheduling to Node maximum without overflow', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  const hugeTtlMs = 2_147_483_648;
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
    codexUsage: { cacheTtlMs: hugeTtlMs },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account');
  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
  });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requests.push(init);
    return usageResponse(8);
  };

  try {
    await withFakeUsageClock(async (intervals) => {
      await harness.handlers.get('session_start')({}, harness.context);
      await flushAsync();
      await flushAsync();
      assert.equal(intervals.length, 1);
      assert.equal(intervals[0].ms, 2_147_483_647);
      assert.equal(requests.length, 1);

      intervals[0].callback();
      await flushAsync();
      assert.equal(requests.length, 1, 'the clamped timer still performs identity-only checks');
    });
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer revalidates account identity before accepting a late Codex response', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
    codexUsage: { cacheTtlMs: 0 },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account-a');

  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    codexAccountId: 'fixture-account-a',
  });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = deferred();
    requests.push({ init, request });
    return request.promise;
  };

  try {
    await harness.handlers.get('session_start')({}, harness.context);
    await flushAsync();
    assert.equal(requests.length, 1);

    writeFakeCodexCredential(agentDir, 'fixture-account-b');
    harness.setCodexAccountId('fixture-account-b');
    requests[0].request.resolve(usageResponse(11));
    await flushAsync();
    await flushAsync();
    await flushAsync();

    assert.equal(requests.length, 2, 'the changed account should refresh after discarding A');
    assert.equal(requests[1].init.headers['ChatGPT-Account-Id'], 'fixture-account-b');
    assert.doesNotMatch(
      harness.footerState.footer.render(80).join('\n'),
      /5h 11%/,
      'a late response for A must never become the current account snapshot',
    );

    requests[1].request.resolve(usageResponse(29));
    await flushAsync();
    await flushAsync();
    assert.match(harness.footerState.footer.render(80).join('\n'), /5h 29%/);
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer rejects a deferred token/account switch before sending WHAM', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
    codexUsage: { cacheTtlMs: 0 },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account-a');

  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    codexAccountId: 'fixture-account-a',
  });
  const authGate = deferred();
  let authCalls = 0;
  harness.context.modelRegistry.getProviderAuth = async (providerId) => {
    assert.equal(providerId, 'openai-codex');
    authCalls += 1;
    if (authCalls === 1) {
      await authGate.promise;
      return { auth: { apiKey: fakeCodexToken('fixture-account-b') } };
    }
    return { auth: { apiKey: fakeCodexToken('fixture-account-b') } };
  };
  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    fetchCalls.push(init);
    return usageResponse(41);
  };

  try {
    await harness.handlers.get('session_start')({}, harness.context);
    await flushAsync();
    assert.equal(authCalls, 1);
    assert.equal(fetchCalls.length, 0, 'the deferred mismatched token must not reach WHAM');

    writeFakeCodexCredential(agentDir, 'fixture-account-b');
    harness.setCodexAccountId('fixture-account-b');
    authGate.resolve();
    await flushAsync();
    await flushAsync();
    await flushAsync();

    assert.equal(fetchCalls.length, 1, 'only the replacement account may be fetched');
    assert.equal(
      fetchCalls[0].headers.Authorization,
      `Bearer ${fakeCodexToken('fixture-account-b')}`,
    );
    assert.equal(fetchCalls[0].headers['ChatGPT-Account-Id'], 'fixture-account-b');
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer ignores late Codex results after shutdown and replacement session_start', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account');

  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
  });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = deferred();
    requests.push({ init, request });
    return request.promise;
  };

  try {
    await harness.handlers.get('session_start')({}, harness.context);
    await flushAsync();
    assert.equal(requests.length, 1);

    await harness.handlers.get('session_shutdown')({}, harness.context);
    await harness.handlers.get('session_start')({}, harness.context);
    await flushAsync();
    assert.equal(requests.length, 2);

    requests[0].request.resolve(usageResponse(11));
    await flushAsync();
    await flushAsync();
    assert.doesNotMatch(
      harness.footerState.footer.render(80).join('\n'),
      /5h 11%/,
      'a result from the shut-down session must not repaint its replacement',
    );

    requests[1].request.resolve(usageResponse(29));
    await flushAsync();
    await flushAsync();
    assert.match(harness.footerState.footer.render(80).join('\n'), /5h 29%/);
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer does not fetch or render usage for direct OpenAI API-key models', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
  });
  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai', api: 'openai-responses', id: 'gpt-6-astra' },
    oauth: false,
  });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fixture fetch should not be called');
  };

  try {
    await harness.handlers.get('session_start')({}, harness.context);
    await flushAsync();
    const rendered = harness.footerState.footer.render(80).join('\n');
    assert.doesNotMatch(rendered, /usage (?:unsupported|unavailable|\d)/);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(harness.authCalls, []);
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer shows Codex usage unavailable without OAuth and does not fetch', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
  });
  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    oauth: false,
  });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fixture fetch should not be called without OAuth');
  };

  try {
    await harness.handlers.get('session_start')({}, harness.context);
    await flushAsync();
    const rendered = harness.footerState.footer.render(80).join('\n');
    assert.match(rendered, /usage unavailable/);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(harness.authCalls, []);
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer clears stale usage after HTTP 429 and thrown fetch errors', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    gitStatus: { enabled: false },
  });
  writeFakeCodexCredential(agentDir, 'fixture-account');

  const harness = createFooterHarness({
    projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
  });
  const outcomes = [
    usageResponse(17),
    { ok: false, status: 429 },
    new Error('fixture network failure'),
  ];
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async () => {
    fetchCalls.push(true);
    const outcome = outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };

  try {
    await harness.handlers.get('session_start')({}, harness.context);
    await flushAsync();
    await flushAsync();
    assert.match(harness.footerState.footer.render(80).join('\n'), /5h 17%/);

    await harness.handlers.get('model_select')({}, harness.context);
    await flushAsync();
    await flushAsync();
    const rateLimited = harness.footerState.footer.render(80).join('\n');
    assert.match(rateLimited, /usage unavailable/);
    assert.doesNotMatch(rateLimited, /5h 17%/);

    await harness.handlers.get('model_select')({}, harness.context);
    await flushAsync();
    await flushAsync();
    const failed = harness.footerState.footer.render(80).join('\n');
    assert.match(failed, /usage unavailable/);
    assert.doesNotMatch(failed, /5h 17%/);
    assert.equal(fetchCalls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    harness.footerState.footer?.dispose();
  }
});

test('minimal-footer renderFooterLines renders branch, repo, context, thinking, dumb-zone, usage, and experimental marker from fake data', (t) => {
  setEnv(t, 'PI_EXPERIMENTAL', '1');

  const config = {
    context: {
      showPercent: true,
      dumbZone: {
        enabled: true,
        thresholdTokens: 200000,
        label: 'DUMB ZONE',
        color: 'error',
      },
    },
    codexUsage: {
      enabled: true,
      cacheTtlMs: 300000,
      requestTimeoutMs: 10000,
      windows: {
        primary: {
          enabled: true,
          label: 'auto',
        },
        secondary: {
          enabled: true,
          label: 'auto',
        },
      },
    },
    experimentalMarker: {
      enabled: true,
      label: 'xp',
      color: 'warning',
    },
    gitStatus: {
      enabled: true,
      refreshIntervalMs: 8000,
      gitTimeoutMs: 1500,
      ghTimeoutMs: 3000,
    },
  };

  assert.deepEqual(
    renderFooterLines({
      width: 40,
      cwd: '/tmp/workspace/sample-repo',
      config,
      branch: 'feature/footer-tests',
      gitStatus: '!1 +2 ↑3 • PR #44',
      contextUsage: {
        percent: 87.4,
        tokens: 250000,
      },
      modelId: 'gpt-5.5',
      modelProvider: 'openai-codex',
      thinkingLevel: 'high',
      theme: plainTheme,
      usageSnapshot: {
        primary: { usedPercent: 12.4, windowSeconds: 18_000 },
        secondary: { usedPercent: 67.6, windowSeconds: 604_800 },
        fetchedAt: 123,
      },
    }),
    [
      'feature/footer-tests · !1 +2 ↑3 • PR #44',
      'sample-repo',
      '87.4% · DUMB ZONE · 5h 12% · 7d 68% · xp',
      'gpt-5.5 high',
    ],
  );

  const themedCalls = [];
  const themedLines = renderFooterLines({
    width: 80,
    cwd: '/tmp/workspace/sample-repo',
    config,
    branch: 'main',
    contextUsage: { percent: 10, tokens: 1 },
    modelId: 'gpt-6-astra',
    modelProvider: 'openai',
    thinkingLevel: 'off',
    theme: {
      fg(color, text) {
        themedCalls.push(color);
        return `${String.fromCharCode(27)}[32m${text}${String.fromCharCode(27)}[39m`;
      },
    },
    // Direct OpenAI ChatGPT OAuth has no verified WHAM-compatible usage path.
    usageSnapshot: {
      primary: { usedPercent: 99 },
      fetchedAt: 123,
    },
    usageStatus: 'unsupported',
  });
  assert.match(themedLines.join('\n'), /usage unsupported/);
  assert.ok(themedCalls.includes('dim'));

  const narrowLines = renderFooterLines({
    width: 1,
    cwd: '/tmp/workspace/sample-repo',
    config,
    branch: '',
    modelId: undefined,
    modelProvider: 'openai',
    thinkingLevel: 'off',
    theme: plainTheme,
    usageStatus: 'unsupported',
  });
  assert.equal(narrowLines.length, 4);
});
