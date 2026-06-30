import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const require = createRequire(import.meta.url);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
let importCounter = 0;

initTheme('dark');

const plainTheme = {
  fg(_kind, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

async function loadFreshExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath));
  moduleUrl.searchParams.set('test', `${Date.now()}-${importCounter++}`);
  const extensionModule = await import(moduleUrl.href);
  return extensionModule.default;
}

function patchSpawn(t) {
  const childProcess = require('node:child_process');
  const original = childProcess.spawn;
  const calls = [];

  childProcess.spawn = (...args) => {
    calls.push(args);
    throw new Error('spawn should not be called in this test');
  };

  syncBuiltinESMExports();
  t.after(() => {
    childProcess.spawn = original;
    syncBuiltinESMExports();
  });

  return calls;
}

async function getTool(relativePath, name) {
  const extension = await loadFreshExtension(relativePath);
  const harness = createExtensionHarness();
  extension(harness.pi);
  const tool = harness.tools.get(name);
  assert.ok(tool, `expected ${name} tool to be registered`);
  return tool;
}

function renderLines(component, width = 200) {
  return component.render(width).map((line) => line.trimEnd());
}

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-9;]*m/g, '');
}

function createOracleLikeContext(available = [], model) {
  return {
    cwd: repoRoot,
    hasUI: false,
    model,
    modelRegistry: {
      async getAvailable() {
        return available;
      },
    },
  };
}

function createLibrarianContext(available = [], model) {
  return {
    cwd: repoRoot,
    model,
    modelRegistry: {
      async getAvailable() {
        return available;
      },
    },
  };
}

function createLibrarianDetails(overrides = {}) {
  return {
    status: 'done',
    workspace: '/tmp/pi-librarian/run-123',
    cache: {
      mode: 'enabled',
      root: '/tmp/pi-librarian/cache',
      ttlDays: 7,
      cleanupDeleted: 2,
      cleanupErrors: [],
      decisionReason: 'enabled by user preference',
    },
    model: {
      modelRef: 'anthropic/claude-haiku-4-5',
      modelId: 'claude-haiku-4-5',
      provider: 'anthropic',
      thinkingLevel: 'low',
      autoSelected: true,
      selectionReason: 'Selected a preferred fast Librarian model.',
    },
    turns: 3,
    toolCalls: [
      { id: '1', name: 'read', args: { path: 'README.md', offset: 4, limit: 2 }, startedAt: 0 },
      { id: '2', name: 'bash', args: { command: 'git status --short' }, startedAt: 0, isError: true },
      { id: '3', name: 'ls', args: { path: 'src' }, startedAt: 0 },
      { id: '4', name: 'grep', args: { pattern: 'needle', path: 'lib' }, startedAt: 0 },
      { id: '5', name: 'find', args: { pattern: '*.ts', path: 'extensions' }, startedAt: 0 },
      { id: '6', name: 'read', args: { path: 'a.ts' }, startedAt: 0 },
      { id: '7', name: 'read', args: { path: 'b.ts' }, startedAt: 0 },
    ],
    startedAt: 0,
    ...overrides,
  };
}

function createOracleDetails(overrides = {}) {
  return {
    modelRef: 'openai/gpt-5.5-pro',
    provider: 'openai',
    modelId: 'gpt-5.5-pro',
    modelName: 'GPT-5.5 Pro',
    thinkingLevel: 'xhigh',
    autoSelected: true,
    selectionReason: 'Selected the top-ranked reasoning model on the current provider.',
    includeBash: true,
    usage: {
      turns: 2,
      input: 1500,
      output: 420,
      cacheRead: 12,
      cacheWrite: 3,
      cost: 0.0123,
      contextTokens: 2048,
    },
    stderr: '',
    exitCode: 0,
    durationMs: 1532,
    cwd: repoRoot,
    ...overrides,
  };
}

