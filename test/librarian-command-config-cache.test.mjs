import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let importCounter = 0;

async function loadFreshLibrarianExtension() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts'));
  moduleUrl.searchParams.set('test', `${Date.now()}-${importCounter++}`);
  const extensionModule = await import(moduleUrl.href);
  return extensionModule.default;
}

function setEnv(t, key, value) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });
}

function setupLibrarianEnv(t, { extensionPathConflict = false } = {}) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'librarian-command-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const cacheRoot = path.join(rootDir, 'cache');
  const configPath = path.join(agentDir, 'extensions', 'librarian.json');

  mkdirSync(agentDir, { recursive: true });
  if (extensionPathConflict) {
    writeFileSync(path.join(agentDir, 'extensions'), 'conflict\n');
  } else {
    mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  }

  setEnv(t, 'PI_CODING_AGENT_DIR', agentDir);
  setEnv(t, 'PI_LIBRARIAN_CACHE_ROOT', cacheRoot);
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  return { agentDir, cacheRoot, configPath };
}

function createCommandContext() {
  const notifications = [];
  return {
    notifications,
    ctx: {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  };
}

function getCommand(harness, name) {
  const command = harness.commands.get(name);
  assert.ok(command, `expected ${name} command to be registered`);
  return command;
}

function getHandler(harness, name) {
  const handler = harness.handlers.get(name);
  assert.equal(typeof handler, 'function', `expected ${name} handler to be registered`);
  return handler;
}

function completionValues(result) {
  return result?.map((entry) => entry.value) ?? [];
}

test('librarian-config reports status, mutates defaults, offers completions, and persists preferences in a temp agent dir', async (t) => {
  const { configPath } = setupLibrarianEnv(t);
  const librarianExtension = await loadFreshLibrarianExtension();
  const harness = createExtensionHarness();
  librarianExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness, 'librarian-config');
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);

  assert.deepEqual(completionValues(command.getArgumentCompletions('')), ['status', 'model', 'thinking', 'clear']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('thi')), ['thinking']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('thinking m')), ['minimal', 'medium', 'max']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('thinking max')), ['max']);

  await command.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Librarian defaults: cache=off, model=auto, thinkingLevel=low\./);
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await command.handler('model anthropic/claude-haiku-4-5:high', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian model default updated\./);
  assert.match(notifications.at(-1).message, /model=anthropic\/claude-haiku-4-5/);
  assert.match(notifications.at(-1).message, /thinkingLevel=high/);

  await command.handler('clear model', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian defaults cleared \(model\)\./);
  assert.match(notifications.at(-1).message, /model=auto/);
  assert.match(notifications.at(-1).message, /thinkingLevel=high/);

  await command.handler('thinking medium', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian thinking default set to medium\./);

  const savedPreferences = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(savedPreferences.cacheMode, 'disabled');
  assert.equal(savedPreferences.cacheEnabled, false);
  assert.equal(savedPreferences.thinkingLevel, 'medium');
  assert.equal(savedPreferences.model, undefined);
  assert.equal(typeof savedPreferences.updatedAt, 'string');

  const reloadedExtension = await loadFreshLibrarianExtension();
  const reloadedHarness = createExtensionHarness();
  reloadedExtension(reloadedHarness.pi);

  const reloadedSessionStart = getHandler(reloadedHarness, 'session_start');
  const reloadedCommand = getCommand(reloadedHarness, 'librarian-config');
  const reloadedContext = createCommandContext();

  await reloadedSessionStart({}, reloadedContext.ctx);
  await reloadedCommand.handler('status', reloadedContext.ctx);
  assert.match(reloadedContext.notifications.at(-1).message, /cache=off, model=auto, thinkingLevel=medium\./);
});

test('librarian-cache reports status, toggles cache, offers completions, and persists cache mode in a temp agent dir', async (t) => {
  const { cacheRoot, configPath } = setupLibrarianEnv(t);
  const librarianExtension = await loadFreshLibrarianExtension();
  const harness = createExtensionHarness();
  librarianExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness, 'librarian-cache');
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);

  assert.deepEqual(completionValues(command.getArgumentCompletions('')), ['on', 'off', 'toggle', 'status']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('t')), ['toggle']);

  await command.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Librarian cache is off\./);
  assert.match(notifications.at(-1).message, new RegExp(cacheRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await command.handler('on', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian cache enabled\./);
  assert.match(notifications.at(-1).message, new RegExp(cacheRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await command.handler('toggle', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian cache disabled\./);

  const savedPreferences = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(savedPreferences.cacheMode, 'disabled');
  assert.equal(savedPreferences.cacheEnabled, false);
  assert.equal(savedPreferences.thinkingLevel, 'low');
  assert.equal(savedPreferences.model, undefined);
  assert.equal(typeof savedPreferences.updatedAt, 'string');

  const reloadedExtension = await loadFreshLibrarianExtension();
  const reloadedHarness = createExtensionHarness();
  reloadedExtension(reloadedHarness.pi);

  const reloadedSessionStart = getHandler(reloadedHarness, 'session_start');
  const reloadedCommand = getCommand(reloadedHarness, 'librarian-cache');
  const reloadedContext = createCommandContext();

  await reloadedSessionStart({}, reloadedContext.ctx);
  await reloadedCommand.handler('status', reloadedContext.ctx);
  assert.match(reloadedContext.notifications.at(-1).message, /Librarian cache is off\./);
});

test('librarian-config warns when preferences cannot be saved but still updates the current process state', async (t) => {
  const { configPath } = setupLibrarianEnv(t, { extensionPathConflict: true });
  const librarianExtension = await loadFreshLibrarianExtension();
  const harness = createExtensionHarness();
  librarianExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness, 'librarian-config');
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);
  await command.handler('thinking high', ctx);

  assert.equal(notifications.at(-1).level, 'warning');
  assert.match(notifications.at(-1).message, /Preference changed for this process, but could not save/);
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await command.handler('status', ctx);
  assert.match(notifications.at(-1).message, /thinkingLevel=high\./);
});

test('librarian tool_result marks error results without flagging successful or unrelated tool events', async () => {
  const librarianExtension = await loadFreshLibrarianExtension();
  const harness = createExtensionHarness();
  librarianExtension(harness.pi);

  const toolResult = getHandler(harness, 'tool_result');

  assert.deepEqual(await toolResult({ toolName: 'librarian', details: { status: 'error' } }, {}), { isError: true });
  assert.equal(await toolResult({ toolName: 'librarian', details: { status: 'done' } }, {}), undefined);
  assert.equal(await toolResult({ toolName: 'bash', details: { status: 'error' } }, {}), undefined);
});
