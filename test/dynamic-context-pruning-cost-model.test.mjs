import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'extensions/dynamic-context-pruning/index.ts');
const dcp = await import(pathToFileURL(modulePath).href);

const {
  defaultConfig,
  normalizeConfig,
  estimateTailTokens,
  estimateDecisionSavings,
  computeCacheCostModel,
  evaluateNetBenefitGate,
  resolveBreakEvenThreshold,
  runDynamicContextPruningPipeline,
  proposalToDecisionRecord,
} = dcp;

// Builds a full gate config override. `breakEvenThresholdByState` mirrors
// `breakEvenThreshold` by default (resolveBreakEvenThreshold prefers the
// per-state map when present), so callers that only care about the
// state-agnostic default threshold must override both consistently.
function gateConfig(overrides = {}) {
  const base = defaultConfig().gate;
  const breakEvenThreshold = overrides.breakEvenThreshold ?? base.breakEvenThreshold;
  return {
    ...base,
    ...overrides,
    breakEvenThreshold,
    breakEvenThresholdByState: overrides.breakEvenThresholdByState ?? { idle: breakEvenThreshold, mid_loop: breakEvenThreshold },
  };
}

function toolCallMessages({ toolCallId = 'call_1', toolName = 'bash', isError = false, resultText = 'a'.repeat(2000) } = {}) {
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

// ---------------------------------------------------------------------------
// computeCacheCostModel: exact formulas per pe-s2ho ticket NOTES (binding):
//   penalty ~= (1 - r) * tailTokensAfterEarliestChange
//   recurringSaving ~= r * tokensRemoved
//   breakEvenCalls = penalty / recurringSaving
// ---------------------------------------------------------------------------

test('computeCacheCostModel applies the exact NOTES formula', () => {
  const result = computeCacheCostModel({ tailTokensAfterEarliestChange: 1000, tokensRemoved: 200, cachedPriceRatio: 0.1 });
  assert.equal(result.penalty, 0.9 * 1000);
  assert.equal(result.recurringSaving, 0.1 * 200);
  assert.equal(result.breakEvenCalls, (0.9 * 1000) / (0.1 * 200));
});

test('computeCacheCostModel: zero recurring saving with a real penalty yields Infinity break-even', () => {
  const result = computeCacheCostModel({ tailTokensAfterEarliestChange: 500, tokensRemoved: 0, cachedPriceRatio: 0.1 });
  assert.equal(result.recurringSaving, 0);
  assert.equal(result.breakEvenCalls, Infinity);
});

test('computeCacheCostModel: no tail and no removal is a trivial (already break-even) 0/0 case', () => {
  const result = computeCacheCostModel({ tailTokensAfterEarliestChange: 0, tokensRemoved: 0, cachedPriceRatio: 0.1 });
  assert.equal(result.penalty, 0);
  assert.equal(result.recurringSaving, 0);
  assert.equal(result.breakEvenCalls, 0);
});

test('computeCacheCostModel clamps an out-of-range cachedPriceRatio to a safe default', () => {
  const result = computeCacheCostModel({ tailTokensAfterEarliestChange: 100, tokensRemoved: 100, cachedPriceRatio: -5 });
  assert.ok(Number.isFinite(result.penalty));
  assert.ok(result.penalty >= 0);
});

// ---------------------------------------------------------------------------
// estimateTailTokens: edge positions
// ---------------------------------------------------------------------------

test('estimateTailTokens at index 0 covers the whole conversation', () => {
  const messages = toolCallMessages();
  const whole = estimateTailTokens(messages, 0);
  const sumEachMessage = messages.reduce((sum, _m, i) => sum + (estimateTailTokens(messages, i) - estimateTailTokens(messages, i + 1)), 0);
  assert.equal(whole, sumEachMessage);
  assert.ok(whole > 0);
});

test('estimateTailTokens at the last index only counts the final message', () => {
  const messages = toolCallMessages();
  const lastOnly = estimateTailTokens(messages, messages.length - 1);
  assert.ok(lastOnly > 0);
  assert.ok(lastOnly < estimateTailTokens(messages, 0));
});

test('estimateTailTokens beyond the array length is zero, not a crash', () => {
  const messages = toolCallMessages();
  assert.equal(estimateTailTokens(messages, messages.length + 10), 0);
});

// ---------------------------------------------------------------------------
// estimateDecisionSavings
// ---------------------------------------------------------------------------

test('estimateDecisionSavings computes tokensRemoved and position for a tool_result_content decision', () => {
  const messages = toolCallMessages();
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale' });
  const estimate = estimateDecisionSavings(messages, decision);
  assert.equal(estimate.position, 2);
  assert.ok(estimate.tokensRemoved > 0);
});

test('estimateDecisionSavings returns undefined when the decision would not apply (absent target)', () => {
  const messages = toolCallMessages();
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'missing', kind: 'tool_result_content', reason: 'stale' });
  assert.equal(estimateDecisionSavings(messages, decision), undefined);
});

