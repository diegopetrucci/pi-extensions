import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  AgentSession,
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

test('Pi 1.0 explicit tool allowlists block built-in, MCP, extension, and custom execution paths while loading resources', async (t) => {
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

const boundaryToolNames = [
  'read',
  'bash',
  'powershell',
  'edit',
  'write',
  'grep',
  'find',
  'ls',
  'codemode',
  'mcp__fixture__tool',
  'extension_fixture_tool',
  'late_direct',
  'late_deferred',
  'custom_fixture_tool',
];

const boundaryThemeColorNames = `
  accent border borderAccent borderMuted success error warning muted dim text
  thinkingText selectedBg userMessageBg userMessageText customMessageBg customMessageText
  customMessageLabel toolPendingBg toolSuccessBg toolErrorBg toolTitle toolOutput mdHeading
  mdLink mdLinkUrl mdCode mdCodeBlock mdCodeBlockBorder mdQuote mdQuoteBorder mdHr
  mdListBullet toolDiffAdded toolDiffRemoved toolDiffContext syntaxComment syntaxKeyword
  syntaxFunction syntaxVariable syntaxString syntaxNumber syntaxType syntaxOperator
  syntaxPunctuation thinkingOff thinkingMinimal thinkingLow thinkingMedium thinkingHigh
  thinkingXhigh thinkingMax bashMode
`.trim().split(/\s+/);

function createBoundaryTool(name, { exposure = 'direct', execute = async () => ({ content: [{ type: 'text', text: 'fixture' }] }) } = {}) {
  return {
    name,
    label: name,
    description: `Boundary fixture ${name}`,
    promptSnippet: `Boundary fixture ${name}`,
    parameters: Type.Object({}),
    exposure,
    annotations: { readOnlyHint: true, idempotentHint: true },
    execute,
  };
}

async function createBoundaryResources(root) {
  const skillDir = path.join(root, 'boundary-skill');
  const promptDir = path.join(root, 'boundary-prompts');
  const themeDir = path.join(root, 'boundary-themes');
  await Promise.all([mkdir(skillDir), mkdir(promptDir), mkdir(themeDir)]);
  await Promise.all([
    writeFile(path.join(root, 'AGENTS.md'), 'Boundary project instructions.\n'),
    writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: boundary-skill\ndescription: Boundary skill\n---\nUse the boundary skill.\n',
    ),
    writeFile(
      path.join(promptDir, 'boundary.md'),
      '---\ndescription: Boundary prompt\n---\nUse the boundary prompt.\n',
    ),
    writeFile(
      path.join(themeDir, 'boundary.json'),
      `${JSON.stringify({
        name: 'boundary-theme',
        colors: Object.fromEntries(boundaryThemeColorNames.map((name) => [name, '#00ff00'])),
      })}\n`,
    ),
  ]);
  return { skillDir, promptDir, themeDir };
}

function assertBoundarySurface(session, allowlist, phase) {
  const active = session.getActiveToolNames();
  const callable = session.getCallableToolNames();
  const definitions = session.getAllTools();
  const definitionNames = definitions.map((tool) => tool.name);
  const allowed = new Set(allowlist);

  assert.ok(active.every((name) => allowed.has(name)), `${phase}: active tools escaped the allowlist`);
  assert.ok(callable.every((name) => allowed.has(name)), `${phase}: callable tools escaped the allowlist`);
  assert.ok(definitionNames.every((name) => allowed.has(name)), `${phase}: definitions escaped the allowlist`);
  for (const name of boundaryToolNames) {
    if (allowed.has(name)) {
      assert.ok(session.getToolDefinition(name), `${phase}: allowed tool ${name} must remain registered`);
    } else {
      assert.equal(session.getToolDefinition(name), undefined, `${phase}: blocked tool ${name} must not have a definition`);
      assert.equal(active.includes(name), false, `${phase}: blocked tool ${name} must not be active`);
      assert.equal(callable.includes(name), false, `${phase}: blocked tool ${name} must not be callable`);
      assert.equal(definitionNames.includes(name), false, `${phase}: blocked tool ${name} must not be listed`);
    }
  }
}

function assertBoundaryPositiveControls(session, phase) {
  assert.ok(session.getActiveToolNames().includes('late_direct'), `${phase}: allowed late direct tool must activate`);
  assert.ok(session.getCallableToolNames().includes('late_deferred'), `${phase}: allowed deferred tool must remain callable`);
  const lateDirect = session.getAllTools().find((tool) => tool.name === 'late_direct');
  assert.deepEqual(lateDirect?.annotations, { readOnlyHint: true, idempotentHint: true }, `${phase}: tool annotations changed`);
}

function assertRestoredBoundaryPositiveControls(session, phase) {
  assertBoundaryPositiveControls(session, phase);
  assert.ok(
    session.getActiveToolNames().includes('late_deferred'),
    `${phase}: restored transcript must activate the allowed deferred tool`,
  );
}

async function createBoundaryScenario(scenario) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-tool-boundary-'));
  const agentDir = path.join(root, 'agent');
  await mkdir(agentDir);
  await createBoundaryResources(root);

  const expandedDefaultTools = [
    'read',
    'bash',
    'powershell',
    'edit',
    'write',
    'grep',
    'find',
    'ls',
    'codemode',
    'mcp__fixture__tool',
    'extension_fixture_tool',
    'late_direct',
    'late_deferred',
    'custom_fixture_tool',
  ];
  await writeFile(path.join(agentDir, 'settings.json'), JSON.stringify({ defaultTools: ['read'] }));

  const markers = {
    sessionStarts: 0,
    sessionStartReasons: [],
    resourceDiscoveries: 0,
    toolCalls: [],
    registeredProviders: [],
    providerStreams: 0,
    credentialLookups: 0,
    rawProviderStreams: 0,
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
  const modelRuntime = {
    getModel(provider, id) {
      if (provider === model.provider && id === model.id) return model;
      if (provider === extensionModel.provider && id === extensionModel.id) return extensionModel;
      return undefined;
    },
    registerProvider(provider) {
      markers.registeredProviders.push(typeof provider === 'string' ? provider : provider.id);
    },
    hasConfiguredAuth() {
      markers.credentialLookups += 1;
      throw new Error('unexpected real credential lookup');
    },
    async getAuth() {
      markers.credentialLookups += 1;
      throw new Error('unexpected real credential lookup');
    },
    async streamSimple() {
      markers.providerStreams += 1;
      throw new Error('unexpected provider request');
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
    pi.registerTool(createBoundaryTool('extension_fixture_tool'));
    pi.registerTool({
      ...createBoundaryTool('mcp__fixture__tool'),
      namespace: { name: 'mcp__fixture', description: 'Boundary MCP namespace' },
    });
    pi.on('session_start', (event) => {
      markers.sessionStarts += 1;
      markers.sessionStartReasons.push(event.reason);
      pi.registerTool(createBoundaryTool('late_direct'));
      pi.registerTool(createBoundaryTool('late_deferred', { exposure: 'deferred' }));
      pi.registerMcpServer('fixture', { command: 'fixture-server-not-run', enabled: false });
    });
    pi.on('tool_call', (event) => {
      markers.toolCalls.push(event.toolName);
    });
    pi.on('resources_discover', () => {
      markers.resourceDiscoveries += 1;
      return {
        skillPaths: [path.join(root, 'boundary-skill')],
        promptPaths: [path.join(root, 'boundary-prompts')],
        themePaths: [path.join(root, 'boundary-themes')],
      };
    });
  };

  const settingsManager = SettingsManager.create(root, agentDir);
  const extensionFactories = [
    createCodemodeExtension(),
    createMcpExtension({
      loadConfig: () => ({ servers: [], errors: [] }),
      startupWaitMs: 0,
    }),
    fixtureExtension,
  ];
  const resourceLoader = new DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager,
    extensionFactories,
  });
  await resourceLoader.reload();
  return {
    root,
    agentDir,
    expandedDefaultTools,
    extensionFactories,
    markers,
    model,
    modelRuntime,
    resourceLoader,
    settingsManager,
    scenario,
  };
}

