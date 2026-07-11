import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let importCounter = 0;

async function loadFreshExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath));
  moduleUrl.searchParams.set('test', `${Date.now()}-${importCounter++}`);
  const extensionModule = await import(moduleUrl.href);
  return extensionModule.default;
}

function setupTempDirs(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'brrr-extension-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const projectDir = path.join(rootDir, 'workspace', 'sample-project');

  mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  mkdirSync(path.join(projectDir, '.pi'), { recursive: true });
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  return { agentDir, projectDir };
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

function setEnvVar(t, name, value) {
  const original = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  t.after(() => {
    if (original === undefined) {
      delete process.env[name];
      return;
    }
    process.env[name] = original;
  });
}

function writeBrrrConfig(filePath, config) {
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function patchFetch(t, implementation) {
  const original = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return implementation({ url, options });
  };

  t.after(() => {
    globalThis.fetch = original;
  });

  return calls;
}

function captureConsoleErrors(t) {
  const errors = [];
  const original = console.error;

  console.error = (...args) => {
    errors.push(args.map((value) => String(value)).join(' '));
  };

  t.after(() => {
    console.error = original;
  });

  return errors;
}

function createCommandContext({ cwd, hasUI = true, isProjectTrusted = () => true } = {}) {
  const notifications = [];
  const ctx = {
    cwd,
    hasUI,
    isProjectTrusted,
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };

  return { ctx, notifications };
}

function createSettledContext({ cwd, hasUI = true, isProjectTrusted = () => true, messages = [] } = {}) {
  return {
    cwd,
    hasUI,
    isProjectTrusted,
    sessionManager: {
      buildContextEntries() {
        return messages.map((message, index) => ({
          type: 'message',
          id: `entry-${index}`,
          parentId: index === 0 ? null : `entry-${index - 1}`,
          timestamp: new Date(0).toISOString(),
          message,
        }));
      },
    },
  };
}

function getBrrrCommand(commands) {
  const command = commands.get('brrr');
  assert.ok(command, 'expected brrr command to be registered');
  return command;
}

test('brrr subscribes to settled runs and reads the final assistant message from session state', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeBrrrConfig(path.join(agentDir, 'extensions', 'brrr.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: 'https://api.brrr.now/v1/br_settled',
    idleSeconds: null,
    includeLastAssistantMessage: true,
    message: 'Fallback {project}',
  });

  const fetchCalls = patchFetch(t, async () => ({ status: 202 }));
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, handlers } = createExtensionHarness();
  brrrExtension(pi);

  assert.equal(typeof handlers.get('agent_settled'), 'function');
  assert.equal(handlers.has('agent_end'), false);

  await handlers.get('agent_settled')(
    {
      messages: [{ role: 'assistant', content: 'stale agent_end reply' }],
    },
    createSettledContext({
      cwd: projectDir,
      messages: [
        { role: 'assistant', content: 'final settled reply' },
      ],
    }),
  );

  const [{ options }] = fetchCalls;
  assert.deepEqual(JSON.parse(options.body), {
    title: 'Pi finished',
    message: 'final settled reply',
  });
});

test('brrr status command reports webhook resolution and skips UI notifications when unavailable', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, 'BRRR_STATUS_WEBHOOK', 'https://api.brrr.now/v1/br_status_env');
  setEnvVar(t, 'BRRR_STATUS_BRACED_WEBHOOK', 'https://api.brrr.now/v1/br_status_braced');

  const configPath = path.join(agentDir, 'extensions', 'brrr.json');
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, commands } = createExtensionHarness();
  brrrExtension(pi);

  const handler = getBrrrCommand(commands).handler;
  const { ctx, notifications } = createCommandContext({ cwd: projectDir });

  writeBrrrConfig(configPath, {
    enabled: true,
    webhook: '$BRRR_STATUS_WEBHOOK',
    idleSeconds: 5,
  });
  await handler([], ctx);

  writeBrrrConfig(configPath, {
    enabled: false,
    webhook: '${BRRR_STATUS_BRACED_WEBHOOK}',
    idleSeconds: null,
  });
  await handler([], ctx);

  writeBrrrConfig(configPath, {
    enabled: true,
    webhook: 'https://example.com/not-brrr',
    idleSeconds: 1,
  });
  await handler([], ctx);

  const { ctx: noUiCtx, notifications: noUiNotifications } = createCommandContext({ cwd: projectDir, hasUI: false });
  await handler([], noUiCtx);

  assert.deepEqual(notifications, [
    {
      message: 'brrr is enabled; webhook configured; idle threshold 5s.',
      level: 'info',
    },
    {
      message: 'brrr is disabled; webhook configured; idle threshold off.',
      level: 'info',
    },
    {
      message: 'brrr is enabled; webhook invalid; idle threshold 1s.',
      level: 'info',
    },
  ]);
  assert.deepEqual(noUiNotifications, []);
});

