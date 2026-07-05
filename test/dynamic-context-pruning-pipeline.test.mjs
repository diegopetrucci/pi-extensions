import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'extensions/dynamic-context-pruning/index.ts');
const dcp = await import(pathToFileURL(modulePath).href);

const {
  defaultConfig,
  runDynamicContextPruningPipeline,
  applyPruneDecision,
  proposalToDecisionRecord,
  findToolCallPairIndices,
  buildIdempotencyKey,
} = dcp;

function toolCallMessages({ toolCallId = 'call_1', toolName = 'bash', isError = false, resultText = 'a'.repeat(500) } = {}) {
  return [
    { role: 'user', content: 'do the thing', timestamp: 1 },
    {
      role: 'assistant',
      content: [{ type: 'toolCall', id: toolCallId, name: toolName, arguments: { command: 'ls' } }],
      timestamp: 2,
    },
    {
      role: 'toolResult',
      toolCallId,
      toolName,
      content: [{ type: 'text', text: resultText }],
      isError,
      timestamp: 3,
    },
    { role: 'assistant', content: [{ type: 'text', text: 'done' }], timestamp: 4 },
  ];
}

test('pipeline is a no-op when disabled', () => {
  const messages = toolCallMessages();
  const config = { ...defaultConfig(), enabled: false };
  const result = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [],
    knownIdempotencyKeys: new Set(),
  });
  assert.equal(result.messages, messages);
  assert.deepEqual(result.newlyAppliedDecisions, []);
});

test('applyPruneDecision replaces tool result content in place, preserving ids/order (pairing invariant)', () => {
  const messages = toolCallMessages();
  const decision = proposalToDecisionRecord({
    strategyId: 'test-strategy',
    toolCallId: 'call_1',
    kind: 'tool_result_content',
    reason: 'stale output',
  });

  const before = JSON.parse(JSON.stringify(messages));
  const result = applyPruneDecision(messages, decision);

  assert.equal(result.applied, true);
  assert.ok(result.charsRemoved > 0);

  // Same length, same roles/order as before -> no message was dropped.
  assert.equal(messages.length, before.length);
  messages.forEach((message, index) => assert.equal(message.role, before[index].role));

  // toolCall / toolResult ids are unchanged -> no orphan pairs possible.
  assert.equal(messages[1].content[0].id, 'call_1');
  assert.equal(messages[2].toolCallId, 'call_1');
  assert.equal(messages[2].toolName, before[2].toolName);
  assert.equal(messages[2].isError, before[2].isError);

  // Content was replaced with a placeholder, not left untouched or removed.
  assert.equal(messages[2].content.length, 1);
  assert.equal(messages[2].content[0].type, 'text');
  assert.ok(messages[2].content[0].text.includes('pruned by dynamic-context-pruning'));
  assert.notEqual(messages[2].content[0].text, before[2].content[0].text);

  // Assistant/user text blocks are never touched.
  assert.deepEqual(messages[0], before[0]);
  assert.deepEqual(messages[3], before[3]);
});

test('applyPruneDecision only redacts tool_call_input for errored calls', () => {
  const successMessages = toolCallMessages({ isError: false });
  const errorMessages = toolCallMessages({ toolCallId: 'call_2', isError: true });

  const successDecision = proposalToDecisionRecord({
    strategyId: 'test-strategy',
    toolCallId: 'call_1',
    kind: 'tool_call_input',
    reason: 'redundant input',
  });
  const errorDecision = proposalToDecisionRecord({
    strategyId: 'test-strategy',
    toolCallId: 'call_2',
    kind: 'tool_call_input',
    reason: 'redundant input',
  });

  const successResult = applyPruneDecision(successMessages, successDecision);
  assert.equal(successResult.applied, false, 'must never redact input for a successful tool call');
  assert.deepEqual(successMessages[1].content[0].arguments, { command: 'ls' });

  const errorResult = applyPruneDecision(errorMessages, errorDecision);
  assert.equal(errorResult.applied, true);
  assert.deepEqual(errorMessages[1].content[0].arguments, { pruned: true, reason: 'redundant input' });
  // The tool call id/name/type are preserved; only arguments changed.
  assert.equal(errorMessages[1].content[0].id, 'call_2');
  assert.equal(errorMessages[1].content[0].name, 'bash');
});

