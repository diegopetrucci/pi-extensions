import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_FAST_BETA = 'fast-mode-2026-02-01';
let importCounter = 0;

async function loadFreshExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath));
  moduleUrl.searchParams.set('test', `${Date.now()}-${importCounter++}`);
  const extensionModule = await import(moduleUrl.href);
  return extensionModule.default;
}

function setupTempDirs(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'fast-extensions-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const projectDir = path.join(rootDir, 'workspace', 'sample-project');
  const nestedDir = path.join(projectDir, 'packages', 'app', 'src');

  mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  mkdirSync(path.join(projectDir, '.pi'), { recursive: true });
  mkdirSync(nestedDir, { recursive: true });
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  return { agentDir, projectDir, nestedDir };
}

function setAgentDirEnv(t, agentDir) {
  const original = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (original === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
      return;
    }
    process.env.PI_CODING_AGENT_DIR = original;
  });
}

function writeConfig(filePath, config) {
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function createUI() {
  const statuses = [];
  const notifications = [];
  return {
    statuses,
    notifications,
    ui: {
      setStatus(key, value) {
        statuses.push({ key, value });
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };
}

function createFastContext({ cwd, model, trusted = true, hasUI = true, isUsingOAuth = false }) {
  const uiState = createUI();
  const oauthCalls = [];

  return {
    ...uiState,
    oauthCalls,
    ctx: {
      cwd,
      hasUI,
      isProjectTrusted() {
        return trusted;
      },
      model,
      sessionManager: {},
      ui: uiState.ui,
      modelRegistry: {
        isUsingOAuth(currentModel) {
          oauthCalls.push(currentModel);
          return isUsingOAuth;
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

function readBetaHeader(model) {
  return (model.headers?.['anthropic-beta'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

test('openai-fast honors trusted nested project config over global config and ignores untrusted project config', async (t) => {
  const { agentDir, projectDir, nestedDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeConfig(path.join(agentDir, 'extensions', 'openai-fast.json'), {
    enabled: false,
    showStatus: true,
  });
  writeConfig(path.join(projectDir, '.pi', 'openai-fast.json'), {
    enabled: true,
    showStatus: false,
  });

  const openAIFastExtension = await loadFreshExtension('extensions/openai-fast/index.ts');
  const harness = createExtensionHarness();
  openAIFastExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const beforeProviderRequest = getHandler(harness, 'before_provider_request');
  const trustedModel = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' };
  const trusted = createFastContext({
    cwd: nestedDir,
    model: trustedModel,
    trusted: true,
    isUsingOAuth: true,
  });

  await sessionStart({}, trusted.ctx);
  assert.deepEqual(trusted.statuses, [{ key: 'openai-fast', value: undefined }]);

  const trustedPayload = await beforeProviderRequest({ payload: { model: 'gpt-5.5', input: 'hello' } }, trusted.ctx);
  assert.deepEqual(trustedPayload, {
    model: 'gpt-5.5',
    input: 'hello',
    service_tier: 'priority',
  });
  assert.deepEqual(trusted.statuses.at(-1), { key: 'openai-fast', value: undefined });

  const untrustedModel = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' };
  const untrusted = createFastContext({
    cwd: nestedDir,
    model: untrustedModel,
    trusted: false,
    isUsingOAuth: true,
  });

  await sessionStart({}, untrusted.ctx);
  assert.deepEqual(untrusted.statuses, [{ key: 'openai-fast', value: undefined }]);

  const untrustedPayload = await beforeProviderRequest({ payload: { model: 'gpt-5.5', input: 'hello' } }, untrusted.ctx);
  assert.equal(untrustedPayload, undefined);
  assert.deepEqual(untrusted.statuses.at(-1), { key: 'openai-fast', value: undefined });
});

test('openai-fast reports no-model status, hides disabled status indicators, and warns on invalid command usage', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeConfig(path.join(agentDir, 'extensions', 'openai-fast.json'), {
    enabled: false,
    showStatus: false,
  });

  const openAIFastExtension = await loadFreshExtension('extensions/openai-fast/index.ts');
  const harness = createExtensionHarness();
  openAIFastExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness, 'fast');
  const fastContext = createFastContext({
    cwd: projectDir,
    model: undefined,
    trusted: true,
    isUsingOAuth: true,
  });

  await sessionStart({}, fastContext.ctx);
  await command.handler('', fastContext.ctx);

  assert.match(
    fastContext.notifications[0].message,
    /^OpenAI Fast mode is on \(session override\), but inactive for no-model: no model is selected\.$/,
  );
  assert.equal(fastContext.notifications[0].level, 'info');
  assert.deepEqual(fastContext.statuses, [
    { key: 'openai-fast', value: undefined },
    { key: 'openai-fast', value: undefined },
  ]);
  assert.deepEqual(fastContext.oauthCalls, []);

  await command.handler('status', fastContext.ctx);
  assert.deepEqual(fastContext.notifications.at(-1), {
    message: 'Usage: /fast',
    level: 'warning',
  });
});

test('openai-fast gates request mutation on payload shape, model match, and existing service tier', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeConfig(path.join(agentDir, 'extensions', 'openai-fast.json'), {
    enabled: true,
    showStatus: true,
  });

  const openAIFastExtension = await loadFreshExtension('extensions/openai-fast/index.ts');
  const harness = createExtensionHarness();
  openAIFastExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const beforeProviderRequest = getHandler(harness, 'before_provider_request');
  const fastContext = createFastContext({
    cwd: projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.4' },
    trusted: true,
    isUsingOAuth: true,
  });

  await sessionStart({}, fastContext.ctx);
  assert.deepEqual(fastContext.statuses.at(-1), { key: 'openai-fast', value: 'fast' });

  assert.equal(await beforeProviderRequest({ payload: ['not-an-object'] }, fastContext.ctx), undefined);
  assert.deepEqual(fastContext.statuses.at(-1), { key: 'openai-fast', value: 'fast' });

  assert.equal(
    await beforeProviderRequest({ payload: { model: 'gpt-5.5', input: 'hello' } }, fastContext.ctx),
    undefined,
  );
  assert.deepEqual(fastContext.statuses.at(-1), { key: 'openai-fast', value: 'fast' });

  const existingTierPayload = { model: 'gpt-5.4', input: 'hello', service_tier: 'default' };
  assert.equal(await beforeProviderRequest({ payload: existingTierPayload }, fastContext.ctx), undefined);
  assert.deepEqual(existingTierPayload, {
    model: 'gpt-5.4',
    input: 'hello',
    service_tier: 'default',
  });
  assert.deepEqual(fastContext.statuses.at(-1), { key: 'openai-fast', value: 'fast' });
});

test('claude-fast honors trusted nested project config over global config and ignores untrusted project config', async (t) => {
  const { agentDir, projectDir, nestedDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeConfig(path.join(agentDir, 'extensions', 'claude-fast.json'), {
    enabled: false,
    showStatus: true,
  });
  writeConfig(path.join(projectDir, '.pi', 'claude-fast.json'), {
    enabled: true,
    showStatus: false,
  });

  const claudeFastExtension = await loadFreshExtension('extensions/claude-fast/index.ts');
  const harness = createExtensionHarness();
  claudeFastExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const beforeProviderRequest = getHandler(harness, 'before_provider_request');
  const trustedModel = {
    provider: 'anthropic',
    api: 'anthropic-messages',
    id: 'claude-opus-4-8',
    headers: { 'Anthropic-Beta': 'existing-beta' },
  };
  const trusted = createFastContext({
    cwd: nestedDir,
    model: trustedModel,
    trusted: true,
    isUsingOAuth: true,
  });

  await sessionStart({}, trusted.ctx);
  assert.deepEqual(trusted.statuses, [{ key: 'claude-fast', value: undefined }]);
  assert.deepEqual(readBetaHeader(trustedModel), [
    'existing-beta',
    'claude-code-20250219',
    'oauth-2025-04-20',
    CLAUDE_FAST_BETA,
  ]);

  const trustedPayload = await beforeProviderRequest({ payload: { model: 'claude-opus-4-8', input: 'hello' } }, trusted.ctx);
  assert.deepEqual(trustedPayload, {
    model: 'claude-opus-4-8',
    input: 'hello',
    speed: 'fast',
  });
  assert.deepEqual(trusted.statuses.at(-1), { key: 'claude-fast', value: undefined });

  const untrustedModel = {
    provider: 'anthropic',
    api: 'anthropic-messages',
    id: 'claude-opus-4-8',
    headers: { 'Anthropic-Beta': 'existing-beta' },
  };
  const untrusted = createFastContext({
    cwd: nestedDir,
    model: untrustedModel,
    trusted: false,
    isUsingOAuth: true,
  });

  await sessionStart({}, untrusted.ctx);
  assert.deepEqual(untrusted.statuses, [{ key: 'claude-fast', value: undefined }]);
  assert.deepEqual(readBetaHeader(untrustedModel), ['existing-beta']);

  const untrustedPayload = await beforeProviderRequest({ payload: { model: 'claude-opus-4-8', input: 'hello' } }, untrusted.ctx);
  assert.equal(untrustedPayload, undefined);
  assert.deepEqual(untrusted.statuses.at(-1), { key: 'claude-fast', value: undefined });
});

test('claude-fast reports no-model status, hides disabled status indicators, and warns on invalid command usage', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeConfig(path.join(agentDir, 'extensions', 'claude-fast.json'), {
    enabled: false,
    showStatus: false,
  });

  const claudeFastExtension = await loadFreshExtension('extensions/claude-fast/index.ts');
  const harness = createExtensionHarness();
  claudeFastExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness, 'claude-fast');
  const fastContext = createFastContext({
    cwd: projectDir,
    model: undefined,
    trusted: true,
    isUsingOAuth: true,
  });

  await sessionStart({}, fastContext.ctx);
  await command.handler('', fastContext.ctx);

  assert.match(
    fastContext.notifications[0].message,
    /^Claude Fast mode is on \(session override\), but inactive for no-model: no model is selected\.$/,
  );
  assert.equal(fastContext.notifications[0].level, 'info');
  assert.deepEqual(fastContext.statuses, [
    { key: 'claude-fast', value: undefined },
    { key: 'claude-fast', value: undefined },
  ]);
  assert.deepEqual(fastContext.oauthCalls, []);

  await command.handler('status', fastContext.ctx);
  assert.deepEqual(fastContext.notifications.at(-1), {
    message: 'Usage: /claude-fast',
    level: 'warning',
  });
});

test('claude-fast gates request mutation on payload shape, model match, and existing speed', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeConfig(path.join(agentDir, 'extensions', 'claude-fast.json'), {
    enabled: true,
    showStatus: true,
  });

  const claudeFastExtension = await loadFreshExtension('extensions/claude-fast/index.ts');
  const harness = createExtensionHarness();
  claudeFastExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const beforeProviderRequest = getHandler(harness, 'before_provider_request');
  const model = {
    provider: 'anthropic',
    api: 'anthropic-messages',
    id: 'claude-opus-4-7',
    headers: { 'anthropic-beta': 'existing-beta' },
  };
  const fastContext = createFastContext({
    cwd: projectDir,
    model,
    trusted: true,
    isUsingOAuth: false,
  });

  await sessionStart({}, fastContext.ctx);
  assert.deepEqual(fastContext.statuses.at(-1), { key: 'claude-fast', value: 'fast' });
  assert.deepEqual(readBetaHeader(model), ['existing-beta', CLAUDE_FAST_BETA]);

  assert.equal(await beforeProviderRequest({ payload: ['not-an-object'] }, fastContext.ctx), undefined);
  assert.deepEqual(fastContext.statuses.at(-1), { key: 'claude-fast', value: 'fast' });
  assert.deepEqual(readBetaHeader(model), ['existing-beta', CLAUDE_FAST_BETA]);

  assert.equal(
    await beforeProviderRequest({ payload: { model: 'claude-opus-4-8', input: 'hello' } }, fastContext.ctx),
    undefined,
  );
  assert.deepEqual(fastContext.statuses.at(-1), { key: 'claude-fast', value: 'fast' });
  assert.deepEqual(readBetaHeader(model), ['existing-beta', CLAUDE_FAST_BETA]);

  const existingSpeedPayload = { model: 'claude-opus-4-7', input: 'hello', speed: 'slow' };
  assert.equal(await beforeProviderRequest({ payload: existingSpeedPayload }, fastContext.ctx), undefined);
  assert.deepEqual(existingSpeedPayload, {
    model: 'claude-opus-4-7',
    input: 'hello',
    speed: 'slow',
  });
  assert.deepEqual(fastContext.statuses.at(-1), { key: 'claude-fast', value: 'fast' });
  assert.deepEqual(readBetaHeader(model), ['existing-beta', CLAUDE_FAST_BETA]);
});
