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
  assert.deepEqual(parseModelPreference('openai/gpt-5.5-pro'), {
    model: 'openai/gpt-5.5-pro',
  });
});

test('oracle auto-selection prefers the current provider hardcoded top reasoning model', async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const result = await selectOracleModel(
    createContext({
      model: { provider: 'openai', id: 'gpt-5.4', reasoning: true },
      available: [
        { provider: 'openai', id: 'gpt-5.5', reasoning: true },
        { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
        { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, 'openai/gpt-5.5-pro');
  assert.equal(result.selection.autoSelected, true);
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    ['openai/gpt-5.5-pro', 'openai/gpt-5.5'],
  );
  assert.match(result.selection.selectionReason, /hardcoded preference list for openai/i);
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
});
