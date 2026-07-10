import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let importCounter = 0;

async function loadFreshOracleExtension() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/oracle/index.ts'));
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

function setupOracleEnv(t, { extensionPathConflict = false } = {}) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'oracle-command-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const configPath = path.join(agentDir, 'extensions', 'oracle.json');

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

test('oracle commands report status, offer completions, persist preferences in a temp agent dir, and keep oracle-model status aligned', async (t) => {
  const { configPath } = setupOracleEnv(t);
  const oracleExtension = await loadFreshOracleExtension();
  const harness = createExtensionHarness();
  oracleExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const oracleCommand = getCommand(harness, 'oracle');
  const oracleModelCommand = getCommand(harness, 'oracle-model');
  const { ctx, notifications } = createCommandContext({
    model: { provider: 'openai', id: 'gpt-4.1', reasoning: true },
    available: [
      {
        provider: 'openai',
        id: 'gpt-5.5-pro',
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
      { provider: 'openai', id: 'gpt-5.5', reasoning: true },
      { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
    ],
  });

  await sessionStart({}, ctx);

  assert.deepEqual(completionValues(oracleCommand.getArgumentCompletions('')), ['status', 'model', 'thinking', 'clear']);
  assert.deepEqual(completionValues(oracleCommand.getArgumentCompletions('thi')), ['thinking']);
  assert.deepEqual(completionValues(oracleCommand.getArgumentCompletions('thinking m')), ['minimal', 'medium', 'max']);
  assert.deepEqual(completionValues(oracleCommand.getArgumentCompletions('thinking max')), ['max']);
  assert.deepEqual(completionValues(oracleCommand.getArgumentCompletions('clear t')), ['thinking']);

  await oracleCommand.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Oracle defaults: model=auto, thinkingLevel=auto\./);
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await oracleCommand.handler('model openai/gpt-5.5-pro:high', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Oracle default model set to openai\/gpt-5\.5-pro\./);
  assert.match(notifications.at(-1).message, /model=openai\/gpt-5\.5-pro/);
  assert.match(notifications.at(-1).message, /thinkingLevel=high/);

  await oracleModelCommand.handler('', ctx);
  assert.match(notifications.at(-1).message, /Oracle: openai\/gpt-5\.5-pro \(low\) — Configured default oracle model is active\./);
  assert.match(notifications.at(-1).message, /Requested thinking level high was clamped to low/);

  await oracleCommand.handler('clear model', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Oracle defaults cleared \(model\)\./);
  assert.match(notifications.at(-1).message, /model=auto/);
  assert.match(notifications.at(-1).message, /thinkingLevel=high/);

  await oracleCommand.handler('thinking medium', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Oracle default thinking level set to medium\./);

  const savedPreferences = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(savedPreferences.model, undefined);
  assert.equal(savedPreferences.thinkingLevel, 'medium');
  assert.equal(typeof savedPreferences.updatedAt, 'string');

  const reloadedExtension = await loadFreshOracleExtension();
  const reloadedHarness = createExtensionHarness();
  reloadedExtension(reloadedHarness.pi);

  const reloadedSessionStart = getHandler(reloadedHarness, 'session_start');
  const reloadedOracleCommand = getCommand(reloadedHarness, 'oracle');
  const reloadedOracleModelCommand = getCommand(reloadedHarness, 'oracle-model');
  const reloadedContext = createCommandContext({
    model: { provider: 'openai', id: 'gpt-4.1', reasoning: true },
    available: [
      { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
      { provider: 'openai', id: 'gpt-5.5', reasoning: true },
      { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
    ],
  });

  await reloadedSessionStart({}, reloadedContext.ctx);
  await reloadedOracleCommand.handler('status', reloadedContext.ctx);
  assert.match(reloadedContext.notifications.at(-1).message, /Oracle defaults: model=auto, thinkingLevel=medium\./);

  await reloadedOracleModelCommand.handler('', reloadedContext.ctx);
  assert.match(reloadedContext.notifications.at(-1).message, /Oracle: openai\/gpt-5\.5-pro \(medium\) — Selected gpt-5\.5-pro via the hardcoded preference list for openai\./);

  await reloadedOracleCommand.handler('clear', reloadedContext.ctx);
  assert.equal(reloadedContext.notifications.at(-1).level, 'info');
  assert.match(reloadedContext.notifications.at(-1).message, /Oracle defaults cleared \(all\)\./);
  assert.match(reloadedContext.notifications.at(-1).message, /model=auto, thinkingLevel=auto\./);

  assert.deepEqual(harness.execCalls, []);
  assert.deepEqual(reloadedHarness.execCalls, []);
});

test('oracle command warns when preferences cannot be saved but still updates the current process state', async (t) => {
  const { configPath } = setupOracleEnv(t, { extensionPathConflict: true });
  const oracleExtension = await loadFreshOracleExtension();
  const harness = createExtensionHarness();
  oracleExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const oracleCommand = getCommand(harness, 'oracle');
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);
  await oracleCommand.handler('thinking high', ctx);

  assert.equal(notifications.at(-1).level, 'warning');
  assert.match(notifications.at(-1).message, /Preference changed for this process, but could not save/);
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await oracleCommand.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Oracle defaults: model=auto, thinkingLevel=high\./);

  assert.deepEqual(harness.execCalls, []);
});
