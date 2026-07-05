import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'extensions/dynamic-context-pruning/index.ts');
const dcp = await import(pathToFileURL(modulePath).href);

const {
  defaultConfig,
  parseContextPruningArgs,
  applyContextPruningConfigMutation,
  contextPruningUsage,
  formatStatusReport,
  formatStatsReport,
  buildArgsDigest,
  buildPrunableItems,
  buildActiveResultDecisionMap,
  formatPrunableItemOption,
  formatPrunableItemDetail,
  formatPrunableItemsReport,
  sessionEntriesToMessages,
  buildManualPruneProposal,
  proposalToDecisionRecord,
  buildRestoreRecord,
  parseRestoreRecord,
  resolvePruneTombstoneState,
  runDynamicContextPruningPipeline,
  emptyCumulativeStats,
  foldStatsRecord,
  computeCacheCostModel,
} = dcp;

function setEnv(t, key, value) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });
}

function setupAgentDir(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'dynamic-context-pruning-commands-test-'));
  const agentDir = path.join(rootDir, 'agent');
  mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  setEnv(t, 'PI_CODING_AGENT_DIR', agentDir);
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  return agentDir;
}

function decisionEntry(decision, overrides = {}) {
  return {
    type: 'custom',
    id: overrides.id ?? 'e-decision',
    parentId: overrides.parentId ?? null,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    customType: 'dynamic-context-pruning:decision',
    data: decision,
  };
}

function restoreEntry(record, overrides = {}) {
  return {
    type: 'custom',
    id: overrides.id ?? 'e-restore',
    parentId: overrides.parentId ?? null,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    customType: 'dynamic-context-pruning:restore',
    data: record,
  };
}

function toolCallMessages({ toolCallId = 'call_1', toolName = 'bash', args = { command: 'ls' }, resultText = 'a'.repeat(400), isError = false } = {}) {
  return [
    { role: 'user', content: 'do the thing', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'toolCall', id: toolCallId, name: toolName, arguments: args }], timestamp: 2 },
    { role: 'toolResult', toolCallId, toolName, content: [{ type: 'text', text: resultText }], isError, timestamp: 3 },
    { role: 'assistant', content: [{ type: 'text', text: 'done' }], timestamp: 4 },
  ];
}

// ---------------------------------------------------------------------------
// parseContextPruningArgs
// ---------------------------------------------------------------------------

test('parseContextPruningArgs: no args and "help" both yield help', () => {
  assert.deepEqual(parseContextPruningArgs(''), { kind: 'help' });
  assert.deepEqual(parseContextPruningArgs('   '), { kind: 'help' });
  assert.deepEqual(parseContextPruningArgs('help'), { kind: 'help' });
  assert.deepEqual(parseContextPruningArgs('--help'), { kind: 'help' });
});

test('parseContextPruningArgs: status/stats/on/off/toggle', () => {
  assert.deepEqual(parseContextPruningArgs('status'), { kind: 'status' });
  assert.deepEqual(parseContextPruningArgs('STATS'), { kind: 'stats' });
  assert.deepEqual(parseContextPruningArgs('on'), { kind: 'enabled', value: true });
  assert.deepEqual(parseContextPruningArgs('off'), { kind: 'enabled', value: false });
  assert.deepEqual(parseContextPruningArgs('toggle'), { kind: 'toggle' });
});

test('parseContextPruningArgs: strategy <name> on|off, including dashed and camelCase aliases', () => {
  assert.deepEqual(parseContextPruningArgs('strategy dedupe on'), { kind: 'strategy', strategy: 'dedupe', value: true });
  assert.deepEqual(parseContextPruningArgs('strategy error-purge off'), { kind: 'strategy', strategy: 'errorPurge', value: false });
  assert.deepEqual(parseContextPruningArgs('strategy errorPurge on'), { kind: 'strategy', strategy: 'errorPurge', value: true });
  assert.deepEqual(parseContextPruningArgs('strategy superseded-file-ops on'), {
    kind: 'strategy',
    strategy: 'supersededFileOps',
    value: true,
  });
});

