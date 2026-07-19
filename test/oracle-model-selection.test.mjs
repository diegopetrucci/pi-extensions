import assert from 'node:assert/strict';
import test from 'node:test';

import { createModelSelectionContext, loadRoleTestUtils } from './support/provider-policy-contract-support.mjs';

async function loadOracleTestUtils() {
  return loadRoleTestUtils('oracle');
}

test('oracle auto-selection keeps the gpt-5.6 sol/terra/luna ordering before older openai-codex fallbacks', async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const result = await selectOracleModel(
    createModelSelectionContext({
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
    createModelSelectionContext({
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
    createModelSelectionContext({
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
  const ctx = createModelSelectionContext({
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
