import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

const testSupportDir = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.resolve(testSupportDir, '..');
export const repoRoot = path.resolve(testDir, '..');

const roleModulePaths = {
  oracle: 'extensions/oracle/index.ts',
  contrarian: 'extensions/contrarian/index.ts',
  'code-reviewer': 'extensions/code-reviewer/index.ts',
  librarian: 'extensions/librarian/index.ts',
};

export function createModelSelectionContext({ model, available = [] } = {}) {
  return {
    model,
    modelRegistry: {
      async getAvailable() {
        return available;
      },
    },
  };
}

export async function loadRoleTestUtils(role) {
  const modulePath = roleModulePaths[role];
  assert.ok(modulePath, `Unsupported provider-policy test role: ${role}`);
  const moduleUrl = pathToFileURL(path.join(repoRoot, modulePath)).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.__test__;
}

export function extractConst(relativeFilePath, constName) {
  const filePath = path.join(repoRoot, relativeFilePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== constName || !declaration.initializer) continue;
      return Function(`return (${declaration.initializer.getText(sourceFile)});`)();
    }
  }
  throw new Error(`Could not find ${constName} in ${filePath}`);
}

export function parseOracleProviderMatrix() {
  const markdown = fs.readFileSync(path.join(repoRoot, 'docs/oracle-provider-matrix.md'), 'utf8');
  const rows = [];
  for (const line of markdown.split('\n')) {
    const match = /^\| `([^`]+)` \| `([^`]+)` \|/.exec(line.trim());
    if (match) rows.push({ provider: match[1], topPick: match[2] });
  }
  return rows;
}