test('parseContextPruningArgs: gate on|off|always-apply', () => {
  assert.deepEqual(parseContextPruningArgs('gate on'), { kind: 'gate', mode: 'on' });
  assert.deepEqual(parseContextPruningArgs('gate off'), { kind: 'gate', mode: 'off' });
  assert.deepEqual(parseContextPruningArgs('gate always-apply'), { kind: 'gate', mode: 'always-apply' });
});

test('parseContextPruningArgs: unknown subcommands and malformed strategy/gate args', () => {
  assert.deepEqual(parseContextPruningArgs('bogus'), { kind: 'unknown', raw: 'bogus' });
  assert.deepEqual(parseContextPruningArgs('strategy nope on'), { kind: 'unknown', raw: 'strategy nope on' });
  assert.deepEqual(parseContextPruningArgs('strategy dedupe sideways'), { kind: 'unknown', raw: 'strategy dedupe sideways' });
  assert.deepEqual(parseContextPruningArgs('strategy dedupe'), { kind: 'unknown', raw: 'strategy dedupe' });
  assert.deepEqual(parseContextPruningArgs('gate maybe'), { kind: 'unknown', raw: 'gate maybe' });
});

test('contextPruningUsage mentions every subcommand', () => {
  const usage = contextPruningUsage();
  for (const token of ['status', 'stats', 'on', 'off', 'toggle', 'strategy', 'gate']) {
    assert.ok(usage.includes(token), `usage text should mention "${token}"`);
  }
});

// ---------------------------------------------------------------------------
// applyContextPruningConfigMutation: config transitions
// ---------------------------------------------------------------------------

test('applyContextPruningConfigMutation: on/off/toggle', () => {
  const base = defaultConfig();
  assert.equal(applyContextPruningConfigMutation(base, { kind: 'enabled', value: false }).config.enabled, false);
  assert.equal(applyContextPruningConfigMutation(base, { kind: 'enabled', value: true }).config.enabled, true);

  const disabled = { ...base, enabled: false };
  assert.equal(applyContextPruningConfigMutation(disabled, { kind: 'toggle' }).config.enabled, true);
  assert.equal(applyContextPruningConfigMutation(base, { kind: 'toggle' }).config.enabled, false);
});

test('applyContextPruningConfigMutation: strategy toggles only the targeted strategy', () => {
  const base = defaultConfig();
  const { config } = applyContextPruningConfigMutation(base, { kind: 'strategy', strategy: 'errorPurge', value: false });
  assert.equal(config.strategies.errorPurge.enabled, false);
  assert.equal(config.strategies.dedupe.enabled, true);
  assert.equal(config.strategies.supersededFileOps.enabled, true);
  // minTurnsOld untouched
  assert.equal(config.strategies.errorPurge.minTurnsOld, base.strategies.errorPurge.minTurnsOld);
});

test('applyContextPruningConfigMutation: gate mode transitions', () => {
  const base = defaultConfig();
  for (const mode of ['on', 'off', 'always-apply']) {
    const { config, message } = applyContextPruningConfigMutation(base, { kind: 'gate', mode });
    assert.equal(config.gate.mode, mode);
    assert.ok(message.includes(mode));
  }
});

test('applyContextPruningConfigMutation is pure (does not mutate the input config)', () => {
  const base = defaultConfig();
  const snapshot = JSON.parse(JSON.stringify(base));
  applyContextPruningConfigMutation(base, { kind: 'enabled', value: false });
  applyContextPruningConfigMutation(base, { kind: 'strategy', strategy: 'dedupe', value: false });
  applyContextPruningConfigMutation(base, { kind: 'gate', mode: 'off' });
  assert.deepEqual(base, snapshot);
});

// ---------------------------------------------------------------------------
// Config persistence round-trip (temp agent dir), mirroring the sibling
// config test's PI_CODING_AGENT_DIR convention.
// ---------------------------------------------------------------------------

