import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'extensions/dynamic-context-pruning/scripts/benchmark.mjs');
const bench = await import(pathToFileURL(modulePath).href);
const dcp = await import(pathToFileURL(path.join(repoRoot, 'extensions/dynamic-context-pruning/index.ts')).href);

const {
  parseArgs,
  parseSessionLines,
  resolveActiveBranch,
  classifyTurnState,
  replaySession,
  aggregateBySessionAndStrategy,
  sweepThreshold,
  deriveSweepCeiling,
  sweepThresholdWithAutoExpand,
  computeAggregate,
  runBenchmark,
} = bench;

const fixturesDir = path.join(repoRoot, 'test/fixtures/dynamic-context-pruning');
const fixture = (name) => path.join(fixturesDir, name);

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

test('parseArgs applies defaults and parses options', () => {
  const args = parseArgs([]);
  assert.deepEqual(args.paths, []);
  assert.equal(args.limit, undefined);
  assert.deepEqual(args.ratios, [0.1]);
  assert.equal(args.json, false);
  assert.equal(args.help, false);
});

test('parseArgs parses --limit, --ratio (repeatable and comma-separated), --json, positional paths', () => {
  const args = parseArgs(['some/dir', '--limit', '3', '--ratio', '0.2,0.3', '--ratio', '0.5', '--json']);
  assert.deepEqual(args.paths, ['some/dir']);
  assert.equal(args.limit, 3);
  assert.deepEqual(args.ratios, [0.2, 0.3, 0.5]);
  assert.equal(args.json, true);
});

test('parseArgs rejects invalid --limit/--ratio and unknown options', () => {
  assert.throws(() => parseArgs(['--limit', '0']));
  assert.throws(() => parseArgs(['--limit', 'nope']));
  assert.throws(() => parseArgs(['--ratio', '1.5']));
  assert.throws(() => parseArgs(['--ratio', '-1']));
  assert.throws(() => parseArgs(['--bogus']));
});

test('parseArgs parses --sweep-max (both forms) and defaults it to undefined', () => {
  assert.equal(parseArgs([]).sweepMax, undefined);
  assert.equal(parseArgs(['--sweep-max', '50']).sweepMax, 50);
  assert.equal(parseArgs(['--sweep-max=75']).sweepMax, 75);
  assert.throws(() => parseArgs(['--sweep-max', '0']));
  assert.throws(() => parseArgs(['--sweep-max', 'nope']));
});

// ---------------------------------------------------------------------------
// Session parsing / active-branch replay
// ---------------------------------------------------------------------------

test('parseSessionLines skips the header and unparseable lines with warnings, keeps valid entries', () => {
  const originalError = console.error;
  const warnings = [];
  console.error = (message) => warnings.push(message);
  try {
    const raw = [
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z"}',
      'not json at all',
      '{"missingType": true}',
      '{"type":"message","id":"m1","parentId":null,"timestamp":"t","message":{"role":"user","content":"hi"}}',
      '',
    ].join('\n');
    const entries = parseSessionLines('test.jsonl', raw);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'm1');
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /unparseable JSON/);
    assert.match(warnings[1], /missing a string "type"/);
  } finally {
    console.error = originalError;
  }
});

test('resolveActiveBranch follows the parentId chain from the last entry back to the root (tree-structured session)', () => {
  const entries = [
    { type: 'message', id: 'a', parentId: null, message: { role: 'user', content: '1' } },
    { type: 'message', id: 'b', parentId: 'a', message: { role: 'assistant', content: [{ type: 'text', text: '1' }] } },
    // A branch off of "a" that is NOT on the active path (not reachable from the last entry).
    { type: 'message', id: 'x', parentId: 'a', message: { role: 'user', content: 'abandoned branch' } },
    { type: 'message', id: 'c', parentId: 'b', message: { role: 'user', content: '2' } },
    { type: 'message', id: 'd', parentId: 'c', message: { role: 'assistant', content: [{ type: 'text', text: '2' }] } },
  ];
  const branch = resolveActiveBranch(entries);
  assert.deepEqual(branch.map((entry) => entry.id), ['a', 'b', 'c', 'd']);
});

