import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { getBuiltinModels, getBuiltinProviders } from '@earendil-works/pi-ai/providers/all';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

function extractConst(filePath, constName) {
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

function catalogTexts(provider) {
  return getBuiltinModels(provider).map((model) => `${model.id} ${model.name ?? ''}`.toLowerCase());
}

function firstCatalogMatch(provider, patterns) {
  const texts = catalogTexts(provider);
  return patterns.find((pattern) => texts.some((text) => text.includes(pattern.toLowerCase())));
}

function parseProviderMatrix() {
  const markdown = fs.readFileSync(path.join(repoRoot, 'docs/oracle-provider-matrix.md'), 'utf8');
  const rows = [];
  for (const line of markdown.split('\n')) {
    const match = /^\| `([^`]+)` \| `([^`]+)` \|/.exec(line.trim());
    if (match) rows.push({ provider: match[1], topPick: match[2] });
  }
  return rows;
}

test('oracle and contrarian hardcoded provider coverage matches the built-in provider catalog', () => {
  const builtinProviders = getBuiltinProviders().sort();
  for (const file of ['extensions/oracle/index.ts', 'extensions/contrarian/index.ts']) {
    const preferences = extractConst(path.join(repoRoot, file), 'PROVIDER_MODEL_PREFERENCES');
    assert.deepEqual(Object.keys(preferences).sort(), builtinProviders, `${file} provider coverage drifted from the built-in catalog`);
  }
});

test('hardcoded provider preference patterns still match the pinned built-in catalog', () => {
  const cases = [
    ['extensions/oracle/index.ts', 'PROVIDER_MODEL_PREFERENCES'],
    ['extensions/contrarian/index.ts', 'PROVIDER_MODEL_PREFERENCES'],
    ['extensions/code-reviewer/index.ts', 'PROVIDER_MODEL_PREFERENCES'],
  ];

  for (const [file, constName] of cases) {
    const preferences = extractConst(path.join(repoRoot, file), constName);
    for (const [provider, patterns] of Object.entries(preferences)) {
      const texts = catalogTexts(provider);
      const missing = patterns.filter((pattern) => !texts.some((text) => text.includes(pattern.toLowerCase())));
      assert.deepEqual(missing, [], `${file} has stale ${provider} preference pattern(s): ${missing.join(', ')}`);
    }
  }
});

test('cross-provider preference lists keep the refreshed frontier IDs present in the pinned catalog', () => {
  const contrarian = extractConst(path.join(repoRoot, 'extensions/contrarian/index.ts'), 'CONTRARIAN_MODEL_PREFERENCES');
  const codeReviewer = extractConst(path.join(repoRoot, 'extensions/code-reviewer/index.ts'), 'CODE_REVIEWER_MODEL_PREFERENCES');

  assert.deepEqual(contrarian.slice(0, 4), ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5']);
  assert.deepEqual(codeReviewer.slice(0, 4), ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5']);
  assert.ok(contrarian.includes('grok-4.5'));
  assert.ok(codeReviewer.includes('grok-4.5'));
  assert.ok(contrarian.includes('gemini-3.5-flash'));
  assert.ok(codeReviewer.includes('gemini-3.5-flash'));
});

test('oracle provider matrix top picks stay aligned with the implementation', () => {
  const preferences = extractConst(path.join(repoRoot, 'extensions/oracle/index.ts'), 'PROVIDER_MODEL_PREFERENCES');
  const matrixRows = parseProviderMatrix();

  assert.equal(matrixRows.length, Object.keys(preferences).length);
  for (const { provider, topPick } of matrixRows) {
    const firstMatch = firstCatalogMatch(provider, preferences[provider]);
    assert.equal(firstMatch, topPick, `docs/oracle-provider-matrix.md drifted for ${provider}`);
  }
});
