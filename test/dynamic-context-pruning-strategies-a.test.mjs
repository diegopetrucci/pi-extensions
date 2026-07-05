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
  canonicalizeArguments,
  canonicalizeArgumentsJSON,
  buildDedupeKey,
  dedupeStrategy,
  errorPurgeStrategy,
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

function propose(strategy, messages, configOverrides = {}) {
  const config = { ...defaultConfig(), ...configOverrides };
  return strategy.propose({
    messages,
    protections: config.protections,
    estimateTokens: estimateTokensForText,
    config,
  });
}

// ---------------------------------------------------------------------------
// Argument canonicalization
// ---------------------------------------------------------------------------

test('canonicalizeArgumentsJSON is stable across top-level key order', () => {
  const a = canonicalizeArgumentsJSON({ b: 1, a: 2 });
  const b = canonicalizeArgumentsJSON({ a: 2, b: 1 });
  assert.equal(a, b);
});

test('canonicalizeArgumentsJSON sorts nested object keys recursively', () => {
  const a = canonicalizeArgumentsJSON({ outer: { z: 1, a: { y: 2, x: 1 } }, top: true });
  const b = canonicalizeArgumentsJSON({ top: true, outer: { a: { x: 1, y: 2 }, z: 1 } });
  assert.equal(a, b);
});

test('canonicalizeArguments preserves array order (arrays are not sorted)', () => {
  const a = canonicalizeArgumentsJSON({ items: [3, 1, 2] });
  const b = canonicalizeArgumentsJSON({ items: [1, 2, 3] });
  assert.notEqual(a, b, 'array element order is meaningful and must not be reordered');
});

test('canonicalizeArguments never normalizes string argument VALUES (only structural key order)', () => {
  const a = canonicalizeArgumentsJSON({ message: 'hello  world' });
  const b = canonicalizeArgumentsJSON({ message: 'hello world' });
  assert.notEqual(a, b, 'whitespace differences inside a string value must not be collapsed');
});

test('buildDedupeKey is case-insensitive on tool name but canonicalizes args', () => {
  const keyA = buildDedupeKey('Bash', { cmd: 'ls', opts: { a: 1, b: 2 } });
  const keyB = buildDedupeKey('bash', { opts: { b: 2, a: 1 }, cmd: 'ls' });
  assert.equal(keyA, keyB);
});

// ---------------------------------------------------------------------------
// Dedupe strategy: proposal shape
// ---------------------------------------------------------------------------

test('dedupeStrategy proposes pruning all but the newest identical call, keyed by canonicalized args', () => {
  const messages = [
    ...toolCallTurn('c1', 'bash', { a: 1, b: 2 }, 'output one'),
    ...toolCallTurn('c2', 'bash', { b: 2, a: 1 }, 'output two'), // same call, different key order
    ...toolCallTurn('c3', 'read', { path: 'x.txt' }, 'unrelated call'),
  ];

  const proposals = propose(dedupeStrategy, messages);
  assert.equal(proposals.length, 1, 'only the older duplicate (c1) should be proposed; c2 is newest, c3 is not a duplicate');
  assert.equal(proposals[0].toolCallId, 'c1');
  assert.equal(proposals[0].kind, 'tool_result_content');
  assert.ok(proposals[0].placeholder.includes('bash'));
  assert.ok(proposals[0].placeholder.includes('c2'), 'placeholder must point at the newest occurrence');
});

test('dedupeStrategy proposes nothing when there is no duplicate', () => {
  const messages = [...toolCallTurn('c1', 'bash', { a: 1 }, 'x'), ...toolCallTurn('c2', 'read', { path: 'y' }, 'y')];
  assert.deepEqual(propose(dedupeStrategy, messages), []);
});

test('dedupeStrategy respects the strategies.dedupe.enabled config toggle', () => {
  const messages = [...toolCallTurn('c1', 'bash', { a: 1 }, 'x'), ...toolCallTurn('c2', 'bash', { a: 1 }, 'y')];
  const config = { ...defaultConfig(), strategies: { ...defaultConfig().strategies, dedupe: { enabled: false } } };
  const proposals = dedupeStrategy.propose({ messages, protections: config.protections, estimateTokens: estimateTokensForText, config });
  assert.deepEqual(proposals, []);
});

// ---------------------------------------------------------------------------
// Dedupe strategy: end-to-end via the pipeline (applies + protections)
// ---------------------------------------------------------------------------