test('resolveActiveBranch returns entries as-is for v1 (linear, no id/parentId) sessions', () => {
  const entries = [
    { type: 'message', message: { role: 'user', content: '1' } },
    { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: '1' }] } },
  ];
  const branch = resolveActiveBranch(entries);
  assert.deepEqual(branch, entries);
});

// ---------------------------------------------------------------------------
// Turn-state classification
// ---------------------------------------------------------------------------

test('classifyTurnState distinguishes mid-loop (more assistant calls before next user msg) from idle (turn end)', () => {
  const messages = [
    { role: 'user', content: 'go' },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: {} }] }, // index 1: mid-loop
    { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [], isError: false },
    { role: 'assistant', content: [{ type: 'text', text: 'done' }] }, // index 3: idle (turn end)
    { role: 'user', content: 'next' },
    { role: 'assistant', content: [{ type: 'text', text: 'ack' }] }, // index 5: idle (only assistant call this turn)
  ];
  assert.equal(classifyTurnState(messages, 1), 'mid_loop');
  assert.equal(classifyTurnState(messages, 3), 'idle');
  assert.equal(classifyTurnState(messages, 5), 'idle');
});

// ---------------------------------------------------------------------------
// End-to-end replay against fixtures
// ---------------------------------------------------------------------------

async function loadFixtureMessages(name) {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(fixture(name), 'utf8');
  const entries = parseSessionLines(name, raw);
  const branch = resolveActiveBranch(entries);
  return dcp.sessionEntriesToMessages(branch);
}

test('replaySession finds the dedupe candidate on duplicate-reads.jsonl with correct realized-benefit math', async () => {
  const messages = await loadFixtureMessages('duplicate-reads.jsonl');
  const result = replaySession('duplicate-reads.jsonl', messages, { ratios: [0.1] });

  const dedupeCandidates = result.candidates.filter((c) => c.strategyId === 'dedupe');
  assert.equal(dedupeCandidates.length, 1, 'exactly one dedupe candidate (call_1 superseded by call_3)');
  const candidate = dedupeCandidates[0];
  assert.equal(candidate.toolCallId, 'call_1');
  assert.ok(candidate.tokensRemoved > 0);

  const r = candidate.byRatio[0.1];
  // realized net benefit = actualRemainingCalls * recurringSaving - penalty (NOTES-binding formula).
  const expected = candidate.actualRemainingCalls * r.recurringSaving - r.penalty;
  assert.ok(Math.abs(r.realizedNetBenefit - expected) < 1e-9);
  assert.equal(r.breakEvenCalls, r.penalty / r.recurringSaving);
});

test('replaySession finds the error-purge candidate on errored-call.jsonl', async () => {
  const messages = await loadFixtureMessages('errored-call.jsonl');
  // Explicit zero floor (pe-qdzb): this fixture's redacted-args saving is
  // small (well under the real default minCharsSaved=200), and this test is
  // about the error-purge strategy/pipeline wiring, not about the default
  // floor value, so isolate it from that floor here.
  const config = { ...dcp.normalizeConfig(undefined), thresholds: { minCharsSaved: 0 } };
  const result = replaySession('errored-call.jsonl', messages, { ratios: [0.1], config });
  const candidates = result.candidates.filter((c) => c.strategyId === 'error-purge');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].toolCallId, 'call_err1');
});

test('replaySession finds the superseded-file-ops candidate on read-edit-read.jsonl', async () => {
  const messages = await loadFixtureMessages('read-edit-read.jsonl');
  const result = replaySession('read-edit-read.jsonl', messages, { ratios: [0.1] });
  const candidates = result.candidates.filter((c) => c.strategyId === 'superseded-file-ops');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].toolCallId, 'call_r1');
});

test('replaySession records each distinct opportunity exactly once, at its earliest call boundary', async () => {
  const messages = await loadFixtureMessages('multi-turn.jsonl');
  const result = replaySession('multi-turn.jsonl', messages, { ratios: [0.1] });
  const byKey = new Map();
  for (const candidate of result.candidates) {
    const key = `${candidate.strategyId}:${candidate.toolCallId}`;
    assert.ok(!byKey.has(key), `candidate ${key} should only be recorded once across all call boundaries`);
    byKey.set(key, candidate);
  }
  assert.ok(byKey.size > 0);
});

