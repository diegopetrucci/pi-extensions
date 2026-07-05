import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'extensions/dynamic-context-pruning/index.ts');
const dcp = await import(pathToFileURL(modulePath).href);

const {
  defaultConfig,
  proposalToDecisionRecord,
  buildStatsRecord,
  parseStatsRecord,
  emptyCumulativeStats,
  foldStatsRecord,
  rebuildStatsStateFromEntries,
  computeContextSizeSnapshot,
  runDynamicContextPruningPipeline,
} = dcp;

function statsEntry(record, overrides = {}) {
  return {
    type: 'custom',
    id: overrides.id ?? 'e-stats',
    parentId: overrides.parentId ?? null,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    customType: 'dynamic-context-pruning:stats',
    data: record,
  };
}

function toolCallMessages({ toolCallId = 'call_1', resultText = 'a'.repeat(2000) } = {}) {
  return [
    { role: 'user', content: 'do the thing', timestamp: 1 },
    {
      role: 'assistant',
      content: [{ type: 'toolCall', id: toolCallId, name: 'bash', arguments: { command: 'ls' } }],
      timestamp: 2,
    },
    {
      role: 'toolResult',
      toolCallId,
      toolName: 'bash',
      content: [{ type: 'text', text: resultText }],
      isError: false,
      timestamp: 3,
    },
    { role: 'assistant', content: [{ type: 'text', text: 'done' }], timestamp: 4 },
  ];
}

// ---------------------------------------------------------------------------
// buildStatsRecord / parseStatsRecord
// ---------------------------------------------------------------------------

