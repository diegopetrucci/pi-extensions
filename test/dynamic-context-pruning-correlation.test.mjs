import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'extensions/dynamic-context-pruning/index.ts');
const dcp = await import(pathToFileURL(modulePath).href);

const {
  findToolCallPairIndices,
  buildEntryIdToMessageIndexMap,
  findMessageIndexByRoleAndTimestamp,
  resolveMessageIndexForEntry,
} = dcp;

test('findToolCallPairIndices locates both the assistant toolCall block and the toolResult by id', () => {
  const messages = [
    { role: 'user', content: 'hi', timestamp: 1 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'call_1', name: 'bash', arguments: {} }], timestamp: 2 },
    { role: 'toolResult', toolCallId: 'call_1', toolName: 'bash', content: [], isError: false, timestamp: 3 },
  ];
  const pair = findToolCallPairIndices(messages, 'call_1');
  assert.equal(pair.assistantIndex, 1);
  assert.equal(pair.toolCallBlockIndex, 0);
  assert.equal(pair.resultIndex, 2);
});

test('findToolCallPairIndices returns partial results when only one side is present', () => {
  const onlyResult = [{ role: 'toolResult', toolCallId: 'call_1', toolName: 'bash', content: [], isError: false, timestamp: 1 }];
  const pairResultOnly = findToolCallPairIndices(onlyResult, 'call_1');
  assert.equal(pairResultOnly.resultIndex, 0);
  assert.equal(pairResultOnly.assistantIndex, undefined);

  const onlyCall = [{ role: 'assistant', content: [{ type: 'toolCall', id: 'call_1', name: 'bash', arguments: {} }], timestamp: 1 }];
  const pairCallOnly = findToolCallPairIndices(onlyCall, 'call_1');
  assert.equal(pairCallOnly.assistantIndex, 0);
  assert.equal(pairCallOnly.resultIndex, undefined);
});

test('buildEntryIdToMessageIndexMap order-zips message-producing entries against context messages', () => {
  const entries = [
    { type: 'message', id: 'e1', parentId: null, timestamp: 't1', message: { role: 'user', content: 'hi', timestamp: 1 } },
    { type: 'custom', id: 'e2', parentId: 'e1', timestamp: 't2', customType: 'dynamic-context-pruning:decision', data: {} },
    { type: 'message', id: 'e3', parentId: 'e2', timestamp: 't3', message: { role: 'assistant', content: [], timestamp: 2 } },
  ];
  const messages = [
    { role: 'user', content: 'hi', timestamp: 1 },
    { role: 'assistant', content: [], timestamp: 2 },
  ];
  const map = buildEntryIdToMessageIndexMap(entries, messages);
  assert.equal(map.get('e1'), 0);
  assert.equal(map.get('e3'), 1);
  assert.equal(map.has('e2'), false, 'custom (non-message-producing) entries must not appear in the zip');
});

test('findMessageIndexByRoleAndTimestamp is the last-resort fallback when order-zip counts diverge', () => {
  const entry = {
    type: 'message',
    id: 'e1',
    parentId: null,
    timestamp: 't1',
    message: { role: 'assistant', content: [], timestamp: 42 },
  };
  const messages = [
    { role: 'user', content: 'hi', timestamp: 1 },
    { role: 'assistant', content: [], timestamp: 42 },
  ];
  assert.equal(findMessageIndexByRoleAndTimestamp(entry, messages), 1);
  assert.equal(findMessageIndexByRoleAndTimestamp(entry, [{ role: 'assistant', timestamp: 999 }]), undefined);
});

test('resolveMessageIndexForEntry prefers the order-zip and falls back to role+timestamp on mismatch', () => {
  const entries = [
    { type: 'message', id: 'e1', parentId: null, timestamp: 't1', message: { role: 'user', content: 'hi', timestamp: 1 } },
    { type: 'message', id: 'e2', parentId: 'e1', timestamp: 't2', message: { role: 'assistant', content: [], timestamp: 2 } },
  ];
  const matchingMessages = [
    { role: 'user', content: 'hi', timestamp: 1 },
    { role: 'assistant', content: [], timestamp: 2 },
  ];
  assert.equal(resolveMessageIndexForEntry('e2', entries, matchingMessages), 1);

  // Simulate a count mismatch (e.g. compaction collapsed history): zip breaks,
  // but role+timestamp fallback should still find it.
  const shiftedMessages = [
    { role: 'compactionSummary', summary: 's', tokensBefore: 10, timestamp: 0 },
    { role: 'user', content: 'hi', timestamp: 1 },
    { role: 'assistant', content: [], timestamp: 2 },
  ];
  assert.equal(resolveMessageIndexForEntry('e2', entries, shiftedMessages), 2);
});

test('resolveMessageIndexForEntry returns undefined gracefully when nothing matches', () => {
  const entries = [{ type: 'message', id: 'e1', parentId: null, timestamp: 't1', message: { role: 'user', content: 'hi', timestamp: 1 } }];
  assert.equal(resolveMessageIndexForEntry('missing', entries, []), undefined);
});
