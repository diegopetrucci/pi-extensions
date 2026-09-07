import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const quietToolsModule = await import(pathToFileURL(path.join(repoRoot, 'extensions/quiet-tools/index.ts')).href);
const quietToolsExtension = quietToolsModule.default;

initTheme('dark');

test('Pi 0.85.1 quiet tool execution uses current context cwd rather than registration cwd', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'quiet-cwd-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const current = path.join(root, 'current');
  mkdirSync(current);
  writeFileSync(path.join(root, 'fixture.txt'), 'original');
  writeFileSync(path.join(current, 'fixture.txt'), 'current');
  const harness = createExtensionHarness();
  quietToolsExtension(harness.pi);
  await getSessionStartHandler(harness)({}, { cwd: root });
  const ctx = { cwd: current, sessionManager: { getSessionId: () => 'cwd-test', getSessionFile: () => undefined } };
  const run = (name, args) => harness.tools.get(name).execute(name, args, undefined, undefined, ctx);
  writeFileSync(path.join(current, 'current-only.txt'), 'unique-current-marker');
  assert.match((await run('ls', { path: '.' })).content[0].text, /current-only.txt/);
  assert.match((await run('find', { pattern: 'current-only.txt' })).content[0].text, /current-only.txt/);
  assert.match((await run('grep', { pattern: 'unique-current-marker' })).content[0].text, /current-only.txt/);
  assert.match((await run('bash', { command: 'cat fixture.txt' })).content[0].text, /^current\s*$/);
  const result = await harness.tools.get('read').execute('read', { path: 'fixture.txt' }, undefined, undefined, ctx);
  assert.equal(result.content[0].text, 'current');
  await harness.tools.get('write').execute('write', { path: 'fixture.txt', content: 'updated' }, undefined, undefined, ctx);
  assert.equal(readFileSync(path.join(current, 'fixture.txt'), 'utf8'), 'updated');
  await run('edit', { path: 'fixture.txt', edits: [{ oldText: 'updated', newText: 'edited' }] });
  assert.equal(readFileSync(path.join(current, 'fixture.txt'), 'utf8'), 'edited');
  assert.equal(readFileSync(path.join(root, 'fixture.txt'), 'utf8'), 'original');
});

const theme = {
  fg(kind, text) {
    return `<${kind}>${text}</${kind}>`;
  },
  bg(kind, text) {
    return `<${kind}>${text}</${kind}>`;
  },
  bold(text) {
    return `*${text}*`;
  },
};

const quietToolCases = new Map([
  ['bash', { command: 'echo hello' }],
  ['edit', { file_path: 'README.md' }],
  ['find', { pattern: 'src/**/*.ts' }],
  ['grep', { pattern: 'TODO' }],
  ['ls', { path: '.' }],
  ['read', { path: 'README.md' }],
  ['write', { path: 'README.md', content: '' }],
]);

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trimEnd();
}

function getSessionStartHandler(harness) {
  const handler = harness.handlers.get('session_start');
  assert.equal(typeof handler, 'function', 'expected session_start handler to be registered');
  return handler;
}

function getQuietToolsCommand(harness) {
  const command = harness.commands.get('quiet-tools');
  assert.ok(command, 'expected quiet-tools command to be registered');
  return command;
}

function createCommandContext() {
  const notifications = [];
  return {
    notifications,
    ctx: {
      cwd: repoRoot,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  };
}

function renderCollapsedCall(tool) {
  const lines = tool.renderCall(
    quietToolCases.get(tool.name),
    theme,
    {
      argsComplete: true,
      cwd: repoRoot,
      executionStarted: true,
      expanded: false,
      isPartial: false,
      lastComponent: undefined,
      state: {},
    },
  ).render(200);

  return lines.map(stripAnsi);
}

function assertRegisteredToolNames(tools) {
  assert.deepEqual([...tools.keys()].sort(), [...quietToolCases.keys()].sort());
}

function assertQuietRegistrations(tools) {
  assertRegisteredToolNames(tools);
  for (const toolName of quietToolCases.keys()) {
    const tool = tools.get(toolName);
    const lines = renderCollapsedCall(tool);
    assert.equal(lines.length, 2, `${toolName} should render a two-line quiet preview`);
    assert.match(lines[1], /to expand/, `${toolName} should include the expand hint when quiet previews are enabled`);
  }
}

function assertStandardRegistrations(tools) {
  assertRegisteredToolNames(tools);
  for (const toolName of quietToolCases.keys()) {
    const tool = tools.get(toolName);
    const lines = renderCollapsedCall(tool);
    if (toolName !== 'edit') {
      assert.equal(lines.length, 1, `${toolName} should fall back to the standard collapsed renderer without an extra quiet hint row`);
    }
    assert.equal(
      lines.some((line) => line.includes('to expand')),
      false,
      `${toolName} should not include the quiet expand hint when previews are disabled`,
    );
  }
}

test('quiet-tools registers quiet built-in previews on session start and reports status changes', async () => {
  const harness = createExtensionHarness();
  quietToolsExtension(harness.pi);

  const sessionStart = getSessionStartHandler(harness);
  const command = getQuietToolsCommand(harness);
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);
  assertQuietRegistrations(harness.tools);

  await command.handler('status', ctx);
  await command.handler('off', ctx);
  assertStandardRegistrations(harness.tools);
  await command.handler('status', ctx);

  assert.deepEqual(notifications, [
    {
      message: "Quiet tool previews are enabled. Collapsed tool rows show a one-line invocation and hide output until expanded. Model-visible tool results are unchanged.",
      level: 'info',
    },
    {
      message: "Quiet tool previews disabled: restored pi's standard built-in tool renderers.",
      level: 'info',
    },
    {
      message: "Quiet tool previews are disabled. Collapsed tool rows use pi's default rendering. Model-visible tool results are unchanged.",
      level: 'info',
    },
  ]);
});

test('quiet-tools on and toggle re-register the active built-in renderers and notify the user', async () => {
  const harness = createExtensionHarness();
  quietToolsExtension(harness.pi);

  const sessionStart = getSessionStartHandler(harness);
  const command = getQuietToolsCommand(harness);
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);
  await command.handler('off', ctx);
  assertStandardRegistrations(harness.tools);

  await command.handler('on', ctx);
  assertQuietRegistrations(harness.tools);

  await command.handler('toggle', ctx);
  assertStandardRegistrations(harness.tools);

  assert.deepEqual(notifications, [
    {
      message: "Quiet tool previews disabled: restored pi's standard built-in tool renderers.",
      level: 'info',
    },
    {
      message: 'Quiet tool previews enabled: collapsed built-in tool rows show a one-line invocation plus an expand hint.',
      level: 'info',
    },
    {
      message: "Quiet tool previews disabled: restored pi's standard built-in tool renderers.",
      level: 'info',
    },
  ]);
});
