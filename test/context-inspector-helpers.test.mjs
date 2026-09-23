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

function createContext({
  branchEntries,
  currentEntries = branchEntries,
  sessionProjection,
  exposeSessionProjection = sessionProjection !== undefined,
  usage,
  systemPrompt = '',
  cwd = '/repo',
  redactSessionGetters = false,
} = {}) {
  const sessionManager = {
    getBranch() {
      return branchEntries;
    },
    buildContextEntries() {
      return currentEntries;
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
  };
  if (exposeSessionProjection) {
    sessionManager.buildSessionProjection = () => sessionProjection;
  }

  return {
    cwd,
    model: {
      provider: 'anthropic',
      id: 'claude-opus-4-8',
      contextWindow: 100,
    },
    getSystemPrompt() {
      return systemPrompt;
    },
    getContextUsage() {
      return usage;
    },
    sessionManager,
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

test('context-inspector current context applies projection omissions and replacements while full history stays raw', () => {
  const keptEntry = {
    type: 'message',
    id: 'kept-user',
    timestamp: '2024-01-01T00:00:00.000Z',
    message: {
      role: 'user',
      timestamp: Date.parse('2024-01-01T00:00:00.000Z'),
      content: [{ type: 'text', text: 'kept model context' }],
    },
  };
  const omittedEntry = {
    type: 'message',
    id: 'omitted-user',
    timestamp: '2024-01-01T00:00:01.000Z',
    message: {
      role: 'user',
      timestamp: Date.parse('2024-01-01T00:00:01.000Z'),
      content: [{ type: 'text', text: 'omitted from model context' }],
    },
  };
  const replacedEntry = {
    type: 'message',
    id: 'replaced-user',
    timestamp: '2024-01-01T00:00:02.000Z',
    message: {
      role: 'user',
      timestamp: Date.parse('2024-01-01T00:00:02.000Z'),
      content: [{ type: 'text', text: 'original content only in history' }],
    },
  };
  const omissionEdit = {
    type: 'context_edit',
    id: 'omit-edit',
    parentId: 'omitted-user',
    timestamp: '2024-01-01T00:00:03.000Z',
    targetId: 'omitted-user',
    replacement: null,
  };
  const replacementEdit = {
    type: 'context_edit',
    id: 'replace-edit',
    parentId: 'replaced-user',
    timestamp: '2024-01-01T00:00:04.000Z',
    targetId: 'replaced-user',
    replacement: { content: [{ type: 'text', text: 'replacement content used by model' }] },
  };
  const replacementMessage = {
    ...replacedEntry.message,
    content: [{ type: 'text', text: 'replacement content used by model' }],
  };
  const branchEntries = [keptEntry, omittedEntry, replacedEntry, omissionEdit, replacementEdit];
  const sessionProjection = {
    entries: [
      { sourceEntry: keptEntry, messages: [keptEntry.message] },
      { sourceEntry: omittedEntry, messages: [] },
      { sourceEntry: replacedEntry, messages: [replacementMessage] },
      { sourceEntry: omissionEdit, messages: [] },
      { sourceEntry: replacementEdit, messages: [] },
    ],
    messages: [keptEntry.message, replacementMessage],
    thinkingLevel: 'high',
    model: { provider: 'anthropic', modelId: 'claude-opus-4-8' },
  };

  const report = buildReportData(
    createPi(),
    createContext({ branchEntries, sessionProjection, usage: { tokens: 20, contextWindow: 100 } }),
    { open: false, keep: false, redact: false, defaultDataset: 'current', help: false },
  );
  const currentText = report.datasets.current.segments.map((segment) => segment.detail).join('\n');
  const fullText = report.datasets.full.segments.map((segment) => segment.detail).join('\n');

  assert.equal(report.datasets.current.stats.messageCount, 2);
  assert.equal(report.datasets.full.stats.messageCount, 3);
  assert.match(currentText, /kept model context/);
  assert.match(currentText, /replacement content used by model/);
  assert.doesNotMatch(currentText, /omitted from model context/);
  assert.doesNotMatch(currentText, /original content only in history/);
  assert.match(fullText, /omitted from model context/);
  assert.match(fullText, /original content only in history/);
  assert.doesNotMatch(fullText, /replacement content used by model/);
  assert.equal(
    report.datasets.current.segments.find((segment) => segment.preview.includes('replacement content used by model')).entryId,
    'replaced-user',
  );
});

test('context-inspector projection uses Pi 0.87 compaction provenance without double-counting system overhead or stale summaries', () => {
  const systemMessage = {
    role: 'system',
    timestamp: Date.parse('2024-01-01T00:00:00.000Z'),
    content: [{ type: 'text', text: 'persisted system message should not be analyzed separately' }],
  };
  const latestSummaryMessage = {
    role: 'compactionSummary',
    timestamp: Date.parse('2024-01-01T00:00:01.000Z'),
    summary: 'latest projected compaction summary',
    tokensBefore: 4321,
  };
  const userMessage = {
    role: 'user',
    timestamp: Date.parse('2024-01-01T00:00:02.000Z'),
    content: [{ type: 'text', text: 'message retained after compaction' }],
  };
  const latestCompaction = {
    type: 'compaction',
    id: 'latest-compaction',
    timestamp: '2024-01-01T00:00:03.000Z',
    summary: 'latest projected compaction summary',
    tokensBefore: 4321,
  };
  const staleCompaction = {
    type: 'compaction',
    id: 'stale-compaction',
    timestamp: '2024-01-01T00:00:04.000Z',
    summary: 'stale summary must stay out of current context',
    tokensBefore: 1234,
  };
  const retainedEntry = {
    type: 'message',
    id: 'retained-user',
    timestamp: '2024-01-01T00:00:05.000Z',
    message: userMessage,
  };
  const branchEntries = [latestCompaction, staleCompaction, retainedEntry];
  const sessionProjection = {
    entries: [
      { sourceEntry: latestCompaction, messages: [systemMessage, latestSummaryMessage] },
      { sourceEntry: staleCompaction, messages: [] },
      { sourceEntry: retainedEntry, messages: [userMessage] },
    ],
    messages: [systemMessage, latestSummaryMessage, userMessage],
    thinkingLevel: 'high',
    model: { provider: 'anthropic', modelId: 'claude-opus-4-8' },
  };

  const report = buildReportData(
    createPi(),
    createContext({
      branchEntries,
      sessionProjection,
      systemPrompt: 'active system prompt represented by overhead',
      usage: { tokens: null, contextWindow: 100 },
    }),
    { open: false, keep: false, redact: false, defaultDataset: 'current', help: false },
  );
  const current = report.datasets.current;
  const currentText = current.segments.map((segment) => segment.detail).join('\n');
  const fullText = report.datasets.full.segments.map((segment) => segment.detail).join('\n');
  const systemSegments = current.segments.filter((segment) => segment.category === 'system');
  const systemCategory = current.stats.categories.find((category) => category.id === 'system');

  assert.equal(current.stats.messageCount, 2, 'system overhead is not counted as a projected conversation message');
  assert.equal(systemSegments.length, 1, 'the projected persisted system message is not double-counted');
  assert.equal(systemSegments[0].detail, 'active system prompt represented by overhead');
  assert.equal(systemCategory.segments, 1);
  assert.equal(systemCategory.tokens, systemSegments[0].tokens);
  assert.equal(current.stats.providerDeltaTokens, 0);
  assert.match(currentText, /latest projected compaction summary/);
  assert.match(currentText, /message retained after compaction/);
  assert.doesNotMatch(currentText, /stale summary must stay out of current context/);
  assert.doesNotMatch(currentText, /persisted system message should not be analyzed separately/);
  assert.match(fullText, /stale summary must stay out of current context/);
});

test('context-inspector rejects malformed projection provenance or roles and falls back to raw current entries', () => {
  const projectedEntry = {
    type: 'message',
    id: 'projected-entry',
    timestamp: '2024-01-01T00:00:00.000Z',
    message: {
      role: 'user',
      timestamp: Date.parse('2024-01-01T00:00:00.000Z'),
      content: [{ type: 'text', text: 'projection should be rejected' }],
    },
  };
  const fallbackEntry = {
    type: 'message',
    id: 'fallback-entry',
    timestamp: '2024-01-01T00:00:01.000Z',
    message: {
      role: 'user',
      timestamp: Date.parse('2024-01-01T00:00:01.000Z'),
      content: [{ type: 'text', text: 'raw fallback current context' }],
    },
  };
  const malformedProjection = {
    entries: [{ sourceEntry: { ...projectedEntry, id: 42 }, messages: [projectedEntry.message] }],
    messages: [projectedEntry.message],
  };
  const report = buildReportData(
    createPi(),
    createContext({
      branchEntries: [projectedEntry],
      currentEntries: [fallbackEntry],
      sessionProjection: malformedProjection,
      usage: { tokens: 10, contextWindow: 100 },
    }),
    { open: false, keep: false, redact: false, defaultDataset: 'current', help: false },
  );
  const currentText = report.datasets.current.segments.map((segment) => segment.detail).join('\n');
  assert.match(currentText, /raw fallback current context/);
  assert.doesNotMatch(currentText, /projection should be rejected/);

  const malformedRoleReport = buildReportData(
    createPi(),
    createContext({
      branchEntries: [projectedEntry],
      currentEntries: [fallbackEntry],
      sessionProjection: {
        entries: [{ sourceEntry: projectedEntry, messages: [{ content: 'missing role' }] }],
      },
      usage: { tokens: 10, contextWindow: 100 },
    }),
    { open: false, keep: false, redact: false, defaultDataset: 'current', help: false },
  );
  const malformedRoleText = malformedRoleReport.datasets.current.segments.map((segment) => segment.detail).join('\n');
  assert.match(malformedRoleText, /raw fallback current context/);
});

test('context-inspector report data falls back to buildContextEntries when projection is unavailable', () => {
  const branchEntries = [
    {
      type: 'message',
      id: 'user-branch',
      timestamp: '2024-01-01T00:00:00.000Z',
      message: {
        role: 'user',
        timestamp: Date.parse('2024-01-01T00:00:00.000Z'),
        content: [{ type: 'text', text: 'branch-only text that should stay out of current context' }],
      },
    },
  ];
  const currentEntries = [
    {
      type: 'message',
      id: 'user-current',
      timestamp: '2024-01-01T00:00:01.000Z',
      message: {
        role: 'user',
        timestamp: Date.parse('2024-01-01T00:00:01.000Z'),
        content: [{ type: 'text', text: 'current-context text' }],
      },
    },
  ];

  const report = buildReportData(
    createPi(),
    createContext({ branchEntries, currentEntries, exposeSessionProjection: false, usage: { tokens: 10, contextWindow: 100 } }),
    { open: false, keep: false, redact: false, defaultDataset: 'current', help: false },
  );

  assert.equal(report.datasets.current.stats.messageCount, 1);
  assert.equal(report.datasets.full.stats.messageCount, 1);
  assert.ok(report.datasets.current.stats.topSegments.some((segment) => segment.preview.includes('current-context text')));
  assert.ok(report.datasets.full.stats.topSegments.some((segment) => segment.preview.includes('branch-only text')));
  assert.ok(report.datasets.full.stats.topSegments.every((segment) => !segment.preview.includes('current-context text')));
});

test('context-inspector report data uses buildContextEntries for compacted current context while full history stays on the branch', () => {
  const branchEntries = [
    {
      type: 'message',
      id: 'user-early',
      timestamp: '2024-01-01T00:00:00.000Z',
      message: {
        role: 'user',
        timestamp: Date.parse('2024-01-01T00:00:00.000Z'),
        content: [{ type: 'text', text: 'early user message' }],
      },
    },
    {
      type: 'message',
      id: 'assistant-early',
      timestamp: '2024-01-01T00:00:01.000Z',
      message: {
        role: 'assistant',
        timestamp: Date.parse('2024-01-01T00:00:01.000Z'),
        content: [{ type: 'text', text: 'early assistant response' }],
      },
    },
    {
      type: 'message',
      id: 'kept-user',
      timestamp: '2024-01-01T00:00:02.000Z',
      message: {
        role: 'user',
        timestamp: Date.parse('2024-01-01T00:00:02.000Z'),
        content: [{ type: 'text', text: 'kept user message' }],
      },
    },
    {
      type: 'compaction',
      id: 'compaction-1',
      firstKeptEntryId: 'kept-user',
      timestamp: '2024-01-01T00:00:03.000Z',
      summary: 'compacted branch summary',
      tokensBefore: 200,
    },
    {
      type: 'message',
      id: 'assistant-late',
      timestamp: '2024-01-01T00:00:04.000Z',
      message: {
        role: 'assistant',
        timestamp: Date.parse('2024-01-01T00:00:04.000Z'),
        content: [{ type: 'text', text: 'latest assistant response' }],
      },
    },
  ];
  const currentEntries = [branchEntries[3], branchEntries[2], branchEntries[4]];

  const report = buildReportData(
    createPi(),
    createContext({ branchEntries, currentEntries, usage: { tokens: 20, contextWindow: 100 } }),
    { open: false, keep: false, redact: false, defaultDataset: 'current', help: false },
  );

  assert.equal(report.datasets.current.stats.messageCount, 3);
  assert.equal(report.datasets.full.stats.messageCount, 5);
  assert.ok(report.datasets.current.stats.topSegments.some((segment) => segment.label === 'Compaction summary'));
  assert.ok(report.datasets.current.stats.topSegments.some((segment) => segment.preview.includes('kept user message')));
  assert.ok(report.datasets.current.stats.topSegments.every((segment) => !segment.preview.includes('early user message')));
  assert.ok(report.datasets.full.stats.topSegments.some((segment) => segment.preview.includes('early user message')));
  assert.ok(report.datasets.full.stats.topSegments.some((segment) => segment.preview.includes('early assistant response')));
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
