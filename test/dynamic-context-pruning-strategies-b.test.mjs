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
  supersededFileOpsStrategy,
  extractFileOpPathArg,
  normalizeFileOpsPath,
  computeFileReadRange,
  isFullFileReadRange,
  readRangeCovers,
  estimateTokensForText,
} = dcp;

// ---------------------------------------------------------------------------
// Helpers to build minimal message fixtures
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

/** A single turn: user message, then an assistant tool call + its result. */
function toolCallTurn(toolCallId, toolName, args, resultText, isError = false) {
  return [
    userMsg(`turn for ${toolCallId}`, nextTs()),
    assistantToolCall(toolCallId, toolName, args, nextTs()),
    toolResultMsg(toolCallId, toolName, resultText, isError, nextTs()),
  ];
}

/** A single turn with just a user message + plain assistant text (no tool call). */
function plainTurn(label) {
  return [userMsg(`user says ${label}`, nextTs()), assistantText(`ok ${label}`, nextTs())];
}

function propose(messages, configOverrides = {}, cwd = undefined) {
  const config = { ...defaultConfig(), ...configOverrides };
  return supersededFileOpsStrategy.propose({
    messages,
    protections: config.protections,
    estimateTokens: estimateTokensForText,
    config,
    cwd,
  });
}

// ---------------------------------------------------------------------------
// Path extraction & normalization
// ---------------------------------------------------------------------------

test('extractFileOpPathArg reads the common arg names defensively', () => {
  assert.equal(extractFileOpPathArg({ path: 'a.txt' }), 'a.txt');
  assert.equal(extractFileOpPathArg({ file_path: 'b.txt' }), 'b.txt');
  assert.equal(extractFileOpPathArg({ filePath: 'c.txt' }), 'c.txt');
  assert.equal(extractFileOpPathArg({}), undefined);
  assert.equal(extractFileOpPathArg(undefined), undefined);
});

test('normalizeFileOpsPath resolves relative paths against cwd', () => {
  const cwd = '/repo';
  assert.equal(normalizeFileOpsPath('a.txt', cwd), path.normalize('/repo/a.txt'));
  assert.equal(normalizeFileOpsPath('./a.txt', cwd), path.normalize('/repo/a.txt'));
  assert.equal(normalizeFileOpsPath('/repo/a.txt', cwd), path.normalize('/repo/a.txt'));
  assert.equal(normalizeFileOpsPath('sub/../a.txt', cwd), path.normalize('/repo/a.txt'));
});

test('normalizeFileOpsPath without a cwd still normalizes ./ prefixes structurally', () => {
  assert.equal(normalizeFileOpsPath('./a.txt', undefined), path.normalize('a.txt'));
  assert.equal(normalizeFileOpsPath('a.txt', undefined), path.normalize('a.txt'));
});

// ---------------------------------------------------------------------------
// Read range computation & coverage
// ---------------------------------------------------------------------------

test('computeFileReadRange: no offset/limit is a full-file read', () => {
  const range = computeFileReadRange({});
  assert.equal(range.start, 1);
  assert.equal(range.end, undefined);
  assert.equal(isFullFileReadRange(range), true);
});

test('computeFileReadRange: offset/limit produce a bounded range', () => {
  const range = computeFileReadRange({ offset: 10, limit: 5 });
  assert.equal(range.start, 10);
  assert.equal(range.end, 14);
  assert.equal(isFullFileReadRange(range), false);
});

test('readRangeCovers: a later full read covers an earlier full read', () => {
  const full = computeFileReadRange({});
  assert.equal(readRangeCovers(full, full), true);
});

test('readRangeCovers: a later full read covers any earlier partial read', () => {
  const full = computeFileReadRange({});
  const partial = computeFileReadRange({ offset: 5, limit: 10 });
  assert.equal(readRangeCovers(full, partial), true);
});

test('readRangeCovers: a later partial read does not cover an earlier partial read with a different range', () => {
  const earlier = computeFileReadRange({ offset: 1, limit: 10 });
  const later = computeFileReadRange({ offset: 20, limit: 10 });
  assert.equal(readRangeCovers(later, earlier), false);
});

