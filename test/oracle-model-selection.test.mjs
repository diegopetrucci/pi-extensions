import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

async function loadOracleTestUtils() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/oracle/index.ts')).href;
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

test('oracle model preference parsing keeps the model ref and extracts the thinking-level suffix', async () => {
  const { parseModelPreference } = await loadOracleTestUtils();

  assert.deepEqual(parseModelPreference(' openai/gpt-5.5-pro:xhigh '), {
    model: 'openai/gpt-5.5-pro',
    thinkingLevel: 'xhigh',
  });
  assert.deepEqual(parseModelPreference('openai/gpt-5.5-pro:max'), {
    model: 'openai/gpt-5.5-pro',
    thinkingLevel: 'max',
  });
  assert.deepEqual(parseModelPreference('openai/gpt-5.5-pro'), {
    model: 'openai/gpt-5.5-pro',
  });
});

test('oracle auto-selection prefers gpt-5.6-sol first on openai and defaults it to high thinking', async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const result = await selectOracleModel(
    createContext({
      model: { provider: 'openai', id: 'gpt-5.4', reasoning: true },
      available: [
        { provider: 'openai', id: 'gpt-5.5', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
        { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
        { provider: 'openai', id: 'gpt-5.6-sol', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
        { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, 'openai/gpt-5.6-sol');
  assert.equal(result.selection.thinkingLevel, 'high');
  assert.equal(result.selection.requestedThinkingLevel, undefined);
  assert.equal(result.selection.thinkingLevelClamped, undefined);
  assert.equal(result.selection.autoSelected, true);
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    ['openai/gpt-5.6-sol', 'openai/gpt-5.5-pro', 'openai/gpt-5.5'],
  );
  assert.match(result.selection.selectionReason, /hardcoded preference list for openai/i);
});

test('oracle auto-selection keeps the gpt-5.6 sol/terra/luna ordering before older openai-codex fallbacks', async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const result = await selectOracleModel(
    createContext({
      model: { provider: 'openai-codex', id: 'gpt-5.4', reasoning: true },
      available: [
        { provider: 'openai-codex', id: 'gpt-5.6-luna', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
        { provider: 'openai-codex', id: 'gpt-5.4', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
        { provider: 'openai-codex', id: 'gpt-5.6-terra', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, 'openai-codex/gpt-5.6-terra');
  assert.equal(result.selection.thinkingLevel, 'xhigh');
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    ['openai-codex/gpt-5.6-terra', 'openai-codex/gpt-5.6-luna', 'openai-codex/gpt-5.4'],
  );
});

test('oracle auto-selection prefers Claude Sonnet 5 over Claude Sonnet 4 when Fable and Opus are unavailable', async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const result = await selectOracleModel(
    createContext({
      model: { provider: 'anthropic', id: 'claude-3-7-sonnet', reasoning: true },
      available: [
        { provider: 'anthropic', id: 'claude-sonnet-4.6', reasoning: true },
        { provider: 'anthropic', id: 'claude-sonnet-5.0', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, 'anthropic/claude-sonnet-5.0');
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    ['anthropic/claude-sonnet-5.0', 'anthropic/claude-sonnet-4.6'],
  );
  assert.match(result.selection.selectionReason, /hardcoded preference list for anthropic/i);
});

test('oracle auto-selection stays on the current provider when it has no reasoning models', async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const result = await selectOracleModel(
    createContext({
      model: { provider: 'google', id: 'gemini-2.5-flash-lite', reasoning: false },
      available: [
        { provider: 'google', id: 'project-random-lite', reasoning: false },
        { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, 'google/project-random-lite');
  assert.match(
    result.selection.selectionReason,
    /current provider has no reasoning models available, so the top-ranked model on that provider was used\./i,
  );
});

test('oracle thinking-level resolution uses high for gpt-5.6-sol defaults and xhigh for other reasoning defaults', async () => {
  const { resolveThinkingLevel } = await loadOracleTestUtils();

  assert.deepEqual(
    resolveThinkingLevel({ provider: 'openai', id: 'gpt-5.6-sol', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } }, undefined),
    {
      requested: 'high',
      effective: 'high',
      clamped: false,
    },
  );
  assert.deepEqual(
    resolveThinkingLevel({ provider: 'openai', id: 'gpt-5.5-pro', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } }, undefined),
    {
      requested: 'xhigh',
      effective: 'xhigh',
      clamped: false,
    },
  );
});

test('oracle thinking-level resolution clamps unsupported levels for matched models', async () => {
  const { findAvailableModel, resolveThinkingLevel } = await loadOracleTestUtils();
  const matchedModel = {
    provider: 'openai',
    id: 'gpt-5.5-pro',
    reasoning: true,
    thinkingLevelMap: {
      off: {},
      minimal: {},
      low: {},
      medium: null,
      high: null,
      xhigh: null,
    },
  };
  const ctx = createContext({
    available: [matchedModel],
  });

  const matched = await findAvailableModel(ctx, 'openai/gpt-5.5-pro');
  assert.equal(matched, matchedModel);
  assert.deepEqual(resolveThinkingLevel(matched, 'xhigh'), {
    requested: 'xhigh',
    effective: 'low',
    clamped: true,
  });

  const maxModel = {
    ...matchedModel,
    thinkingLevelMap: { ...matchedModel.thinkingLevelMap, xhigh: {}, max: {} },
  };
  assert.deepEqual(resolveThinkingLevel(maxModel, 'max'), {
    requested: 'max',
    effective: 'max',
    clamped: false,
  });
  assert.deepEqual(resolveThinkingLevel({ ...maxModel, thinkingLevelMap: { ...maxModel.thinkingLevelMap, max: null } }, 'max'), {
    requested: 'max',
    effective: 'xhigh',
    clamped: true,
  });
});
