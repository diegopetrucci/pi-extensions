import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

import { createExtensionHarness } from './extension-test-helpers.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

async function loadCodeReviewerTestUtils() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/code-reviewer/index.ts')).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.__test__;
}

function createContext({ model, available }) {
  return {
    model,
    modelRegistry: {
      async getAvailable() {
        return available;
      },
    },
  };
}

async function loadCodeReviewerExtensionWithMockPi(t) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'code-reviewer-selection-'));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const sourcePath = path.join(repoRoot, 'extensions/code-reviewer/index.ts');
  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const packageDir = path.join(tempDir, 'node_modules', '@earendil-works', 'pi-coding-agent');
  await mkdir(packageDir, { recursive: true });
  const typeboxDir = path.join(tempDir, 'node_modules', 'typebox');
  await mkdir(typeboxDir, { recursive: true });
  await writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: '@earendil-works/pi-coding-agent', type: 'module', exports: './index.js' }),
    'utf8',
  );
  await writeFile(
    path.join(typeboxDir, 'package.json'),
    JSON.stringify({ name: 'typebox', type: 'module', exports: './index.js' }),
    'utf8',
  );
  await writeFile(
    path.join(typeboxDir, 'index.js'),
    `
export const Type = {
  Object(value) {
    return value;
  },
  Optional(value) {
    return value;
  },
  String(value) {
    return value;
  },
};
`,
    'utf8',
  );
  await writeFile(
    path.join(packageDir, 'index.js'),
    `
export class DefaultResourceLoader {
  constructor(options) {
    this.options = options;
  }
  async reload() {}
}

export const SessionManager = {
  inMemory(cwd) {
    return { cwd };
  },
};

export const SettingsManager = {
  inMemory(settings) {
    return { settings };
  },
};

export function getAgentDir() {
  return '/tmp/mock-agent-dir';
}

const calls = globalThis.__codeReviewerCreateAgentSessionCalls ?? (globalThis.__codeReviewerCreateAgentSessionCalls = []);
const behaviors = globalThis.__codeReviewerCreateAgentSessionBehaviors ?? (globalThis.__codeReviewerCreateAgentSessionBehaviors = []);

export async function createAgentSession(args) {
  calls.push(args);
  const behavior = behaviors.shift();
  if (behavior?.type === 'throw') {
    throw new Error(behavior.message);
  }
  return {
    session: {
      state: {
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: behavior?.text ?? 'review ok' }],
          },
        ],
      },
      subscribe() {
        return () => {};
      },
      async prompt() {},
      async abort() {},
      dispose() {},
    },
  };
}

export function __getCreateAgentSessionCalls() {
  return calls;
}

export function __setCreateAgentSessionBehaviors(nextBehaviors) {
  calls.length = 0;
  behaviors.length = 0;
  behaviors.push(...nextBehaviors);
}
`,
    'utf8',
  );

  const compiledPath = path.join(tempDir, 'code-reviewer.mjs');
  await writeFile(compiledPath, compiled, 'utf8');
  const extensionModule = await import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);
  const piModule = await import(`${pathToFileURL(path.join(packageDir, 'index.js')).href}?t=${Date.now()}`);
  return {
    extension: extensionModule.default,
    getCreateAgentSessionCalls: piModule.__getCreateAgentSessionCalls,
    setCreateAgentSessionBehaviors: piModule.__setCreateAgentSessionBehaviors,
  };
}

