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
    { isError: false, lastComponent: undefined, state: { startedAt: Date.now() } },
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
