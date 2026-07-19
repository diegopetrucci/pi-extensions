import assert from 'node:assert/strict';
import test from 'node:test';

import { createModelSelectionContext, loadRoleTestUtils } from './support/provider-policy-contract-support.mjs';

async function loadContrarianTestUtils() {
  return loadRoleTestUtils('contrarian');
}

test('contrarian auto-selection prefers Claude Sonnet 5 over Claude Sonnet 4 across providers when Opus and Fable are unavailable', async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();
  const result = await selectContrarianModel(
    createModelSelectionContext({
      model: { provider: 'openai', id: 'gpt-5.5', reasoning: true },
      available: [
        { provider: 'amazon-bedrock', id: 'claude-sonnet-4-6', reasoning: true },
        { provider: 'vercel-ai-gateway', id: 'anthropic/claude-sonnet-5.0', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, 'vercel-ai-gateway/anthropic/claude-sonnet-5.0');
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    [
      'vercel-ai-gateway/anthropic/claude-sonnet-5.0',
      'amazon-bedrock/claude-sonnet-4-6',
    ],
  );
  assert.match(result.selection.selectionReason, /hardcoded preference lists while preferring an opposite provider\/model family/i);
});

test('contrarian auto-selection keeps the gpt-5.6 sol/terra/luna ordering across openai fallback paths', async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();
  const result = await selectContrarianModel(
    createModelSelectionContext({
      model: { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
      available: [
        { provider: 'openai-codex', id: 'gpt-5.6-luna', reasoning: true },
        { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
        { provider: 'openai-codex', id: 'gpt-5.6-terra', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, 'openai-codex/gpt-5.6-terra');
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    [
      'openai-codex/gpt-5.6-terra',
      'openai-codex/gpt-5.6-luna',
      'openai/gpt-5.5-pro',
    ],
  );
  assert.match(result.selection.selectionReason, /hardcoded preference lists while preferring an opposite provider\/model family/i);
});

test('contrarian auto-selection falls back to the current provider when no opposite provider or family exists', async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();
  const result = await selectContrarianModel(
    createModelSelectionContext({
      model: { provider: 'custom', id: 'solver-1', reasoning: true },
      available: [
        { provider: 'custom', id: 'solver-1', reasoning: true },
        { provider: 'custom', id: 'solver-2', reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, 'custom/solver-2');
  assert.match(
    result.selection.selectionReason,
    /No opposite provider\/model family was available, so the top-ranked reasoning model on the current provider was used\./i,
  );
});
