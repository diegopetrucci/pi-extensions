import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

async function loadLibrarianTestUtils() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href;
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

test('librarian model preference parsing treats auto/current as auto while keeping thinking overrides', async () => {
  const { parseModelPreference } = await loadLibrarianTestUtils();

  assert.deepEqual(parseModelPreference(' auto '), {});
  assert.deepEqual(parseModelPreference(' current '), {});
  assert.deepEqual(parseModelPreference(' auto:medium '), { thinkingLevel: 'medium' });
  assert.deepEqual(parseModelPreference(' current:high '), { thinkingLevel: 'high' });
  assert.deepEqual(parseModelPreference(' auto:max '), { thinkingLevel: 'max' });
  assert.deepEqual(parseModelPreference(' anthropic/claude-haiku-4-5:low '), {
    model: 'anthropic/claude-haiku-4-5',
    thinkingLevel: 'low',
  });
});

test('librarian max thinking is preserved when supported and clamps to xhigh when unsupported', async () => {
  const { resolveThinkingLevel } = await loadLibrarianTestUtils();
  const model = {
    provider: 'custom',
    id: 'researcher',
    reasoning: true,
    thinkingLevelMap: { off: {}, high: {}, xhigh: {}, max: {} },
  };

  assert.equal(resolveThinkingLevel(model, 'max'), 'max');
  assert.equal(resolveThinkingLevel({ ...model, thinkingLevelMap: { ...model.thinkingLevelMap, max: null } }, 'max'), 'xhigh');
});

test('librarian explicit model matching prefers exact provider-qualified matches', async () => {
  const { findAvailableModel } = await loadLibrarianTestUtils();
  const exactMatch = {
    provider: 'anthropic',
    id: 'claude-haiku-4-5',
    reasoning: false,
  };
  const ctx = createContext({
    model: { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
    available: [
      { provider: 'anthropic', id: 'claude-haiku-4-5-fast', reasoning: false },
      exactMatch,
    ],
  });

  assert.equal(await findAvailableModel(ctx, 'anthropic/claude-haiku-4-5'), exactMatch);
});

test('librarian candidate building falls back from an unavailable configured model to auto-selection and the current model', async () => {
  const { buildLibrarianCandidates } = await loadLibrarianTestUtils();
  const currentModel = {
    provider: 'openai',
    id: 'gpt-5.5-pro',
    reasoning: true,
    cost: { input: 5, output: 15 },
    contextWindow: 200000,
  };
  const preferredFastModel = {
    provider: 'anthropic',
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    reasoning: false,
    cost: { input: 1, output: 1 },
    contextWindow: 200000,
  };

  const candidates = await buildLibrarianCandidates(
    createContext({
      model: currentModel,
      available: [preferredFastModel],
    }),
    'openai/gpt-5.5-mini',
    'low',
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.details.modelRef),
    ['anthropic/claude-haiku-4-5', 'openai/gpt-5.5-pro'],
  );
  assert.equal(candidates[0].details.autoSelected, true);
  assert.match(candidates[0].details.selectionReason, /preferred fast Librarian model/i);
  assert.match(
    candidates[0].details.selectionReason,
    /Configured model openai\/gpt-5\.5-mini was unavailable, so Librarian fell back to auto-selection\./i,
  );
  assert.match(
    candidates[1].details.selectionReason,
    /Used the current session model openai\/gpt-5\.5-pro as a final fallback\./i,
  );
});

test('librarian model availability error detection distinguishes unavailable models from transient failures', async () => {
  const { isModelAvailabilityError } = await loadLibrarianTestUtils();

  assert.equal(isModelAvailabilityError('404 model_not_found_error: model does not exist'), true);
  assert.equal(isModelAvailabilityError('403 forbidden: you do not have access to this model'), true);
  assert.equal(isModelAvailabilityError('rate limited, please retry later'), false);
  assert.equal(isModelAvailabilityError('socket timeout after 30 seconds'), false);
  assert.equal(isModelAvailabilityError(undefined), false);
});
