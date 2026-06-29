import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const contextInspectorModule = await import(pathToFileURL(path.join(repoRoot, 'extensions/context-inspector/index.ts')).href);
const { analyzeEntries, buildReportData } = contextInspectorModule.__testing;

function createPi({ tools = [], thinkingLevel = 'high' } = {}) {
  return {
    getActiveTools() {
      return tools.map((tool) => tool.name);
    },
    getAllTools() {
      return tools;
    },
    getThinkingLevel() {
      return thinkingLevel;
    },
  };
}

function createContext({ branchEntries, usage, cwd = '/repo', redactSessionGetters = false } = {}) {
  return {
    cwd,
    model: {
      provider: 'anthropic',
      id: 'claude-opus-4-8',
      contextWindow: 100,
    },
    getSystemPrompt() {
      return '';
    },
    getContextUsage() {
      return usage;
    },
    sessionManager: {
      getBranch() {
        return branchEntries;
      },
      getSessionId() {
        if (redactSessionGetters) throw new Error('should not read session id while redacted');
        return 'session-123';
      },
      getSessionName() {
        if (redactSessionGetters) throw new Error('should not read session name while redacted');
        return 'main';
      },
      getSessionFile() {
        if (redactSessionGetters) throw new Error('should not read session file while redacted');
        return '/repo/.pi/sessions/main.json';
      },
    },
  };
}

function createClassificationEntries() {
  return [
    {
      type: 'message',
      id: 'user-1',
      timestamp: '2024-01-01T00:00:00.000Z',
      message: {
        role: 'user',
        timestamp: Date.parse('2024-01-01T00:00:00.000Z'),
        content: [{ type: 'text', text: 'Need repo status' }],
      },
    },
    {
      type: 'message',
      id: 'assistant-1',
      timestamp: '2024-01-01T00:00:01.000Z',
      message: {
        role: 'assistant',
        timestamp: Date.parse('2024-01-01T00:00:01.000Z'),
        content: [
          { type: 'thinking', thinking: 'Check git first' },
          {
            type: 'toolCall',
            name: 'bash',
            id: 'call-1',
            arguments: {
              path: '/tmp/secret.txt',
              command: 'git status --short',
            },
          },
          { type: 'text', text: 'Running it now.' },
        ],
      },
    },
    {
      type: 'message',
      id: 'tool-result-1',
      timestamp: '2024-01-01T00:00:02.000Z',
      message: {
        role: 'toolResult',
        timestamp: Date.parse('2024-01-01T00:00:02.000Z'),
        toolName: 'bash',
        toolCallId: 'call-1',
        content: [{ type: 'text', text: ' M src/index.ts' }],
        details: {
          truncation: { truncated: true },
          fullOutputPath: '/tmp/full-output.txt',
        },
      },
    },
    {
      type: 'message',
      id: 'bash-1',
      timestamp: '2024-01-01T00:00:03.000Z',
      message: {
        role: 'bashExecution',
        timestamp: Date.parse('2024-01-01T00:00:03.000Z'),
        command: 'cat secret.txt',
        output: 'top-secret',
        excludeFromContext: true,
      },
    },
    {
      type: 'custom_message',
      id: 'custom-1',
      timestamp: '2024-01-01T00:00:04.000Z',
      customType: 'workspace',
      display: false,
      content: [{ type: 'text', text: 'Repository hints' }],
    },
    {
      type: 'branch_summary',
      id: 'branch-1',
      timestamp: '2024-01-01T00:00:05.000Z',
      summary: 'Branch summary text',
      fromId: 'fork-1',
    },
    {
      type: 'compaction',
      id: 'compact-1',
      timestamp: '2024-01-01T00:00:06.000Z',
      summary: 'Compacted summary text',
      tokensBefore: 4321,
    },
  ];
}

