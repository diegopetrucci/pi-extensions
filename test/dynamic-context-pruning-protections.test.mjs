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
  isProtectedToolName,
  isProtectedPath,
  collectArgStringValues,
  computeRecencyBoundaryIndex,
  isWithinRecencyWindow,
  isDecisionProtected,
  proposalToDecisionRecord,
  estimateTokensForText,
  estimateTokensForContent,
} = dcp;

test('default protections include subagent/skill/todo-like tool names', () => {
  const protections = defaultConfig().protections;
  for (const name of ['todo', 'task', 'subagent', 'skill', 'oracle', 'librarian']) {
    assert.ok(isProtectedToolName(name, protections), `${name} should be protected by default`);
  }
  assert.equal(isProtectedToolName('bash', protections), false);
  assert.equal(isProtectedToolName('Todo', protections), true, 'tool name match should be case-insensitive');
});

test('protected path globs match nested secret-shaped paths', () => {
  const protections = defaultConfig().protections;
  assert.ok(isProtectedPath('/repo/.env', protections));
  assert.ok(isProtectedPath('/repo/.env.production', protections));
  assert.ok(isProtectedPath('/repo/config/secrets/prod.json', protections));
  assert.ok(isProtectedPath('/home/user/.ssh/id_rsa', protections));
  assert.equal(isProtectedPath('/repo/src/index.ts', protections), false);
});

test('collectArgStringValues finds path-like strings shallowly nested in tool args', () => {
  const values = collectArgStringValues({ path: '/repo/.env', options: { encoding: 'utf8' } });
  assert.ok(values.includes('/repo/.env'));
  assert.ok(values.includes('utf8'));
  assert.deepEqual(collectArgStringValues(undefined), []);
});

test('a decision targeting a protected tool name is never applied', () => {
  const protections = defaultConfig().protections;
  const messages = [
    { role: 'user', content: 'hi', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'todo', arguments: {} }], timestamp: 2 },
    { role: 'toolResult', toolCallId: 'c1', toolName: 'todo', content: [{ type: 'text', text: 'x'.repeat(50) }], isError: false, timestamp: 3 },
  ];
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  const boundary = computeRecencyBoundaryIndex(messages, 0);
  assert.equal(isDecisionProtected(decision, messages, protections, boundary), true);
});

test('a decision targeting a protected file path is never applied', () => {
  const protections = defaultConfig().protections;
  const messages = [
    { role: 'user', content: 'hi', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'read', arguments: { path: '/repo/.env' } }], timestamp: 2 },
    { role: 'toolResult', toolCallId: 'c1', toolName: 'read', content: [{ type: 'text', text: 'x'.repeat(50) }], isError: false, timestamp: 3 },
  ];
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  const boundary = computeRecencyBoundaryIndex(messages, 0);
  assert.equal(isDecisionProtected(decision, messages, protections, boundary), true);
});

test('computeRecencyBoundaryIndex protects the last N turns (default 4)', () => {
  // 5 user-started turns; each turn = [user, assistant].
  const messages = [];
  for (let i = 0; i < 5; i++) {
    messages.push({ role: 'user', content: `turn ${i}`, timestamp: i * 2 });
    messages.push({ role: 'assistant', content: [{ type: 'text', text: 'ok' }], timestamp: i * 2 + 1 });
  }
  const boundary = computeRecencyBoundaryIndex(messages, 4);
  // Protect the last 4 turns -> boundary should be the start of the 2nd turn (index 2).
  assert.equal(boundary, 2);
  assert.equal(isWithinRecencyWindow(1, boundary), false, 'first turn is outside the recency window');
  assert.equal(isWithinRecencyWindow(2, boundary), true, 'second turn onward is inside the recency window');
});

test('computeRecencyBoundaryIndex protects everything when fewer turns exist than the window', () => {
  const messages = [
    { role: 'user', content: 'only turn', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }], timestamp: 2 },
  ];
  const boundary = computeRecencyBoundaryIndex(messages, 4);
  assert.equal(boundary, 0);
});

test('computeRecencyBoundaryIndex protects nothing when recentTurns is 0', () => {
  const messages = [
    { role: 'user', content: 'turn', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }], timestamp: 2 },
  ];
  assert.equal(computeRecencyBoundaryIndex(messages, 0), messages.length);
});

test('a decision inside the recency window is never applied', () => {
  const protections = defaultConfig().protections;
  const messages = [
    { role: 'user', content: 'hi', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls' } }], timestamp: 2 },
    { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: 'x'.repeat(50) }], isError: false, timestamp: 3 },
  ];
  const decision = proposalToDecisionRecord({ strategyId: 's', toolCallId: 'c1', kind: 'tool_result_content', reason: 'r' });
  // Boundary at 0 means the whole (single-turn) conversation is protected.
  assert.equal(isDecisionProtected(decision, messages, protections, 0), true);
  // A boundary past the end means nothing is protected by recency.
  assert.equal(isDecisionProtected(decision, messages, protections, messages.length), false);
});

test('normalizeConfig merges partial/garbage input onto safe defaults', () => {
  assert.deepEqual(normalizeConfig(undefined), defaultConfig());
  assert.deepEqual(normalizeConfig(null), defaultConfig());
  assert.deepEqual(normalizeConfig('nonsense'), defaultConfig());

  const merged = normalizeConfig({ enabled: false, protections: { recentTurns: 2 } });
  assert.equal(merged.enabled, false);
  assert.equal(merged.protections.recentTurns, 2);
  assert.deepEqual(merged.protections.toolNames, defaultConfig().protections.toolNames);

  const withGarbageTurns = normalizeConfig({ protections: { recentTurns: -5 } });
  assert.equal(withGarbageTurns.protections.recentTurns, defaultConfig().protections.recentTurns);
});

test('estimateTokensForText/Content use a simple chars/4-style estimate', () => {
  assert.equal(estimateTokensForText(''), 0);
  assert.equal(estimateTokensForText('abcd'), 1);
  assert.equal(estimateTokensForText('abcdefgh'), 2);
  assert.equal(estimateTokensForContent([{ type: 'text', text: 'abcd' }]), 1);
  assert.ok(estimateTokensForContent([{ type: 'image', data: 'x', mimeType: 'image/png' }]) > 0);
});
