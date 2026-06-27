import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

async function loadContrarianTestUtils() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/contrarian/index.ts')).href;
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

test('contrarian explicit model matching prefers exact provider-qualified matches', async () => {
  const { findAvailableModel } = await loadContrarianTestUtils();
  const exactMatch = {
    provider: 'anthropic',
    id: 'claude-opus-4.8',
    reasoning: true,
  };
  const ctx = createContext({
    model: { provider: 'openai', id: 'gpt-5.5', reasoning: true },
    available: [
      { provider: 'anthropic', id: 'claude-opus-4.8-fast', reasoning: true },
      exactMatch,
    ],
  });

  assert.equal(await findAvailableModel(ctx, 'anthropic/claude-opus-4.8'), exactMatch);
});

test('contrarian auto-selection prefers an opposite provider and model family when available', async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();
  const result = await selectContrarianModel(
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

  assert.equal(result.selection.modelRef, 'anthropic/claude-opus-4.8');
  assert.equal(result.selection.autoSelected, true);
  assert.match(result.selection.selectionReason, /opposite provider\/model family/i);
});

test('contrarian thinking-level resolution clamps unsupported levels for matched models', async () => {
  const { findAvailableModel, resolveThinkingLevel } = await loadContrarianTestUtils();
  const matchedModel = {
    provider: 'anthropic',
    id: 'claude-opus-4.8',
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

  const matched = await findAvailableModel(ctx, 'anthropic/claude-opus-4.8');
  assert.equal(matched, matchedModel);
  assert.deepEqual(resolveThinkingLevel(matched, 'high'), {
    requested: 'high',
    effective: 'low',
    clamped: true,
  });
});

test('contrarian auto-selection reports when no authenticated models are available', async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();

  assert.deepEqual(await selectContrarianModel(createContext({ available: [] })), {
    ok: false,
    error: 'No authenticated models are available. Log in or configure an API key first.',
  });
});