function createContrarianDetails(overrides = {}) {
  return {
    modelRef: 'anthropic/claude-opus-4.8',
    provider: 'anthropic',
    modelId: 'claude-opus-4.8',
    modelName: 'Claude Opus 4.8',
    thinkingLevel: 'high',
    autoSelected: true,
    selectionReason: 'Selected a strong opposite-provider reasoning model.',
    includeBash: false,
    usage: {
      turns: 1,
      input: 900,
      output: 250,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.0042,
      contextTokens: 1200,
    },
    stderr: '',
    exitCode: 0,
    durationMs: 845,
    cwd: repoRoot,
    ...overrides,
  };
}

test('librarian tool rejects invalid queries and missing models before starting subagent work', async () => {
  const tool = await getTool('extensions/librarian/index.ts', 'librarian');

  await assert.rejects(
    tool.execute('librarian-blank-query', { query: '   ' }, undefined, undefined, createLibrarianContext()),
    /expected query to be a non-empty string/i,
  );

  await assert.rejects(
    tool.execute('librarian-no-models', { query: 'find the auth entry point' }, undefined, undefined, createLibrarianContext()),
    /No authenticated models are available for Librarian/i,
  );
});

test('librarian renderCall and renderResult cover fallback, partial, collapsed, and expanded branches', async () => {
  const tool = await getTool('extensions/librarian/index.ts', 'librarian');

  const librarianCall = renderLines(
    tool.renderCall(
      {
        query: 'Find the implementation path for the cached GitHub checkout behavior and summarize the guardrails around it.',
        repos: ['owner/repo-a', 'owner/repo-b'],
        owners: ['owner-a'],
      },
      plainTheme,
      {},
    ),
  );
  assert.equal(librarianCall.length, 1);
  assert.match(librarianCall[0], /^repos:2 owners:1 · Find the implementation path for the cached GitHub checkout behavior and /);
  assert.match(librarianCall[0], /(?:\.\.\.|…)$/);

  assert.deepEqual(
    renderLines(tool.renderResult({ content: [{ type: 'text', text: 'raw fallback' }] }, { expanded: false, isPartial: false }, plainTheme, {})),
    ['raw fallback'],
  );

  const partial = renderLines(
    tool.renderResult(
      {
        content: [{ type: 'toolCall', id: 'call-1', name: 'librarian', arguments: {} }],
        details: createLibrarianDetails({ status: 'done', error: 'should stay hidden while partial' }),
      },
      { expanded: false, isPartial: true },
      plainTheme,
      {},
    ),
  ).join('\n');
  assert.match(partial, /⏳ librarian 3 turns • 7 tools • cache:on/);
  assert.match(partial, /Searching GitHub…/);
  assert.doesNotMatch(partial, /should stay hidden while partial/);

  const collapsed = renderLines(
    tool.renderResult(
      {
        content: [{ type: 'toolCall', id: 'call-2', name: 'librarian', arguments: {} }],
        details: createLibrarianDetails({
          status: 'error',
          error: Array.from({ length: 20 }, (_value, index) => `error line ${index + 1}`).join('\n'),
        }),
      },
      { expanded: false, isPartial: false },
      plainTheme,
      {},
    ),
  ).join('\n');
  assert.match(collapsed, /✗ librarian 3 turns • 7 tools • cache:on/);
  assert.match(collapsed, /error line 18/);
  assert.doesNotMatch(collapsed, /error line 19/);
  assert.match(collapsed, /\(Ctrl\+O to expand\)/);
  assert.match(collapsed, /Tools:/);
  assert.match(collapsed, /\n…\n✗ bash git status --short/);

  const expanded = stripAnsi(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: '## Findings\n\n- Cache lookups stay inside the workspace.' }],
          details: createLibrarianDetails({
            cache: {
              mode: 'enabled',
              root: '/tmp/pi-librarian/cache',
              ttlDays: 7,
              cleanupDeleted: 2,
              cleanupErrors: ['permission denied'],
              decisionReason: 'enabled by user preference',
            },
          }),
        },
        { expanded: true, isPartial: false },
        plainTheme,
        {},
      ),
    ).join('\n'),
  );
  assert.match(expanded, /✓ librarian 3 turns • 7 tools • cache:on/);
  assert.match(expanded, /cache cleanup warnings: 1/);
  assert.match(expanded, /Tools:/);
  assert.match(expanded, /Findings/);
  assert.match(expanded, /Cache lookups stay inside the workspace/);
});