test('replaySession is deterministic across repeated runs on the same fixture', async () => {
  const messages = await loadFixtureMessages('multi-turn.jsonl');
  const a = replaySession('multi-turn.jsonl', messages, { ratios: [0.1, 0.2] });
  const b = replaySession('multi-turn.jsonl', messages, { ratios: [0.1, 0.2] });
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// Aggregation / threshold sweep
// ---------------------------------------------------------------------------

test('aggregateBySessionAndStrategy folds candidates into per-strategy totals', async () => {
  const messages = await loadFixtureMessages('multi-turn.jsonl');
  const result = replaySession('multi-turn.jsonl', messages, { ratios: [0.1] });
  const byStrategy = aggregateBySessionAndStrategy(result, 0.1);
  for (const strategyId of Object.keys(byStrategy)) {
    const agg = byStrategy[strategyId];
    const matching = result.candidates.filter((c) => c.strategyId === strategyId);
    assert.equal(agg.candidateCount, matching.length);
    const expectedTokens = matching.reduce((sum, c) => sum + c.tokensRemoved, 0);
    assert.equal(agg.totalTokensRemoved, expectedTokens);
  }
});

test('sweepThreshold is deterministic and picks the smallest T on ties', () => {
  const candidates = [
    { byRatio: { 0.1: { breakEvenCalls: 2, realizedNetBenefit: 5 } } },
    { byRatio: { 0.1: { breakEvenCalls: 10, realizedNetBenefit: -3 } } },
  ];
  const sweepA = sweepThreshold(candidates, 0.1, 30);
  const sweepB = sweepThreshold(candidates, 0.1, 30);
  assert.deepEqual(sweepA, sweepB);
  // T=2..9 accepts only the first (net +5); T>=10 also accepts the second (net +5-3=2); best is T=2..9, smallest is 2.
  assert.equal(sweepA.recommended, 2);
  assert.equal(sweepA.totalAtRecommended, 5);
});

test('sweepThreshold treats Infinity breakEvenCalls as never accepted', () => {
  const candidates = [{ byRatio: { 0.1: { breakEvenCalls: Infinity, realizedNetBenefit: 100 } } }];
  const sweep = sweepThreshold(candidates, 0.1, 30);
  assert.equal(sweep.totalAtRecommended, 0);
});

// ---------------------------------------------------------------------------
// Auto-expanding threshold sweep (pe-7oej)
// ---------------------------------------------------------------------------

/** One candidate per integer breakEvenCalls in [from, to], each contributing +1 net benefit at its threshold. */
function stepCandidates(ratio, values) {
  return values.map((breakEvenCalls) => ({ byRatio: { [ratio]: { breakEvenCalls, realizedNetBenefit: 1 } } }));
}

test('sweepThreshold on a corpus that never pins to 30 matches sweepThresholdWithAutoExpand (back-compat)', () => {
  const candidates = [
    { byRatio: { 0.1: { breakEvenCalls: 2, realizedNetBenefit: 5 } } },
    { byRatio: { 0.1: { breakEvenCalls: 10, realizedNetBenefit: -3 } } },
  ];
  const base = sweepThreshold(candidates, 0.1, 30);
  const expanded = sweepThresholdWithAutoExpand(candidates, 0.1);
  assert.equal(expanded.recommended, base.recommended);
  assert.equal(expanded.totalAtRecommended, base.totalAtRecommended);
  assert.deepEqual(expanded.curve, base.curve);
  assert.equal(expanded.maxTested, 30);
  assert.equal(expanded.boundaryPinned, false);
});

test('deriveSweepCeiling derives from the max finite breakEvenCalls, floors at 30, caps at 500', () => {
  assert.equal(deriveSweepCeiling(stepCandidates(0.1, [1, 5, 10]), 0.1), 30, 'small corpus floors at the historical default');
  assert.equal(deriveSweepCeiling(stepCandidates(0.1, [1, 45]), 0.1), 45);
  assert.equal(
    deriveSweepCeiling(stepCandidates(0.1, [1, 10000]), 0.1),
    500,
    'runaway corpus is clamped at the HARD_SWEEP_CEILING',
  );
});

test('sweepThresholdWithAutoExpand auto-expands past 30 to find a strictly-interior argmax beyond the historical cap', () => {
  // Candidates at breakEvenCalls=1..30 (boundary-pinned within the first window) plus one more
  // at 35 that pushes the true optimum past 30, plus a zero-benefit candidate at 50 that only
  // stretches the corpus-derived ceiling so the true (35) optimum has headroom to land strictly
  // interior to the expanded window, rather than exactly on the derived ceiling itself.
  const candidates = stepCandidates(0.1, [...Array(30).keys()].map((i) => i + 1))
    .concat(stepCandidates(0.1, [35]))
    .concat([{ byRatio: { 0.1: { breakEvenCalls: 50, realizedNetBenefit: 0 } } }]);

  // Sanity check: the fixed-max sweep at 30 is boundary-pinned (this is the bug pe-7oej fixes).
  const fixed = sweepThreshold(candidates, 0.1, 30);
  assert.equal(fixed.recommended, 30);

  const expanded = sweepThresholdWithAutoExpand(candidates, 0.1);
  assert.equal(expanded.recommended, 35, 'auto-expand finds the true argmax beyond the historical cap');
  assert.equal(expanded.totalAtRecommended, 31);
  assert.ok(expanded.recommended > 30);
  assert.ok(expanded.recommended < expanded.maxTested, 'argmax must be strictly interior');
  assert.equal(expanded.boundaryPinned, false);
});

test('sweepThresholdWithAutoExpand flags boundary-pinned when the ceiling truncates the true optimum', () => {
  // True optimum is at breakEvenCalls=100, but this corpus is deliberately capped by an
  // explicit low --sweep-max, which must override the (higher) corpus-derived ceiling.
  const candidates = stepCandidates(0.1, [...Array(100).keys()].map((i) => i + 1));
  const expanded = sweepThresholdWithAutoExpand(candidates, 0.1, { sweepMax: 50 });
  assert.equal(expanded.maxTested, 50, '--sweep-max is respected as an explicit ceiling');
  assert.equal(expanded.recommended, 50, 'recommendation is pinned to the ceiling, not the true (higher) optimum');
  assert.equal(expanded.boundaryPinned, true, 'boundary-pinned marker must be set when truncated by the ceiling');
});

test('sweepThresholdWithAutoExpand respects an explicit --sweep-max even when lower than the historical default of 30', () => {
  const candidates = stepCandidates(0.1, [1, 5, 10, 20]);
  const expanded = sweepThresholdWithAutoExpand(candidates, 0.1, { sweepMax: 10 });
  assert.equal(expanded.maxTested, 10);
  assert.equal(expanded.recommended, 10);
  assert.equal(expanded.boundaryPinned, true);
});

test('computeAggregate reports overall/mid_loop/idle threshold sweeps and a remaining-calls distribution', async () => {
  const messages = await loadFixtureMessages('multi-turn.jsonl');
  const result = replaySession('multi-turn.jsonl', messages, { ratios: [0.1] });
  const aggregate = computeAggregate([result], [0.1]);
  assert.equal(aggregate.candidateCount, result.candidates.length);
  assert.ok('overall' in aggregate.thresholdSweepByRatio[0.1]);
  assert.ok('mid_loop' in aggregate.thresholdSweepByRatio[0.1]);
  assert.ok('idle' in aggregate.thresholdSweepByRatio[0.1]);
  assert.equal(aggregate.distribution.count, result.candidates.length);
  if (result.candidates.length > 0) {
    assert.ok(typeof aggregate.distribution.p50 === 'number');
    assert.ok(typeof aggregate.distribution.p90 === 'number');
  }
});

test('computeAggregate extends each threshold-sweep entry with maxTested/boundaryPinned while keeping existing keys stable', async () => {
  const messages = await loadFixtureMessages('multi-turn.jsonl');
  const result = replaySession('multi-turn.jsonl', messages, { ratios: [0.1] });
  const aggregate = computeAggregate([result], [0.1]);
  for (const key of ['overall', 'mid_loop', 'idle']) {
    const entry = aggregate.thresholdSweepByRatio[0.1][key];
    assert.equal(typeof entry.recommended, 'number', `${key}.recommended (existing key) must stay present`);
    assert.equal(typeof entry.totalAtRecommended, 'number', `${key}.totalAtRecommended (existing key) must stay present`);
    assert.ok(Array.isArray(entry.curve), `${key}.curve (existing key) must stay present`);
    assert.equal(typeof entry.maxTested, 'number', `${key}.maxTested (new key) must be exposed`);
    assert.equal(typeof entry.boundaryPinned, 'boolean', `${key}.boundaryPinned (new key) must be exposed`);
  }
});

test('computeAggregate threads an explicit sweepMax down into every ratio/turn-state sweep', () => {
  const candidates = [
    // Chosen so it is only accepted exactly at the --sweep-max ceiling (5), forcing a real
    // boundary-pinned result rather than a trivial tie at threshold=1.
    { turnState: 'idle', byRatio: { 0.1: { breakEvenCalls: 5, realizedNetBenefit: 1 } } },
  ];
  const sessionResult = { sessionFile: 'synthetic', assistantCallCount: 1, candidates };
  const aggregate = computeAggregate([sessionResult], [0.1], { sweepMax: 5 });
  assert.equal(aggregate.thresholdSweepByRatio[0.1].overall.maxTested, 5);
  assert.equal(aggregate.thresholdSweepByRatio[0.1].overall.boundaryPinned, true);
  assert.equal(aggregate.thresholdSweepByRatio[0.1].idle.maxTested, 5);
});

// ---------------------------------------------------------------------------
// runBenchmark (full harness entry point) + JSON shape
// ---------------------------------------------------------------------------

test('runBenchmark processes all fixture sessions and produces the documented JSON shape', async () => {
  const { sessionFiles, sessionResults, aggregate, ratios } = await runBenchmark({
    paths: [fixturesDir],
    ratios: [0.1],
  });
  assert.equal(sessionFiles.length, 4);
  assert.equal(sessionResults.length, 4);
  assert.deepEqual(ratios, [0.1]);

  for (const session of sessionResults) {
    assert.equal(typeof session.sessionFile, 'string');
    assert.equal(typeof session.assistantCallCount, 'number');
    assert.ok(Array.isArray(session.candidates));
  }

  assert.equal(typeof aggregate.candidateCount, 'number');
  assert.equal(typeof aggregate.byStrategy, 'object');
  assert.equal(typeof aggregate.distribution, 'object');
  assert.equal(typeof aggregate.thresholdSweepByRatio, 'object');

  // Full payload must be JSON-serializable (the --json CLI flag dumps exactly this shape).
  const payload = { generatedAt: new Date().toISOString(), ratios, sessionFiles, sessions: sessionResults, aggregate };
  const json = JSON.stringify(payload);
  const parsed = JSON.parse(json);
  assert.equal(parsed.sessions.length, 4);
});

test('runBenchmark respects --limit', async () => {
  const { sessionFiles } = await runBenchmark({ paths: [fixturesDir], limit: 2, ratios: [0.1] });
  assert.equal(sessionFiles.length, 2);
});

test('runBenchmark threads sweepMax through to the aggregate threshold sweep', async () => {
  const { aggregate } = await runBenchmark({ paths: [fixturesDir], ratios: [0.1], sweepMax: 3 });
  assert.equal(aggregate.thresholdSweepByRatio[0.1].overall.maxTested, 3);
});

test('runBenchmark is read-only: fixture files are byte-for-byte unchanged after a run', async () => {
  const fs = await import('node:fs/promises');
  const before = new Map();
  for (const name of ['duplicate-reads.jsonl', 'errored-call.jsonl', 'read-edit-read.jsonl', 'multi-turn.jsonl']) {
    before.set(name, await fs.readFile(fixture(name), 'utf8'));
  }
  await runBenchmark({ paths: [fixturesDir], ratios: [0.1] });
  for (const [name, contentBefore] of before) {
    const contentAfter = await fs.readFile(fixture(name), 'utf8');
    assert.equal(contentAfter, contentBefore, `${name} must not be modified by the read-only benchmark harness`);
  }
});
