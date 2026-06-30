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

  const handler = handlers.get('agent_end');
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

test('brrr skips disabled, non-interactive, and invalid webhook configurations', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  const configPath = path.join(agentDir, 'extensions', 'brrr.json');
  const fetchCalls = patchFetch(t, async () => ({ status: 202 }));
  const brrrExtension = await loadFreshExtension('extensions/brrr/index.ts');
  const { pi, handlers } = createExtensionHarness();
  brrrExtension(pi);

  const handler = handlers.get('agent_end');
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

  delete process.env.BRRR_WEBHOOK_URL;
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

  const handler = handlers.get('agent_end');
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