test('pipeline applies a dedupe proposal: older result replaced with placeholder, newest kept verbatim', () => {
  const messages = [...toolCallTurn('c1', 'bash', { cmd: 'ls' }, 'a'.repeat(500)), ...toolCallTurn('c2', 'bash', { cmd: 'ls' }, 'b'.repeat(500))];
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });

  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'c1');
  const c2Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'c2');
  assert.ok(c1Result.content[0].text.includes('pruned by dynamic-context-pruning'));
  assert.ok(c1Result.content[0].text.includes('c2'));
  assert.equal(c2Result.content[0].text, 'b'.repeat(500), 'newest occurrence must be kept verbatim');
});

test('pipeline never dedupe-prunes a protected tool name', () => {
  const messages = [...toolCallTurn('c1', 'todo', { text: 'x' }, 'a'.repeat(500)), ...toolCallTurn('c2', 'todo', { text: 'x' }, 'b'.repeat(500))];
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'c1');
  assert.equal(c1Result.content[0].text, 'a'.repeat(500));
});

test('pipeline never dedupe-prunes a call whose args match a protected path glob', () => {
  const messages = [
    ...toolCallTurn('c1', 'read', { path: '/repo/.env' }, 'a'.repeat(500)),
    ...toolCallTurn('c2', 'read', { path: '/repo/.env' }, 'b'.repeat(500)),
  ];
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'c1');
  assert.equal(c1Result.content[0].text, 'a'.repeat(500));
});

test('pipeline never dedupe-prunes duplicates that are both inside the recency window', () => {
  const messages = [...toolCallTurn('c1', 'bash', { cmd: 'ls' }, 'a'.repeat(500)), ...toolCallTurn('c2', 'bash', { cmd: 'ls' }, 'b'.repeat(500))];
  const config = {
    ...defaultConfig(),
    // Both turns fit inside a large recency window -> nothing is eligible.
    protections: { ...defaultConfig().protections, recentTurns: 10 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'c1');
  assert.equal(c1Result.content[0].text, 'a'.repeat(500));
});

// ---------------------------------------------------------------------------
// Error-input purge strategy: turn-boundary
// ---------------------------------------------------------------------------

function buildErrorAgedMessages(turnsAfter) {
  const messages = [...toolCallTurn('err1', 'bash', { stderr: 'x'.repeat(5000) }, 'Error: command failed', true)];
  for (let i = 0; i < turnsAfter; i++) messages.push(...plainTurn(String(i)));
  return messages;
}

test('errorPurgeStrategy does not propose at exactly the configured turn threshold (default 4)', () => {
  const messages = buildErrorAgedMessages(4);
  const proposals = propose(errorPurgeStrategy, messages);
  assert.deepEqual(proposals, [], 'exactly N turns old must not yet be eligible');
});

test('errorPurgeStrategy proposes once older than the configured turn threshold (N+1)', () => {
  const messages = buildErrorAgedMessages(5);
  const proposals = propose(errorPurgeStrategy, messages);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].toolCallId, 'err1');
  assert.equal(proposals[0].kind, 'tool_call_input');
});

test('errorPurgeStrategy never proposes for a successful (non-error) tool call', () => {
  const messages = [...toolCallTurn('ok1', 'bash', { stderr: 'x'.repeat(5000) }, 'fine', false)];
  for (let i = 0; i < 6; i++) messages.push(...plainTurn(String(i)));
  assert.deepEqual(propose(errorPurgeStrategy, messages), []);
});

test('errorPurgeStrategy respects the strategies.errorPurge.enabled config toggle', () => {
  const messages = buildErrorAgedMessages(5);
  const config = { ...defaultConfig(), strategies: { ...defaultConfig().strategies, errorPurge: { enabled: false, minTurnsOld: 4 } } };
  const proposals = errorPurgeStrategy.propose({ messages, protections: config.protections, estimateTokens: estimateTokensForText, config });
  assert.deepEqual(proposals, []);
});

test('errorPurgeStrategy honors a configured minTurnsOld override', () => {
  const messages = buildErrorAgedMessages(2);
  const config = { ...defaultConfig(), strategies: { ...defaultConfig().strategies, errorPurge: { enabled: true, minTurnsOld: 1 } } };
  const proposals = errorPurgeStrategy.propose({ messages, protections: config.protections, estimateTokens: estimateTokensForText, config });
  assert.equal(proposals.length, 1, 'with a lower threshold, 2 elapsed turns is already eligible');
});

// ---------------------------------------------------------------------------
// Error-input purge strategy: end-to-end via the pipeline
// ---------------------------------------------------------------------------

