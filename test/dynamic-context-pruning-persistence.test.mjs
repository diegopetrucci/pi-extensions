import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'extensions/dynamic-context-pruning/index.ts');
const dcp = await import(pathToFileURL(modulePath).href);

const {
  proposalToDecisionRecord,
  parseDecisionRecord,
  rebuildDecisionStateFromEntries,
  runDynamicContextPruningPipeline,
  defaultConfig,
} = dcp;

function customEntry(decision, overrides = {}) {
  return {
    type: 'custom',
    id: overrides.id ?? 'e-decision',
    parentId: overrides.parentId ?? null,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    customType: 'dynamic-context-pruning:decision',
    data: decision,
  };
}

test('parseDecisionRecord round-trips a valid record and rejects malformed payloads', () => {
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  const parsed = parseDecisionRecord(JSON.parse(JSON.stringify(decision)));
  assert.deepEqual(parsed, decision);

  assert.equal(parseDecisionRecord(undefined), undefined);
  assert.equal(parseDecisionRecord(null), undefined);
  assert.equal(parseDecisionRecord({}), undefined);
  assert.equal(parseDecisionRecord({ idempotencyKey: 'k', kind: 'nonsense' }), undefined);
  assert.equal(parseDecisionRecord({ ...decision, correlation: { type: 'bogus' } }), undefined);
});

test('rebuildDecisionStateFromEntries reconstructs decisions from custom entries on a branch', () => {
  const decisionA = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r1' });
  const decisionB = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'c2', kind: 'tool_result_content', reason: 'r2' });

  const entries = [
    { type: 'message', id: 'm1', parentId: null, timestamp: 't0', message: { role: 'user', content: 'hi', timestamp: 1 } },
    customEntry(decisionA, { id: 'e1', parentId: 'm1' }),
    customEntry(decisionB, { id: 'e2', parentId: 'e1' }),
  ];

  const state = rebuildDecisionStateFromEntries(entries);
  assert.equal(state.decisions.length, 2);
  assert.deepEqual(new Set(state.decisions.map((d) => d.idempotencyKey)), new Set([decisionA.idempotencyKey, decisionB.idempotencyKey]));
  assert.ok(state.idempotencyKeys.has(decisionA.idempotencyKey));
  assert.ok(state.idempotencyKeys.has(decisionB.idempotencyKey));
});

test('rebuildDecisionStateFromEntries tolerates duplicate/replayed entries (idempotent rebuild)', () => {
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r1' });
  const entries = [
    customEntry(decision, { id: 'e1' }),
    customEntry(decision, { id: 'e2' }), // replayed/duplicated append
    customEntry(decision, { id: 'e3' }),
  ];
  const state = rebuildDecisionStateFromEntries(entries);
  assert.equal(state.decisions.length, 1, 'duplicate idempotency keys must collapse to a single decision');
});

test('rebuildDecisionStateFromEntries ignores unrelated custom entries and malformed data', () => {
  const entries = [
    { type: 'custom', id: 'e1', parentId: null, timestamp: 't', customType: 'some-other-extension:thing', data: { x: 1 } },
    { type: 'custom', id: 'e2', parentId: 'e1', timestamp: 't', customType: 'dynamic-context-pruning:decision', data: { garbage: true } },
  ];
  const state = rebuildDecisionStateFromEntries(entries);
  assert.equal(state.decisions.length, 0);
});

test('rebuilt state feeds back into the pipeline and is not re-reported for appendEntry', () => {
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r1' });
  const entries = [customEntry(decision)];
  const state = rebuildDecisionStateFromEntries(entries);

  const messages = [
    { role: 'user', content: 'hi', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: {} }], timestamp: 2 },
    { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: 'x'.repeat(50) }], isError: false, timestamp: 3 },
  ];

  // Recency protection is orthogonal to persistence/idempotency; disable it
  // here so this test only exercises the rebuild -> apply -> no-re-report path.
  const config = { ...defaultConfig(), protections: { ...defaultConfig().protections, recentTurns: 0 } };
  const result = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: state.decisions,
    knownIdempotencyKeys: state.idempotencyKeys,
  });

  assert.equal(result.newlyAppliedDecisions.length, 0, 'a decision rebuilt from persisted entries is already known');
  assert.ok(result.messages[2].content[0].text.includes('pruned by'), 'the persisted decision must still be applied to context');
});