test('context-inspector classifies context segments and preserves useful metadata', () => {
  const { segments, messageCount } = analyzeEntries(createClassificationEntries(), false);

  assert.equal(messageCount, 7);
  assert.deepEqual(
    segments.map((segment) => `${segment.category}:${segment.label}`),
    [
      'user:User message',
      'thinking:Assistant thinking',
      'toolCalls:Tool call: bash',
      'assistant:Assistant response',
      'toolResults:Tool result: bash',
      'bash:User bash execution',
      'custom:Custom context: workspace',
      'summaries:Branch summary',
      'summaries:Compaction summary',
    ],
  );

  const toolCall = segments.find((segment) => segment.category === 'toolCalls');
  assert.equal(toolCall.path, '/tmp/secret.txt');
  assert.equal(toolCall.command, 'git status --short');
  assert.match(toolCall.preview, /bash\(/);

  const toolResult = segments.find((segment) => segment.category === 'toolResults');
  assert.match(toolResult.note, /Result was truncated before entering context\./);
  assert.match(toolResult.note, /Full output: \/tmp\/full-output\.txt/);

  const bashSegment = segments.find((segment) => segment.category === 'bash');
  assert.equal(bashSegment.excluded, true);
  assert.match(bashSegment.note, /excludeFromContext/);

  const customSegment = segments.find((segment) => segment.category === 'custom');
  assert.equal(customSegment.displayOnly, true);
  assert.match(customSegment.note, /Hidden in TUI/);

  const compactionSegment = segments.find((segment) => segment.label === 'Compaction summary');
  assert.match(compactionSegment.note, /4\.3k earlier tokens/);
});

test('context-inspector redacts segment text and metadata consistently', () => {
  const unredacted = analyzeEntries(createClassificationEntries(), false).segments;
  const { segments } = analyzeEntries(createClassificationEntries(), true);

  const originalToolCall = unredacted.find((segment) => segment.category === 'toolCalls');
  const toolCall = segments.find((segment) => segment.category === 'toolCalls');
  assert.equal(toolCall.preview, `[redacted ${originalToolCall.detail.length.toLocaleString()} chars]`);
  assert.equal(toolCall.detail, `[redacted ${originalToolCall.detail.length.toLocaleString()} characters]`);
  assert.equal(toolCall.entryId, '[redacted entry]');
  assert.equal(toolCall.timestamp, '[redacted timestamp]');
  assert.equal(toolCall.toolCallId, '[redacted tool call]');
  assert.equal(toolCall.path, '[redacted path]');
  assert.equal(toolCall.command, '[redacted command]');

  const bashSegment = segments.find((segment) => segment.category === 'bash');
  assert.equal(bashSegment.command, '[redacted command]');
  assert.equal(bashSegment.note, '[redacted note]');
});

test('context-inspector report data handles unknown usage, estimator overage, provider delta, and redacted session info', () => {
  const branchEntries = [
    {
      type: 'message',
      id: 'user-1',
      timestamp: '2024-01-01T00:00:00.000Z',
      message: {
        role: 'user',
        timestamp: Date.parse('2024-01-01T00:00:00.000Z'),
        content: [{ type: 'text', text: 'x'.repeat(40) }],
      },
    },
  ];
  const pi = createPi();

  const unknownUsage = buildReportData(
    pi,
    createContext({ branchEntries, usage: { tokens: null, contextWindow: null }, redactSessionGetters: true }),
    { open: false, keep: false, redact: true, defaultDataset: 'current', help: false },
  );
  assert.equal(unknownUsage.cwd, '[redacted cwd]');
  assert.deepEqual(unknownUsage.session, {
    id: '[redacted session]',
    name: '[redacted session name]',
    file: '[redacted session file]',
  });
  assert.match(unknownUsage.notes.join('\n'), /Current context usage is unknown/);

  const overage = buildReportData(
    pi,
    createContext({ branchEntries, usage: { tokens: 5, contextWindow: 100 } }),
    { open: false, keep: false, redact: false, defaultDataset: 'current', help: false },
  );
  assert.equal(overage.datasets.current.stats.estimatorOverageTokens, 5);
  assert.equal(overage.datasets.current.stats.providerDeltaTokens, 0);
  assert.ok(overage.notes.some((note) => note.includes('scaled down proportionally')));

  const providerDelta = buildReportData(
    pi,
    createContext({ branchEntries, usage: { tokens: 20, contextWindow: 100 } }),
    { open: false, keep: false, redact: false, defaultDataset: 'full', help: false },
  );
  assert.equal(providerDelta.options.defaultDataset, 'full');
  assert.equal(providerDelta.datasets.current.stats.providerDeltaTokens, 10);
  assert.ok(providerDelta.datasets.current.stats.categories.some((category) => category.id === 'providerDelta'));
  assert.ok(providerDelta.notes.some((note) => note.includes('unattributed provider/serialization delta')));
});
