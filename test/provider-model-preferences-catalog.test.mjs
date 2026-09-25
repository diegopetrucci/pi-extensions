import assert from 'node:assert/strict';
import test from 'node:test';

import { getBuiltinModels, getBuiltinProviders } from '@earendil-works/pi-ai/providers/all';

import {
  PROVIDER_POLICY_CONTRACT,
  createModelSelectionContext,
  extractConst,
  loadRoleTestUtils,
  parseOracleProviderMatrix,
} from './support/provider-policy-contract-support.mjs';

function catalogTexts(provider) {
  return getBuiltinModels(provider).map((model) => `${model.id} ${model.name ?? ''}`.toLowerCase());
}

function firstCatalogMatch(provider, patterns) {
  const texts = catalogTexts(provider);
  return patterns.find((pattern) => texts.some((text) => text.includes(pattern.toLowerCase())));
}

function firstCatalogMatchId(provider, patterns) {
  return firstCatalogMatch(provider, patterns)?.trimEnd();
}

test('Pi 0.87.1 Astra leads direct OpenAI and Codex preferences with Sol/Luna fallbacks retained', () => {
  for (const role of ['oracle', 'contrarian', 'code-reviewer']) {
    const preferences = extractConst(`extensions/${role}/index.ts`, 'PROVIDER_MODEL_PREFERENCES');
    for (const provider of ['openai', 'openai-codex']) {
      assert.equal(firstCatalogMatchId(provider, preferences[provider]), 'gpt-6-astra');
      assert.equal(preferences[provider][0], 'gpt-6-astra ');
      assert.equal(preferences[provider][1], 'gpt-6-astra');
      assert.ok(preferences[provider].includes('gpt-5.6-sol'));
    }
  }
});

test('Pi 0.87.1 Meta and Radius ladders prefer their current frontier models', () => {
  for (const role of ['oracle', 'contrarian']) {
    const preferences = extractConst(`extensions/${role}/index.ts`, 'PROVIDER_MODEL_PREFERENCES');
    assert.equal(firstCatalogMatchId('meta', preferences.meta), 'muse-spark-1.3');
    assert.equal(firstCatalogMatchId('radius', preferences.radius), 'gpt-6-astra');
    assert.ok(preferences.radius.includes('gpt-5.4-mini'));
  }
});

test('oracle and contrarian hardcoded provider coverage matches the built-in provider catalog', () => {
  const builtinProviders = getBuiltinProviders().sort();
  for (const fixture of PROVIDER_POLICY_CONTRACT.catalogParity.providerPreferenceConstants) {
    const preferences = extractConst(fixture.source.file, fixture.source.constName);
    assert.deepEqual(Object.keys(preferences).sort(), builtinProviders, `${fixture.source.file} provider coverage drifted from the built-in catalog`);

    for (const parityTarget of fixture.parity) {
      assert.deepEqual(
        extractConst(parityTarget.file, parityTarget.constName),
        preferences,
        `${parityTarget.file} drifted from ${fixture.source.file}`,
      );
    }
  }
});

test('hardcoded provider preference patterns still match the pinned built-in catalog', () => {
  const cases = [
    ['extensions/oracle/index.ts', 'PROVIDER_MODEL_PREFERENCES'],
    ['extensions/contrarian/index.ts', 'PROVIDER_MODEL_PREFERENCES'],
    ['extensions/code-reviewer/index.ts', 'PROVIDER_MODEL_PREFERENCES'],
  ];

  for (const [file, constName] of cases) {
    const preferences = extractConst(file, constName);
    for (const [provider, patterns] of Object.entries(preferences)) {
      const texts = catalogTexts(provider);
      const missing = patterns.filter((pattern) => !texts.some((text) => text.includes(pattern.toLowerCase())));
      assert.deepEqual(missing, [], `${file} has stale ${provider} preference pattern(s): ${missing.join(', ')}`);
    }
  }
});

test('cross-provider frontier preference patterns still match the pinned built-in catalog', () => {
  const catalog = getBuiltinProviders().flatMap((provider) => catalogTexts(provider));
  for (const [file, constName] of [
    ['extensions/contrarian/index.ts', 'CONTRARIAN_MODEL_PREFERENCES'],
    ['extensions/code-reviewer/index.ts', 'CODE_REVIEWER_MODEL_PREFERENCES'],
  ]) {
    const patterns = extractConst(file, constName);
    const missing = patterns.filter((pattern) => !catalog.some((text) => text.includes(pattern.toLowerCase())));
    assert.deepEqual(missing, [], `${file} has stale cross-provider preference pattern(s): ${missing.join(', ')}`);
  }
});

