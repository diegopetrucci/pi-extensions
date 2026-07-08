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
  proposalToDecisionRecord,
  buildManualPruneProposal,
} = dcp;

// ---------------------------------------------------------------------------
// thresholds.minCharsSaved enforcement (pe-qdzb): fresh AUTOMATIC proposals
// whose char savings (original content chars minus placeholder chars) fall
// below the configured floor are dropped BEFORE the net-benefit gate runs.
// Manual and already-persisted/replayed decisions always bypass the floor.
// ---------------------------------------------------------------------------

function userMsg(text, timestamp) {
  return { role: 'user', content: text, timestamp };
}

function assistantToolCall(id, name, args, timestamp) {
  return { role: 'assistant', content: [{ type: 'toolCall', id, name, arguments: args }], timestamp };
}

function assistantText(text, timestamp) {
  return { role: 'assistant', content: [{ type: 'text', text }], timestamp };
}

function toolResultMsg(toolCallId, toolName, text, isError, timestamp) {
  return { role: 'toolResult', toolCallId, toolName, content: [{ type: 'text', text }], isError, timestamp };
}

let ts = 0;
function nextTs() {
  ts += 1;
  return ts;
}

function toolCallTurn(toolCallId, toolName, args, resultText) {
  return [
    userMsg(`turn for ${toolCallId}`, nextTs()),
    assistantToolCall(toolCallId, toolName, args, nextTs()),
    toolResultMsg(toolCallId, toolName, resultText, false, nextTs()),
  ];
}

function plainTurn(label) {
  return [userMsg(`user says ${label}`, nextTs()), assistantText(`ok ${label}`, nextTs())];
}

/** A fake strategy that proposes a fixed set of decisions, for precise control over inputs. */
function fakeStrategyProposing(proposals) {
  return { id: 'test-strategy', propose: () => proposals };
}

function withFakeStrategy(t, proposals) {
  const strategy = fakeStrategyProposing(proposals);
  dcp.STRATEGIES.push(strategy);
  t.after(() => {
    const idx = dcp.STRATEGIES.indexOf(strategy);
    if (idx >= 0) dcp.STRATEGIES.splice(idx, 1);
  });
}

test('minCharsSaved: a fresh automatic proposal below the floor is dropped before the gate runs', (t) => {
  // Original content is short; the placeholder text is longer than the
  // savings floor would ever allow through, so the real char delta here is
  // small (or even ~0 after clamping) -- well under the default 200 floor.
  const messages = [
    ...toolCallTurn('call_1', 'bash', { cmd: 'ls' }, 'x'.repeat(30)),
    ...plainTurn('after'),
  ];
  withFakeStrategy(t, [
    { strategyId: 'test-strategy', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale output' },
  ]);

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    // Gate mode "off" isolates this test to the pre-gate floor: if the floor
    // didn't drop the candidate, gate "off" would apply it unconditionally.
    gate: { ...defaultConfig().gate, mode: 'off' },
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });

  assert.equal(result.newlyAppliedDecisions.length, 0, 'below-floor candidate must never be applied');
  assert.equal(result.gate.accepted.length, 0);
  assert.equal(result.gate.rejected.length, 0, 'a dropped-before-gate candidate must not even reach gate.rejected');
  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'call_1');
  assert.equal(c1Result.content[0].text, 'x'.repeat(30), 'unapplied proposal must leave content untouched');
});

test('minCharsSaved: a fresh automatic proposal at/above the floor is kept and applied', (t) => {
  // 'x'.repeat(300) minus a short placeholder comfortably clears the default 200 floor.
  const messages = [
    ...toolCallTurn('call_1', 'bash', { cmd: 'ls' }, 'x'.repeat(300)),
    ...plainTurn('after'),
  ];
  withFakeStrategy(t, [
    { strategyId: 'test-strategy', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale output' },
  ]);

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });

  assert.equal(result.newlyAppliedDecisions.length, 1, 'at/above-floor candidate must survive the floor and be applied');
  assert.equal(result.newlyAppliedDecisions[0].correlation.toolCallId, 'call_1');
  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'call_1');
  assert.ok(c1Result.content[0].text.includes('pruned by'));
});