export const PROVIDER_POLICY_CONTRACT = {
  catalogParity: {
    providerPreferenceConstants: [
      {
        label: 'oracle-provider-preferences',
        source: { file: 'extensions/oracle/index.ts', constName: 'PROVIDER_MODEL_PREFERENCES' },
        parity: [{ file: 'extensions/contrarian/index.ts', constName: 'PROVIDER_MODEL_PREFERENCES' }],
      },
    ],
    frontierPreferenceConstants: [
      {
        label: 'cross-provider-frontier-preferences',
        source: { file: 'extensions/contrarian/index.ts', constName: 'CONTRARIAN_MODEL_PREFERENCES' },
        parity: [{ file: 'extensions/code-reviewer/index.ts', constName: 'CODE_REVIEWER_MODEL_PREFERENCES' }],
      },
    ],
  },
  orderingAndFallbackCases: [
    {
      role: 'oracle',
      method: 'selectOracleModel',
      description: 'Oracle stays on the current provider, prefers the latest frontier tier, and defaults gpt-5.6-sol to high thinking',
      ctx: {
        model: { provider: 'openai', id: 'gpt-5.4', reasoning: true },
        available: [
          { provider: 'openai', id: 'gpt-5.5', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
          { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
          { provider: 'openai', id: 'gpt-5.6-sol', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
          { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } },
        ],
      },
      expected: {
        selectionModelRef: 'openai/gpt-5.6-sol',
        orderedModelRefs: ['openai/gpt-5.6-sol', 'openai/gpt-5.5-pro', 'openai/gpt-5.5'],
        selectionProperties: {
          thinkingLevel: 'high',
          requestedThinkingLevel: undefined,
          thinkingLevelClamped: undefined,
          autoSelected: true,
        },
        selectionReason: /hardcoded preference list for openai/i,
      },
    },
    {
      role: 'contrarian',
      method: 'selectContrarianModel',
      description: 'Contrarian stops at the first non-empty opposite-provider reasoning frontier tier instead of appending exhaustive same-provider fallbacks',
      ctx: {
        model: { provider: 'openai', id: 'gpt-5.5', reasoning: true },
        available: [
          { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
          { provider: 'anthropic', id: 'claude-sonnet-4.6', reasoning: true },
          { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
        ],
      },
      expected: {
        selectionModelRef: 'anthropic/claude-opus-4.8',
        orderedModelRefs: ['anthropic/claude-opus-4.8', 'anthropic/claude-sonnet-4.6'],
        selectionProperties: { thinkingLevel: 'high', autoSelected: true },
        selectionReason: /opposite provider\/model family/i,
      },
    },
    {
      role: 'code-reviewer',
      method: 'selectCodeReviewerModel',
      description: 'Code Reviewer keeps exhaustive fallback tiers after the preferred contrarian candidate set',
      ctx: {
        model: { provider: 'openai', id: 'gpt-5.5', reasoning: true },
        available: [
          { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
          { provider: 'openai', id: 'gpt-5.5-mini', reasoning: false },
          { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
        ],
      },
      expected: {
        selectionModelRef: 'anthropic/claude-opus-4.8',
        orderedModelRefs: ['anthropic/claude-opus-4.8', 'openai/gpt-5.5-pro', 'openai/gpt-5.5-mini'],
      },
    },
    {
      role: 'librarian',
      method: 'buildLibrarianCandidates',
      description: 'Librarian auto-selects the fast/cheap path first and keeps the current model as the final fallback',
      ctx: {
        model: {
          provider: 'openai',
          id: 'gpt-5.5-pro',
          reasoning: true,
          cost: { input: 5, output: 15 },
          contextWindow: 200000,
        },
        available: [
          {
            provider: 'anthropic',
            id: 'claude-haiku-4-5',
            name: 'Claude Haiku 4.5',
            reasoning: false,
            cost: { input: 1, output: 1 },
            contextWindow: 200000,
          },
        ],
      },
      args: ['openai/gpt-5.5-mini', 'low'],
      expected: {
        orderedModelRefs: ['anthropic/claude-haiku-4-5', 'openai/gpt-5.5-pro'],
        thinkingLevels: ['off', 'low'],
        firstCandidateProperties: { autoSelected: true },
        selectionReasons: [
          /preferred fast Librarian model.*Configured model openai\/gpt-5\.5-mini was unavailable, so Librarian fell back to auto-selection\./i,
          /Used the current session model openai\/gpt-5\.5-pro as a final fallback\./i,
        ],
      },
    },
  ],
  parseModelPreferenceCases: [
    {
      roles: ['oracle', 'contrarian'],
      assertions: [
        {
          input: ' anthropic/claude-opus-4.8:medium ',
          expected: { model: 'anthropic/claude-opus-4.8', thinkingLevel: 'medium' },
        },
        {
          input: ' openai/gpt-5.5-pro:xhigh ',
          expected: { model: 'openai/gpt-5.5-pro', thinkingLevel: 'xhigh' },
        },
        {
          input: 'openai/gpt-5.5-pro:max',
          expected: { model: 'openai/gpt-5.5-pro', thinkingLevel: 'max' },
        },
        {
          input: 'openai/gpt-5.5-pro',
          expected: { model: 'openai/gpt-5.5-pro' },
        },
      ],
    },
  ],
  exactProviderQualifiedMatchingCases: [
    {
      role: 'oracle',
      requestedModelRef: 'anthropic/claude-opus-4.8',
      ctx: {
        model: { provider: 'openai', id: 'gpt-5.5', reasoning: true },
        available: [
          { provider: 'anthropic', id: 'claude-opus-4.8-fast', reasoning: true },
          { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
        ],
      },
      expectedModelRef: 'anthropic/claude-opus-4.8',
    },
    {
      role: 'contrarian',
      requestedModelRef: 'anthropic/claude-opus-4.8',
      ctx: {
        model: { provider: 'openai', id: 'gpt-5.5', reasoning: true },
        available: [
          { provider: 'anthropic', id: 'claude-opus-4.8-fast', reasoning: true },
          { provider: 'anthropic', id: 'claude-opus-4.8', reasoning: true },
        ],
      },
      expectedModelRef: 'anthropic/claude-opus-4.8',
    },
    {
      role: 'librarian',
      requestedModelRef: 'anthropic/claude-haiku-4-5',
      ctx: {
        model: { provider: 'openai', id: 'gpt-5.5-pro', reasoning: true },
        available: [
          { provider: 'anthropic', id: 'claude-haiku-4-5-fast', reasoning: false },
          { provider: 'anthropic', id: 'claude-haiku-4-5', reasoning: false },
        ],
      },
      expectedModelRef: 'anthropic/claude-haiku-4-5',
    },
  ],
  noAuthenticatedModelCases: [
    {
      role: 'oracle',
      type: 'result',
      method: 'selectOracleModel',
      ctx: {},
      expected: { ok: false, error: 'No authenticated models are available. Log in or configure an API key first.' },
    },
    {
      role: 'contrarian',
      type: 'result',
      method: 'selectContrarianModel',
      ctx: {},
      expected: { ok: false, error: 'No authenticated models are available. Log in or configure an API key first.' },
    },
    {
      role: 'code-reviewer',
      type: 'result',
      method: 'selectCodeReviewerModel',
      ctx: {},
      expected: { ok: false, error: 'No authenticated models are available. Log in or configure an API key first.' },
    },
    {
      role: 'librarian',
      type: 'throws',
      method: 'buildLibrarianCandidates',
      ctx: {},
      args: [undefined, 'low'],
      expectedMessage: 'No authenticated models are available for Librarian. Log in or configure an API key first.',
    },
  ],
  thinkingLevelCases: [
    {
      role: 'oracle',
      description: 'Oracle defaults gpt-5.6-sol to high while other reasoning models default to xhigh',
      method: 'resolveThinkingLevel',
      assertions: [
        {
          args: [{ provider: 'openai', id: 'gpt-5.6-sol', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } }, undefined],
          expected: { requested: 'high', effective: 'high', clamped: false },
        },
        {
          args: [{ provider: 'openai', id: 'gpt-5.5-pro', reasoning: true, thinkingLevelMap: { high: {}, xhigh: {} } }, undefined],
          expected: { requested: 'xhigh', effective: 'xhigh', clamped: false },
        },
      ],
    },
    {
      role: 'contrarian',
      description: 'Contrarian defaults to high and clamps unsupported requests down to the highest supported tier, including max',
      method: 'resolveThinkingLevel',
      assertions: [
        {
          args: [
            {
              provider: 'anthropic',
              id: 'claude-opus-4.8',
              reasoning: true,
              thinkingLevelMap: { off: {}, minimal: {}, low: {}, medium: null, high: null, xhigh: null },
            },
            'high',
          ],
          expected: { requested: 'high', effective: 'low', clamped: true },
        },
        {
          args: [
            {
              provider: 'anthropic',
              id: 'claude-opus-4.8',
              reasoning: true,
              thinkingLevelMap: { off: {}, minimal: {}, low: {}, medium: {}, high: {}, xhigh: {}, max: {} },
            },
            'max',
          ],
          expected: { requested: 'max', effective: 'max', clamped: false },
        },
        {
          args: [
            {
              provider: 'anthropic',
              id: 'claude-opus-4.8',
              reasoning: true,
              thinkingLevelMap: { off: {}, minimal: {}, low: {}, medium: {}, high: {}, xhigh: {}, max: null },
            },
            'max',
          ],
          expected: { requested: 'max', effective: 'xhigh', clamped: true },
        },
      ],
    },
    {
      role: 'code-reviewer',
      description: 'Code Reviewer defaults to high for reasoning models, off for non-reasoning, and clamps max to xhigh when needed',
      method: 'resolveThinkingLevel',
      assertions: [
        {
          args: [{ provider: 'custom', id: 'solver-2', reasoning: true }, undefined],
          expected: { requested: 'high', effective: 'high', clamped: false, note: 'defaulted to high' },
        },
        {
          args: [{ provider: 'custom', id: 'solver-1', reasoning: false }, undefined],
          expected: { requested: 'off', effective: 'off', clamped: false, note: 'defaulted to off for non-reasoning model' },
        },
        {
          method: 'normalizeThinkingLevel',
          args: ['max'],
          expected: 'max',
        },
        {
          args: [
            { provider: 'custom', id: 'solver-max', reasoning: true, thinkingLevelMap: { off: {}, high: {}, xhigh: {}, max: {} } },
            'max',
          ],
          expected: { requested: 'max', effective: 'max', clamped: false, note: 'requested max' },
        },
        {
          args: [
            { provider: 'custom', id: 'solver-max', reasoning: true, thinkingLevelMap: { off: {}, high: {}, xhigh: {}, max: null } },
            'max',
          ],
          expected: { requested: 'max', effective: 'xhigh', clamped: true, note: 'requested max; clamped to xhigh' },
        },
      ],
    },
    {
      role: 'librarian',
      description: 'Librarian defaults to low and preserves max only when the matched model supports it',
      method: 'resolveThinkingLevel',
      assertions: [
        {
          args: [{ provider: 'custom', id: 'researcher', reasoning: true, thinkingLevelMap: { off: {}, low: {}, high: {}, xhigh: {}, max: {} } }, 'low'],
          expected: 'low',
        },
        {
          args: [{ provider: 'custom', id: 'researcher', reasoning: true, thinkingLevelMap: { off: {}, low: {}, high: {}, xhigh: {}, max: {} } }, 'max'],
          expected: 'max',
        },
        {
          args: [{ provider: 'custom', id: 'researcher', reasoning: true, thinkingLevelMap: { off: {}, low: {}, high: {}, xhigh: {}, max: null } }, 'max'],
          expected: 'xhigh',
        },
      ],
    },
  ],
  availabilityErrorCases: [
    {
      role: 'oracle',
      method: 'isModelAvailabilityError',
      messages: [
        { message: '404 model_not_found_error: model does not exist', expected: true },
        { message: '403 forbidden: you do not have access to this model', expected: true },
        { message: '404 model unavailable after timeout', expected: false },
        { message: 'rate limited, please retry later', expected: false },
        { message: 'socket timeout after 30 seconds', expected: false },
        { message: undefined, expected: false },
      ],
    },
    {
      role: 'contrarian',
      method: 'isModelAvailabilityError',
      messages: [
        { message: '404 model_not_found_error: model does not exist', expected: true },
        { message: '403 forbidden: you do not have access to this model', expected: true },
        { message: '404 model unavailable after timeout', expected: false },
        { message: 'rate limited, please retry later', expected: false },
        { message: 'socket timeout after 30 seconds', expected: false },
        { message: undefined, expected: false },
      ],
    },
    {
      role: 'code-reviewer',
      method: 'isModelAvailabilityError',
      messages: [
        { message: '404 model_not_found_error: model does not exist', expected: true },
        { message: '403 forbidden: you do not have access to this model', expected: true },
        { message: '404 model unavailable after timeout', expected: true },
        { message: 'rate limited, please retry later', expected: false },
        { message: 'socket timeout after 30 seconds', expected: false },
        { message: undefined, expected: false },
      ],
    },
    {
      role: 'librarian',
      method: 'isModelAvailabilityError',
      messages: [
        { message: '404 model_not_found_error: model does not exist', expected: true },
        { message: '403 forbidden: you do not have access to this model', expected: true },
        { message: '404 model unavailable after timeout', expected: true },
        { message: 'rate limited, please retry later', expected: false },
        { message: 'socket timeout after 30 seconds', expected: false },
        { message: undefined, expected: false },
      ],
    },
  ],
};