test('code_reviewer auto-selection prefers an opposite provider and model family when available', async () => {
  const { selectCodeReviewerModel } = await loadCodeReviewerTestUtils();
  const result = await selectCodeReviewerModel(
    createContext({
      model: { provider: 'openai', id: 'gpt-5.5', reasoning: true },
      available: [
        { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
        { provider: 'anthropic', id: 'claude-sonnet-4.6', reasoning: true },
        { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(`${result.selection.provider}/${result.selection.id}`, 'anthropic/claude-opus-4.8');
  assert.deepEqual(
    result.ordered.map((model) => `${model.provider}/${model.id}`),
    ['anthropic/claude-opus-4.8', 'anthropic/claude-sonnet-4.6', 'openai/gpt-5.5-pro'],
  );
});

test('code_reviewer auto-selection falls back to the current provider when no opposite provider or family exists', async () => {
  const { selectCodeReviewerModel } = await loadCodeReviewerTestUtils();
  const result = await selectCodeReviewerModel(
    createContext({
      model: { provider: 'custom', id: 'solver-1', reasoning: true },
      available: [
        { provider: 'custom', id: 'solver-1', reasoning: true },
        { provider: 'custom', id: 'solver-2', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(`${result.selection.provider}/${result.selection.id}`, 'custom/solver-2');
});


test('code_reviewer auto-selection prefers gpt-5.6-sol first within openai fallback paths', async () => {
  const { selectCodeReviewerModel } = await loadCodeReviewerTestUtils();
  const result = await selectCodeReviewerModel(
    createContext({
      model: { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
      available: [
        { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
        { provider: 'openai', id: 'gpt-5.6-sol', reasoning: true },
        { provider: 'openai', id: 'gpt-5.5', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(`${result.selection.provider}/${result.selection.id}`, 'openai/gpt-5.6-sol');
  assert.deepEqual(
    result.ordered.map((model) => `${model.provider}/${model.id}`),
    ['openai/gpt-5.6-sol', 'openai/gpt-5.5-pro', 'openai/gpt-5.5'],
  );
});

test('code_reviewer same-provider openai-codex fallback prefers gpt-5.6-sol with high thinking', async () => {
  const { resolveThinkingLevel, selectCodeReviewerModel } = await loadCodeReviewerTestUtils();
  const result = await selectCodeReviewerModel(
    createContext({
      model: { provider: 'openai-codex', id: 'gpt-5.4', reasoning: true },
      available: [
        { provider: 'openai-codex', id: 'gpt-5.5', reasoning: true },
        { provider: 'openai-codex', id: 'gpt-5.6-sol', reasoning: true },
        { provider: 'openai-codex', id: 'gpt-5.4', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(`${result.selection.provider}/${result.selection.id}`, 'openai-codex/gpt-5.6-sol');
  assert.deepEqual(
    result.ordered.map((model) => `${model.provider}/${model.id}`),
    ['openai-codex/gpt-5.6-sol', 'openai-codex/gpt-5.5', 'openai-codex/gpt-5.4'],
  );
  assert.deepEqual(resolveThinkingLevel(result.selection, undefined), {
    requested: 'high',
    effective: 'high',
    clamped: false,
    note: 'defaulted to high',
  });
});

test('code_reviewer auto-selection preserves fallback tiers after contrarian candidates', async () => {
  const { selectCodeReviewerModel } = await loadCodeReviewerTestUtils();
  const result = await selectCodeReviewerModel(
    createContext({
      model: { provider: 'openai', id: 'gpt-5.5', reasoning: true },
      available: [
        { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
        { provider: 'openai', id: 'gpt-5.5-mini', reasoning: false },
        { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(
    result.ordered.map((model) => `${model.provider}/${model.id}`),
    ['anthropic/claude-opus-4.8', 'openai/gpt-5.5-pro', 'openai/gpt-5.5-mini'],
  );
});

test('code_reviewer auto-selection works without ctx.model, clamps active thinking, and reports the final model details', async (t) => {
  const { extension, getCreateAgentSessionCalls, setCreateAgentSessionBehaviors } = await loadCodeReviewerExtensionWithMockPi(t);
  setCreateAgentSessionBehaviors([]);
  const harness = createExtensionHarness();
  harness.pi.getThinkingLevel = () => 'xhigh';
  extension(harness.pi);
  const tool = harness.tools.get('code_reviewer');
  assert.ok(tool, 'expected code_reviewer tool to be registered');

  const ctx = {
    cwd: repoRoot,
    model: undefined,
    modelRegistry: {
      async getAvailable() {
        return [
          { provider: 'custom', id: 'solver-1', reasoning: false },
          { provider: 'custom', id: 'solver-2', reasoning: true, thinkingLevelMap: { high: true, xhigh: null } },
        ];
      },
    },
  };

  const result = await tool.execute('call-1', { task: 'Review this change for correctness.' }, undefined, undefined, ctx);
  assert.match(result.content[0].text, /review ok/);
  assert.match(result.content[0].text, /Run details: model custom\/solver-2; thinking high \(requested xhigh; clamped to high\)/);
  assert.equal(result.details.modelRef, 'custom/solver-2');
  assert.equal(result.details.requestedThinkingLevel, 'xhigh');
  assert.equal(result.details.effectiveThinkingLevel, 'high');
  assert.equal(result.details.thinkingLevelClamped, true);
  assert.equal(result.details.thinkingLevelNote, 'requested xhigh; clamped to high');

  const createCalls = getCreateAgentSessionCalls();
  assert.equal(createCalls.length, 1);
  assert.equal(`${createCalls[0].model.provider}/${createCalls[0].model.id}`, 'custom/solver-2');
  assert.equal(createCalls[0].thinkingLevel, 'high');
});

test('code_reviewer falls back to lower-priority selected models when preferred contrarian candidates are unavailable and reports the successful fallback model', async (t) => {
  const { extension, getCreateAgentSessionCalls, setCreateAgentSessionBehaviors } = await loadCodeReviewerExtensionWithMockPi(t);
  setCreateAgentSessionBehaviors([
    { type: 'throw', message: '404 model_not_found_error: model does not exist' },
    { type: 'return', text: 'review ok after fallback' },
  ]);
  const harness = createExtensionHarness();
  harness.pi.getThinkingLevel = () => 'high';
  extension(harness.pi);
  const tool = harness.tools.get('code_reviewer');
  assert.ok(tool, 'expected code_reviewer tool to be registered');

  const ctx = {
    cwd: repoRoot,
    model: { provider: 'openai', id: 'gpt-5.5', reasoning: true },
    modelRegistry: {
      async getAvailable() {
        return [
          { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
          { provider: 'openai', id: 'gpt-5.5-mini', reasoning: false },
          { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
        ];
      },
    },
  };

  const result = await tool.execute('call-2', { task: 'Review this change for correctness.' }, undefined, undefined, ctx);
  assert.match(result.content[0].text, /review ok after fallback/);
  assert.match(result.content[0].text, /Run details: model openai\/gpt-5\.5-pro; thinking high \(requested high\)/);
  assert.doesNotMatch(result.content[0].text, /Run details: model anthropic\/claude-opus-4\.8/);
  assert.equal(result.details.modelRef, 'openai/gpt-5.5-pro');
  assert.equal(result.details.effectiveThinkingLevel, 'high');
  assert.equal(result.details.thinkingLevelNote, 'requested high');

  const createCalls = getCreateAgentSessionCalls();
  assert.equal(createCalls.length, 2);
  assert.deepEqual(
    createCalls.map((call) => `${call.model.provider}/${call.model.id}`),
    ['anthropic/claude-opus-4.8', 'openai/gpt-5.5-pro'],
  );
  assert.deepEqual(
    createCalls.map((call) => call.tools),
    [
      ['read', 'grep', 'find', 'ls', 'bash'],
      ['read', 'grep', 'find', 'ls', 'bash'],
    ],
  );
  assert.deepEqual(createCalls.map((call) => call.thinkingLevel), ['high', 'high']);
});

test('code_reviewer thinking resolution defaults to high for reasoning models and off for non-reasoning models', async () => {
  const { resolveThinkingLevel } = await loadCodeReviewerTestUtils();

  assert.deepEqual(resolveThinkingLevel({ provider: 'custom', id: 'solver-2', reasoning: true }, undefined), {
    requested: 'high',
    effective: 'high',
    clamped: false,
    note: 'defaulted to high',
  });
  assert.deepEqual(resolveThinkingLevel({ provider: 'custom', id: 'solver-1', reasoning: false }, undefined), {
    requested: 'off',
    effective: 'off',
    clamped: false,
    note: 'defaulted to off for non-reasoning model',
  });
});

test('code_reviewer max thinking is preserved when supported and clamps to xhigh when unsupported', async () => {
  const { normalizeThinkingLevel, resolveThinkingLevel } = await loadCodeReviewerTestUtils();
  const model = {
    provider: 'custom',
    id: 'solver-max',
    reasoning: true,
    thinkingLevelMap: { off: {}, high: {}, xhigh: {}, max: {} },
  };

  assert.equal(normalizeThinkingLevel('max'), 'max');
  assert.deepEqual(resolveThinkingLevel(model, 'max'), {
    requested: 'max',
    effective: 'max',
    clamped: false,
    note: 'requested max',
  });
  assert.deepEqual(resolveThinkingLevel({ ...model, thinkingLevelMap: { ...model.thinkingLevelMap, max: null } }, 'max'), {
    requested: 'max',
    effective: 'xhigh',
    clamped: true,
    note: 'requested max; clamped to xhigh',
  });
});

test('code_reviewer auto-selection reports when no authenticated models are available', async () => {
  const { selectCodeReviewerModel } = await loadCodeReviewerTestUtils();

  assert.deepEqual(await selectCodeReviewerModel(createContext({ available: [] })), {
    ok: false,
    error: 'No authenticated models are available. Log in or configure an API key first.',
  });
});
