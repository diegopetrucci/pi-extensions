import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const contextInspectorModule = await import(pathToFileURL(path.join(repoRoot, 'extensions/context-inspector/index.ts')).href);
const contextInspectorExtension = contextInspectorModule.default;

function createBranchEntries() {
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
  ];
}

function createCommandContext(t, { cwd, branchEntries = createBranchEntries(), currentEntries = branchEntries } = {}) {
  const notifications = [];
  let waitForIdleCalls = 0;
  const rootDir = cwd ?? mkdtempSync(path.join(os.tmpdir(), 'context-inspector-command-test-'));

  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  return {
    cwd: rootDir,
    notifications,
    get waitForIdleCalls() {
      return waitForIdleCalls;
    },
    ctx: {
      cwd: rootDir,
      model: {
        provider: 'anthropic',
        id: 'claude-opus-4-8',
        contextWindow: 100,
      },
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        setStatus() {},
        setWidget() {},
      },
      getSystemPrompt() {
        return 'Follow repo rules.';
      },
      getContextUsage() {
        return { tokens: 24, contextWindow: 100 };
      },
      sessionManager: {
        getBranch() {
          return branchEntries;
        },
        buildContextEntries() {
          return currentEntries;
        },
        getSessionId() {
          return 'session-123';
        },
        getSessionName() {
          return 'main';
        },
        getSessionFile() {
          return path.join(rootDir, '.pi', 'sessions', 'main.json');
        },
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

function completionValues(result) {
  return result?.map((entry) => entry.value) ?? [];
}

function extractReportPath(message) {
  const match = message.match(/: (.+?)(?:\n|$)/);
  assert.ok(match, `expected report path in message: ${message}`);
  return match[1];
}

function expectedOpenCommand() {
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'win32') return 'cmd';
  return 'xdg-open';
}

test('context command offers flag completions and shows help without generating a report', async (t) => {
  const harness = createExtensionHarness();
  contextInspectorExtension(harness.pi);

  const command = getCommand(harness, 'context');
  const commandContext = createCommandContext(t);

  assert.deepEqual(completionValues(command.getArgumentCompletions('')), ['--no-open', '--keep', '--redact', '--full', '--current', '--help']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('--r')), ['--redact']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('--no-open --k')), ['--keep']);
  assert.equal(command.getArgumentCompletions('notes only'), null);

  await command.handler('--help', commandContext.ctx);

  assert.equal(commandContext.waitForIdleCalls, 0);
  assert.equal(commandContext.notifications.at(-1).level, 'info');
  assert.match(commandContext.notifications.at(-1).message, /^Usage: \/context \[--no-open\] \[--keep\] \[--redact\] \[--full\]/);
  assert.match(commandContext.notifications.at(-1).message, /--no-open   Write the report but do not open a browser\./);
  assert.deepEqual(harness.execCalls, []);
});

test('context command writes a kept redacted report with --no-open and does not invoke pi.exec', async (t) => {
  const harness = createExtensionHarness();
  contextInspectorExtension(harness.pi);

  const command = getCommand(harness, 'context');
  const commandContext = createCommandContext(t);

  await command.handler('--no-open --keep --redact', commandContext.ctx);

  assert.equal(commandContext.waitForIdleCalls, 1);
  assert.equal(commandContext.notifications.at(-1).level, 'info');
  assert.match(commandContext.notifications.at(-1).message, /^Context report written: /);
  assert.deepEqual(harness.execCalls, []);

  const reportPath = extractReportPath(commandContext.notifications.at(-1).message);
  assert.match(reportPath, new RegExp(`\\${path.sep}\\.pi\\${path.sep}context-reports\\${path.sep}`));
  assert.match(path.basename(reportPath), /^pi-context-redacted-\d+\.html$/);

  const reportHtml = readFileSync(reportPath, 'utf8');
  assert.match(reportHtml, /\[redacted cwd\]/);
  assert.match(reportHtml, /\[redacted session\]/);
  assert.match(reportHtml, /\[redacted path\]/);
  assert.doesNotMatch(reportHtml, /session-123/);
  assert.doesNotMatch(reportHtml, /\/tmp\/secret\.txt/);
});

test('context command warns when browser open fails and still writes the report', async (t) => {
  const harness = createExtensionHarness({
    execImpl: async () => ({ code: 1, stderr: 'browser unavailable' }),
  });
  contextInspectorExtension(harness.pi);

  const command = getCommand(harness, 'context');
  const commandContext = createCommandContext(t);

  await command.handler('--keep', commandContext.ctx);

  assert.equal(commandContext.waitForIdleCalls, 1);
  assert.equal(harness.execCalls.length, 1);
  assert.equal(harness.execCalls[0][0], expectedOpenCommand());
  assert.match(String(harness.execCalls[0][1][0]), /^file:/);

  assert.equal(commandContext.notifications.at(-1).level, 'warning');
  assert.match(commandContext.notifications.at(-1).message, /^Context report written, but browser open failed: /);
  assert.match(commandContext.notifications.at(-1).message, /browser unavailable/);

  const reportPath = extractReportPath(commandContext.notifications.at(-1).message);
  assert.match(reportPath, new RegExp(`\\${path.sep}\\.pi\\${path.sep}context-reports\\${path.sep}`));
  assert.match(path.basename(reportPath), /^pi-context-session-123-\d+\.html$/);
  assert.match(readFileSync(reportPath, 'utf8'), /Need repo status/);
});