test('applyPruneDecision gracefully no-ops when the target toolCallId is absent (e.g. after compaction)', () => {
  const messages = toolCallMessages();
  const decision = proposalToDecisionRecord({
    strategyId: 'test-strategy',
    toolCallId: 'does-not-exist',
    kind: 'tool_result_content',
    reason: 'stale output',
  });
  const before = JSON.parse(JSON.stringify(messages));
  const result = applyPruneDecision(messages, decision);
  assert.equal(result.applied, false);
  assert.equal(result.charsRemoved, 0);
  assert.deepEqual(messages, before);
});

test('pipeline degrades gracefully when a persisted decision references an absent message', () => {
  const messages = toolCallMessages();
  const staleDecision = proposalToDecisionRecord({
    strategyId: 'old-strategy',
    toolCallId: 'gone-call-id',
    kind: 'tool_result_content',
    reason: 'no longer present',
  });

  const result = runDynamicContextPruningPipeline({
    messages,
    config: defaultConfig(),
    persistedDecisions: [staleDecision],
    knownIdempotencyKeys: new Set([staleDecision.idempotencyKey]),
  });

  // No crash, no messages dropped, and nothing new to persist.
  assert.equal(result.messages.length, messages.length);
  assert.deepEqual(result.newlyAppliedDecisions, []);
});

test('propose/apply split: a strategy proposes, the pipeline applies and reports it for appendEntry exactly once', (t) => {
  const fakeStrategy = {
    id: 'test-strategy',
    propose: () => [
      { strategyId: 'test-strategy', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale output' },
    ],
  };
  dcp.STRATEGIES.push(fakeStrategy);
  t.after(() => {
    const idx = dcp.STRATEGIES.indexOf(fakeStrategy);
    if (idx >= 0) dcp.STRATEGIES.splice(idx, 1);
  });

  const messages = toolCallMessages();
  // Recency protection and the net-benefit gate are orthogonal to
  // propose/apply/persist; disable both here.
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const idempotencyKey = buildIdempotencyKey({ strategyId: 'test-strategy', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'x' });

  // First call: nothing persisted yet -> the proposal must be applied and reported once.
  const firstCall = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [],
    knownIdempotencyKeys: new Set(),
  });
  assert.equal(firstCall.newlyAppliedDecisions.length, 1);
  assert.equal(firstCall.newlyAppliedDecisions[0].idempotencyKey, idempotencyKey);
  assert.ok(firstCall.messages[2].content[0].text.includes('pruned by'));

  // Second call: the same decision is now persisted/known -> it must still be
  // applied (pruning is recomputed every call) but never re-reported.
  const persistedDecision = firstCall.newlyAppliedDecisions[0];
  const secondCall = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [persistedDecision],
    knownIdempotencyKeys: new Set([persistedDecision.idempotencyKey]),
  });
  assert.equal(secondCall.newlyAppliedDecisions.length, 0, 'must not re-report an already-known decision');
  assert.ok(secondCall.messages[2].content[0].text.includes('pruned by'));
});

test('buildIdempotencyKey is stable for the same strategy/kind/toolCallId', () => {
  const pair = findToolCallPairIndices(toolCallMessages(), 'call_1');
  assert.equal(pair.assistantIndex, 1);
  assert.equal(pair.resultIndex, 2);

  const keyA = buildIdempotencyKey({ strategyId: 's', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'x' });
  const keyB = buildIdempotencyKey({ strategyId: 's', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'y' });
  assert.equal(keyA, keyB, 'idempotency key must not depend on the (possibly varying) reason text');
});
