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
  const result = replaySession('errored-call.jsonl', messages, { ratios: [0.1] });
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