test('selected Pi 0.84.3 and 0.84.4 frontier additions stay represented in curated preferences', () => {
  const preferences = extractConst('extensions/oracle/index.ts', 'PROVIDER_MODEL_PREFERENCES');
  const expectedPatterns = {
    'amazon-bedrock': ['openai.gpt-5.6-sol', 'xai.grok-4.6'],
    baseten: ['zai-org/GLM-5.3'],
    'cloudflare-ai-gateway': [
      'workers-ai/@cf/deepseek-ai/deepseek-v4-pro-0813',
      'workers-ai/@cf/zai-org/glm-5.3',
    ],
    'cloudflare-workers-ai': [
      '@cf/deepseek-ai/deepseek-v4-pro-0813',
      '@cf/zai-org/glm-5.3',
    ],
    nvidia: ['moonshotai/kimi-k3'],
    openrouter: ['z-ai/glm-5.3'],
    together: ['zai-org/GLM-5.3-Flash'],
    'vercel-ai-gateway': ['zai/glm-5.3'],
  };

  for (const [provider, patterns] of Object.entries(expectedPatterns)) {
    for (const pattern of patterns) {
      assert.ok(preferences[provider].includes(pattern), `${provider} omitted pinned frontier pattern ${pattern}`);
    }
  }
});

test('cross-provider frontier preference lists stay in sync where roles intentionally share them', () => {
  for (const fixture of PROVIDER_POLICY_CONTRACT.catalogParity.frontierPreferenceConstants) {
    const source = extractConst(fixture.source.file, fixture.source.constName);
    for (const parityTarget of fixture.parity) {
      assert.deepEqual(
        extractConst(parityTarget.file, parityTarget.constName),
        source,
        `${parityTarget.file} drifted from ${fixture.source.file}`,
      );
    }
  }
});

test('oracle provider matrix top picks stay aligned with the implementation', () => {
  const preferences = extractConst('extensions/oracle/index.ts', 'PROVIDER_MODEL_PREFERENCES');
  const matrixRows = parseOracleProviderMatrix();

  assert.equal(matrixRows.length, Object.keys(preferences).length);
  for (const { provider, topPick } of matrixRows) {
    const firstMatch = firstCatalogMatchId(provider, preferences[provider]);
    assert.equal(firstMatch, topPick, `docs/oracle-provider-matrix.md drifted for ${provider}`);
  }
});

const FRONTIER_CATALOG_CASES = [
  {
    kind: 'opus-5.5',
    providers: ['amazon-bedrock', 'anthropic', 'github-copilot', 'opencode', 'openrouter', 'radius', 'vercel-ai-gateway'],
    catalogPattern: /claude-opus-5/i,
    expected: {
      'amazon-bedrock': /^(?:(?:global|au|eu|jp|us)\.)?anthropic\.claude-opus-5-5$/,
      anthropic: 'claude-opus-5-5',
      'github-copilot': 'claude-opus-5.5',
      opencode: 'claude-opus-5-5',
      openrouter: 'anthropic/claude-opus-5.5',
      radius: 'claude-opus-5-5',
      'vercel-ai-gateway': 'anthropic/claude-opus-5.5',
    },
    codeReviewerProviders: ['amazon-bedrock', 'anthropic', 'github-copilot', 'opencode', 'openrouter', 'radius', 'vercel-ai-gateway'],
  },
  {
    kind: 'gpt-6-astra',
    providers: ['amazon-bedrock', 'azure-openai-responses', 'cloudflare-ai-gateway', 'github-copilot', 'openai', 'openai-codex', 'opencode', 'openrouter', 'radius', 'vercel-ai-gateway'],
    catalogPattern: /gpt-(?:6-(?:astra|sol|luna)|5\.6-(?:sol|terra|luna))/i,
    expected: {
      'amazon-bedrock': /^(?:(?:global|us)\.)?openai\.gpt-6-astra$/,
      'azure-openai-responses': 'gpt-6-astra',
      'cloudflare-ai-gateway': 'gpt-6-astra',
      'github-copilot': 'gpt-6-astra',
      openai: 'gpt-6-astra',
      'openai-codex': 'gpt-6-astra',
      opencode: 'gpt-6-astra',
      openrouter: 'openai/gpt-6-astra',
      radius: 'gpt-6-astra',
      'vercel-ai-gateway': 'openai/gpt-6-astra',
    },
    codeReviewerProviders: ['amazon-bedrock', 'azure-openai-responses', 'cloudflare-ai-gateway', 'github-copilot', 'openai', 'openai-codex', 'opencode', 'openrouter', 'radius', 'vercel-ai-gateway'],
  },
  {
    kind: 'grok-4.7',
    providers: ['github-copilot', 'opencode-go', 'openrouter', 'vercel-ai-gateway', 'xai'],
    catalogPattern: /grok-4\.[567]/i,
    expected: {
      'github-copilot': 'grok-4.7',
      'opencode-go': 'grok-4.7',
      openrouter: 'x-ai/grok-4.7',
      'vercel-ai-gateway': 'spacexai/grok-4.7',
      xai: 'grok-4.7',
    },
    codeReviewerProviders: ['github-copilot', 'opencode-go', 'openrouter', 'vercel-ai-gateway', 'xai'],
  },
];

