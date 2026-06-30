import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let importCounter = 0;

async function loadFreshContrarianExtension() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/contrarian/index.ts'));
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

function setupContrarianEnv(t, { extensionPathConflict = false } = {}) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'contrarian-command-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const configPath = path.join(agentDir, 'extensions', 'contrarian.json');

  mkdirSync(agentDir, { recursive: true });
  if (extensionPathConflict) {
    writeFileSync(path.join(agentDir, 'extensions'), 'conflict\n');
  } else {
    mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  }

  setEnv(t, 'PI_CODING_AGENT_DIR', agentDir);
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  return { agentDir, configPath };
}

function createCommandContext({ model, available = [] } = {}) {
  const notifications = [];
  return {
    notifications,
    ctx: {
      cwd: repoRoot,
      model,
      modelRegistry: {
        async getAvailable() {
          return available;
        },
      },
      hasUI: true,
      ui: {
        theme: {
          fg(_kind, text) {
            return text;
          },
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
        setStatus() {},
        setWidget() {},
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

test('contrarian commands report status, offer completions, persist preferences in a temp agent dir, and keep contrarian-model status aligned', async (t) => {
  const { configPath } = setupContrarianEnv(t);
  const contrarianExtension = await loadFreshContrarianExtension();
  const harness = createExtensionHarness();
  contrarianExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const contrarianCommand = getCommand(harness, 'contrarian');
  const contrarianModelCommand = getCommand(harness, 'contrarian-model');
  const { ctx, notifications } = createCommandContext({
    model: { provider: 'openai', id: 'gpt-4.1', reasoning: true },
    available: [
      {
        provider: 'anthropic',
        id: 'claude-opus-4.8',
        reasoning: true,
        thinkingLevelMap: {
          off: {},
          minimal: {},
          low: {},
          medium: null,
          high: null,
          xhigh: null,
        },
      },
      { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
      { provider: 'openai', id: 'gpt-5.5', reasoning: true },
    ],
  });

  await sessionStart({}, ctx);

  assert.deepEqual(completionValues(contrarianCommand.getArgumentCompletions('')), ['status', 'model', 'thinking', 'clear']);
  assert.deepEqual(completionValues(contrarianCommand.getArgumentCompletions('thi')), ['thinking']);
  assert.deepEqual(completionValues(contrarianCommand.getArgumentCompletions('thinking m')), ['minimal', 'medium']);
  assert.deepEqual(completionValues(contrarianCommand.getArgumentCompletions('clear t')), ['thinking']);

  await contrarianCommand.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Contrarian defaults: model=auto, thinkingLevel=auto\./);
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await contrarianCommand.handler('model anthropic/claude-opus-4.8:high', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Contrarian default model set to anthropic\/claude-opus-4\.8\./);
  assert.match(notifications.at(-1).message, /model=anthropic\/claude-opus-4\.8/);
  assert.match(notifications.at(-1).message, /thinkingLevel=high/);

  await contrarianModelCommand.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Contrarian: anthropic\/claude-opus-4\.8 \(low\) — Configured default contrarian model is active\./);
  assert.match(notifications.at(-1).message, /Requested thinking level high was clamped to low/);

  await contrarianCommand.handler('clear model', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Contrarian defaults cleared \(model\)\./);
  assert.match(notifications.at(-1).message, /model=auto/);
  assert.match(notifications.at(-1).message, /thinkingLevel=high/);

  await contrarianCommand.handler('thinking medium', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Contrarian default thinking level set to medium\./);

  const savedPreferences = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(savedPreferences.model, undefined);
  assert.equal(savedPreferences.thinkingLevel, 'medium');
  assert.equal(typeof savedPreferences.updatedAt, 'string');

  const reloadedExtension = await loadFreshContrarianExtension();
  const reloadedHarness = createExtensionHarness();
  reloadedExtension(reloadedHarness.pi);

  const reloadedSessionStart = getHandler(reloadedHarness, 'session_start');
  const reloadedContrarianCommand = getCommand(reloadedHarness, 'contrarian');
  const reloadedContrarianModelCommand = getCommand(reloadedHarness, 'contrarian-model');
  const reloadedContext = createCommandContext({
    model: { provider: 'openai', id: 'gpt-4.1', reasoning: true },
    available: [
      { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
      { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
      { provider: 'openai', id: 'gpt-5.5', reasoning: true },
    ],
  });

  await reloadedSessionStart({}, reloadedContext.ctx);
  await reloadedContrarianCommand.handler('status', reloadedContext.ctx);
  assert.match(reloadedContext.notifications.at(-1).message, /Contrarian defaults: model=auto, thinkingLevel=medium\./);

  await reloadedContrarianModelCommand.handler('status', reloadedContext.ctx);
  assert.match(
    reloadedContext.notifications.at(-1).message,
    /Contrarian: anthropic\/claude-opus-4\.8 \(medium\) — Selected claude-opus-4\.8 via the hardcoded preference lists while preferring an opposite provider\/model family\./,
  );

  await reloadedContrarianCommand.handler('clear', reloadedContext.ctx);
  assert.equal(reloadedContext.notifications.at(-1).level, 'info');
  assert.match(reloadedContext.notifications.at(-1).message, /Contrarian defaults cleared \(all\)\./);
  assert.match(reloadedContext.notifications.at(-1).message, /model=auto, thinkingLevel=auto\./);

  assert.deepEqual(harness.execCalls, []);
  assert.deepEqual(reloadedHarness.execCalls, []);
});

test('contrarian command warns when preferences cannot be saved but still updates the current process state', async (t) => {
  const { configPath } = setupContrarianEnv(t, { extensionPathConflict: true });
  const contrarianExtension = await loadFreshContrarianExtension();
  const harness = createExtensionHarness();
  contrarianExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const contrarianCommand = getCommand(harness, 'contrarian');
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);
  await contrarianCommand.handler('thinking high', ctx);

  assert.equal(notifications.at(-1).level, 'warning');
  assert.match(notifications.at(-1).message, /Preference changed for this process, but could not save/);
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await contrarianCommand.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Contrarian defaults: model=auto, thinkingLevel=high\./);

  assert.deepEqual(harness.execCalls, []);
});
