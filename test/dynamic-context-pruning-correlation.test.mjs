import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'extensions/dynamic-context-pruning/index.ts');
const dcp = await import(pathToFileURL(modulePath).href);

const {
  findToolCallPairIndices,
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