function frontierCatalogModels(provider, pattern) {
  return getBuiltinModels(provider).filter((model) => pattern.test(`${model.id} ${model.name ?? ''}`));
}

function selectionModel(result) {
  assert.equal(result.ok, true);
  const model = result.selection;
  return {
    modelId: model.modelId ?? model.id,
    modelName: model.modelName ?? model.name,
  };
}

async function selectRoleModel(role, provider, available) {
  const utils = await loadRoleTestUtils(role);
  const method = role === 'oracle' ? 'selectOracleModel' : role === 'contrarian' ? 'selectContrarianModel' : 'selectCodeReviewerModel';
  const result = await utils[method](createModelSelectionContext({
    model: { provider, id: `catalog-test-${provider}`, reasoning: true },
    available,
  }));
  return selectionModel(result);
}

for (const frontierCase of FRONTIER_CATALOG_CASES) {
  for (const role of ['oracle', 'contrarian', 'code-reviewer']) {
    const providers = role === 'code-reviewer' ? frontierCase.codeReviewerProviders : frontierCase.providers;
    for (const provider of providers) {
      test(`${role} resolves the ${frontierCase.kind} catalog tier on ${provider} regardless of catalog order`, async () => {
        const preferences = extractConst(`extensions/${role}/index.ts`, 'PROVIDER_MODEL_PREFERENCES');
        assert.ok(preferences[provider], `${role} is missing a provider preference ladder for ${provider}`);

        const available = frontierCatalogModels(provider, frontierCase.catalogPattern);
        assert.ok(available.length > 0, `${provider} has no pinned ${frontierCase.kind} catalog models`);
        const normal = await selectRoleModel(role, provider, available);
        const reversed = await selectRoleModel(role, provider, [...available].reverse());

        const expectedId = frontierCase.expected[provider];
        assert.ok(expectedId, `${frontierCase.kind} has no expected base ID for ${provider}`);
        assert.equal(normal.modelId, reversed.modelId);
        if (expectedId instanceof RegExp) {
          assert.match(normal.modelId, expectedId);
        } else {
          assert.equal(normal.modelId, expectedId);
        }
      });
    }
  }
}