test('a /context-pruning config mutation round-trips through writeConfig/readConfig', async (t) => {
  setupAgentDir(t);
  const base = await dcp.__testing.readConfig();
  const { config: afterOff } = applyContextPruningConfigMutation(base, { kind: 'enabled', value: false });
  await dcp.__testing.writeConfig(afterOff);

  const raw = JSON.parse(readFileSync(dcp.__testing.getConfigPath(), 'utf8'));
  assert.equal(raw.enabled, false);

  const reloaded = await dcp.__testing.readConfig();
  assert.equal(reloaded.enabled, false);

  const { config: afterStrategyOff } = applyContextPruningConfigMutation(reloaded, {
    kind: 'strategy',
    strategy: 'supersededFileOps',
    value: false,
  });
  const { config: afterGate } = applyContextPruningConfigMutation(afterStrategyOff, { kind: 'gate', mode: 'always-apply' });
  await dcp.__testing.writeConfig(afterGate);

  const finalReloaded = await dcp.__testing.readConfig();
  assert.equal(finalReloaded.enabled, false);
  assert.equal(finalReloaded.strategies.supersededFileOps.enabled, false);
  assert.equal(finalReloaded.gate.mode, 'always-apply');
});

// ---------------------------------------------------------------------------
// formatStatusReport / formatStatsReport
// ---------------------------------------------------------------------------

test('formatStatusReport includes enabled state, strategies, protections, and snapshot', () => {
  const config = defaultConfig();
  const lines = formatStatusReport({
    config,
    contextUsage: { tokens: 1200, contextWindow: 100000, percent: 1.2 },
    lastSnapshot: { rawTokens: 500, effectiveTokens: 300, tokensSavedThisCall: 200 },
  }).join('\n');
  assert.match(lines, /ENABLED/);
  assert.match(lines, /dedupe: on/);
  assert.match(lines, /error-purge: on/);
  assert.match(lines, /superseded-file-ops: on/);
  assert.match(lines, /recentTurns=/);
  assert.match(lines, /raw=500 tok, effective=300 tok, saved=200 tok/);
  assert.match(lines, /1200 \/ 100000 tokens \(1.2%\)/);
});

test('formatStatusReport degrades gracefully with no snapshot/usage yet', () => {
  const config = { ...defaultConfig(), enabled: false };
  const lines = formatStatusReport({ config }).join('\n');
  assert.match(lines, /disabled/);
  assert.match(lines, /no context snapshot yet/);
});

test('formatStatsReport reports totals and a sorted per-strategy breakdown', () => {
  let stats = emptyCumulativeStats();
  stats = foldStatsRecord(stats, { idempotencyKey: 'a', strategyId: 'dedupe', tokensRemoved: 100, appliedAt: 't1' });
  stats = foldStatsRecord(stats, { idempotencyKey: 'b', strategyId: 'error-purge', tokensRemoved: 30, appliedAt: 't2' });
  const lines = formatStatsReport(stats);
  assert.equal(lines[0], 'Total tokens saved: 130 across 2 prune(s).');
  assert.ok(lines.some((l) => l.includes('dedupe: 100 tok saved across 1 prune(s)')));
  assert.ok(lines.some((l) => l.includes('error-purge: 30 tok saved across 1 prune(s)')));
});

test('formatStatsReport reports "no prunes recorded yet" for empty stats', () => {
  const lines = formatStatsReport(emptyCumulativeStats());
  assert.ok(lines.some((l) => l.includes('No prunes recorded yet.')));
});

// ---------------------------------------------------------------------------
// buildArgsDigest
// ---------------------------------------------------------------------------

test('buildArgsDigest returns the full canonical JSON when short enough', () => {
  const digest = buildArgsDigest({ b: 2, a: 1 });
  assert.equal(digest, '{"a":1,"b":2}');
});

