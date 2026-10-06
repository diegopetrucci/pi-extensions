import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initTheme } from '@earendil-works/pi-coding-agent';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const quietToolsModule = await import(pathToFileURL(path.join(repoRoot, 'extensions/quiet-tools/index.ts')).href);
const { sanitizeInlineText, formatQuietCallLine, createQuietToolDefinition } = quietToolsModule.__testing;
initTheme('dark');

const theme = {
  fg(kind, text) {
    return `<${kind}>${text}</${kind}>`;
  },
  bold(text) {
    return `*${text}*`;
  },
};

test('quiet-tools strips ANSI and control characters before building one-line summaries', () => {
  assert.equal(
    sanitizeInlineText('\u001b]8;;file:///tmp/secret\u0007label\u001b]8;;\u0007\tline\r\nnext\u0000\u001b[31m!\u001b[0m'),
    'label line next!',
  );
});

test('quiet-tools formats focused call summaries for built-in tools without multiline spill', () => {
  const homeFile = path.join(homedir(), 'project', 'notes.txt');
  const shortHomeFile = `~${homeFile.slice(homedir().length)}`;
  const cases = [
    {
      toolName: 'bash',
      args: { command: 'printf \"\u001b[31mhi\u001b[0m\tthere\"', timeout: 5 },
      expected: '<toolTitle>*$*</toolTitle> <toolTitle>*printf "hi there"*</toolTitle><muted> (timeout 5s)</muted>',
    },
    {
      toolName: 'read',
      args: { path: homeFile, offset: 4, limit: 3 },
      expected: `<toolTitle>*read*</toolTitle> <accent>${shortHomeFile}</accent><warning>:4-6</warning>`,
    },
    {
      toolName: 'grep',
      args: { pattern: 'TODO', path: '/tmp/work', glob: '**/*.ts', limit: 7 },
      expected: '<toolTitle>*grep*</toolTitle> <accent>/TODO/</accent><toolOutput> in /tmp/work</toolOutput><toolOutput> (**/*.ts)</toolOutput><toolOutput> limit 7</toolOutput>',
    },
    {
      toolName: 'find',
      args: { pattern: 'src/**/*.ts', limit: 2 },
      expected: '<toolTitle>*find*</toolTitle> <accent>src/**/*.ts</accent><toolOutput> in .</toolOutput><toolOutput> (limit 2)</toolOutput>',
    },
    {
      toolName: 'ls',
      args: { path: homeFile, limit: 1 },
      expected: `<toolTitle>*ls*</toolTitle> <accent>${shortHomeFile}</accent><toolOutput> (limit 1)</toolOutput>`,
    },
    {
      toolName: 'edit',
      args: { file_path: homeFile },
      expected: `<toolTitle>*edit*</toolTitle> <accent>${shortHomeFile}</accent>`,
    },
    {
      toolName: 'write',
      args: { path: homeFile },
      expected: `<toolTitle>*write*</toolTitle> <accent>${shortHomeFile}</accent>`,
    },
  ];

  for (const { toolName, args, expected } of cases) {
    assert.equal(formatQuietCallLine(toolName, args, theme), expected, toolName);
  }
});