const CODE_REVIEWER_GPT6_CATALOG_CASES = [
  {
    provider: 'azure-openai-responses',
    modelIds: ['gpt-5.6-luna', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-sol', 'gpt-6-astra'],
    expected: 'gpt-6-astra',
  },
  {
    provider: 'openai',
    modelIds: ['gpt-5.6-luna', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-sol', 'gpt-6-astra'],
    expected: 'gpt-6-astra',
  },
  {
    provider: 'openai-codex',
    modelIds: ['gpt-5.6-luna', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-sol', 'gpt-6-astra'],
    expected: 'gpt-6-astra',
  },
  {
    provider: 'github-copilot',
    modelIds: ['gpt-5.6-luna', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-sol', 'gpt-6-astra'],
    expected: 'gpt-6-astra',
  },
  {
    provider: 'opencode',
    modelIds: ['gpt-5.6-luna', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-sol', 'gpt-6-astra'],
    expected: 'gpt-6-astra',
  },
  {
    provider: 'openrouter',
    modelIds: ['openai/gpt-5.6-luna', 'openai/gpt-6-luna', 'openai/gpt-5.6-sol', 'openai/gpt-5.6-terra', 'openai/gpt-6-sol', 'openai/gpt-6-astra'],
    expected: 'openai/gpt-6-astra',
  },
  {
    provider: 'radius',
    modelIds: ['gpt-5.6-luna', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-sol', 'gpt-6-astra'],
    expected: 'gpt-6-astra',
  },
  {
    provider: 'vercel-ai-gateway',
    modelIds: ['openai/gpt-5.6-luna', 'openai/gpt-6-luna', 'openai/gpt-5.6-sol', 'openai/gpt-5.6-terra', 'openai/gpt-6-sol', 'openai/gpt-6-astra'],
    expected: 'openai/gpt-6-astra',
  },
];

for (const { provider, modelIds, expected } of CODE_REVIEWER_GPT6_CATALOG_CASES) {
  test(`code-reviewer resolves ${expected} on ${provider} from actual catalog IDs in either order`, async () => {
    const models = modelIds.map((id) => {
      const model = getBuiltinModels(provider).find((candidate) => candidate.id === id);
      assert.ok(model, `missing pinned catalog model ${provider}/${id}`);
      return model;
    });
    const normal = await selectRoleModel('code-reviewer', provider, models);
    const reversed = await selectRoleModel('code-reviewer', provider, [...models].reverse());
    assert.equal(normal.modelId, expected);
    assert.equal(reversed.modelId, expected);
  });
}

const CROSS_PROVIDER_CATALOG_CASES = [
  {
    kind: 'Opus 5.5',
    models: [
      ['anthropic', 'claude-opus-5'],
      ['anthropic', 'claude-opus-5-5'],
    ],
    expected: 'claude-opus-5-5',
  },
  {
    kind: 'GPT-6 Astra',
    models: [
      ['openai', 'gpt-6-sol'],
      ['openai', 'gpt-6-astra'],
      ['openai', 'gpt-6-luna'],
    ],
    expected: 'gpt-6-astra',
  },
  {
    kind: 'Grok 4.7',
    models: [
      ['xai', 'grok-4.6'],
      ['xai', 'grok-4.7'],
    ],
    expected: 'grok-4.7',
  },
];

for (const crossCase of CROSS_PROVIDER_CATALOG_CASES) {
  for (const role of ['contrarian', 'code-reviewer']) {
    test(`${role} cross-provider ladder selects ${crossCase.kind} from actual catalog models in either order`, async () => {
      const models = crossCase.models.map(([provider, id]) => {
        const model = getBuiltinModels(provider).find((candidate) => candidate.id === id);
        assert.ok(model, `missing pinned catalog model ${provider}/${id}`);
        return model;
      });
      const normal = await selectRoleModel(role, 'custom', models);
      const reversed = await selectRoleModel(role, 'custom', [...models].reverse());
      assert.equal(normal.modelId, crossCase.expected);
      assert.equal(reversed.modelId, crossCase.expected);
    });
  }
}

const CROSS_PROVIDER_ALIAS_CATALOG_CASES = [
  { kind: 'Opus 5.5', provider: 'amazon-bedrock', pattern: /claude-opus-5/i, expected: /^(?:(?:global|au|eu|jp|us)\.)?anthropic\.claude-opus-5-5$/ },
  { kind: 'Opus 5.5', provider: 'openrouter', pattern: /claude-opus-5/i, expected: 'anthropic/claude-opus-5.5' },
  { kind: 'Opus 5.5', provider: 'vercel-ai-gateway', pattern: /claude-opus-5/i, expected: 'anthropic/claude-opus-5.5' },
  { kind: 'GPT-6 frontier', provider: 'amazon-bedrock', pattern: /gpt-(?:6-(?:astra|sol|luna)|5\.6-(?:sol|terra|luna))/i, expected: /^(?:(?:global|us)\.)?openai\.gpt-6-astra$/ },
  { kind: 'GPT-6 frontier', provider: 'openrouter', pattern: /gpt-(?:6-(?:astra|sol|luna)|5\.6-(?:sol|terra|luna))/i, expected: 'openai/gpt-6-astra' },
  { kind: 'GPT-6 frontier', provider: 'vercel-ai-gateway', pattern: /gpt-(?:6-(?:astra|sol|luna)|5\.6-(?:sol|terra|luna))/i, expected: 'openai/gpt-6-astra' },
  { kind: 'Grok 4.7', provider: 'openrouter', pattern: /grok-4\.[567]/i, expected: 'x-ai/grok-4.7' },
  { kind: 'Grok 4.7', provider: 'vercel-ai-gateway', pattern: /grok-4\.[567]/i, expected: 'spacexai/grok-4.7' },
];

for (const { kind, provider, pattern, expected } of CROSS_PROVIDER_ALIAS_CATALOG_CASES) {
  for (const role of ['contrarian', 'code-reviewer']) {
    test(`${role} cross-provider ${kind} on ${provider} resolves a stable ID across aliases`, async () => {
      const models = frontierCatalogModels(provider, pattern);
      assert.ok(models.length > 1, `${provider} needs complete alias coverage for ${kind}`);
      const normal = await selectRoleModel(role, 'custom', models);
      const reversed = await selectRoleModel(role, 'custom', [...models].reverse());
      assert.equal(normal.modelId, reversed.modelId);
      if (expected instanceof RegExp) {
        assert.match(normal.modelId, expected);
      } else {
        assert.equal(normal.modelId, expected);
      }
    });
  }
}

test('direct, Copilot, and Radius ladders keep Astra above Sol/Luna with GPT-5.6 fallbacks', () => {
  const directCases = [
    {
      provider: 'azure-openai-responses',
      astra: 'gpt-6-astra',
      sol: 'gpt-6-sol',
      luna: 'gpt-6-luna',
      fallbacks: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    },
    {
      provider: 'github-copilot',
      astra: 'gpt-6-astra',
      sol: 'gpt-6-sol',
      luna: 'gpt-6-luna',
      fallbacks: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    },
    {
      provider: 'openai',
      astra: 'gpt-6-astra',
      sol: 'gpt-6-sol',
      luna: 'gpt-6-luna',
      fallbacks: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    },
    {
      provider: 'openai-codex',
      astra: 'gpt-6-astra',
      sol: 'gpt-6-sol',
      luna: 'gpt-6-luna',
      fallbacks: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    },
    {
      provider: 'opencode',
      astra: 'gpt-6-astra',
      sol: 'gpt-6-sol',
      luna: 'gpt-6-luna',
      fallbacks: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    },
    {
      provider: 'openrouter',
      astra: 'openai/gpt-6-astra',
      sol: 'openai/gpt-6-sol',
      luna: 'openai/gpt-6-luna',
      fallbacks: ['openai/gpt-5.6-sol', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-luna'],
    },
    {
      provider: 'radius',
      astra: 'gpt-6-astra',
      sol: 'gpt-6-sol',
      luna: 'gpt-6-luna',
      fallbacks: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    },
    {
      provider: 'vercel-ai-gateway',
      astra: 'openai/gpt-6-astra',
      sol: 'openai/gpt-6-sol',
      luna: 'openai/gpt-6-luna',
      fallbacks: ['openai/gpt-5.6-sol', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-luna'],
    },
  ];

  for (const role of ['oracle', 'contrarian', 'code-reviewer']) {
    const preferences = extractConst(`extensions/${role}/index.ts`, 'PROVIDER_MODEL_PREFERENCES');
    for (const { provider, astra, sol, luna, fallbacks } of directCases) {
      const patterns = preferences[provider];
      assert.ok(patterns, `${role} is missing a provider preference ladder for ${provider}`);
      const astraIndex = patterns.indexOf(astra);
      const solIndex = patterns.indexOf(sol);
      const lunaIndex = patterns.indexOf(luna);
      assert.ok(astraIndex >= 0 && astraIndex < solIndex, `${role}/${provider} placed Astra below Sol`);
      assert.ok(astraIndex < lunaIndex, `${role}/${provider} placed Astra below Luna`);
      assert.ok(solIndex < lunaIndex, `${role}/${provider} placed Sol below Luna`);
      for (const fallback of fallbacks) {
        assert.ok(patterns.includes(fallback), `${role}/${provider} omitted GPT-5.6 fallback ${fallback}`);
      }
    }
  }
});

test('specific frontier spellings precede ambiguous generations in every affected ladder', () => {
  const affectedProviders = ['amazon-bedrock', 'anthropic', 'github-copilot', 'opencode', 'openrouter', 'radius', 'vercel-ai-gateway', 'xai', 'opencode-go'];
  for (const role of ['oracle', 'contrarian', 'code-reviewer']) {
    const providerPreferences = extractConst(`extensions/${role}/index.ts`, 'PROVIDER_MODEL_PREFERENCES');
    for (const provider of affectedProviders) {
      const patterns = providerPreferences[provider];
      if (!patterns) continue;
      const exact = patterns.findIndex((pattern) => /claude-opus-5(?:-5|\.5)/i.test(pattern));
      const ambiguous = patterns.indexOf('claude-opus-5');
      if (exact >= 0 && ambiguous >= 0) assert.ok(exact < ambiguous, `${role}/${provider} placed Opus 5.5 after Opus 5`);
      const grok47 = patterns.findIndex((pattern) => /(?:^|\/)grok-4\.7$/i.test(pattern));
      const grok46 = patterns.findIndex((pattern) => /(?:^|\/)grok-4\.6$/i.test(pattern));
      if (grok47 >= 0 && grok46 >= 0) assert.ok(grok47 < grok46, `${role}/${provider} placed Grok 4.7 after Grok 4.6`);
    }
  }

  for (const [file, constName] of [
    ['extensions/contrarian/index.ts', 'CONTRARIAN_MODEL_PREFERENCES'],
    ['extensions/code-reviewer/index.ts', 'CODE_REVIEWER_MODEL_PREFERENCES'],
  ]) {
    const patterns = extractConst(file, constName);
    const astra = patterns.indexOf('gpt-6-astra');
    const sol = patterns.indexOf('gpt-6-sol');
    const luna = patterns.indexOf('gpt-6-luna');
    assert.ok(astra >= 0 && astra < sol && astra < luna, `${file} violated cross-provider Astra tier precedence`);
    assert.ok(sol < luna, `${file} placed cross-provider Sol below Luna`);
    assert.ok(patterns.indexOf('grok-4.7') < patterns.indexOf('grok-4.6'), `${file} placed cross-provider Grok 4.7 after Grok 4.6`);
    assert.ok(patterns.indexOf('claude-opus-5-5') < patterns.indexOf('claude-opus-5'));
    assert.ok(patterns.indexOf('claude-opus-5.5') < patterns.indexOf('claude-opus-5'));
  }
});

test('only unified direct API Fast mode gains the confirmed GPT-6 allowlist', () => {
  const prohibitedModels = ['claude-opus-5-5', 'claude-opus-5.5', 'grok-4.7'];
  const unchangedAllowlists = [
    ['extensions/fast/index.ts', 'OPENAI_SUPPORTED_MODELS'],
    ['extensions/claude-fast/index.ts', 'SUPPORTED_MODELS'],
    ['extensions/openai-fast/index.ts', 'SUPPORTED_MODELS'],
  ];
  const confirmedDirectOpenAIModels = ['gpt-6-astra', 'gpt-6-luna', 'gpt-6-sol'];
  const directOpenAIAllowlist = extractConst('extensions/fast/index.ts', 'OPENAI_API_SUPPORTED_MODELS');

  assert.deepEqual([...directOpenAIAllowlist].sort(), confirmedDirectOpenAIModels);

  // ANTHROPIC_SUPPORTED_MODELS intentionally includes claude-opus-5-5 (added by #92);
  // verify GPT-6 models, grok-4.7, and claude-opus-5.5 (dot notation) still stay out.
  const anthropicAllowlist = extractConst('extensions/fast/index.ts', 'ANTHROPIC_SUPPORTED_MODELS');
  const anthropicProhibited = ['claude-opus-5.5', 'grok-4.7'];
  for (const model of [...anthropicProhibited, ...confirmedDirectOpenAIModels]) {
    assert.equal(anthropicAllowlist.has(model), false, `extensions/fast/index.ts unexpectedly fast-enabled ${model}`);
  }

  for (const [file, constName] of unchangedAllowlists) {
    const allowlist = extractConst(file, constName);
    for (const model of [...prohibitedModels, ...confirmedDirectOpenAIModels]) {
      assert.equal(allowlist.has(model), false, `${file} unexpectedly fast-enabled ${model}`);
    }
  }
});