test('buildArgsDigest truncates long argument JSON to maxLength with an ellipsis', () => {
  const args = { command: 'x'.repeat(200) };
  const digest = buildArgsDigest(args, 40);
  assert.equal(digest.length, 40);
  assert.ok(digest.endsWith('\u2026'));
});

test('buildArgsDigest handles undefined/empty args', () => {
  assert.equal(buildArgsDigest(undefined), '{}');
});

// ---------------------------------------------------------------------------
// sessionEntriesToMessages
// ---------------------------------------------------------------------------

test('sessionEntriesToMessages extracts only "message"-typed entries in order', () => {
  const entries = [
    { type: 'message', id: 'm1', parentId: null, timestamp: 't0', message: { role: 'user', content: 'hi', timestamp: 1 } },
    { type: 'custom', id: 'c1', parentId: 'm1', timestamp: 't1', customType: 'x', data: {} },
    { type: 'message', id: 'm2', parentId: 'c1', timestamp: 't2', message: { role: 'assistant', content: [], timestamp: 2 } },
  ];
  const messages = sessionEntriesToMessages(entries);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[1].role, 'assistant');
});

// ---------------------------------------------------------------------------
// buildPrunableItems / formatPrunableItemOption / formatPrunableItemDetail
// ---------------------------------------------------------------------------

test('buildPrunableItems reports an unpruned tool result as "active"', () => {
  const messages = toolCallMessages({ toolCallId: 'c1', toolName: 'read', args: { path: 'a.txt' }, resultText: 'hello world' });
  const items = buildPrunableItems(messages, new Map(), new Set());
  assert.equal(items.length, 1);
  assert.equal(items[0].toolCallId, 'c1');
  assert.equal(items[0].toolName, 'read');
  assert.equal(items[0].status, 'active');
  assert.ok(items[0].estimatedTokens > 0);
  assert.equal(items[0].argsDigest, '{"path":"a.txt"}');
});

test('buildPrunableItems reports a pruned tool result with its active decision', () => {
  const messages = toolCallMessages({ toolCallId: 'c1', toolName: 'bash' });
  const decision = proposalToDecisionRecord({ strategyId: 'dedupe', toolCallId: 'c1', kind: 'tool_result_content', reason: 'dup' });
  const activeByToolCallId = buildActiveResultDecisionMap([decision]);
  const items = buildPrunableItems(messages, activeByToolCallId, new Set());
  assert.equal(items[0].status, 'pruned');
  assert.equal(items[0].activeDecision.strategyId, 'dedupe');
});

test('buildPrunableItems reports a tombstoned item as "restored" when not active', () => {
  const messages = toolCallMessages({ toolCallId: 'c1', toolName: 'bash' });
  const items = buildPrunableItems(messages, new Map(), new Set(['c1']));
  assert.equal(items[0].status, 'restored');
});