test('oracle tool rejects blank tasks and reports missing models without spawning a subprocess', async (t) => {
  const spawnCalls = patchSpawn(t);
  const tool = await getTool('extensions/oracle/index.ts', 'oracle');
  const available = [{ provider: 'openai', id: 'gpt-5.5-pro', reasoning: true }];

  await assert.rejects(
    tool.execute('oracle-blank-task', { task: '   ' }, undefined, undefined, createOracleLikeContext(available)),
    /expected task to be a non-empty string/i,
  );

  const noModelsResult = await tool.execute(
    'oracle-no-models',
    { task: 'Review the current plan' },
    undefined,
    undefined,
    createOracleLikeContext([]),
  );
  assert.equal(noModelsResult.content[0]?.type, 'text');
  assert.match(noModelsResult.content[0]?.text ?? '', /No authenticated models are available/i);
  assert.equal(noModelsResult.details.exitCode, 1);
  assert.match(noModelsResult.details.selectionReason, /No authenticated models are available/i);
  assert.deepEqual(spawnCalls, []);
});

test('oracle renderCall and renderResult cover fallback, collapsed error, and expanded branches', async () => {
  const tool = await getTool('extensions/oracle/index.ts', 'oracle');

  const oracleCall = renderLines(
    tool.renderCall(
      {
        task: 'Review the caching strategy and call out any migration risks that might affect mixed-provider users during rollout.',
        includeBash: true,
        model: 'openai/gpt-5.5-pro',
        thinkingLevel: 'xhigh',
      },
      plainTheme,
      {},
    ),
  );
  assert.equal(oracleCall[0], 'oracle read-only+bash [openai/gpt-5.5-pro] (xhigh)');
  assert.match(oracleCall[1], /^  Review the caching strategy and call out any migration risks that might affect mixed-/);
  assert.match(oracleCall[1], /\.\.\.$/);

  assert.deepEqual(
    renderLines(tool.renderResult({ content: [{ type: 'text', text: 'raw fallback' }] }, { expanded: false, isPartial: false }, plainTheme, {})),
    ['raw fallback'],
  );

  const collapsed = renderLines(
    tool.renderResult(
      {
        content: [{ type: 'text', text: Array.from({ length: 10 }, (_value, index) => `body line ${index + 1}`).join('\n') }],
        details: createOracleDetails({
          stderr: Array.from({ length: 5 }, (_value, index) => `stderr line ${index + 1}`).join('\n'),
          exitCode: 1,
        }),
      },
      { expanded: false, isPartial: false },
      plainTheme,
      {},
    ),
  ).join('\n');
  assert.match(collapsed, /✗ oracle openai\/gpt-5\.5-pro/);
  assert.match(collapsed, /xhigh · read-only\+bash · 1\.5s/);
  assert.match(collapsed, /body line 8/);
  assert.doesNotMatch(collapsed, /body line 9/);
  assert.match(collapsed, /2 turns ↑1\.5k ↓420 R12 W3 \$0\.0123 ctx:2\.0k/);
  assert.match(collapsed, /stderr line 4/);
  assert.doesNotMatch(collapsed, /stderr line 5/);
  assert.match(collapsed, /\(Ctrl\+O to expand\)/);

  const expanded = stripAnsi(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: '## Bottom line\n\nThe migration is safe if the cache is provider-scoped.' }],
          details: createOracleDetails({ includeBash: false, durationMs: 845 }),
        },
        { expanded: true, isPartial: false },
        plainTheme,
        {},
      ),
    ).join('\n'),
  );
  assert.match(expanded, /✓ oracle openai\/gpt-5\.5-pro/);
  assert.match(expanded, /Selection/);
  assert.match(expanded, /Selected the top-ranked reasoning model on the current provider/);
  assert.match(expanded, /Output/);
  assert.match(expanded, /Bottom line/);
  assert.match(expanded, /Usage/);
});