test('minCharsSaved: a manual decision bypasses the floor even with a tiny saving', (t) => {
  const messages = [
    ...toolCallTurn('call_1', 'bash', { cmd: 'ls' }, 'x'.repeat(10)),
    ...plainTurn('after'),
  ];
  // Manual proposals are never emitted by real strategies; a fake strategy
  // stands in for the /prune picker's `buildManualPruneProposal` here, same
  // pattern as the existing manual-bypass gate tests.
  withFakeStrategy(t, [buildManualPruneProposal('call_1')]);

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });

  assert.equal(result.newlyAppliedDecisions.length, 1, 'manual decisions must bypass the minCharsSaved floor');
  assert.equal(result.newlyAppliedDecisions[0].source, 'manual');
  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'call_1');
  assert.ok(c1Result.content[0].text.includes('pruned by'));
});

test('minCharsSaved: an already-persisted decision stays applied regardless of the floor', () => {
  const messages = [
    ...toolCallTurn('call_1', 'bash', { cmd: 'ls' }, 'x'.repeat(10)),
    ...plainTurn('after'),
  ];
  const persistedDecision = proposalToDecisionRecord({
    strategyId: 'dedupe',
    toolCallId: 'call_1',
    kind: 'tool_result_content',
    reason: 'duplicate call',
  });

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
  };

  const result = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [persistedDecision],
    knownIdempotencyKeys: new Set([persistedDecision.idempotencyKey]),
  });

  // Already applied, not "newly" applied -- but it must remain applied in the output messages.
  assert.equal(result.newlyAppliedDecisions.length, 0);
  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'call_1');
  assert.ok(c1Result.content[0].text.includes('pruned by'), 'a persisted decision must stay applied regardless of the floor');
});

test('minCharsSaved: floor of 0 disables filtering entirely, even for a below-default-floor saving', (t) => {
  // 'x'.repeat(120) yields a modest, clearly-positive char/token saving that
  // still falls well under the default 200-char floor -- exactly the
  // candidate the default config would drop, to prove floor:0 lets it through.
  const messages = [
    ...toolCallTurn('call_1', 'bash', { cmd: 'ls' }, 'x'.repeat(120)),
    ...plainTurn('after'),
  ];
  withFakeStrategy(t, [
    { strategyId: 'test-strategy', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale output' },
  ]);

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    thresholds: { ...defaultConfig().thresholds, minCharsSaved: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });

  assert.equal(result.newlyAppliedDecisions.length, 1, 'a floor of 0 must apply even a tiny/negative-saving proposal');
});

test('minCharsSaved: a below-floor candidate never contributes to the gate batch (earliest position / tail sizing)', (t) => {
  // call_1: a tiny below-floor candidate placed EARLY, with a huge amount of
  // filler content between it and call_2. If it were NOT filtered out
  // before the gate, it would drag the batch's `earliestPosition` far back
  // and inflate `tailTokensAfterEarliestChange` (and thus the cache-bust
  // penalty) enough to make the whole batch look uneconomical.
  // call_2: a large, above-floor candidate placed LATE, with only a small
  // tail after it -- cheap on its own.
  const messages = [
    ...toolCallTurn('call_1', 'bash', { cmd: 'ls' }, 'x'.repeat(10)),
  ];
  for (let i = 0; i < 60; i++) messages.push(...plainTurn(`filler-${i}`));
  messages.push(...toolCallTurn('call_2', 'bash', { cmd: 'ls -la' }, 'y'.repeat(2000)));
  messages.push(...plainTurn('tail'));

  withFakeStrategy(t, [
    { strategyId: 'test-strategy', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale output' },
    { strategyId: 'test-strategy', toolCallId: 'call_2', kind: 'tool_result_content', reason: 'stale output' },
  ]);

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'on' },
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });

  // call_1 must never be applied (below floor) and call_2 (cheap, short
  // tail, above floor) must be accepted by the gate -- which would not
  // happen if call_1's far-earlier position were still dragging the batch's
  // earliestPosition/tail sizing down.
  assert.equal(result.newlyAppliedDecisions.length, 1);
  assert.equal(result.newlyAppliedDecisions[0].correlation.toolCallId, 'call_2');
  assert.equal(result.gate.accepted.length, 1);
  assert.equal(result.gate.accepted[0].correlation.toolCallId, 'call_2');

  const call2ResultIndex = result.messages.findIndex((m) => m.role === 'toolResult' && m.toolCallId === 'call_2');
  assert.equal(
    result.gate.earliestPosition,
    call2ResultIndex,
    'the gate batch earliest position must reflect only the surviving (above-floor) candidate',
  );

  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'call_1');
  assert.equal(c1Result.content[0].text, 'x'.repeat(10), 'below-floor candidate must remain unpruned');
});