test('readRangeCovers: a later partial read covers an earlier one it fully encloses', () => {
  const earlier = computeFileReadRange({ offset: 10, limit: 5 }); // lines 10-14
  const later = computeFileReadRange({ offset: 1, limit: 50 }); // lines 1-50
  assert.equal(readRangeCovers(later, earlier), true);
});

test('readRangeCovers: conservative skip when earlier is unbounded but later is bounded', () => {
  const earlier = computeFileReadRange({ offset: 10 }); // reads to EOF, actual end unknown
  const later = computeFileReadRange({ offset: 5, limit: 100 }); // bounded; might stop before EOF
  assert.equal(readRangeCovers(later, earlier), false, 'cannot prove the bounded later read reaches EOF');
});

// ---------------------------------------------------------------------------
// Strategy: full-read-supersedes-full-read
// ---------------------------------------------------------------------------

test('supersededFileOpsStrategy: a full read is superseded by a later full read of the same path', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'a.txt' }, 'y'.repeat(500)),
  ];
  const proposals = propose(messages);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].toolCallId, 'r1');
  assert.equal(proposals[0].kind, 'tool_result_content');
  assert.ok(proposals[0].placeholder.includes('r2'));
});

test('supersededFileOpsStrategy: full reads of different paths do not supersede each other', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'b.txt' }, 'y'.repeat(500)),
  ];
  assert.deepEqual(propose(messages), []);
});

test('supersededFileOpsStrategy: normalizes relative vs absolute paths against cwd before comparing', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: './a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: '/repo/a.txt' }, 'y'.repeat(500)),
  ];
  const proposals = propose(messages, {}, '/repo');
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].toolCallId, 'r1');
});

// ---------------------------------------------------------------------------
// Strategy: partial-read conservatism
// ---------------------------------------------------------------------------

test('supersededFileOpsStrategy: a partial read is NOT superseded by a later partial read of a different, incomparable range', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt', offset: 1, limit: 10 }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'a.txt', offset: 50, limit: 10 }, 'y'.repeat(500)),
  ];
  assert.deepEqual(propose(messages), [], 'ranges do not overlap/cover; conservative skip');
});

test('supersededFileOpsStrategy: a partial read IS superseded when a later read covers its range', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt', offset: 10, limit: 5 }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'a.txt', offset: 1, limit: 50 }, 'y'.repeat(500)),
  ];
  const proposals = propose(messages);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].toolCallId, 'r1');
});

test('supersededFileOpsStrategy: an unbounded earlier read is not superseded by a bounded later read (conservative)', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt', offset: 10 }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'a.txt', offset: 5, limit: 100 }, 'y'.repeat(500)),
  ];
  assert.deepEqual(propose(messages), []);
});

// ---------------------------------------------------------------------------
// Strategy: read-before-successful-write/edit supersession
// ---------------------------------------------------------------------------

test('supersededFileOpsStrategy: a read is superseded by a later successful write to the same path, with a "file has since changed" placeholder', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('w1', 'write', { path: 'a.txt', content: 'new content' }, 'Successfully wrote 11 bytes to a.txt'),
  ];
  const proposals = propose(messages);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].toolCallId, 'r1');
  assert.match(proposals[0].placeholder, /file has since changed/);
  assert.ok(proposals[0].placeholder.includes('w1'));
});

test('supersededFileOpsStrategy: a read is superseded by a later successful edit to the same path', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt', offset: 1, limit: 5 }, 'x'.repeat(500)),
    ...toolCallTurn('e1', 'edit', { path: 'a.txt', edits: [{ oldText: 'x', newText: 'y' }] }, 'Edit applied'),
  ];
  const proposals = propose(messages);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].toolCallId, 'r1');
  assert.match(proposals[0].placeholder, /file has since changed/);
});

test('supersededFileOpsStrategy: an ERRORED later write does NOT supersede an earlier read', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('w1', 'write', { path: 'a.txt', content: 'new content' }, 'Error: permission denied', true),
  ];
  assert.deepEqual(propose(messages), []);
});

