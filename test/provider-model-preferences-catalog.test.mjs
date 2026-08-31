import assert from 'node:assert/strict';
import test from 'node:test';

import { getBuiltinModels, getBuiltinProviders } from '@earendil-works/pi-ai/providers/all';

import {
  PROVIDER_POLICY_CONTRACT,
  extractConst,
  parseOracleProviderMatrix,
} from './support/provider-policy-contract-support.mjs';

function catalogTexts(provider) {
  return getBuiltinModels(provider).map((model) => `${model.id} ${model.name ?? ''}`.toLowerCase());
}

function firstCatalogMatch(provider, patterns) {
  const texts = catalogTexts(provider);
  return patterns.find((pattern) => texts.some((text) => text.includes(pattern.toLowerCase())));
}

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
    nvidia: ['moonshotai/kimi-k3', 'deepseek-ai/deepseek-v4-pro-0813'],
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
    const firstMatch = firstCatalogMatch(provider, preferences[provider]);
    assert.equal(firstMatch, topPick, `docs/oracle-provider-matrix.md drifted for ${provider}`);
  }
});
