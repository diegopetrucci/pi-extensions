import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'pi-extensions-mutation-tests-'));
const agentDir = path.join(tempRoot, 'agent');
const projectDir = path.join(tempRoot, 'project');
mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
mkdirSync(projectDir, { recursive: true });

async function withAgentDir(run) {
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
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

function createContextCapContext({ model, registryModels = [] }) {
  const uiState = createUI();
  return {
    ...uiState,
    ctx: {
      model,
      hasUI: true,
      ui: uiState.ui,
      modelRegistry: {
        getAll() {
          return registryModels;
        },
      },
    },
  };
}

function createFastContext({ model, isUsingOAuth }) {
  const uiState = createUI();
  return {
    ...uiState,
    ctx: {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted() {
        return false;
      },
      model,
      sessionManager: {},
      ui: uiState.ui,
      modelRegistry: {
        isUsingOAuth(currentModel) {
          assert.equal(currentModel, model);
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

test('context-cap caps large models on session start and restores original windows on shutdown', async () => {
  const contextCapExtension = await loadExtension('extensions/context-cap/index.ts');
  const harness = createExtensionHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const sessionShutdown = getHandler(harness, 'session_shutdown');

  const activeModel = { provider: 'anthropic', id: 'claude-opus-4-8', contextWindow: 500_000 };
  const largeRegistryModel = { provider: 'openai', id: 'gpt-5.5', contextWindow: 300_000 };
  const smallRegistryModel = { provider: 'openai', id: 'gpt-5.5-mini', contextWindow: 128_000 };
  const { ctx } = createContextCapContext({
    model: activeModel,
    registryModels: [largeRegistryModel, smallRegistryModel],
  });

  await sessionStart({}, ctx);
  assert.equal(activeModel.contextWindow, 200_000);
  assert.equal(largeRegistryModel.contextWindow, 200_000);
  assert.equal(smallRegistryModel.contextWindow, 128_000);

  await sessionShutdown({}, ctx);
  assert.equal(activeModel.contextWindow, 500_000);
  assert.equal(largeRegistryModel.contextWindow, 300_000);
  assert.equal(smallRegistryModel.contextWindow, 128_000);
});

test('context-cap status, off, on, and toggle commands report and mutate the session model window', async () => {
  const contextCapExtension = await loadExtension('extensions/context-cap/index.ts');
  const harness = createExtensionHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness, 'context-cap');
  const model = { provider: 'anthropic', id: 'claude-opus-4-8', contextWindow: 400_000 };
  const { ctx, notifications, statuses } = createContextCapContext({ model, registryModels: [model] });

  await sessionStart({}, ctx);
  await command.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Context cap is enabled\./);
  assert.match(notifications.at(-1).message, /anthropic\/claude-opus-4-8/);
  assert.match(notifications.at(-1).message, /200k\/400k effective\/original/);

  await command.handler('off', ctx);
  assert.equal(model.contextWindow, 400_000);
  assert.deepEqual(statuses.at(-1), { key: 'context-cap', value: undefined });
  assert.match(notifications.at(-1).message, /Context cap disabled for this extension session \(1 model window\(s\) restored\)\./);

  await command.handler('on', ctx);
  assert.equal(model.contextWindow, 200_000);
  assert.deepEqual(statuses.at(-1), { key: 'context-cap', value: 'ctx cap 200k' });
  assert.match(notifications.at(-1).message, /Context cap enabled \(1 model window\(s\) capped\/restored\)\./);

  await command.handler('toggle', ctx);
  assert.equal(model.contextWindow, 400_000);
  assert.deepEqual(statuses.at(-1), { key: 'context-cap', value: undefined });
  assert.match(notifications.at(-1).message, /Context cap disabled for this extension session \(1 model window\(s\) restored\)\./);
});

test('openai-fast injects the priority service tier only for eligible OAuth Codex requests', async () => {
  await withAgentDir(async () => {
    const openAIFastExtension = await loadExtension('extensions/openai-fast/index.ts');
    const harness = createExtensionHarness();
    openAIFastExtension(harness.pi);

    const sessionStart = getHandler(harness, 'session_start');
    const beforeProviderRequest = getHandler(harness, 'before_provider_request');
    const command = getCommand(harness, 'fast');
    const model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.4' };
    const { ctx, statuses } = createFastContext({ model, isUsingOAuth: true });

    await sessionStart({}, ctx);
    await command.handler('', ctx);
    const result = await beforeProviderRequest({ payload: { model: 'gpt-5.4', input: 'hello' } }, ctx);

    assert.deepEqual(result, {
      model: 'gpt-5.4',
      input: 'hello',
      service_tier: 'priority',
    });
    assert.deepEqual(statuses.at(-1), { key: 'openai-fast', value: 'fast' });
  });
});

test('openai-fast skips injection for ineligible non-OAuth requests', async () => {
  await withAgentDir(async () => {
    const openAIFastExtension = await loadExtension('extensions/openai-fast/index.ts');
    const harness = createExtensionHarness();
    openAIFastExtension(harness.pi);

    const sessionStart = getHandler(harness, 'session_start');
    const beforeProviderRequest = getHandler(harness, 'before_provider_request');
    const command = getCommand(harness, 'fast');
    const model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' };
    const { ctx, statuses } = createFastContext({ model, isUsingOAuth: false });

    await sessionStart({}, ctx);
    await command.handler('', ctx);
    const result = await beforeProviderRequest({ payload: { model: 'gpt-5.5', input: 'hello' } }, ctx);

    assert.equal(result, undefined);
    assert.deepEqual(statuses.at(-1), { key: 'openai-fast', value: undefined });
  });
});

test('openai-fast never overwrites an existing service tier', async () => {
  await withAgentDir(async () => {
    const openAIFastExtension = await loadExtension('extensions/openai-fast/index.ts');
    const harness = createExtensionHarness();
    openAIFastExtension(harness.pi);

    const sessionStart = getHandler(harness, 'session_start');
    const beforeProviderRequest = getHandler(harness, 'before_provider_request');
    const command = getCommand(harness, 'fast');
    const model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' };
    const { ctx, statuses } = createFastContext({ model, isUsingOAuth: true });
    const payload = { model: 'gpt-5.5', input: 'hello', service_tier: 'default' };

    await sessionStart({}, ctx);
    await command.handler('', ctx);
    const result = await beforeProviderRequest({ payload }, ctx);

    assert.equal(result, undefined);
    assert.deepEqual(payload, { model: 'gpt-5.5', input: 'hello', service_tier: 'default' });
    assert.deepEqual(statuses.at(-1), { key: 'openai-fast', value: 'fast' });
  });
});

test('claude-fast injects speed and preserves OAuth beta headers for eligible Claude Opus requests', async () => {
  await withAgentDir(async () => {
    const claudeFastExtension = await loadExtension('extensions/claude-fast/index.ts');
    const harness = createExtensionHarness();
    claudeFastExtension(harness.pi);

    const sessionStart = getHandler(harness, 'session_start');
    const beforeProviderRequest = getHandler(harness, 'before_provider_request');
    const command = getCommand(harness, 'claude-fast');
    const model = {
      provider: 'anthropic',
      api: 'anthropic-messages',
      id: 'claude-opus-4-8',
      headers: {
        'Anthropic-Beta': 'existing-beta,oauth-2025-04-20',
      },
    };
    const { ctx, statuses } = createFastContext({ model, isUsingOAuth: true });

    await sessionStart({}, ctx);
    await command.handler('', ctx);
    const result = await beforeProviderRequest({ payload: { model: 'claude-opus-4-8', input: 'hello' } }, ctx);

    assert.deepEqual(result, {
      model: 'claude-opus-4-8',
      input: 'hello',
      speed: 'fast',
    });
    assert.deepEqual(readBetaHeader(model), [
      'existing-beta',
      'oauth-2025-04-20',
      'claude-code-20250219',
      'fast-mode-2026-02-01',
    ]);
    assert.equal(model.headers['Anthropic-Beta'], undefined);
    assert.deepEqual(statuses.at(-1), { key: 'claude-fast', value: 'fast' });
  });
});

test('claude-fast removes only the fast beta for ineligible models while preserving OAuth betas', async () => {
  await withAgentDir(async () => {
    const claudeFastExtension = await loadExtension('extensions/claude-fast/index.ts');
    const harness = createExtensionHarness();
    claudeFastExtension(harness.pi);

    const sessionStart = getHandler(harness, 'session_start');
    const beforeProviderRequest = getHandler(harness, 'before_provider_request');
    const command = getCommand(harness, 'claude-fast');
    const model = {
      provider: 'anthropic',
      api: 'anthropic-messages',
      id: 'claude-sonnet-4-5',
      headers: {
        'anthropic-beta': 'fast-mode-2026-02-01,claude-code-20250219,oauth-2025-04-20,existing-beta',
      },
    };
    const { ctx, statuses } = createFastContext({ model, isUsingOAuth: true });

    await sessionStart({}, ctx);
    await command.handler('', ctx);
    const result = await beforeProviderRequest({ payload: { model: 'claude-sonnet-4-5', input: 'hello' } }, ctx);

    assert.equal(result, undefined);
    assert.deepEqual(readBetaHeader(model), [
      'claude-code-20250219',
      'oauth-2025-04-20',
      'existing-beta',
    ]);
    assert.deepEqual(statuses.at(-1), { key: 'claude-fast', value: undefined });
  });
});

test('claude-fast never overwrites an existing speed field', async () => {
  await withAgentDir(async () => {
    const claudeFastExtension = await loadExtension('extensions/claude-fast/index.ts');
    const harness = createExtensionHarness();
    claudeFastExtension(harness.pi);

    const sessionStart = getHandler(harness, 'session_start');
    const beforeProviderRequest = getHandler(harness, 'before_provider_request');
    const command = getCommand(harness, 'claude-fast');
    const model = {
      provider: 'anthropic',
      api: 'anthropic-messages',
      id: 'claude-opus-4-7',
      headers: {},
    };
    const { ctx, statuses } = createFastContext({ model, isUsingOAuth: true });
    const payload = { model: 'claude-opus-4-7', input: 'hello', speed: 'slow' };

    await sessionStart({}, ctx);
    await command.handler('', ctx);
    const result = await beforeProviderRequest({ payload }, ctx);

    assert.equal(result, undefined);
    assert.deepEqual(payload, { model: 'claude-opus-4-7', input: 'hello', speed: 'slow' });
    assert.deepEqual(readBetaHeader(model), [
      'claude-code-20250219',
      'oauth-2025-04-20',
      'fast-mode-2026-02-01',
    ]);
    assert.deepEqual(statuses.at(-1), { key: 'claude-fast', value: 'fast' });
  });
});