test('estimateDecisionSavings never mutates the input messages', () => {
  const messages = toolCallMessages();
  const before = JSON.parse(JSON.stringify(messages));
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale' });
  estimateDecisionSavings(messages, decision);
  assert.deepEqual(messages, before);
});

// ---------------------------------------------------------------------------
// evaluateNetBenefitGate: modes, threshold variations, batching
// ---------------------------------------------------------------------------

function gateCandidate(messages, toolCallId, reason = 'stale') {
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId, kind: 'tool_result_content', reason });
  const estimate = estimateDecisionSavings(messages, decision);
  return { decision, position: estimate.position, tokensRemoved: estimate.tokensRemoved };
}

test('evaluateNetBenefitGate: mode "off" accepts everything without cost modelling', () => {
  const messages = toolCallMessages();
  const candidate = gateCandidate(messages, 'call_1');
  const config = gateConfig({ mode: 'off' });
  const result = evaluateNetBenefitGate([candidate], messages, config);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.cost, undefined);
});

test('evaluateNetBenefitGate: mode "always-apply" accepts even when break-even is far above threshold', () => {
  const messages = toolCallMessages({ resultText: 'a'.repeat(10) }); // tiny removal, big tail penalty
  const candidate = gateCandidate(messages, 'call_1');
  const config = gateConfig({ mode: 'always-apply', breakEvenThreshold: 1 });
  const result = evaluateNetBenefitGate([candidate], messages, config);
  assert.equal(result.accepted.length, 1);
  assert.ok(result.cost.breakEvenCalls > 1, 'sanity: this case really is above threshold');
});

test('evaluateNetBenefitGate: mode "on" accepts when break-even is within threshold', () => {
  // Large removal relative to tail => low break-even.
  const messages = toolCallMessages({ resultText: 'a'.repeat(20000) });
  const candidate = gateCandidate(messages, 'call_1');
  const config = gateConfig({ mode: 'on', breakEvenThreshold: 100 });
  const result = evaluateNetBenefitGate([candidate], messages, config);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 0);
});

test('evaluateNetBenefitGate: mode "on" rejects when break-even exceeds threshold', () => {
  const messages = toolCallMessages({ resultText: 'a'.repeat(50) }); // small removal, big fixed tail (final message)
  const candidate = gateCandidate(messages, 'call_1');
  const config = gateConfig({ mode: 'on', breakEvenThreshold: 0.01 });
  const result = evaluateNetBenefitGate([candidate], messages, config);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
});

test('evaluateNetBenefitGate: threshold variations flip the same candidate between accept/reject', () => {
  const messages = toolCallMessages({ resultText: 'a'.repeat(2000) });
  const candidate = gateCandidate(messages, 'call_1');
  const strict = evaluateNetBenefitGate([candidate], messages, gateConfig({ mode: 'on', breakEvenThreshold: 0 }));
  const lenient = evaluateNetBenefitGate([candidate], messages, gateConfig({ mode: 'on', breakEvenThreshold: 1e9 }));
  assert.equal(strict.accepted.length, 0);
  assert.equal(lenient.accepted.length, 1);
});

test('evaluateNetBenefitGate: batch sharing — multiple pending prunes behind the same earliest change are evaluated jointly', () => {
  const messages = [
    { role: 'user', content: 'go', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: {} }], timestamp: 2 },
    { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: 'x'.repeat(1000) }], isError: false, timestamp: 3 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c2', name: 'bash', arguments: {} }], timestamp: 4 },
    { role: 'toolResult', toolCallId: 'c2', toolName: 'bash', content: [{ type: 'text', text: 'y'.repeat(1000) }], isError: false, timestamp: 5 },
    { role: 'assistant', content: [{ type: 'text', text: 'done' }], timestamp: 6 },
  ];
  const candidateA = gateCandidate(messages, 'c1');
  const candidateB = gateCandidate(messages, 'c2');
  assert.ok(candidateA.position < candidateB.position);

  const config = gateConfig({ mode: 'on', breakEvenThreshold: 1000 });
  const jointResult = evaluateNetBenefitGate([candidateA, candidateB], messages, config);

  // The shared cache bust is anchored at the earliest position (candidateA's),
  // and the combined saving is the sum of both candidates' removals.
  assert.equal(jointResult.earliestPosition, candidateA.position);
  assert.equal(jointResult.totalTokensRemoved, candidateA.tokensRemoved + candidateB.tokensRemoved);
  assert.equal(jointResult.tailTokensAfterEarliestChange, estimateTailTokens(messages, candidateA.position));

  // Evaluated (and accepted/rejected) jointly: both accepted or both rejected, never split.
  assert.ok(jointResult.accepted.length === 0 || jointResult.accepted.length === 2);
});

