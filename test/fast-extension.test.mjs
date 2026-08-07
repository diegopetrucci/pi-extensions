import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CONFIG_DIR_NAME } from '@earendil-works/pi-coding-agent';
import { streamSimple as streamAnthropicSimple } from '@earendil-works/pi-ai/api/anthropic-messages';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

const OPENAI_MODELS = ['gpt-5.4', 'gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];
const ANTHROPIC_MODELS = ['claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8'];
const ANTHROPIC_FAST_BETA = 'fast-mode-2026-02-01';

function setupTempDirs(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'unified-fast-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const projectDir = path.join(rootDir, 'project');
  const nestedDir = path.join(projectDir, 'packages', 'app');
  mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  mkdirSync(path.join(projectDir, CONFIG_DIR_NAME), { recursive: true });
  mkdirSync(nestedDir, { recursive: true });
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  return { agentDir, projectDir, nestedDir };
}

function setAgentDir(t, agentDir) {
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  });
}

function writeConfig(filePath, config) {
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function createContext({ cwd, model, trusted = true, hasUI = true, oauth = false, authToken }) {
  const statuses = [];
  const notifications = [];
  const sessionManager = {};
  const ctx = {
    cwd,
    model,
    hasUI,
    sessionManager,
    isProjectTrusted() {
      return trusted;
    },
    ui: {
      setStatus(key, value) {
        statuses.push({ key, value });
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
    modelRegistry: {
      isUsingOAuth() {
        return oauth;
      },
      async getProviderAuth() {
        const apiKey = authToken ?? (oauth ? 'sk-ant-oat-test' : 'sk-ant-api-test');
        return { auth: { apiKey } };
      },
    },
  };
  return { ctx, statuses, notifications };
}

function getHandler(harness, name) {
  const handler = harness.handlers.get(name);
  assert.equal(typeof handler, 'function', `expected ${name} handler`);
  return handler;
}

function getCommand(harness) {
  const command = harness.commands.get('fast');
  assert.ok(command, 'expected /fast command');
  return command;
}

function betaValues(headers) {
  const value = Object.entries(headers)
    .filter(([name]) => name.toLowerCase() === 'anthropic-beta')
    .map(([, headerValue]) => headerValue ?? '')
    .join(',');
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

test('fast routes one enabled session across supported OpenAI and Anthropic models', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);

  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  extension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const modelSelect = getHandler(harness, 'model_select');
  const beforeHeaders = getHandler(harness, 'before_provider_headers');
  const beforeRequest = getHandler(harness, 'before_provider_request');
  const command = getCommand(harness);
  const context = createContext({
    cwd: projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    oauth: true,
  });

  await sessionStart({}, context.ctx);
  await command.handler('', context.ctx);
  assert.match(context.notifications.at(-1).message, /active for openai-codex\/gpt-5\.5/);
  assert.deepEqual(
    await beforeRequest({ payload: { model: 'gpt-5.5', input: 'hello' } }, context.ctx),
    { model: 'gpt-5.5', input: 'hello', service_tier: 'priority' },
  );

  context.ctx.model = {
    provider: 'anthropic',
    api: 'anthropic-messages',
    id: 'claude-opus-4-8',
    compat: { forceAdaptiveThinking: true },
  };
  await modelSelect({ model: context.ctx.model }, context.ctx);
  assert.deepEqual(context.statuses.at(-1), { key: 'fast', value: 'fast' });

  const headers = { 'Anthropic-Beta': 'existing-beta,oauth-2025-04-20' };
  await beforeHeaders({ headers }, context.ctx);
  assert.deepEqual(betaValues(headers), [
    'existing-beta',
    'oauth-2025-04-20',
    'claude-code-20250219',
    ANTHROPIC_FAST_BETA,
  ]);
  assert.equal(headers['Anthropic-Beta'], undefined);
  assert.deepEqual(
    await beforeRequest({ payload: { model: 'claude-opus-4-8', messages: [] } }, context.ctx),
    { model: 'claude-opus-4-8', messages: [], speed: 'fast' },
  );

  context.ctx.model = { provider: 'google', api: 'google-generative-ai', id: 'gemini-test' };
  await modelSelect({ model: context.ctx.model }, context.ctx);
  assert.deepEqual(context.statuses.at(-1), { key: 'fast', value: undefined });
  assert.equal(await beforeRequest({ payload: { model: 'gemini-test' } }, context.ctx), undefined);

  context.ctx.model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.4' };
  await modelSelect({ model: context.ctx.model }, context.ctx);
  assert.deepEqual(
    await beforeRequest({ payload: { model: 'gpt-5.4', input: 'again' } }, context.ctx),
    { model: 'gpt-5.4', input: 'again', service_tier: 'priority' },
  );
});

test('fast supports every legacy allowlisted model and preserves provider-specific auth rules', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);
  writeConfig(path.join(agentDir, 'extensions', 'fast.json'), { enabled: true, showStatus: true });

  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  extension(harness.pi);
  const sessionStart = getHandler(harness, 'session_start');
  const beforeRequest = getHandler(harness, 'before_provider_request');

  for (const id of OPENAI_MODELS) {
    const context = createContext({
      cwd: projectDir,
      model: { provider: 'openai-codex', api: 'openai-codex-responses', id },
      oauth: true,
    });
    await sessionStart({}, context.ctx);
    assert.deepEqual(await beforeRequest({ payload: { model: id } }, context.ctx), {
      model: id,
      service_tier: 'priority',
    });
  }

  for (const id of ANTHROPIC_MODELS) {
    const context = createContext({
      cwd: projectDir,
      model: { provider: 'anthropic', api: 'anthropic-messages', id },
      oauth: false,
    });
    await sessionStart({}, context.ctx);
    assert.deepEqual(await beforeRequest({ payload: { model: id } }, context.ctx), {
      model: id,
      speed: 'fast',
    });
  }

  const apiKeyOpenAI = createContext({
    cwd: projectDir,
    model: { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    oauth: false,
  });
  await sessionStart({}, apiKeyOpenAI.ctx);
  assert.equal(await beforeRequest({ payload: { model: 'gpt-5.5' } }, apiKeyOpenAI.ctx), undefined);
  assert.deepEqual(apiKeyOpenAI.statuses.at(-1), { key: 'fast', value: undefined });
});

test('fast never overwrites provider fields or mutates malformed and mismatched payloads', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);
  writeConfig(path.join(agentDir, 'extensions', 'fast.json'), { enabled: true });

  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  extension(harness.pi);
  const sessionStart = getHandler(harness, 'session_start');
  const beforeRequest = getHandler(harness, 'before_provider_request');
  const context = createContext({
    cwd: projectDir,
    model: { provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-4-7' },
  });
  await sessionStart({}, context.ctx);

  assert.equal(await beforeRequest({ payload: ['bad'] }, context.ctx), undefined);
  assert.equal(await beforeRequest({ payload: { model: 'claude-opus-4-8' } }, context.ctx), undefined);
  const speedPayload = { model: 'claude-opus-4-7', speed: 'standard' };
  assert.equal(await beforeRequest({ payload: speedPayload }, context.ctx), undefined);
  assert.deepEqual(speedPayload, { model: 'claude-opus-4-7', speed: 'standard' });

  context.ctx.model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.4' };
  context.ctx.modelRegistry.isUsingOAuth = () => true;
  const tierPayload = { model: 'gpt-5.4', service_tier: 'default' };
  assert.equal(await beforeRequest({ payload: tierPayload }, context.ctx), undefined);
  assert.deepEqual(tierPayload, { model: 'gpt-5.4', service_tier: 'default' });
});