test('pipeline applies error-input purge: args replaced, error output text preserved', () => {
  const messages = buildErrorAgedMessages(5);
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });

  const assistantMsg = result.messages.find(
    (m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'toolCall' && b.id === 'err1'),
  );
  const toolCallBlock = assistantMsg.content.find((b) => b.id === 'err1');
  assert.notDeepEqual(toolCallBlock.arguments, { stderr: 'x'.repeat(5000) });
  assert.equal(toolCallBlock.arguments.pruned, true);

  const resultMsg = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'err1');
  assert.equal(resultMsg.content[0].text, 'Error: command failed', 'error output text itself must be preserved');
});

test('pipeline never purges a protected tool name error input', () => {
  const messages = [...toolCallTurn('err1', 'todo', { text: 'x'.repeat(5000) }, 'Error: failed', true)];
  for (let i = 0; i < 6; i++) messages.push(...plainTurn(String(i)));
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const assistantMsg = result.messages.find(
    (m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'toolCall' && b.id === 'err1'),
  );
  const toolCallBlock = assistantMsg.content.find((b) => b.id === 'err1');
  assert.deepEqual(toolCallBlock.arguments, { text: 'x'.repeat(5000) });
});

test('pipeline never purges an error input whose args match a protected path glob', () => {
  const messages = [...toolCallTurn('err1', 'read', { path: '/repo/.env', extra: 'x'.repeat(5000) }, 'Error: failed', true)];
  for (let i = 0; i < 6; i++) messages.push(...plainTurn(String(i)));
  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const assistantMsg = result.messages.find(
    (m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'toolCall' && b.id === 'err1'),
  );
  const toolCallBlock = assistantMsg.content.find((b) => b.id === 'err1');
  assert.equal(toolCallBlock.arguments.path, '/repo/.env');
});

test('pipeline never purges an error input still inside the recency window', () => {
  const messages = buildErrorAgedMessages(5);
  const config = {
    ...defaultConfig(),
    // A large recency window covers the whole conversation despite 5 elapsed turns.
    protections: { ...defaultConfig().protections, recentTurns: 20 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };
  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const assistantMsg = result.messages.find(
    (m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'toolCall' && b.id === 'err1'),
  );
  const toolCallBlock = assistantMsg.content.find((b) => b.id === 'err1');
  assert.deepEqual(toolCallBlock.arguments, { stderr: 'x'.repeat(5000) });
});

// ---------------------------------------------------------------------------
// Net-benefit gate interaction: proposal produced but not applied on reject
// ---------------------------------------------------------------------------

test('gate rejects a real dedupe proposal with small savings and a long tail; nothing is applied', () => {
  // A small-but-positive saving (result text only slightly longer than the
  // placeholder it would become) plus a long tail after it inflates the
  // cache-bust penalty far beyond the recurring saving, so break-even calls
  // ends up well above the default threshold.
  const smallResultText = 'x'.repeat(150);
  const messages = [
    ...toolCallTurn('c1', 'bash', { cmd: 'ls' }, smallResultText),
    ...toolCallTurn('c2', 'bash', { cmd: 'ls' }, smallResultText),
  ];
  for (let i = 0; i < 80; i++) messages.push(...plainTurn(`tail-${i}`));

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'on', breakEvenThreshold: 5 },
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });

  assert.equal(result.newlyAppliedDecisions.length, 0, 'the gate must reject the low-value proposal');
  assert.equal(result.gate.rejected.length, 1, 'the proposal must have been produced and evaluated, not silently dropped');
  assert.equal(result.gate.rejected[0].correlation.toolCallId, 'c1');

  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'c1');
  assert.equal(c1Result.content[0].text, smallResultText, 'unapplied proposal must leave content untouched');
});

test('gate config toggles off (mode "off") bypass cost modelling and apply the same dedupe proposal', () => {
  const messages = [...toolCallTurn('c1', 'bash', { cmd: 'ls' }, 'a'.repeat(500)), ...toolCallTurn('c2', 'bash', { cmd: 'ls' }, 'b'.repeat(500))];
  for (let i = 0; i < 80; i++) messages.push(...plainTurn(`tail-${i}`));

  const config = {
    ...defaultConfig(),
    protections: { ...defaultConfig().protections, recentTurns: 0 },
    gate: { ...defaultConfig().gate, mode: 'off' },
  };

  const result = runDynamicContextPruningPipeline({ messages, config, persistedDecisions: [], knownIdempotencyKeys: new Set() });
  const c1Result = result.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'c1');
  assert.ok(c1Result.content[0].text.includes('pruned by dynamic-context-pruning'));
});