test('brrr uses trusted project config over global config and formats webhook payloads', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeBrrrConfig(path.join(agentDir, 'extensions', 'brrr.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: 'https://api.brrr.now/v1/br_global',
    idleSeconds: null,
    title: 'Global {project}',
    message: 'Global {cwd}',
    includeLastAssistantMessage: false,
    sound: 'global-sound',
    openUrl: 'https://global.example/open',
    imageUrl: 'https://global.example/image.png',
  });

  writeBrrrConfig(path.join(projectDir, '.pi', 'brrr.json'), {
    webhook: 'https://api.brrr.now/v1/br_project',
    title: 'Project {project}',
    message: 'Project {cwd}',
    sound: 'project-sound',
    openUrl: 'https://project.example/open',
    imageUrl: 'https://project.example/image.png',
  });

  const fetchCalls = patchFetch(t, async () => ({ status: 202 }));
  const consoleErrors = captureConsoleErrors(t);
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, handlers } = createExtensionHarness();
  brrrExtension(pi);

  const handler = handlers.get('agent_settled');
  assert.equal(typeof handler, 'function');

  const event = {
    messages: [{ role: 'assistant', content: 'This should be ignored by the fallback template.' }],
  };

  await handler(event, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  await handler(event, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => false,
  });

  assert.equal(consoleErrors.length, 0);
  assert.deepEqual(
    fetchCalls.map(({ url, options }) => ({ url, body: JSON.parse(options.body) })),
    [
      {
        url: 'https://api.brrr.now/v1/br_project',
        body: {
          title: 'Project sample-project',
          message: `Project ${projectDir}`,
          sound: 'project-sound',
          open_url: 'https://project.example/open',
          image_url: 'https://project.example/image.png',
        },
      },
      {
        url: 'https://api.brrr.now/v1/br_global',
        body: {
          title: 'Global sample-project',
          message: `Global ${projectDir}`,
          sound: 'global-sound',
          open_url: 'https://global.example/open',
          image_url: 'https://global.example/image.png',
        },
      },
    ],
  );
});

test('brrr resolves $ENV and ${ENV} webhook references when sending notifications', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, 'BRRR_WEBHOOK_DOLLAR', 'https://api.brrr.now/v1/br_env_dollar');
  setEnvVar(t, 'BRRR_WEBHOOK_BRACED', 'https://api.brrr.now/v1/br_env_braced');

  const configPath = path.join(agentDir, 'extensions', 'brrr.json');
  const fetchCalls = patchFetch(t, async () => ({ status: 202 }));
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, handlers } = createExtensionHarness();
  brrrExtension(pi);

  const handler = handlers.get('agent_settled');
  assert.equal(typeof handler, 'function');

  writeBrrrConfig(configPath, {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: '$BRRR_WEBHOOK_DOLLAR',
    idleSeconds: null,
    includeLastAssistantMessage: false,
    message: 'Dollar {project}',
  });

  await handler({ messages: [] }, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  writeBrrrConfig(configPath, {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: '${BRRR_WEBHOOK_BRACED}',
    idleSeconds: null,
    includeLastAssistantMessage: false,
    message: 'Braced {project}',
  });

  await handler({ messages: [] }, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(
    fetchCalls.map(({ url, options }) => ({ url, body: JSON.parse(options.body) })),
    [
      {
        url: 'https://api.brrr.now/v1/br_env_dollar',
        body: {
          title: 'Pi finished',
          message: 'Dollar sample-project',
        },
      },
      {
        url: 'https://api.brrr.now/v1/br_env_braced',
        body: {
          title: 'Pi finished',
          message: 'Braced sample-project',
        },
      },
    ],
  );
});

test('brrr skips disabled, non-interactive, and invalid webhook configurations', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  const configPath = path.join(agentDir, 'extensions', 'brrr.json');
  const fetchCalls = patchFetch(t, async () => ({ status: 202 }));
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, handlers } = createExtensionHarness();
  brrrExtension(pi);

  const handler = handlers.get('agent_settled');
  assert.equal(typeof handler, 'function');

  writeBrrrConfig(configPath, {
    enabled: false,
    onlyWhenInteractive: false,
    webhook: 'https://api.brrr.now/v1/br_disabled',
    idleSeconds: null,
  });

  await handler({ messages: [] }, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  writeBrrrConfig(configPath, {
    enabled: true,
    onlyWhenInteractive: true,
    webhook: 'https://api.brrr.now/v1/br_interactive',
    idleSeconds: null,
  });

  await handler({ messages: [] }, {
    cwd: projectDir,
    hasUI: false,
    isProjectTrusted: () => true,
  });

  writeBrrrConfig(configPath, {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: 'https://example.com/not-brrr',
    idleSeconds: null,
  });

  await handler({ messages: [] }, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  setEnvVar(t, 'BRRR_WEBHOOK_URL', undefined);
  writeBrrrConfig(configPath, {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: '$BRRR_WEBHOOK_URL',
    idleSeconds: null,
  });

  await handler({ messages: [] }, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.equal(fetchCalls.length, 0);
});

test('brrr falls back to the valid config and warns when project config JSON is invalid', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeBrrrConfig(path.join(agentDir, 'extensions', 'brrr.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: 'https://api.brrr.now/v1/br_global_fallback',
    idleSeconds: null,
    includeLastAssistantMessage: false,
    message: 'Global fallback {project}',
  });
  const invalidProjectConfigPath = path.join(projectDir, '.pi', 'brrr.json');
  writeFileSync(invalidProjectConfigPath, '{ invalid json\n');

  const fetchCalls = patchFetch(t, async () => ({ status: 202 }));
  const consoleErrors = captureConsoleErrors(t);
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, handlers } = createExtensionHarness();
  brrrExtension(pi);

  const handler = handlers.get('agent_settled');
  assert.equal(typeof handler, 'function');

  await handler({ messages: [] }, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(
    fetchCalls.map(({ url, options }) => ({ url, body: JSON.parse(options.body) })),
    [
      {
        url: 'https://api.brrr.now/v1/br_global_fallback',
        body: {
          title: 'Pi finished',
          message: 'Global fallback sample-project',
        },
      },
    ],
  );
  assert.equal(consoleErrors.length, 1);
  assert.match(consoleErrors[0], new RegExp(`Warning: Could not parse ${invalidProjectConfigPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`));
});