async function createRestoredBoundarySession(
  environment,
  createdSession,
  { includeTranscript = true, transcriptTools = boundaryToolNames, onExtensionError } = {},
) {
  const transcriptSource = SessionManager.inMemory(environment.root);
  if (includeTranscript) {
    transcriptSource.appendMessage({
      role: 'system',
      content: 'Restored boundary transcript.',
      toolsAdded: transcriptTools.map((name) => ({
        name,
        description: `Restored ${name}`,
        parameters: Type.Object({}),
      })),
      timestamp: Date.now(),
    });
  }
  const sessionManager = SessionManager.inMemory(environment.root, undefined, transcriptSource.getEntries());
  const restoredContext = sessionManager.buildSessionContext();
  const restorationToolNames = restoredContext.messages
    .find((message) => message.role === 'system')?.toolsAdded?.map((tool) => tool.name) ?? [];
  const settingsManager = SettingsManager.create(environment.root, environment.agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: environment.root,
    agentDir: environment.agentDir,
    settingsManager,
    extensionFactories: environment.extensionFactories,
  });
  await resourceLoader.reload();

  const Agent = createdSession.agent.constructor;
  const agent = new Agent({
    initialState: {
      systemPrompt: '',
      model: environment.model,
      thinkingLevel: 'off',
      tools: [],
      messages: restoredContext.messages,
    },
    convertToLlm: createdSession.agent.convertToLlm,
    streamFn: async () => {
      environment.markers.rawProviderStreams += 1;
      throw new Error('unexpected restored-session provider request');
    },
    sessionId: sessionManager.getSessionId(),
  });
  const session = new AgentSession({
    agent,
    sessionManager,
    settingsManager,
    cwd: environment.root,
    resourceLoader,
    customTools: [createBoundaryTool('custom_fixture_tool')],
    modelRuntime: environment.modelRuntime,
    allowedToolNames: environment.scenario.allowlist,
    usesDefaultTools: false,
  });
  await session.bindExtensions({ mode: 'json', onError: onExtensionError });
  return { session, restorationToolNames };
}

