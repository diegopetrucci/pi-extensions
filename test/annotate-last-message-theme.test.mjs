import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const themePath = path.join(repoRoot, 'extensions', 'annotate-last-message', 'theme.ts');
const themeSource = await readFile(themePath, 'utf8');
const transpiled = ts.transpileModule(themeSource, {
  fileName: themePath,
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  reportDiagnostics: true,
});
assert.deepEqual(
  transpiled.diagnostics ?? [],
  [],
  `Failed to transpile theme.ts: ${(transpiled.diagnostics ?? [])
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    .join('\n')}`,
);
const themeModuleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, 'utf8').toString('base64')}`;
const { getThemeCssVars, __testing } = await import(themeModuleUrl);

function rgb(r, g, b) {
  return { kind: 'rgb', r, g, b };
}

test('theme bridge provides readable dark and light fallbacks without host theme state', () => {
  const dark = getThemeCssVars();
  assert.equal(dark['--color-scheme'], 'dark');
  assert.equal(dark['--bg'], '#0d1117');
  assert.equal(dark['--text'], '#f0f6fc');
  assert.equal(dark['--mdHeading'], '#f4c95d');

  const light = getThemeCssVars({
    appearance: 'light',
    colors: {},
    fg() {
      throw new Error('token unavailable');
    },
    bg() {
      throw new Error('token unavailable');
    },
  });
  assert.equal(light['--color-scheme'], 'light');
  assert.equal(light['--bg'], '#f6f8fa');
  assert.equal(light['--text'], '#1f2328');
  assert.equal(light['--mdHeading'], '#9a6700');
  assert.equal(light['--mdLink'], '#0969da');
});

test('theme bridge propagates concrete public Theme.colors values and validates them', () => {
  const vars = getThemeCssVars({
    appearance: 'light',
    colors: {
      text: rgb(18, 171, 52),
      mdHeading: rgb(240, 198, 116),
      mdLink: rgb(10, 20, 30),
      customMessageBg: rgb(1, 2, 3),
      selectedBg: rgb(4, 5, 6),
      toolPendingBg: rgb(7, 8, 9),
    },
    fg() {
      throw new Error('only concrete colors should be used in this test');
    },
    bg() {
      throw new Error('only concrete colors should be used in this test');
    },
  });

  assert.equal(vars['--text'], '#12ab34');
  assert.equal(vars['--mdHeading'], '#f0c674');
  assert.equal(vars['--mdLink'], '#0a141e');
  assert.equal(vars['--panel'], '#010203');
  assert.equal(vars['--panel-hover'], '#040506');
  assert.equal(vars['--inset'], '#070809');
  assert.equal(vars['--color-scheme'], 'light');
});

test('theme bridge isolates failing tokens and can use public Theme.fg/bg as a safe fallback', () => {
  const brokenColors = {
    get mdHeading() {
      throw new Error('broken token');
    },
    text: { kind: 'rgb', r: -1, g: 999, b: 0 },
  };
  const theme = {
    appearance: 'light',
    get colors() {
      return brokenColors;
    },
    fg(token) {
      if (token === 'mdHeading') return '\u001b[38;2;18;171;52mX\u001b[39m';
      throw new Error(`broken ${token}`);
    },
    bg() {
      throw new Error('broken background');
    },
  };

  assert.doesNotThrow(() => getThemeCssVars(theme));
  const vars = getThemeCssVars(theme);
  assert.equal(vars['--mdHeading'], '#12ab34');
  assert.equal(vars['--text'], '#1f2328');
  assert.equal(vars['--panel'], '#ffffff');
});

test('theme bridge converts ANSI and indexed values without exposing arbitrary CSS', () => {
  assert.equal(__testing.ansiColorToHex('\u001b[38;2;1;2;3mX', false), '#010203');
  assert.equal(__testing.ansiColorToHex('\u001b[48;5;245mX', true), '#8a8a8a');
  assert.equal(__testing.colorValueToHex(rgb(255, 0, 128)), '#ff0080');
  assert.equal(__testing.colorValueToHex({ kind: 'rgb', r: 'url(x)', g: 0, b: 0 }), null);
  assert.equal(__testing.colorValueToHex({ kind: 'indexed', index: 300 }), null);
});