// ---------------------------------------------------------------------------
// Strategy: write/edit superseded by a later successful write/edit
// ---------------------------------------------------------------------------

test('supersededFileOpsStrategy: an older successful write is superseded by a later successful write to the same path', () => {
  const messages = [
    ...toolCallTurn('w1', 'write', { path: 'a.txt', content: 'v1' }, 'Successfully wrote 2 bytes to a.txt'),
    ...toolCallTurn('w2', 'write', { path: 'a.txt', content: 'v2' }, 'Successfully wrote 2 bytes to a.txt'),
  ];
  const proposals = propose(messages);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].toolCallId, 'w1');
  assert.ok(proposals[0].placeholder.includes('w2'));
});

test('supersededFileOpsStrategy: an errored later write does NOT supersede an earlier successful write', () => {
  const messages = [
    ...toolCallTurn('w1', 'write', { path: 'a.txt', content: 'v1' }, 'Successfully wrote 2 bytes to a.txt'),
    ...toolCallTurn('w2', 'write', { path: 'a.txt', content: 'v2' }, 'Error: disk full', true),
  ];
  assert.deepEqual(propose(messages), []);
});

test('supersededFileOpsStrategy: zero-length write output is never proposed even if a later successful write exists', () => {
  const messages = [
    ...toolCallTurn('w1', 'write', { path: 'a.txt', content: 'v1' }, ''),
    ...toolCallTurn('w2', 'write', { path: 'a.txt', content: 'v2' }, 'Successfully wrote 2 bytes to a.txt'),
  ];
  assert.deepEqual(propose(messages), []);
});

// ---------------------------------------------------------------------------
// Strategy: newest operation for a path is never pruned
// ---------------------------------------------------------------------------

test('supersededFileOpsStrategy: the newest operation for a path is never proposed for pruning', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'a.txt' }, 'y'.repeat(500)),
    ...toolCallTurn('w1', 'write', { path: 'a.txt', content: 'v1' }, 'Successfully wrote 2 bytes to a.txt'),
  ];
  const proposals = propose(messages);
  const targetedIds = proposals.map((p) => p.toolCallId);
  assert.ok(!targetedIds.includes('w1'), 'the newest op for the path must never be a prune target');
  // Both reads become stale once w1 lands, and r1 is additionally covered by r2.
  assert.ok(targetedIds.includes('r1'));
  assert.ok(targetedIds.includes('r2'));
});

// ---------------------------------------------------------------------------
// Strategy: reverse-pass rewrite regression coverage (pe-e0zd) — exercises the
// nearest-covering-read domination list and the write/read priority ordering
// with more than two occurrences per path, where a naive single-tracked-value
// rewrite could pick the wrong (non-nearest, or dominated) candidate.
// ---------------------------------------------------------------------------

test('supersededFileOpsStrategy: with 3+ reads, an earlier partial read is matched against the nearest ACTUALLY-covering later read, skipping a non-covering one in between', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt', offset: 1, limit: 5 }, 'x'.repeat(500)), // lines 1-5
    ...toolCallTurn('r2', 'read', { path: 'a.txt', offset: 10, limit: 5 }, 'y'.repeat(500)), // lines 10-14, does NOT cover r1 or nothing yet
    ...toolCallTurn('r3', 'read', { path: 'a.txt', offset: 1, limit: 20 }, 'z'.repeat(500)), // lines 1-20, covers both r1 and r2
  ];
  const proposals = propose(messages);
  const byId = new Map(proposals.map((p) => [p.toolCallId, p]));

  assert.equal(proposals.length, 2, 'r1 and r2 are both superseded by r3; r3 itself (newest) is never proposed');
  assert.ok(byId.get('r1').placeholder.includes('r3'), 'r1 must cite r3 (the nearest read that actually covers it), not r2');
  assert.ok(!byId.get('r1').placeholder.includes('r2'));
  assert.ok(byId.get('r2').placeholder.includes('r3'));
});