test('quiet-tools wrapper preserves Pi 0.99 metadata, execution context, structured results, and errors', async () => {
  const parameters = { type: 'object', properties: { command: { type: 'string' } } };
  const outputSchema = { type: 'object', properties: { output: { type: 'string' } } };
  const constrainedSampling = { type: 'json_schema', strict: 'prefer' };
  const annotations = { readOnlyHint: false, destructiveHint: true };
  const namespace = { name: 'fixture', description: 'fixture namespace' };
  const futureMetadata = { futureFlag: true };
  const prepareArguments = (args) => args;
  const prepareLoadout = () => undefined;
  const updates = [];
  const executeCalls = [];
  const renderCalls = [];
  const baseResultComponent = { type: 'base-result' };
  const baseExecute = async (toolCallId, args, signal, onUpdate, ctx) => {
    executeCalls.push({ toolCallId, args, signal, onUpdate, ctx });
    onUpdate?.({ content: [{ type: 'text', text: 'partial' }], details: { phase: 'partial' } });
    return {
      content: [{ type: 'text', text: 'failure details' }],
      details: { phase: 'final' },
      structuredContent: { output: 'structured' },
      isError: true,
      usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, totalTokens: 10, cost: { total: 0 } },
    };
  };
  const base = {
    name: 'fixture',
    label: 'Fixture',
    description: 'Fixture tool',
    promptSnippet: 'fixture()',
    promptGuidelines: ['keep fixture output bounded'],
    parameters,
    outputSchema,
    constrainedSampling,
    renderShell: 'self',
    exposure: 'codemode',
    namespace,
    annotations,
    futureMetadata,
    defaultActive: false,
    prepareArguments,
    prepareLoadout,
    executionMode: 'parallel',
    execute: baseExecute,
    renderResult(result, options, _theme, context) {
      renderCalls.push({ result, options, context });
      return baseResultComponent;
    },
  };
  const quietTool = createQuietToolDefinition(base);

  for (const key of [
    'name', 'label', 'description', 'promptSnippet', 'promptGuidelines', 'parameters', 'outputSchema',
    'constrainedSampling', 'renderShell', 'exposure', 'namespace', 'annotations', 'futureMetadata', 'defaultActive',
    'prepareArguments', 'prepareLoadout', 'executionMode', 'execute',
  ]) {
    assert.equal(quietTool[key], base[key], `${key} should be retained by the renderer wrapper`);
  }

  const signal = new AbortController().signal;
  const onUpdate = (partial) => updates.push(partial);
  const ctx = { cwd: '/tmp/fixture', toolCallId: 'fixture-call' };
  const result = await quietTool.execute('fixture-call', { command: 'printf safe' }, signal, onUpdate, ctx);
  assert.deepEqual(result, {
    content: [{ type: 'text', text: 'failure details' }],
    details: { phase: 'final' },
    structuredContent: { output: 'structured' },
    isError: true,
    usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, totalTokens: 10, cost: { total: 0 } },
  });
  assert.deepEqual(executeCalls, [{ toolCallId: 'fixture-call', args: { command: 'printf safe' }, signal, onUpdate, ctx }]);
  assert.deepEqual(updates, [{ content: [{ type: 'text', text: 'partial' }], details: { phase: 'partial' } }]);

  const errorResult = {
    content: [{ type: 'text', text: 'line 1\nline 2' }],
    details: { phase: 'streaming' },
    structuredContent: { output: 'not rendered while collapsed' },
    isError: true,
  };
  const partialCollapsed = quietTool.renderResult(
    { ...errorResult, isError: false },
    { expanded: false, isPartial: true },
    theme,
    { isError: false, lastComponent: undefined, state: {} },
  );
  assert.deepEqual(partialCollapsed.render(200), []);

  const finalCollapsed = quietTool.renderResult(
    errorResult,
    { expanded: false, isPartial: false },
    theme,
    { isError: true, lastComponent: partialCollapsed, state: {} },
  );
  assert.deepEqual(finalCollapsed.render(200), []);

  const emptyResult = { content: [], details: {}, isError: false };
  const partialEmptyCollapsed = quietTool.renderResult(
    emptyResult,
    { expanded: false, isPartial: true },
    theme,
    { isError: false, lastComponent: undefined, state: {} },
  );
  assert.deepEqual(partialEmptyCollapsed.render(200), []);

  const finalEmptyCollapsed = quietTool.renderResult(
    emptyResult,
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: partialEmptyCollapsed, state: {} },
  );
  assert.deepEqual(finalEmptyCollapsed.render(200), []);

  assert.equal(
    quietTool.renderResult(
      errorResult,
      { expanded: true, isPartial: false },
      theme,
      { isError: true, lastComponent: undefined, state: {} },
    ),
    baseResultComponent,
  );
  assert.deepEqual(renderCalls.at(-1), {
    result: errorResult,
    options: { expanded: true, isPartial: false },
    context: { isError: true, lastComponent: undefined, state: {} },
  });
});

test('quiet-tools collapsed render keeps summaries visible while hiding results until expanded', () => {
  const baseCall = { type: 'base-call' };
  const baseResult = { type: 'base-result' };
  const quietTool = createQuietToolDefinition({
    name: 'bash',
    renderCall() {
      return baseCall;
    },
    renderResult() {
      return baseResult;
    },
  });

  const collapsedCall = quietTool.renderCall(
    { command: 'echo hello' },
    theme,
    { expanded: false, executionStarted: true, lastComponent: undefined, state: {} },
  );
  const collapsedLines = collapsedCall.render(200);
  assert.equal(collapsedLines.length, 2);
  assert.equal(collapsedLines[0], '<toolTitle>*$*</toolTitle> <toolTitle>*echo hello*</toolTitle>');
  assert.match(collapsedLines[1], /to expand/);

  const collapsedResult = quietTool.renderResult(
    { text: 'hidden result' },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined, state: {} },
  );
  assert.deepEqual(collapsedResult.render(200), []);

  assert.equal(
    quietTool.renderCall({}, theme, { expanded: true, executionStarted: false, lastComponent: undefined, state: {} }),
    baseCall,
  );
  assert.equal(
    quietTool.renderResult({}, { expanded: true, isPartial: false }, theme, { isError: false, lastComponent: undefined, state: {} }),
    baseResult,
  );
});