test('buildStatsRecord round-trips through parseStatsRecord', () => {
  const decision = proposalToDecisionRecord({ strategyId: 'dedupe', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  const record = buildStatsRecord(decision, 123, '2026-01-01T00:00:00.000Z');
  assert.equal(record.idempotencyKey, decision.idempotencyKey);
  assert.equal(record.strategyId, 'dedupe');
  assert.equal(record.tokensRemoved, 123);

  const parsed = parseStatsRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(parsed, record);
});

test('buildStatsRecord clamps negative tokensRemoved to zero', () => {
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  const record = buildStatsRecord(decision, -50);
  assert.equal(record.tokensRemoved, 0);
});

test('parseStatsRecord rejects malformed payloads', () => {
  assert.equal(parseStatsRecord(undefined), undefined);
  assert.equal(parseStatsRecord(null), undefined);
  assert.equal(parseStatsRecord({}), undefined);
  assert.equal(parseStatsRecord({ idempotencyKey: 'k', strategyId: 's', tokensRemoved: 'NaN', appliedAt: 't' }), undefined);
  assert.equal(parseStatsRecord({ idempotencyKey: 'k', strategyId: 's', tokensRemoved: 5 }), undefined, 'missing appliedAt');
});

// ---------------------------------------------------------------------------
// foldStatsRecord / cumulative accumulation
// ---------------------------------------------------------------------------

test('foldStatsRecord accumulates totals and per-strategy breakdown', () => {
  const recordA = { idempotencyKey: 'a', strategyId: 'dedupe', tokensRemoved: 100, appliedAt: 't1' };
  const recordB = { idempotencyKey: 'b', strategyId: 'dedupe', tokensRemoved: 50, appliedAt: 't2' };
  const recordC = { idempotencyKey: 'c', strategyId: 'error-purge', tokensRemoved: 30, appliedAt: 't3' };

  let stats = emptyCumulativeStats();
  stats = foldStatsRecord(stats, recordA);
  stats = foldStatsRecord(stats, recordB);
  stats = foldStatsRecord(stats, recordC);

  assert.equal(stats.totalTokensRemoved, 180);
  assert.equal(stats.totalPruneCount, 3);
  assert.deepEqual(stats.byStrategy.dedupe, { tokensRemoved: 150, pruneCount: 2 });
  assert.deepEqual(stats.byStrategy['error-purge'], { tokensRemoved: 30, pruneCount: 1 });
});

test('foldStatsRecord is pure (does not mutate the input stats object)', () => {
  const stats = emptyCumulativeStats();
  const before = JSON.parse(JSON.stringify(stats));
  foldStatsRecord(stats, { idempotencyKey: 'a', strategyId: 's', tokensRemoved: 10, appliedAt: 't' });
  assert.deepEqual(stats, before);
});

// ---------------------------------------------------------------------------
// rebuildStatsStateFromEntries: idempotent rebuild
// ---------------------------------------------------------------------------

test('rebuildStatsStateFromEntries reconstructs cumulative stats from custom entries', () => {
  const recordA = { idempotencyKey: 'a', strategyId: 'dedupe', tokensRemoved: 100, appliedAt: 't1' };
  const recordB = { idempotencyKey: 'b', strategyId: 'dedupe', tokensRemoved: 50, appliedAt: 't2' };
  const entries = [statsEntry(recordA, { id: 'e1' }), statsEntry(recordB, { id: 'e2', parentId: 'e1' })];

  const { stats, seenKeys } = rebuildStatsStateFromEntries(entries);
  assert.equal(stats.totalTokensRemoved, 150);
  assert.equal(stats.totalPruneCount, 2);
  assert.ok(seenKeys.has('a'));
  assert.ok(seenKeys.has('b'));
});

test('rebuildStatsStateFromEntries tolerates duplicate/replayed entries (idempotent rebuild)', () => {
  const record = { idempotencyKey: 'a', strategyId: 'dedupe', tokensRemoved: 100, appliedAt: 't1' };
  const entries = [statsEntry(record, { id: 'e1' }), statsEntry(record, { id: 'e2' }), statsEntry(record, { id: 'e3' })];

  const { stats } = rebuildStatsStateFromEntries(entries);
  assert.equal(stats.totalPruneCount, 1, 'duplicate idempotency keys must collapse to a single fold');
  assert.equal(stats.totalTokensRemoved, 100);
});

test('rebuildStatsStateFromEntries ignores unrelated custom entries and malformed data', () => {
  const entries = [
    { type: 'custom', id: 'e1', parentId: null, timestamp: 't', customType: 'some-other-extension:thing', data: { x: 1 } },
    { type: 'custom', id: 'e2', parentId: 'e1', timestamp: 't', customType: 'dynamic-context-pruning:stats', data: { garbage: true } },
  ];
  const { stats } = rebuildStatsStateFromEntries(entries);
  assert.equal(stats.totalPruneCount, 0);
  assert.equal(stats.totalTokensRemoved, 0);
});

test('rebuilding stats state twice from the same entries yields identical cumulative stats (rebuild is idempotent)', () => {
  const entries = [
    statsEntry({ idempotencyKey: 'a', strategyId: 's1', tokensRemoved: 40, appliedAt: 't1' }, { id: 'e1' }),
    statsEntry({ idempotencyKey: 'b', strategyId: 's2', tokensRemoved: 10, appliedAt: 't2' }, { id: 'e2' }),
  ];
  const first = rebuildStatsStateFromEntries(entries);
  const second = rebuildStatsStateFromEntries(entries);
  assert.deepEqual(first.stats, second.stats);
});

// ---------------------------------------------------------------------------
// computeContextSizeSnapshot
// ---------------------------------------------------------------------------

test('computeContextSizeSnapshot reports raw vs effective tokens and the delta', () => {
  const raw = toolCallMessages({ resultText: 'a'.repeat(2000) });
  const effective = toolCallMessages({ resultText: '[pruned]' });
  const snapshot = computeContextSizeSnapshot(raw, effective);
  assert.ok(snapshot.rawTokens > snapshot.effectiveTokens);
  assert.equal(snapshot.tokensSavedThisCall, snapshot.rawTokens - snapshot.effectiveTokens);
});

test('computeContextSizeSnapshot never reports negative savings when effective grows', () => {
  const raw = toolCallMessages({ resultText: 'small' });
  const effective = toolCallMessages({ resultText: 'a'.repeat(2000) });
  const snapshot = computeContextSizeSnapshot(raw, effective);
  assert.equal(snapshot.tokensSavedThisCall, 0);
});

// ---------------------------------------------------------------------------
// End-to-end: pipeline surfaces newlyAppliedStats + contextSizeSnapshot
// ---------------------------------------------------------------------------

test('pipeline reports newlyAppliedStats matching newlyAppliedDecisions 1:1, and a shrinking contextSizeSnapshot', (t) => {
  const fakeStrategy = {
    id: 'test-strategy',
    propose: () => [{ strategyId: 'test-strategy', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale' }],
  };
  dcp.STRATEGIES.push(fakeStrategy);
  t.after(() => {
    const idx = dcp.STRATEGIES.indexOf(fakeStrategy);
    if (idx >= 0) dcp.STRATEGIES.splice(idx, 1);
  });

  const messages = toolCallMessages({ resultText: 'a'.repeat(2000) });
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });

  assert.equal(result.newlyAppliedDecisions.length, 1);
  assert.equal(result.newlyAppliedStats.length, 1);
  assert.equal(result.newlyAppliedStats[0].idempotencyKey, result.newlyAppliedDecisions[0].idempotencyKey);
  assert.equal(result.newlyAppliedStats[0].strategyId, 'test-strategy');
  assert.ok(result.newlyAppliedStats[0].tokensRemoved > 0);

  assert.ok(result.contextSizeSnapshot.rawTokens > result.contextSizeSnapshot.effectiveTokens);
  assert.equal(
    result.contextSizeSnapshot.tokensSavedThisCall,
    result.contextSizeSnapshot.rawTokens - result.contextSizeSnapshot.effectiveTokens,
  );
});

test('pipeline does not re-report stats for an already-known decision (idempotent accounting)', () => {
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'call_1', kind: 'tool_result_content', reason: 'stale' });
  const messages = toolCallMessages({ resultText: 'a'.repeat(2000) });
  const config = { ...defaultConfig(), protections: { ...defaultConfig().protections, recentTurns: 0 } };

  const result = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [decision],
    knownIdempotencyKeys: new Set([decision.idempotencyKey]),
  });

  assert.equal(result.newlyAppliedStats.length, 0);
});
