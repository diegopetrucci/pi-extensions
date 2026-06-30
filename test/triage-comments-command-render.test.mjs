import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const triageCommentsModule = await import(pathToFileURL(path.join(repoRoot, 'extensions/triage-comments/index.ts')).href);
const triageCommentsExtension = triageCommentsModule.default;

initTheme('dark');

const plainTheme = {
  fg(_kind, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

function createTriageHarness() {
  const harness = createExtensionHarness();
  const sentUserMessages = [];

  harness.pi.sendUserMessage = (message, options) => {
    sentUserMessages.push({ message, options });
  };
  harness.pi.getThinkingLevel = () => 'low';

  return { ...harness, sentUserMessages };
}

function createCommandContext({ hasUI = true, selectResult = 'Cancel', editorResult, isIdle = true } = {}) {
  const notifications = [];
  let selectCalls = 0;
  let editorCalls = 0;
  let inputCalls = 0;

  return {
    notifications,
    get selectCalls() {
      return selectCalls;
    },
    get editorCalls() {
      return editorCalls;
    },
    get inputCalls() {
      return inputCalls;
    },
    ctx: {
      cwd: repoRoot,
      hasUI,
      signal: undefined,
      isIdle() {
        return isIdle;
      },
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        async select() {
          selectCalls += 1;
          return selectResult;
        },
        async editor() {
          editorCalls += 1;
          return editorResult;
        },
        async input() {
          inputCalls += 1;
          return undefined;
        },
        setStatus() {},
      },
    },
  };
}

function getCommand(harness, name) {
  const command = harness.commands.get(name);
  assert.ok(command, `expected ${name} command to be registered`);
  return command;
}

function getTool(harness, name) {
  const tool = harness.tools.get(name);
  assert.ok(tool, `expected ${name} tool to be registered`);
  return tool;
}

function completionValues(result) {
  return result?.map((entry) => entry.value) ?? [];
}

function renderLines(component, width = 200) {
  return component.render(width).map((line) => line.trimEnd());
}

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-9;]*m/g, '');
}

test('triage-comments command completes arguments and handles help, no-UI, and cancel flows without starting triage', async (t) => {
  const harness = createTriageHarness();
  triageCommentsExtension(harness.pi);

  const command = getCommand(harness, 'triage-comments');

  assert.deepEqual(completionValues(command.getArgumentCompletions('')), ['paste', 'pr', 'help']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('P')), ['paste', 'pr']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('pr')), ['pr']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('he')), ['help']);
  assert.equal(command.getArgumentCompletions('paste feedback'), null);

  const helpContext = createCommandContext();
  await command.handler('help', helpContext.ctx);
  assert.equal(helpContext.notifications.at(-1).level, 'info');
  assert.match(helpContext.notifications.at(-1).message, /^Usage: \/triage-comments \[paste \| pr \[<PR URL or number>] \| <PR URL or number>]$/m);

  const noUiMessages = [];
  const originalConsoleLog = console.log;
  console.log = (message) => {
    noUiMessages.push(String(message));
  };
  t.after(() => {
    console.log = originalConsoleLog;
  });

  await command.handler('', { cwd: repoRoot, hasUI: false });
  assert.match(noUiMessages.at(-1), /This intake flow requires The Last Harness interactive UI/);

  const cancelSelectionContext = createCommandContext({ selectResult: 'Cancel' });
  await command.handler('', cancelSelectionContext.ctx);
  assert.equal(cancelSelectionContext.selectCalls, 1);
  assert.equal(cancelSelectionContext.editorCalls, 0);
  assert.equal(cancelSelectionContext.inputCalls, 0);
  assert.deepEqual(cancelSelectionContext.notifications, []);

  const pasteCancelContext = createCommandContext({ editorResult: '   ' });
  await command.handler('paste', pasteCancelContext.ctx);
  assert.equal(pasteCancelContext.selectCalls, 0);
  assert.equal(pasteCancelContext.editorCalls, 1);
  assert.equal(pasteCancelContext.notifications.at(-1).level, 'warning');
  assert.match(pasteCancelContext.notifications.at(-1).message, /No feedback was provided/);

  const pasteIdleContext = createCommandContext({ editorResult: 'Use <details> for the summary.' });
  await command.handler('paste', pasteIdleContext.ctx);
  assert.equal(pasteIdleContext.notifications.at(-1).level, 'info');
  assert.match(pasteIdleContext.notifications.at(-1).message, /Sent 1 selected comment\(s\) to the main agent/);
  assert.match(harness.sentUserMessages[0].message, /Task: start read-only review-feedback triage for 1 selected item\(s\)\./);
  assert.match(harness.sentUserMessages[0].message, /"body": "Use <details> for the summary\."/);
  assert.equal(harness.sentUserMessages[0].options, undefined);

  const pasteFollowUpContext = createCommandContext({ editorResult: 'Second pass', isIdle: false });
  await command.handler('paste', pasteFollowUpContext.ctx);
  assert.equal(pasteFollowUpContext.notifications.at(-1).level, 'info');
  assert.equal(harness.sentUserMessages[1].options?.deliverAs, 'followUp');

  assert.deepEqual(harness.execCalls, []);
});