test('buildActiveResultDecisionMap only maps tool_result_content decisions, keeping the first per toolCallId', () => {
  const resultDecision = proposalToDecisionRecord({ strategyId: 'dedupe', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  const inputDecision = proposalToDecisionRecord({ strategyId: 'error-purge', toolCallId: 'c2', kind: 'tool_call_input', reason: 'r' });
  const secondResultDecision = proposalToDecisionRecord({ strategyId: 'manual', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r2' });
  const map = buildActiveResultDecisionMap([resultDecision, inputDecision, secondResultDecision]);
  assert.equal(map.size, 1);
  assert.equal(map.get('c1').strategyId, 'dedupe');
  assert.equal(map.has('c2'), false);
});

test('formatPrunableItemOption/Detail render tool name, args digest, tokens, and status', () => {
  const messages = toolCallMessages({ toolCallId: 'c1', toolName: 'bash', args: { command: 'ls' } });
  const items = buildPrunableItems(messages, new Map(), new Set());
  const option = formatPrunableItemOption(items[0]);
  assert.match(option, /bash/);
  assert.match(option, /command/);
  assert.match(option, /not pruned/);

  const cost = computeCacheCostModel({ tailTokensAfterEarliestChange: 1000, tokensRemoved: 100, cachedPriceRatio: 0.1 });
  const detail = formatPrunableItemDetail(items[0], cost);
  assert.match(detail, /Predicted cache-bust cost/);
  assert.match(detail, /bypass the net-benefit gate/);
});

test('formatPrunableItemsReport degrades to an informative message when nothing is prunable', () => {
  assert.deepEqual(formatPrunableItemsReport([]), ['No prunable tool results found in this session.']);
});

// ---------------------------------------------------------------------------
// Restore/tombstone semantics
// ---------------------------------------------------------------------------

test('buildRestoreRecord / parseRestoreRecord round-trip; parseRestoreRecord rejects malformed payloads', () => {
  const record = buildRestoreRecord('k1', '2026-01-01T00:00:00.000Z');
  assert.deepEqual(record, { idempotencyKey: 'k1', createdAt: '2026-01-01T00:00:00.000Z' });
  const parsed = parseRestoreRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(parsed, record);

  assert.equal(parseRestoreRecord(undefined), undefined);
  assert.equal(parseRestoreRecord({}), undefined);
  assert.equal(parseRestoreRecord({ idempotencyKey: 'k' }), undefined);
});

test('resolvePruneTombstoneState: a decision with no restore is active', () => {
  const decision = proposalToDecisionRecord({ strategyId: 'dedupe', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  const state = resolvePruneTombstoneState([decisionEntry(decision)]);
  assert.ok(state.activeIdempotencyKeys.has(decision.idempotencyKey));
  assert.equal(state.restoredKeys.has(decision.idempotencyKey), false);
  assert.equal(state.activeDecisions.length, 1);
});

test('resolvePruneTombstoneState: a decision followed by a restore is tombstoned (inactive)', () => {
  const decision = proposalToDecisionRecord({ strategyId: 'dedupe', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  const entries = [decisionEntry(decision, { id: 'e1' }), restoreEntry(buildRestoreRecord(decision.idempotencyKey), { id: 'e2', parentId: 'e1' })];
  const state = resolvePruneTombstoneState(entries);
  assert.equal(state.activeIdempotencyKeys.has(decision.idempotencyKey), false);
  assert.ok(state.restoredKeys.has(decision.idempotencyKey));
  assert.equal(state.activeDecisions.length, 0);
  // History is preserved even though the decision is inactive.
  assert.equal(state.lastDecisionByKey.get(decision.idempotencyKey).idempotencyKey, decision.idempotencyKey);
});

test('resolvePruneTombstoneState: decision -> restore -> re-decision (same key) is active again (last event wins)', () => {
  const decision = proposalToDecisionRecord({ strategyId: 'dedupe', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  const entries = [
    decisionEntry(decision, { id: 'e1' }),
    restoreEntry(buildRestoreRecord(decision.idempotencyKey), { id: 'e2', parentId: 'e1' }),
    decisionEntry(decision, { id: 'e3', parentId: 'e2' }),
  ];
  const state = resolvePruneTombstoneState(entries);
  assert.ok(state.activeIdempotencyKeys.has(decision.idempotencyKey));
  assert.equal(state.restoredKeys.has(decision.idempotencyKey), false);
});

test('resolvePruneTombstoneState ignores unrelated/malformed custom entries', () => {
  const entries = [
    { type: 'custom', id: 'e1', parentId: null, timestamp: 't', customType: 'some-other-extension:thing', data: { x: 1 } },
    { type: 'custom', id: 'e2', parentId: 'e1', timestamp: 't', customType: 'dynamic-context-pruning:restore', data: { garbage: true } },
  ];
  const state = resolvePruneTombstoneState(entries);
  assert.equal(state.activeDecisions.length, 0);
  assert.equal(state.restoredKeys.size, 0);
});

test('restore prevents an automatic decision from silently re-applying on the next context event', () => {
  const messages = toolCallMessages({ toolCallId: 'call_1', resultText: 'a'.repeat(2000) });
  const config = { ...defaultConfig(), protections: { ...defaultConfig().protections, recentTurns: 0 }, gate: { ...defaultConfig().gate, mode: 'off' } };

  dcp.STRATEGIES.push({
    id: 'test-strategy',
    propose: () => [{ strategyId: 'test-strategy', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale' }],
  });
  try {
    const proposalKey = 'test-strategy:tool_result_content:call_1';
    // Simulate: the decision was already applied+persisted once, then restored.
    const result = runDynamicContextPruningPipeline({
      messages,
      config,
      persistedDecisions: [],
      knownIdempotencyKeys: new Set(),
      restoredIdempotencyKeys: new Set([proposalKey]),
    });
    assert.equal(result.newlyAppliedDecisions.length, 0, 'a tombstoned key must not be freshly re-applied');
    assert.ok(!result.messages[2].content[0].text.includes('pruned by'), 'the tool result must remain unpruned after restore');
  } finally {
    const idx = dcp.STRATEGIES.findIndex((s) => s.id === 'test-strategy');
    if (idx >= 0) dcp.STRATEGIES.splice(idx, 1);
  }
});

test('a manual prune bypasses the net-benefit gate even when the gate would reject an equivalent automatic proposal', () => {
  // Long tail after the change + tiny savings would normally be rejected by
  // the "on" gate mode; manual decisions must never go through gate
  // evaluation at all (source: "manual" candidates bypass gate entirely).
  const messages = [
    { role: 'user', content: 'go', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'call_1', name: 'bash', arguments: {} }], timestamp: 2 },
    { role: 'toolResult', toolCallId: 'call_1', toolName: 'bash', content: [{ type: 'text', text: 'x'.repeat(20) }], isError: false, timestamp: 3 },
    // A very large tail after the prune target makes the cache-bust penalty huge relative to the tiny saving above.
    { role: 'assistant', content: [{ type: 'text', text: 'y'.repeat(50000) }], timestamp: 4 },
  ];
  const config = { ...defaultConfig(), protections: { ...defaultConfig().protections, recentTurns: 0 } };
  const manualDecision = proposalToDecisionRecord(buildManualPruneProposal('call_1'));

  const result = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [],
    knownIdempotencyKeys: new Set(),
  });
  // No strategies are registered to propose this automatically, so nothing applies yet.
  assert.equal(result.newlyAppliedDecisions.length, 0);

  // Manual decisions are injected as already-persisted (bypassing the gate entirely, like /prune does).
  const manualResult = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [manualDecision],
    knownIdempotencyKeys: new Set(),
  });
  assert.equal(manualResult.newlyAppliedDecisions.length, 1);
  assert.equal(manualResult.newlyAppliedDecisions[0].source, 'manual');
  assert.ok(manualResult.messages[2].content[0].text.includes('pruned by'), 'manual prune must apply regardless of gate economics');
});

test('re-prune after restore works: a fresh manual decision for the same toolCallId applies even though the original key is tombstoned', () => {
  const messages = toolCallMessages({ toolCallId: 'call_1', resultText: 'a'.repeat(500) });
  const config = { ...defaultConfig(), protections: { ...defaultConfig().protections, recentTurns: 0 } };

  const autoDecision = proposalToDecisionRecord({ strategyId: 'dedupe', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'dup' });
  // autoDecision was restored (tombstoned); the manual re-prune uses a distinct "manual:" idempotencyKey.
  const manualDecision = proposalToDecisionRecord(buildManualPruneProposal('call_1'));
  assert.notEqual(manualDecision.idempotencyKey, autoDecision.idempotencyKey);

  const result = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [manualDecision],
    knownIdempotencyKeys: new Set(),
    restoredIdempotencyKeys: new Set([autoDecision.idempotencyKey]),
  });
  assert.equal(result.newlyAppliedDecisions.length, 1);
  assert.equal(result.newlyAppliedDecisions[0].idempotencyKey, manualDecision.idempotencyKey);
  assert.ok(result.messages[2].content[0].text.includes('pruned by'));
});