test('Pi 1.0 child allowlists survive real reloads, late registrations, and restored transcripts', async (t) => {
  const scenarios = [
    { name: 'empty allowlist', allowlist: [] },
    { name: 'read allowlist', allowlist: ['read'] },
    { name: 'read+bash allowlist', allowlist: ['read', 'bash'] },
    { name: 'research read+grep+find+ls+bash allowlist', allowlist: ['read', 'grep', 'find', 'ls', 'bash'] },
    {
      name: 'late direct/deferred positive controls',
      allowlist: ['read', 'extension_fixture_tool', 'custom_fixture_tool', 'late_direct', 'late_deferred'],
      positive: true,
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async (caseTest) => {
      const environment = await createBoundaryScenario(scenario);
      caseTest.after(() => rm(environment.root, { recursive: true, force: true }));
      let created;
      let restored;
      let absentTranscript;
      let emptyTranscript;
      const extensionErrors = [];
      const captureExtensionError = (error) => extensionErrors.push(error);
      try {
        created = await createAgentSession({
          cwd: environment.root,
          agentDir: environment.agentDir,
          modelRuntime: environment.modelRuntime,
          resourceLoader: environment.resourceLoader,
          settingsManager: environment.settingsManager,
          sessionManager: SessionManager.inMemory(environment.root),
          model: environment.model,
          thinkingLevel: 'off',
          tools: scenario.allowlist,
          customTools: [createBoundaryTool('custom_fixture_tool')],
        });
        await created.session.bindExtensions({ mode: 'json', onError: captureExtensionError });

        assert.equal(environment.settingsManager.getDefaultTools()?.join(','), 'read');
        assertBoundarySurface(created.session, scenario.allowlist, 'startup');
        assert.deepEqual(environment.markers.sessionStartReasons, ['startup']);
        assert.equal(environment.markers.sessionStarts, 1, 'session_start hooks must run during binding');
        assert.ok(environment.markers.registeredProviders.includes('fixture-extension'), 'provider discovery must remain enabled');
        assert.ok(environment.markers.resourceDiscoveries > 0, 'resource discovery hooks must remain enabled');
        assert.ok(created.extensionsResult.extensions.length >= 3, 'extension discovery must remain enabled');
        assert.ok(environment.resourceLoader.getExtensions().extensions.length >= 3, 'resource loader must retain extensions');
        assert.ok(environment.resourceLoader.getSkills().skills.some((skill) => skill.name === 'boundary-skill'));
        assert.ok(environment.resourceLoader.getPrompts().prompts.some((prompt) => prompt.name === 'boundary'));
        assert.ok(environment.resourceLoader.getThemes().themes.some((theme) => theme.name === 'boundary-theme'));
        assert.match(environment.resourceLoader.getAgentsFiles().agentsFiles.map((file) => file.content).join('\n'), /Boundary project instructions/);
        if (scenario.positive) assertBoundaryPositiveControls(created.session, 'startup');

        await writeFile(
          path.join(environment.agentDir, 'settings.json'),
          JSON.stringify({ defaultTools: environment.expandedDefaultTools }),
        );
        await created.session.reload();
        assert.deepEqual(environment.settingsManager.getDefaultTools(), environment.expandedDefaultTools);
        assertBoundarySurface(created.session, scenario.allowlist, 'reload');
        assert.ok(environment.markers.sessionStartReasons.includes('reload'), 'reload must emit a reload lifecycle event');
        assert.ok(environment.markers.sessionStarts >= 2, 'reload must run the session_start hook');
        assert.ok(environment.markers.resourceDiscoveries >= 2, 'reload must preserve resources_discover hooks');
        if (scenario.positive) assertBoundaryPositiveControls(created.session, 'reload');

        created.session.setActiveToolsByName(boundaryToolNames);
        assertBoundarySurface(created.session, scenario.allowlist, 'attempted reactivation');
        if (scenario.positive) assertBoundaryPositiveControls(created.session, 'attempted reactivation');

        const restoredResult = await createRestoredBoundarySession(
          environment,
          created.session,
          { onExtensionError: captureExtensionError },
        );
        restored = restoredResult.session;
        assert.equal(boundaryToolNames.length, 14, 'boundary fixture must declare 14 tools');
        assert.deepEqual(
          restoredResult.restorationToolNames,
          boundaryToolNames,
          'restoration input must retain all 14 declared fixture tools',
        );
        assertBoundarySurface(restored, scenario.allowlist, 'restored transcript');
        if (scenario.positive) assertRestoredBoundaryPositiveControls(restored, 'restored transcript');
        await restored.reload();
        assertBoundarySurface(restored, scenario.allowlist, 'restored transcript reload');
        if (scenario.positive) assertRestoredBoundaryPositiveControls(restored, 'restored transcript reload');
        restored.setActiveToolsByName(boundaryToolNames);
        assertBoundarySurface(restored, scenario.allowlist, 'restored attempted reactivation');
        if (scenario.positive) assertRestoredBoundaryPositiveControls(restored, 'restored attempted reactivation');

        if (scenario.positive) {
          const absentResult = await createRestoredBoundarySession(
            environment,
            created.session,
            { includeTranscript: false, onExtensionError: captureExtensionError },
          );
          absentTranscript = absentResult.session;
          assert.deepEqual(absentResult.restorationToolNames, [], 'absent transcript must provide no restoration tools');
          assertBoundarySurface(absentTranscript, scenario.allowlist, 'absent transcript');
          assertBoundaryPositiveControls(absentTranscript, 'absent transcript');
          assert.equal(
            absentTranscript.getActiveToolNames().includes('late_deferred'),
            false,
            'deferred tool must stay inactive without transcript restoration',
          );

          const emptyResult = await createRestoredBoundarySession(
            environment,
            created.session,
            { transcriptTools: [], onExtensionError: captureExtensionError },
          );
          emptyTranscript = emptyResult.session;
          assert.deepEqual(emptyResult.restorationToolNames, [], 'empty transcript must provide no restoration tools');
          assertBoundarySurface(emptyTranscript, scenario.allowlist, 'empty transcript');
          assertBoundaryPositiveControls(emptyTranscript, 'empty transcript');
          assert.equal(
            emptyTranscript.getActiveToolNames().includes('late_deferred'),
            false,
            'deferred tool must stay inactive with an empty transcript',
          );
        }

        assert.deepEqual(extensionErrors, [], 'extension binding and reload errors must be reported and absent');
        assert.deepEqual(environment.markers.toolCalls, [], 'no fixture tool may execute during loadout checks');
        assert.equal(environment.markers.credentialLookups, 0, 'loadout checks must not inspect real credentials');
        assert.equal(environment.markers.providerStreams, 0, 'loadout checks must not contact a provider');
        assert.equal(environment.markers.rawProviderStreams, 0, 'restored loadout checks must not contact a provider');
      } finally {
        emptyTranscript?.dispose();
        absentTranscript?.dispose();
        restored?.dispose();
        created?.session.dispose();
      }
    });
  }
});