test('brrr extracts only text parts from the latest structured assistant message', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeBrrrConfig(path.join(agentDir, 'extensions', 'brrr.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: 'https://api.brrr.now/v1/br_structured',
    idleSeconds: null,
    includeLastAssistantMessage: true,
    message: 'Fallback {project}',
  });

  const fetchCalls = patchFetch(t, async () => ({ status: 202 }));
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, handlers } = createExtensionHarness();
  brrrExtension(pi);

  const handler = handlers.get('agent_settled');
  assert.equal(typeof handler, 'function');

  await handler(
    {
      messages: [
        { role: 'assistant', content: 'Older reply that should not be used.' },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Ignore me' },
            { type: 'tool_result', text: 'Ignore tool output' },
            { type: 'text', text: 'Structured line 1' },
            { type: 'text', text: 'Structured line 2' },
          ],
        },
      ],
    },
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  const [{ options }] = fetchCalls;
  assert.deepEqual(JSON.parse(options.body), {
    title: 'Pi finished',
    message: 'Structured line 1\nStructured line 2',
  });
});

test('brrr skips empty latest assistant content and falls back to the configured template', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeBrrrConfig(path.join(agentDir, 'extensions', 'brrr.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: 'https://api.brrr.now/v1/br_skip_latest_empty',
    idleSeconds: null,
    includeLastAssistantMessage: true,
    message: 'Fallback {project}',
  });

  const fetchCalls = patchFetch(t, async () => ({ status: 202 }));
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, handlers } = createExtensionHarness();
  brrrExtension(pi);

  const handler = handlers.get('agent_settled');
  assert.equal(typeof handler, 'function');

  await handler(
    {
      messages: [
        { role: 'assistant', content: 'Older reply that should be ignored.' },
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'bash', arguments: { command: 'pwd' } },
            { type: 'image', source: 'ignored' },
            { type: 'text', text: '   ' },
          ],
        },
      ],
    },
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  const [{ options }] = fetchCalls;
  assert.deepEqual(JSON.parse(options.body), {
    title: 'Pi finished',
    message: 'Fallback sample-project',
  });
});

test('brrr uses the last assistant message, truncates payloads, and logs webhook failures', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeBrrrConfig(path.join(agentDir, 'extensions', 'brrr.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    webhook: 'https://api.brrr.now/v1/br_failure',
    idleSeconds: null,
    title: 'Done {project}',
    message: 'Fallback {project}',
    includeLastAssistantMessage: true,
    sound: '   ',
    openUrl: '',
    imageUrl: '  ',
  });

  const fetchCalls = patchFetch(t, async () => ({ status: 500 }));
  const consoleErrors = captureConsoleErrors(t);
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, handlers } = createExtensionHarness();
  brrrExtension(pi);

  const handler = handlers.get('agent_settled');
  assert.equal(typeof handler, 'function');

  const assistantMessage = `${'x'.repeat(805)}\n`;
  await assert.doesNotReject(() =>
    handler(
      {
        messages: [
          { role: 'user', content: 'Ignore me' },
          { role: 'assistant', content: assistantMessage },
        ],
      },
      {
        cwd: projectDir,
        hasUI: true,
        isProjectTrusted: () => true,
      },
    ),
  );

  const [{ url, options }] = fetchCalls;
  assert.equal(url, 'https://api.brrr.now/v1/br_failure');
  assert.deepEqual(JSON.parse(options.body), {
    title: 'Done sample-project',
    message: `${'x'.repeat(797)}...`,
  });
  assert.deepEqual(consoleErrors, ['brrr notification failed: Unexpected response status 500.']);
});
