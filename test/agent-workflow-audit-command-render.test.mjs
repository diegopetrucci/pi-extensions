import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initTheme } from '@earendil-works/pi-coding-agent';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const auditModule = await import(pathToFileURL(path.join(repoRoot, 'extensions/agent-workflow-audit/index.ts')).href);
const agentWorkflowAuditExtension = auditModule.default;

initTheme('dark');

function createAuditHarness({ execImpl } = {}) {
  const commands = new Map();
  const messageRenderers = new Map();
  const execCalls = [];
  const sentMessages = [];

  return {
    pi: {
      on() {},
      registerCommand(name, definition) {
        commands.set(name, definition);
      },
      registerMessageRenderer(type, renderer) {
        messageRenderers.set(type, renderer);
      },
      sendMessage(message) {
        sentMessages.push(message);
      },
      getThinkingLevel() {
        return 'low';
      },
      async exec(...args) {
        execCalls.push(args);
        if (!execImpl) throw new Error('pi.exec should not have been called');
        return execImpl(...args);
      },
    },
    commands,
    messageRenderers,
    execCalls,
    sentMessages,
  };
}

function createCommandContext({ model, hasUI = true } = {}) {
  const notifications = [];
  let confirmCalls = 0;
  let waitForIdleCalls = 0;

  return {
    notifications,
    get confirmCalls() {
      return confirmCalls;
    },
    get waitForIdleCalls() {
      return waitForIdleCalls;
    },
    ctx: {
      cwd: repoRoot,
      model,
      hasUI,
      signal: undefined,
      ui: {
        theme: {
          fg(_kind, text) {
            return text;
          },
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
        async confirm() {
          confirmCalls += 1;
          return true;
        },
        setStatus() {},
        setWidget() {},
      },
      async waitForIdle() {
        waitForIdleCalls += 1;
      },
    },
  };
}

function getCommand(harness, name) {
  const command = harness.commands.get(name);
  assert.ok(command, `expected ${name} command to be registered`);
  return command;
}

function getRenderer(harness, type) {
  const renderer = harness.messageRenderers.get(type);
  assert.equal(typeof renderer, 'function', `expected ${type} message renderer to be registered`);
  return renderer;
}

function completionValues(result) {
  return result?.map((entry) => entry.value) ?? [];
}

const theme = {
  fg(kind, text) {
    return `<${kind}>${text}</${kind}>`;
  },
  bold(text) {
    return `*${text}*`;
  },
};

test('agent-workflow-audit command provides flag completions and handles help/error/no-model cases without starting an audit', async () => {
  const harness = createAuditHarness();
  agentWorkflowAuditExtension(harness.pi);

  const command = getCommand(harness, 'agent-workflow-audit');

  assert.deepEqual(completionValues(command.getArgumentCompletions('')), ['--yes', '--plan-only', '--help']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('--p')), ['--plan-only']);
  assert.equal(command.getArgumentCompletions('focus notes'), null);

  const helpContext = createCommandContext({ model: undefined });
  await command.handler('--help', helpContext.ctx);
  assert.equal(helpContext.notifications.at(-1).level, 'info');
  assert.match(helpContext.notifications.at(-1).message, /^Usage: \/agent-workflow-audit \[--yes\] \[--plan-only\] \[focus notes\]/);

  const errorContext = createCommandContext({ model: undefined });
  await command.handler('--bogus', errorContext.ctx);
  assert.equal(errorContext.notifications.at(-1).level, 'error');
  assert.match(errorContext.notifications.at(-1).message, /Unknown \/agent-workflow-audit option: --bogus/);

  const noModelContext = createCommandContext({ model: undefined });
  await command.handler('', noModelContext.ctx);
  assert.equal(noModelContext.notifications.at(-1).level, 'error');
  assert.match(noModelContext.notifications.at(-1).message, /needs an active model/);
  assert.equal(noModelContext.confirmCalls, 0);
  assert.equal(noModelContext.waitForIdleCalls, 0);

  const nonInteractiveWarnings = [];
  const originalConsoleLog = console.log;
  console.log = (message) => {
    nonInteractiveWarnings.push(String(message));
  };
  try {
    const noUiContext = createCommandContext({ model: {}, hasUI: false });
    await command.handler('focus notes', noUiContext.ctx);
    assert.equal(noUiContext.confirmCalls, 0);
    assert.equal(noUiContext.waitForIdleCalls, 0);
    assert.match(nonInteractiveWarnings.at(-1), /Non-interactive execution mode requires --yes or --plan-only/);
  } finally {
    console.log = originalConsoleLog;
  }

  assert.deepEqual(harness.execCalls, []);
  assert.deepEqual(harness.sentMessages, []);
});

test('agent-workflow-audit message renderer collapses long reports and preserves status metadata', () => {
  const harness = createAuditHarness();
  agentWorkflowAuditExtension(harness.pi);

  const renderer = getRenderer(harness, 'agent-workflow-audit');
  const report = Array.from({ length: 26 }, (_value, index) => `line ${index + 1}`).join('\n');
  const rendered = renderer(
    {
      content: report,
      details: {
        status: 'done',
        mode: 'execute',
        cwd: '/tmp/repo',
        focus: 'docs',
        turns: 2,
        toolCalls: [],
        toolCallCount: 9,
        startedAt: 0,
        endedAt: 2500,
      },
    },
    { expanded: false },
    theme,
  ).render(200).join('\n');

  assert.match(rendered, /<success>✓<\/success>/);
  assert.match(rendered, /execute · 2 turns · 9 tools · 2\.5s/);
  assert.match(rendered, /line 1/);
  assert.match(rendered, /… \(2 more lines; expand to view\)/);
});

test('agent-workflow-audit message renderer expands details and covers status fallbacks', () => {
  const harness = createAuditHarness();
  agentWorkflowAuditExtension(harness.pi);

  const renderer = getRenderer(harness, 'agent-workflow-audit');
  const expanded = renderer(
    {
      content: '## Summary\nAudit complete.',
      details: {
        status: 'error',
        mode: 'plan-only',
        cwd: '/tmp/repo',
        focus: 'release docs',
        turns: 1,
        toolCalls: [],
        startedAt: 5,
        endedAt: 305,
      },
    },
    { expanded: true },
    theme,
  ).render(200).join('\n');

  assert.match(expanded, /<error>✗<\/error>/);
  assert.match(expanded, /plan-only · 1 turns · 0 tools · 300ms/);
  assert.match(expanded, /cwd: \/tmp\/repo/);
  assert.match(expanded, /focus: release docs/);
  assert.match(expanded, /Audit complete\./);

  const fallback = renderer({ content: [], details: undefined }, { expanded: false }, theme).render(200).join('\n');
  assert.match(fallback, /final report/);
  assert.match(fallback, /\(no report\)/);

  const aborted = renderer(
    {
      content: 'stopped',
      details: {
        status: 'aborted',
        mode: 'execute',
        cwd: '/tmp/repo',
        turns: 0,
        toolCalls: [],
        startedAt: 10,
        endedAt: 20,
      },
    },
    { expanded: false },
    theme,
  ).render(200).join('\n');
  assert.match(aborted, /<warning>◼<\/warning>/);

  const running = renderer(
    {
      content: 'working',
      details: {
        status: 'running',
        mode: 'execute',
        cwd: '/tmp/repo',
        turns: 0,
        toolCalls: [],
        startedAt: 10,
      },
    },
    { expanded: false },
    theme,
  ).render(200).join('\n');
  assert.match(running, /<warning>⏳<\/warning>/);
});