test('contrarian tool rejects blank tasks and reports missing models without spawning a subprocess', async (t) => {
  const spawnCalls = patchSpawn(t);
  const tool = await getTool('extensions/contrarian/index.ts', 'contrarian');
  const available = [{ provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true }];

  await assert.rejects(
    tool.execute('contrarian-blank-task', { task: '   ' }, undefined, undefined, createOracleLikeContext(available)),
    /expected task to be a non-empty string/i,
  );

  const noModelsResult = await tool.execute(
    'contrarian-no-models',
    { task: 'Challenge the rollout plan' },
    undefined,
    undefined,
    createOracleLikeContext([]),
  );
  assert.equal(noModelsResult.content[0]?.type, 'text');
  assert.match(noModelsResult.content[0]?.text ?? '', /No authenticated models are available/i);
  assert.equal(noModelsResult.details.exitCode, 1);
  assert.match(noModelsResult.details.selectionReason, /No authenticated models are available/i);
  assert.deepEqual(spawnCalls, []);
});

test('contrarian renderCall and renderResult cover fallback, collapsed error, and expanded branches', async () => {
  const tool = await getTool('extensions/contrarian/index.ts', 'contrarian');

  const contrarianCall = renderLines(
    tool.renderCall(
      {
        task: 'Pressure-test the plan for hidden dependency on the current provider and look for the strongest opposing case.',
        includeBash: false,
        model: 'anthropic/claude-opus-4.8',
        thinkingLevel: 'high',
      },
      plainTheme,
      {},
    ),
  );
  assert.equal(contrarianCall[0], 'contrarian read-only [anthropic/claude-opus-4.8] (high)');
  assert.match(contrarianCall[1], /^  Pressure-test the plan for hidden dependency on the current provider and look for the /);
  assert.match(contrarianCall[1], /\.\.\.$/);

  assert.deepEqual(
    renderLines(tool.renderResult({ content: [{ type: 'text', text: 'raw fallback' }] }, { expanded: false, isPartial: false }, plainTheme, {})),
    ['raw fallback'],
  );

  const collapsed = renderLines(
    tool.renderResult(
      {
        content: [{ type: 'text', text: Array.from({ length: 10 }, (_value, index) => `body line ${index + 1}`).join('\n') }],
        details: createContrarianDetails({
          stderr: Array.from({ length: 5 }, (_value, index) => `stderr line ${index + 1}`).join('\n'),
          exitCode: 1,
        }),
      },
      { expanded: false, isPartial: false },
      plainTheme,
      {},
    ),
  ).join('\n');
  assert.match(collapsed, /✗ contrarian anthropic\/claude-opus-4\.8/);
  assert.match(collapsed, /high · read-only · 845ms/);
  assert.match(collapsed, /body line 8/);
  assert.doesNotMatch(collapsed, /body line 9/);
  assert.match(collapsed, /1 turn ↑900 ↓250 \$0\.0042 ctx:1\.2k/);
  assert.match(collapsed, /stderr line 4/);
  assert.doesNotMatch(collapsed, /stderr line 5/);
  assert.match(collapsed, /\(Ctrl\+O to expand\)/);

  const expanded = stripAnsi(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: '## Strongest opposing case\n\nThe fallback still hides cross-provider drift risk.' }],
          details: createContrarianDetails({ includeBash: true, durationMs: 1532 }),
        },
        { expanded: true, isPartial: false },
        plainTheme,
        {},
      ),
    ).join('\n'),
  );
  assert.match(expanded, /✓ contrarian anthropic\/claude-opus-4\.8/);
  assert.match(expanded, /Selection/);
  assert.match(expanded, /Selected a strong opposite-provider reasoning model/);
  assert.match(expanded, /Output/);
  assert.match(expanded, /Strongest opposing case/);
  assert.match(expanded, /Usage/);
});