test('triage_comments tool rejects missing model and invalid input before launching triage work', async () => {
  const harness = createTriageHarness();
  triageCommentsExtension(harness.pi);

  const tool = getTool(harness, 'triage_comments');

  await assert.rejects(
    tool.execute('triage-comments-1', { comments: ['ready to triage'] }, undefined, undefined, { cwd: repoRoot }),
    /needs an active model/,
  );

  await assert.rejects(
    tool.execute('triage-comments-2', { comments: ['   ', { body: ' ' }] }, undefined, undefined, { cwd: repoRoot, model: {} }),
    /expected comments to include at least one non-empty comment body/,
  );

  assert.deepEqual(harness.execCalls, []);
});

test('triage_comments renderCall summarizes selected comments and PR context', async () => {
  const harness = createTriageHarness();
  triageCommentsExtension(harness.pi);

  const tool = getTool(harness, 'triage_comments');

  assert.deepEqual(renderLines(tool.renderCall({ comments: ['  First comment body  '], pr: { number: 42 } }, plainTheme, {})), [
    '1 comments • PR #42 · First comment body',
  ]);
  assert.deepEqual(renderLines(tool.renderCall({ comments: [{ body: '  Object body  ' }], pr: { url: 'https://example.test/pr/42' } }, plainTheme, {})), [
    '1 comments • PR context · Object body',
  ]);
  assert.deepEqual(renderLines(tool.renderCall({ comments: [] }, plainTheme, {})), ['0 comments • no PR context ·']);
});

test('triage_comments renderResult covers fallback, partial, collapsed, and expanded branches', async () => {
  const harness = createTriageHarness();
  triageCommentsExtension(harness.pi);

  const tool = getTool(harness, 'triage_comments');
  const baseDetails = {
    cwd: '/repo',
    commentCount: 2,
    turns: 3,
    startedAt: 0,
    toolCalls: [
      { id: '1', name: 'read', args: { path: 'README.md', offset: 2, limit: 3 }, startedAt: 0 },
      { id: '2', name: 'bash', args: { command: 'git status --short' }, startedAt: 0, isError: true },
      { id: '3', name: 'ls', args: { path: 'src' }, startedAt: 0 },
      { id: '4', name: 'grep', args: { pattern: 'needle', path: 'lib' }, startedAt: 0 },
      { id: '5', name: 'find', args: { pattern: '*.ts', path: 'extensions' }, startedAt: 0 },
      { id: '6', name: 'read', args: { path: 'a' }, startedAt: 0 },
      { id: '7', name: 'read', args: { path: 'b' }, startedAt: 0 },
    ],
  };

  assert.deepEqual(
    renderLines(tool.renderResult({ content: [{ type: 'text', text: 'raw fallback' }] }, { expanded: false, isPartial: false }, plainTheme, {})),
    ['raw fallback'],
  );

  const errorFallback = renderLines(
    tool.renderResult(
      {
        content: [{ type: 'toolCall', id: 'call-1', name: 'triage_comments', arguments: {} }],
        details: { ...baseDetails, status: 'error', error: 'Bad input' },
      },
      { expanded: false, isPartial: false },
      plainTheme,
      {},
    ),
  ).join('\n');
  assert.match(errorFallback, /✗ triage_comments 2 comments • 3 turns • 7 tools/);
  assert.match(errorFallback, /Bad input/);

  const partial = renderLines(
    tool.renderResult(
      {
        content: [{ type: 'toolCall', id: 'call-2', name: 'triage_comments', arguments: {} }],
        details: { ...baseDetails, status: 'done', error: 'should be hidden while partial' },
      },
      { expanded: false, isPartial: true },
      plainTheme,
      {},
    ),
  ).join('\n');
  assert.match(partial, /⏳ triage_comments 2 comments • 3 turns • 7 tools/);
  assert.match(partial, /Triaging comments…/);
  assert.doesNotMatch(partial, /should be hidden while partial/);

  const collapsed = renderLines(
    tool.renderResult(
      {
        content: [{ type: 'text', text: Array.from({ length: 20 }, (_value, index) => `line ${index + 1}`).join('\n') }],
        details: { ...baseDetails, status: 'done' },
      },
      { expanded: false, isPartial: false },
      plainTheme,
      {},
    ),
  ).join('\n');
  assert.match(collapsed, /✓ triage_comments 2 comments • 3 turns • 7 tools/);
  assert.match(collapsed, /line 18/);
  assert.doesNotMatch(collapsed, /line 19/);
  assert.match(collapsed, /\(Ctrl\+O to expand\)/);
  assert.match(collapsed, /Read-only checks:/);
  assert.match(collapsed, /\n…\n✗ bash git status --short/);

  const expanded = stripAnsi(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: '## Heading\n\nBody paragraph' }],
          details: { ...baseDetails, status: 'aborted' },
        },
        { expanded: true, isPartial: false },
        plainTheme,
        {},
      ),
    ).join('\n'),
  );
  assert.match(expanded, /◼ triage_comments 2 comments • 3 turns • 7 tools/);
  assert.match(expanded, /→ read README\.md:2-4/);
  assert.match(expanded, /Heading/);
  assert.match(expanded, /Body paragraph/);
});