test('supersededFileOpsStrategy: rule 3 (later successful write) takes priority over a later covering read for an earlier read', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('w1', 'write', { path: 'a.txt', content: 'v2' }, 'Successfully wrote 2 bytes to a.txt'),
    ...toolCallTurn('r2', 'read', { path: 'a.txt' }, 'y'.repeat(500)),
  ];
  const proposals = propose(messages);
  const byId = new Map(proposals.map((p) => [p.toolCallId, p]));

  // r1 must be attributed to the later write (rule 3), never to the later
  // covering read r2, even though r2 (a full read) would otherwise cover r1.
  assert.match(byId.get('r1').placeholder, /file has since changed/);
  assert.ok(byId.get('r1').placeholder.includes('w1'));
  assert.ok(!byId.get('r1').placeholder.includes('r2'));
});

// ---------------------------------------------------------------------------
// Strategy: config toggle
// ---------------------------------------------------------------------------

test('supersededFileOpsStrategy respects the strategies.supersededFileOps.enabled config toggle (default on)', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'a.txt' }, 'y'.repeat(500)),
  ];
  assert.equal(defaultConfig().strategies.supersededFileOps.enabled, true, 'default must be on');

  const disabledProposals = propose(messages, {
    strategies: { ...defaultConfig().strategies, supersededFileOps: { enabled: false } },
  });
  assert.deepEqual(disabledProposals, []);
});

// ---------------------------------------------------------------------------
// Pipeline integration: protections, recency, gate
// ---------------------------------------------------------------------------

test('pipeline applies a superseded-read proposal: older read replaced with placeholder, newer kept verbatim', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'a.txt' }, 'y'.repeat(500)),
  ];
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const r1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'r1');
  const r2Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'r2');
  assert.ok(r1Result.content[0].text.includes('pruned by dynamic-context-pruning'));
  assert.equal(r2Result.content[0].text, 'y'.repeat(500), 'newest occurrence must be kept verbatim');
});

test('pipeline never prunes a superseded read whose path matches a protected glob', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: '/repo/.env' }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: '/repo/.env' }, 'y'.repeat(500)),
  ];
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const r1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'r1');
  assert.equal(r1Result.content[0].text, 'x'.repeat(500));
});

test('pipeline never prunes a superseded read still inside the recency window', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'a.txt' }, 'y'.repeat(500)),
  ];
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 10 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const r1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'r1');
  assert.equal(r1Result.content[0].text, 'x'.repeat(500));
});

test('gate rejects a low-value superseded-read proposal when the cache-bust tail is long; nothing is applied', () => {
  const smallResultText = 'x'.repeat(150);
  const messages = [
    ...toolCallTurn('r1', 'read', { path: 'a.txt' }, smallResultText),
    ...toolCallTurn('r2', 'read', { path: 'a.txt' }, smallResultText),
  ];
  for (let i = 0; i < 80; i++) messages.push(...plainTurn(`tail-${i}`));

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'on', breakEvenThreshold: 5 },
    // Identical full reads of the same path with identical output are also a
    // `dedupe` match; disable it here so this test isolates the
    // superseded-file-ops proposal (and its gate interaction) specifically.
    strategies: { ...defaultConfig().strategies, dedupe: { enabled: false } },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  assert.equal(result.newlyAppliedDecisions.length, 0);
  assert.equal(result.gate.rejected.length, 1);
  const r1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'r1');
  assert.equal(r1Result.content[0].text, smallResultText);
});

test('pipeline via cwd: relative reads against the same session cwd are recognized as the same path end-to-end', () => {
  const messages = [
    ...toolCallTurn('r1', 'read', { path: './a.txt' }, 'x'.repeat(500)),
    ...toolCallTurn('r2', 'read', { path: 'a.txt' }, 'y'.repeat(500)),
  ];
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({
    messages,
    config,
    persistedDecisions: [],
    knownIdempotencyKeys: new Set(),
    cwd: '/repo',
  });
  const r1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'r1');
  assert.ok(r1Result.content[0].text.includes('pruned by dynamic-context-pruning'));
});