test('evaluateNetBenefitGate: empty candidate list is a no-op', () => {
  const messages = toolCallMessages();
  const result = evaluateNetBenefitGate([], messages, defaultConfig().gate);
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.cost, undefined);
});

// ---------------------------------------------------------------------------
// resolveBreakEvenThreshold: state-conditioning hook
// ---------------------------------------------------------------------------

test('resolveBreakEvenThreshold uses the per-state override when present', () => {
  const gateConfig = { ...defaultConfig().gate, breakEvenThreshold: 5, breakEvenThresholdByState: { idle: 5, mid_loop: 20 } };
  assert.equal(resolveBreakEvenThreshold(gateConfig, 'idle'), 5);
  assert.equal(resolveBreakEvenThreshold(gateConfig, 'mid_loop'), 20);
});

test('resolveBreakEvenThreshold falls back to breakEvenThreshold by default (both states equal)', () => {
  const gateConfig = defaultConfig().gate;
  assert.equal(resolveBreakEvenThreshold(gateConfig, 'idle'), gateConfig.breakEvenThreshold);
  assert.equal(resolveBreakEvenThreshold(gateConfig, 'mid_loop'), gateConfig.breakEvenThreshold);
});

test('default gate config uses the pe-c5n9 recalibrated threshold (T=22 at r=0.1) with idle/mid_loop kept at parity', () => {
  // pe-zy4s (2026-07-08): real runtime mid_loop/idle detection is now wired
  // through the `context` event handler, and the offline benchmark's
  // candidate labeling was aligned to that same runtime-observable
  // (turn-START) definition and re-derived on the representative corpus.
  // The re-derived split REVERSES the earlier turn-END-based pe-c5n9 finding:
  // at r=0.1, "idle" now carries essentially all the realized net benefit
  // (T=22, ~20.6k) and "mid_loop" carries essentially none (T=1, ~0). Since
  // idle is not the worthless state under this definition, parity is kept
  // rather than forcing a stricter default in either direction. This test
  // locks that deliberate parity so a future change to it is a visible,
  // reviewed diff.
  const gateConfig = defaultConfig().gate;
  assert.equal(gateConfig.breakEvenThreshold, 22);
  assert.equal(gateConfig.breakEvenThresholdByState.idle, 22);
  assert.equal(gateConfig.breakEvenThresholdByState.mid_loop, 22);
  assert.equal(resolveBreakEvenThreshold(gateConfig, 'idle'), resolveBreakEvenThreshold(gateConfig, 'mid_loop'));
});

// ---------------------------------------------------------------------------
// classifyAgentStateFromMessages: runtime-observable agent-state detection
// ---------------------------------------------------------------------------

test('classifyAgentStateFromMessages: user-message-last => idle (first call of a turn)', () => {
  const { classifyAgentStateFromMessages } = dcp;
  const messages = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: [{ type: 'text', text: 'ack' }] },
    { role: 'user', content: 'do a thing' },
  ];
  assert.equal(classifyAgentStateFromMessages(messages), 'idle');
});

test('classifyAgentStateFromMessages: toolResult-last => mid_loop', () => {
  const { classifyAgentStateFromMessages } = dcp;
  const messages = [
    { role: 'user', content: 'do a thing' },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: {} }] },
    { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [], isError: false },
  ];
  assert.equal(classifyAgentStateFromMessages(messages), 'mid_loop');
});

test('classifyAgentStateFromMessages: assistant-message-last (mid-chain) => mid_loop', () => {
  const { classifyAgentStateFromMessages } = dcp;
  const messages = [
    { role: 'user', content: 'do a thing' },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: {} }] },
    { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [], isError: false },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c2', name: 'bash', arguments: {} }] },
  ];
  assert.equal(classifyAgentStateFromMessages(messages), 'mid_loop');
});

test('classifyAgentStateFromMessages: empty history => idle', () => {
  const { classifyAgentStateFromMessages } = dcp;
  assert.equal(classifyAgentStateFromMessages([]), 'idle');
});

test('classifyAgentStateFromMessages: system-only history => idle (skips non-user/assistant/toolResult roles)', () => {
  const { classifyAgentStateFromMessages } = dcp;
  const messages = [{ role: 'system', content: 'you are a helpful agent' }];
  assert.equal(classifyAgentStateFromMessages(messages), 'idle');
});