test('fast uses trusted project config, ignores untrusted project config, and does not read legacy configs', async (t) => {
  const { agentDir, projectDir, nestedDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);
  writeConfig(path.join(agentDir, 'extensions', 'fast.json'), { enabled: false, showStatus: true });
  writeConfig(path.join(agentDir, 'extensions', 'openai-fast.json'), { enabled: true, showStatus: true });
  writeConfig(path.join(projectDir, CONFIG_DIR_NAME, 'fast.json'), { enabled: true, showStatus: false });

  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  extension(harness.pi);
  const sessionStart = getHandler(harness, 'session_start');
  const beforeRequest = getHandler(harness, 'before_provider_request');
  const model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' };

  const trusted = createContext({ cwd: nestedDir, model, trusted: true, oauth: true });
  await sessionStart({}, trusted.ctx);
  assert.deepEqual(await beforeRequest({ payload: { model: 'gpt-5.5' } }, trusted.ctx), {
    model: 'gpt-5.5',
    service_tier: 'priority',
  });
  assert.deepEqual(trusted.statuses.at(-1), { key: 'fast', value: undefined });

  const untrusted = createContext({ cwd: nestedDir, model, trusted: false, oauth: true });
  await sessionStart({}, untrusted.ctx);
  assert.equal(await beforeRequest({ payload: { model: 'gpt-5.5' } }, untrusted.ctx), undefined);
  assert.deepEqual(untrusted.statuses.at(-1), { key: 'fast', value: undefined });
});

