import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CONFIG_DIR_NAME } from '@earendil-works/pi-coding-agent';
import { streamSimple as streamAnthropicSimple } from '@earendil-works/pi-ai/api/anthropic-messages';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

const OPENAI_CODEX_MODELS = ['gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna'];
const OPENAI_API_MODELS = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'];
const ANTHROPIC_MODELS = ['claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5'];
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
  const oauthCalls = [];
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
      isUsingOAuth(currentModel) {
        oauthCalls.push(currentModel);
        return oauth;
      },
      async getProviderAuth() {
        const apiKey = authToken ?? (oauth ? 'sk-ant-oat-test' : 'sk-ant-api-test');
        return { auth: { apiKey } };
      },
    },
  };
  return { ctx, statuses, notifications, oauthCalls };
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

  context.ctx.model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.6-sol' };
  await modelSelect({ model: context.ctx.model }, context.ctx);
  assert.deepEqual(
    await beforeRequest({ payload: { model: 'gpt-5.6-sol', input: 'again' } }, context.ctx),
    { model: 'gpt-5.6-sol', input: 'again', service_tier: 'priority' },
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

  for (const id of OPENAI_CODEX_MODELS) {
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

test('fast preserves direct OpenAI API-key and OAuth payload behavior without live certification', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);
  writeConfig(path.join(agentDir, 'extensions', 'fast.json'), { enabled: true });

  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  extension(harness.pi);
  const sessionStart = getHandler(harness, 'session_start');
  const beforeRequest = getHandler(harness, 'before_provider_request');

  for (const api of ['openai-responses', 'openai-completions']) {
    for (const id of OPENAI_API_MODELS) {
      for (const oauth of [false, true]) {
        const context = createContext({
          cwd: projectDir,
          model: { provider: 'openai', api, id },
          oauth,
        });
        await sessionStart({}, context.ctx);
        assert.deepEqual(await beforeRequest({ payload: { model: id, input: 'hello' } }, context.ctx), {
          model: id,
          input: 'hello',
          service_tier: 'fast',
        });
        assert.deepEqual(context.statuses.at(-1), { key: 'fast', value: 'fast' });
        assert.deepEqual(context.oauthCalls, [], 'direct OpenAI auth must not be routed through Codex auth checks');
      }
    }
  }

  const directApiContext = createContext({
    cwd: projectDir,
    model: { provider: 'openai', api: 'openai-responses', id: 'gpt-6-astra' },
    oauth: true,
  });
  await sessionStart({}, directApiContext.ctx);
  const existingTierPayload = { model: 'gpt-6-astra', input: 'hello', service_tier: 'default' };
  assert.equal(await beforeRequest({ payload: existingTierPayload }, directApiContext.ctx), undefined);
  assert.deepEqual(existingTierPayload, {
    model: 'gpt-6-astra',
    input: 'hello',
    service_tier: 'default',
  });

  for (const model of [
    { provider: 'openai', api: 'openai-responses', id: 'gpt-5.6-sol' },
    { provider: 'openai', api: 'openai-responses', id: 'gpt-6.1-sol-fast' },
    { provider: 'openai', api: 'openai-responses', id: 'gpt-6.1-sol-pro' },
    { provider: 'openai', api: 'openai-codex-responses', id: 'gpt-6-astra' },
    { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.3-codex-spark' },
  ]) {
    const context = createContext({ cwd: projectDir, model, oauth: true });
    await sessionStart({}, context.ctx);
    assert.equal(
      await beforeRequest({ payload: { model: model.id, input: 'hello' } }, context.ctx),
      undefined,
      `${model.provider}/${model.api}/${model.id} must remain ineligible`,
    );
    assert.deepEqual(context.statuses.at(-1), { key: 'fast', value: undefined });
  }
});

test('fast enables direct GPT-6.1 Sol only after toggling', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);

  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  extension(harness.pi);
  const sessionStart = getHandler(harness, 'session_start');
  const beforeRequest = getHandler(harness, 'before_provider_request');
  const command = getCommand(harness);

  const direct = createContext({
    cwd: projectDir,
    model: { provider: 'openai', api: 'openai-responses', id: 'gpt-6.1-sol' },
    oauth: false,
  });
  await sessionStart({}, direct.ctx);
  const disabledPayload = { model: 'gpt-6.1-sol', input: 'disabled' };
  assert.equal(await beforeRequest({ payload: disabledPayload }, direct.ctx), undefined);
  assert.deepEqual(disabledPayload, { model: 'gpt-6.1-sol', input: 'disabled' });
  assert.deepEqual(direct.statuses.at(-1), { key: 'fast', value: undefined });
  assert.deepEqual(direct.oauthCalls, [], 'API-key direct OpenAI auth must not use Codex OAuth checks');

  await command.handler('', direct.ctx);
  assert.match(
    direct.notifications.at(-1).message,
    /active for openai\/gpt-6\.1-sol; requests will use service_tier=fast\./,
  );
  assert.deepEqual(
    await beforeRequest({ payload: { model: 'gpt-6.1-sol', input: 'enabled' } }, direct.ctx),
    { model: 'gpt-6.1-sol', input: 'enabled', service_tier: 'fast' },
  );

});

