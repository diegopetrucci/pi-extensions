import assert from 'node:assert/strict';
import test from 'node:test';

import { createModelSelectionContext, loadRoleTestUtils } from './support/provider-policy-contract-support.mjs';

async function loadLibrarianTestUtils() {
  return loadRoleTestUtils('librarian');
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
