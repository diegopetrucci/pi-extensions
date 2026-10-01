import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

function createTool(name, execute = async () => ({ content: [{ type: 'text', text: 'fixture' }] })) {
  return {
    name,
    label: name,
    description: `Fixture ${name}`,
    parameters: Type.Object({}),
    execute,
  };
}

test('Pi 0.99 explicit tool allowlists block built-in, MCP, extension, and custom execution paths while loading resources', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-child-tool-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const skillDir = path.join(root, 'fixture-skill');
  const promptDir = path.join(root, 'fixture-prompts');
  const themeDir = path.join(root, 'fixture-themes');
  await Promise.all([mkdir(skillDir), mkdir(promptDir), mkdir(themeDir)]);
  const themeColorNames = [
    'accent', 'border', 'borderAccent', 'borderMuted', 'success', 'error', 'warning', 'muted', 'dim', 'text',
    'thinkingText', 'selectedBg', 'userMessageBg', 'userMessageText', 'customMessageBg', 'customMessageText',
    'customMessageLabel', 'toolPendingBg', 'toolSuccessBg', 'toolErrorBg', 'toolTitle', 'toolOutput', 'mdHeading',
    'mdLink', 'mdLinkUrl', 'mdCode', 'mdCodeBlock', 'mdCodeBlockBorder', 'mdQuote', 'mdQuoteBorder', 'mdHr',
    'mdListBullet', 'toolDiffAdded', 'toolDiffRemoved', 'toolDiffContext', 'syntaxComment', 'syntaxKeyword',
    'syntaxFunction', 'syntaxVariable', 'syntaxString', 'syntaxNumber', 'syntaxType', 'syntaxOperator',
    'syntaxPunctuation', 'thinkingOff', 'thinkingMinimal', 'thinkingLow', 'thinkingMedium', 'thinkingHigh',
    'thinkingXhigh', 'thinkingMax', 'bashMode',
  ];
  const fixtureTheme = JSON.stringify({
    name: 'fixture-theme',
    colors: Object.fromEntries(themeColorNames.map((name) => [name, '#00ff00'])),
  });
  await Promise.all([
    writeFile(path.join(root, 'AGENTS.md'), 'Fixture project instructions.\n'),
    writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: fixture-skill\ndescription: Fixture skill\n---\nUse the fixture skill.\n',
    ),
    writeFile(
      path.join(promptDir, 'fixture.md'),
      '---\ndescription: Fixture prompt\n---\nUse the fixture prompt.\n',
    ),
    writeFile(path.join(themeDir, 'fixture.json'), `${fixtureTheme}\n`),
  ]);

  const markers = {
    sessionStarts: 0,
    toolCalls: [],
    discoveredProviders: [],
  };
  const extensionModel = {
    provider: 'fixture-extension',
    id: 'extension-model',
    api: 'openai-completions',
    name: 'extension model',
    reasoning: false,
    input: ['text'],
    contextWindow: 16_000,
    maxTokens: 1_000,
    baseUrl: 'http://fixture.invalid',
  };
  const model = {
    provider: 'fixture',
    id: 'fixture-model',
    api: 'openai-completions',
    name: 'fixture model',
    reasoning: false,
    input: ['text'],
    contextWindow: 16_000,
    maxTokens: 1_000,
    baseUrl: 'http://fixture.invalid',
  };
  const registeredProviders = new Map();
  let authLookups = 0;
  const modelRuntime = {
    getModel(provider, id) {
      if (provider === model.provider && id === model.id) return model;
      if (provider === extensionModel.provider && id === extensionModel.id) return extensionModel;
      return undefined;
    },
    registerProvider(provider, config) {
      registeredProviders.set(provider, config);
      markers.discoveredProviders.push(provider);
    },
    hasConfiguredAuth() {
      authLookups += 1;
      return true;
    },
    async getAuth() {
      authLookups += 1;
      return { type: 'api_key', apiKey: 'fixture-only' };
    },
    async streamSimple() {
      throw new Error('fixture session must not contact a provider');
    },
  };

  const fixtureExtension = (pi) => {
    pi.registerProvider('fixture-extension', {
      baseUrl: 'http://fixture.invalid',
      api: 'openai-completions',
      apiKey: 'fixture-only',
      models: [{
        id: extensionModel.id,
        name: extensionModel.name,
        input: ['text'],
        reasoning: false,
        contextWindow: extensionModel.contextWindow,
        maxTokens: extensionModel.maxTokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }],
    });
    pi.registerTool(createTool('extension_fixture_tool', async () => {
      markers.toolCalls.push('extension_fixture_tool');
      return { content: [{ type: 'text', text: 'should not execute' }] };
    }));
    pi.registerTool({
      ...createTool('mcp__fixture__tool', async () => {
        markers.toolCalls.push('mcp__fixture__tool');
        return { content: [{ type: 'text', text: 'should not execute' }] };
      }),
      namespace: { name: 'mcp__fixture', description: 'Fixture MCP namespace' },
    });
    pi.on('session_start', () => {
      markers.sessionStarts += 1;
      pi.registerMcpServer('fixture', { command: 'fixture-server-not-run', enabled: false });
    });
    pi.on('tool_call', (event) => {
      markers.toolCalls.push(event.toolName);
    });
    pi.on('resources_discover', () => ({
      skillPaths: [skillDir],
      promptPaths: [promptDir],
      themePaths: [themeDir],
    }));
  };

  const settingsManager = SettingsManager.inMemory({
    defaultTools: ['read', 'bash', 'write', 'edit', 'codemode', 'mcp__fixture__tool', 'extension_fixture_tool'],
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: root,
    agentDir: root,
    settingsManager,
    extensionFactories: [
      createCodemodeExtension(),
      createMcpExtension({
        loadConfig: () => ({ servers: [], errors: [] }),
        startupWaitMs: 0,
      }),
      fixtureExtension,
    ],
  });
  await resourceLoader.reload();

  const created = await createAgentSession({
    cwd: root,
    agentDir: root,
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(root),
    model,
    thinkingLevel: 'off',
    tools: ['read'],
    customTools: [createTool('custom_fixture_tool', async () => {
      markers.toolCalls.push('custom_fixture_tool');
      return { content: [{ type: 'text', text: 'should not execute' }] };
    })],
  });

  try {
    await created.session.bindExtensions({ mode: 'json' });

    assert.equal(markers.sessionStarts, 1, 'discovered extension hooks must still run');
    assert.ok(registeredProviders.has('fixture-extension'), 'provider extensions must still register');
    assert.ok(created.extensionsResult.extensions.length >= 3, 'resource extensions must remain discoverable');
    assert.ok(resourceLoader.getExtensions().extensions.length >= 3, 'resource loader must retain discovered extensions');
    assert.ok(resourceLoader.getSkills().skills.some((skill) => skill.name === 'fixture-skill'));
    assert.ok(resourceLoader.getPrompts().prompts.some((prompt) => prompt.name === 'fixture'));
    assert.ok(resourceLoader.getThemes().themes.some((theme) => theme.name === 'fixture-theme'));
    assert.match(resourceLoader.getAgentsFiles().agentsFiles.map((file) => file.content).join('\n'), /Fixture project instructions/);

    const blockedNames = [
      'bash',
      'write',
      'edit',
      'codemode',
      'mcp__fixture__tool',
      'extension_fixture_tool',
      'custom_fixture_tool',
    ];
    assert.deepEqual(created.session.getActiveToolNames(), ['read']);
    assert.deepEqual(created.session.getCallableToolNames(), ['read']);
    assert.deepEqual(created.session.getAllTools().map((tool) => tool.name), ['read']);
    for (const name of blockedNames) {
      assert.equal(created.session.getToolDefinition(name), undefined, `${name} must not be executable`);
    }
    created.session.setActiveToolsByName(['read', ...blockedNames]);
    assert.deepEqual(created.session.getActiveToolNames(), ['read'], 'the allowlist must prevent reactivation');
    assert.deepEqual(markers.toolCalls, [], 'blocked tools must not execute');
    assert.equal(authLookups, 0, 'loadout inspection must not resolve credentials');
  } finally {
    created.session.dispose();
  }
});