test('classifyAgentStateFromMessages: skips trailing system messages to find the real last relevant message', () => {
  const { classifyAgentStateFromMessages } = dcp;
  const messages = [
    { role: 'user', content: 'do a thing' },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: {} }] },
    { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [], isError: false },
    { role: 'system', content: 'a compaction notice or similar bookkeeping entry' },
  ];
  assert.equal(classifyAgentStateFromMessages(messages), 'mid_loop');
});

// ---------------------------------------------------------------------------
// Pipeline wiring: gate on/off/always-apply, manual bypass, persisted immunity
// ---------------------------------------------------------------------------

function fakeStrategyFor(dcpModule, toolCallId, source) {
  return {
    id: 'test-strategy',
    propose: () => [{ strategyId: 'test-strategy', toolCallId, kind: 'tool_result_content', reason: 'stale', source }],
  };
}

test('pipeline: gate "on" (default, low threshold) rejects a NEW low-value automatic proposal', (t) => {
  const messages = toolCallMessages({ resultText: 'a'.repeat(50) });
  const strategy = fakeStrategyFor(dcp, 'call_1');
  dcp.STRATEGIES.push(strategy);
  t.after(() => {
    const idx = dcp.STRATEGIES.indexOf(strategy);
    if (idx >= 0) dcp.STRATEGIES.splice(idx, 1);
  });

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: gateConfig({ mode: 'on', breakEvenThreshold: 0.001 }),
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  assert.equal(result.newlyAppliedDecisions.length, 0);
  assert.equal(result.messages[2].content[0].text.includes('pruned by'), false);
});

test('pipeline: gate "always-apply" applies a NEW proposal even above threshold', (t) => {
  // Large enough removal that tokensRemoved > 0 (so it actually reaches the
  // gate), but with a threshold so low it would be rejected under mode "on".
  const messages = toolCallMessages({ resultText: 'a'.repeat(2000) });
  const strategy = fakeStrategyFor(dcp, 'call_1');
  dcp.STRATEGIES.push(strategy);
  t.after(() => {
    const idx = dcp.STRATEGIES.indexOf(strategy);
    if (idx >= 0) dcp.STRATEGIES.splice(idx, 1);
  });

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: gateConfig({ mode: 'always-apply', breakEvenThreshold: 0.001 }),
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  assert.equal(result.newlyAppliedDecisions.length, 1);
  assert.ok(result.messages[2].content[0].text.includes('pruned by'));
});

test('pipeline: manual decisions bypass the gate even when it would reject them', (t) => {
  const messages = toolCallMessages({ resultText: 'a'.repeat(50) });
  const strategy = fakeStrategyFor(dcp, 'call_1', 'manual');
  dcp.STRATEGIES.push(strategy);
  t.after(() => {
    const idx = dcp.STRATEGIES.indexOf(strategy);
    if (idx >= 0) dcp.STRATEGIES.splice(idx, 1);
  });

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: gateConfig({ mode: 'on', breakEvenThreshold: 0.001 }),
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  assert.equal(result.newlyAppliedDecisions.length, 1);
  assert.equal(result.newlyAppliedDecisions[0].source, 'manual');
  assert.ok(result.messages[2].content[0].text.includes('pruned by'));
});

test('pipeline: an already-persisted decision stays applied regardless of gate mode/threshold', () => {
  const messages = toolCallMessages({ resultText: 'a'.repeat(50) });
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale' });

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: gateConfig({ mode: 'on', breakEvenThreshold: 0.001 }),
  };

  const result = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [decision],
    knownIdempotencyKeys: new Set([decision.idempotencyKey]),
  });
  assert.equal(result.newlyAppliedDecisions.length, 0, 'already-known, not re-reported');
  assert.ok(result.messages[2].content[0].text.includes('pruned by'), 'but still applied to context');
});

test('pipeline: gate result is exposed on the pipeline output for stats/debug consumers', (t) => {
  const messages = toolCallMessages({ resultText: 'a'.repeat(20000) });
  const strategy = fakeStrategyFor(dcp, 'call_1');
  dcp.STRATEGIES.push(strategy);
  t.after(() => {
    const idx = dcp.STRATEGIES.indexOf(strategy);
    if (idx >= 0) dcp.STRATEGIES.splice(idx, 1);
  });

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: gateConfig({ mode: 'on', breakEvenThreshold: 1000 }),
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  assert.equal(result.gate.mode, 'on');
  assert.ok(result.gate.cost.breakEvenCalls >= 0);
});