for (const id of ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna']) {
  test(`fast gates Codex ${id} priority injection on OAuth and an explicit toggle`, async (t) => {
    const { agentDir, projectDir } = setupTempDirs(t);
    setAgentDir(t, agentDir);
    const extension = await loadExtension('extensions/fast/index.ts');
    const harness = createExtensionHarness();
    extension(harness.pi);
    const sessionStart = getHandler(harness, 'session_start');
    const beforeRequest = getHandler(harness, 'before_provider_request');
    const beforeHeaders = getHandler(harness, 'before_provider_headers');
    const command = getCommand(harness);
    const model = { provider: 'openai-codex', api: 'openai-codex-responses', id };
    const context = createContext({ cwd: projectDir, model, oauth: true });
    const payload = { model: id, input: 'hello' };

    await sessionStart({}, context.ctx);
    assert.equal(await beforeRequest({ payload }, context.ctx), undefined);
    assert.deepEqual(context.statuses.at(-1), { key: 'fast', value: undefined });
    await command.handler('', context.ctx);
    assert.ok(context.notifications.at(-1).message.includes(`active for openai-codex/${id}; requests will use service_tier=priority.`));
    assert.deepEqual(await beforeRequest({ payload }, context.ctx), { ...payload, service_tier: 'priority' });
    assert.deepEqual(payload, { model: id, input: 'hello' });
    assert.deepEqual(context.statuses.at(-1), { key: 'fast', value: 'fast' });
    const headers = { 'x-test': 'unchanged' };
    await beforeHeaders({ headers }, context.ctx);
    assert.deepEqual(headers, { 'x-test': 'unchanged' });

    for (const service_tier of ['default', 'flex', 'fast', 'priority', null]) {
      const existing = { ...payload, service_tier };
      assert.equal(await beforeRequest({ payload: existing }, context.ctx), undefined);
      assert.deepEqual(existing, { ...payload, service_tier });
    }
    assert.equal(await beforeRequest({ payload: { model: `${id}-pro` } }, context.ctx), undefined);
    await command.handler('', context.ctx);
    assert.equal(await beforeRequest({ payload }, context.ctx), undefined);
    await command.handler('', context.ctx);
    await sessionStart({}, context.ctx);
    assert.equal(await beforeRequest({ payload }, context.ctx), undefined, 'session start resets the toggle');

    for (const blocked of [
      { model, oauth: false },
      { model: { ...model, provider: 'unsupported' }, oauth: true },
      { model: { ...model, api: 'openai-responses' }, oauth: true },
      { model: { ...model, id: `${id}-pro` }, oauth: true },
    ]) {
      const denied = createContext({ cwd: projectDir, ...blocked });
      await sessionStart({}, denied.ctx);
      await command.handler('', denied.ctx);
      const deniedPayload = { model: blocked.model.id };
      assert.equal(await beforeRequest({ payload: deniedPayload }, denied.ctx), undefined);
      assert.deepEqual(deniedPayload, { model: blocked.model.id });
      assert.deepEqual(denied.statuses.at(-1), { key: 'fast', value: undefined });
    }
  });
}

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
    model: { provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-4-8' },
  });
  await sessionStart({}, context.ctx);

  assert.equal(await beforeRequest({ payload: ['bad'] }, context.ctx), undefined);
  assert.equal(await beforeRequest({ payload: { model: 'claude-opus-5' } }, context.ctx), undefined);
  const speedPayload = { model: 'claude-opus-4-8', speed: 'standard' };
  assert.equal(await beforeRequest({ payload: speedPayload }, context.ctx), undefined);
  assert.deepEqual(speedPayload, { model: 'claude-opus-4-8', speed: 'standard' });

  context.ctx.model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' };
  context.ctx.modelRegistry.isUsingOAuth = () => true;
  const tierPayload = { model: 'gpt-5.5', service_tier: 'default' };
  assert.equal(await beforeRequest({ payload: tierPayload }, context.ctx), undefined);
  assert.deepEqual(tierPayload, { model: 'gpt-5.5', service_tier: 'default' });
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
      id: 'claude-opus-4-8',
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

test('fast treats removed models gpt-5.4, claude-opus-4-6, and claude-opus-4-7 as ineligible', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDir(t, agentDir);
  writeConfig(path.join(agentDir, 'extensions', 'fast.json'), { enabled: true });

  const extension = await loadExtension('extensions/fast/index.ts');
  const harness = createExtensionHarness();
  extension(harness.pi);
  const sessionStart = getHandler(harness, 'session_start');
  const beforeRequest = getHandler(harness, 'before_provider_request');

  for (const id of ['gpt-5.4']) {
    const context = createContext({
      cwd: projectDir,
      model: { provider: 'openai-codex', api: 'openai-codex-responses', id },
      oauth: true,
    });
    await sessionStart({}, context.ctx);
    assert.equal(
      await beforeRequest({ payload: { model: id, input: 'hello' } }, context.ctx),
      undefined,
      `expected ${id} to be ineligible`,
    );
  }

  for (const id of ['claude-opus-4-6', 'claude-opus-4-7']) {
    const context = createContext({
      cwd: projectDir,
      model: { provider: 'anthropic', api: 'anthropic-messages', id },
      oauth: false,
    });
    await sessionStart({}, context.ctx);
    assert.equal(
      await beforeRequest({ payload: { model: id } }, context.ctx),
      undefined,
      `expected ${id} to be ineligible`,
    );
  }
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