test('fast only adds Anthropic request headers while active and merges beta values case-insensitively', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);
  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  extension(harness.pi);
  const sessionStart = getHandler(harness, 'session_start');
  const beforeHeaders = getHandler(harness, 'before_provider_headers');
  const command = getCommand(harness);
  const context = createContext({
    cwd: projectDir,
    model: {
      provider: 'anthropic',
      api: 'anthropic-messages',
      id: 'claude-opus-4-6',
      compat: { forceAdaptiveThinking: true },
    },
    oauth: false,
  });
  await sessionStart({}, context.ctx);

  const disabledHeaders = { 'Anthropic-Beta': 'existing-beta' };
  await beforeHeaders({ headers: disabledHeaders }, context.ctx);
  assert.deepEqual(disabledHeaders, { 'Anthropic-Beta': 'existing-beta' });

  await command.handler('', context.ctx);
  const activeHeaders = {
    'Anthropic-Beta': 'existing-beta',
    'anthropic-beta': `second-beta,${ANTHROPIC_FAST_BETA}`,
  };
  await beforeHeaders({ headers: activeHeaders }, context.ctx);
  assert.deepEqual(betaValues(activeHeaders), ['existing-beta', 'second-beta', ANTHROPIC_FAST_BETA]);

  context.ctx.model = { provider: 'anthropic', api: 'anthropic-messages', id: 'claude-sonnet-4-5' };
  const unsupportedHeaders = { 'anthropic-beta': 'keep-me' };
  await beforeHeaders({ headers: unsupportedHeaders }, context.ctx);
  assert.deepEqual(unsupportedHeaders, { 'anthropic-beta': 'keep-me' });
});

test('fast preserves required Anthropic provider betas in final API-key and OAuth wire headers', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);
  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  harness.pi.getActiveTools = () => ['read'];
  extension(harness.pi);
  const sessionStart = getHandler(harness, 'session_start');
  const beforeHeaders = getHandler(harness, 'before_provider_headers');
  const command = getCommand(harness);

  async function captureWireHeaders({ oauth, compat, modelHeaders }) {
    const authToken = oauth ? 'sk-ant-oat-wire-test' : 'sk-ant-api-wire-test';
    const model = {
      provider: 'anthropic',
      api: 'anthropic-messages',
      id: 'claude-opus-4-8',
      name: 'Claude Opus 4.8 test',
      baseUrl: 'https://anthropic-wire-test.invalid',
      reasoning: true,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 100_000,
      maxTokens: 4096,
      compat,
      headers: modelHeaders,
    };
    const context = createContext({ cwd: projectDir, model, oauth, authToken });
    await sessionStart({}, context.ctx);
    await command.handler('', context.ctx);

    const requestHeaders = { 'Anthropic-Beta': 'existing-beta' };
    await beforeHeaders({ headers: requestHeaders }, context.ctx);
    let captured;
    const stream = streamAnthropicSimple(
      model,
      {
        systemPrompt: 'test',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }], timestamp: Date.now() }],
        tools: [{ name: 'read', description: 'test', parameters: { type: 'object', properties: {} } }],
      },
      {
        apiKey: authToken,
        headers: requestHeaders,
        fetch: async (_input, init) => {
          captured = Object.fromEntries(new Headers(init?.headers));
          return new Response(JSON.stringify({ error: { message: 'wire capture complete' } }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    );
    await stream.result();
    assert.ok(captured, 'expected Anthropic request to reach the fake fetch');
    return captured;
  }

  const apiKeyHeaders = await captureWireHeaders({
    oauth: false,
    compat: { forceAdaptiveThinking: false, supportsEagerToolInputStreaming: false },
    modelHeaders: { 'Anthropic-Beta': 'model-custom-beta' },
  });
  assert.deepEqual(betaValues(apiKeyHeaders), [
    'model-custom-beta',
    'existing-beta',
    'fine-grained-tool-streaming-2025-05-14',
    'interleaved-thinking-2025-05-14',
    ANTHROPIC_FAST_BETA,
  ]);

  const oauthHeaders = await captureWireHeaders({
    oauth: true,
    compat: { forceAdaptiveThinking: true, supportsEagerToolInputStreaming: true },
    modelHeaders: undefined,
  });
  assert.deepEqual(betaValues(oauthHeaders), [
    'existing-beta',
    'claude-code-20250219',
    'oauth-2025-04-20',
    ANTHROPIC_FAST_BETA,
  ]);
});

test('fast reports unsupported models, respects headless mode, and rejects command arguments', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);
  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  extension(harness.pi);
  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness);
  const context = createContext({ cwd: projectDir, model: undefined, hasUI: false });

  await sessionStart({}, context.ctx);
  assert.deepEqual(context.statuses, []);
  await command.handler('', context.ctx);
  assert.match(context.notifications.at(-1).message, /inactive for no-model: no model is selected/);
  await command.handler('status', context.ctx);
  assert.deepEqual(context.notifications.at(-1), { message: 'Usage: /fast', level: 'warning' });
});
