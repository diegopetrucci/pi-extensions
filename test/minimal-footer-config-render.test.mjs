import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleCache = new Map();
const transpileRoot = await mkdtemp(path.join(repoRoot, '.tmp-minimal-footer-config-render-'));

after(async () => {
  await rm(transpileRoot, { recursive: true, force: true });
});

function resolveRelativeTsImport(fromFile, specifier) {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = specifier.endsWith('.ts')
    ? [basePath]
    : [`${basePath}.ts`, path.join(basePath, 'index.ts')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(`Could not resolve local TypeScript import ${specifier} from ${fromFile}`);
}

function rewriteRelativeImportSpecifiers(outputText, specifiers) {
  let rewritten = outputText;
  for (const specifier of specifiers) {
    const replacement = specifier.endsWith('.ts')
      ? `${specifier.slice(0, -3)}.mjs`
      : `${specifier}.mjs`;
    rewritten = rewritten.replaceAll(`"${specifier}"`, `"${replacement}"`);
    rewritten = rewritten.replaceAll(`'${specifier}'`, `'${replacement}'`);
  }
  return rewritten;
}

async function transpileTsModule(absolutePath, seen = new Set()) {
  if (seen.has(absolutePath)) return;
  seen.add(absolutePath);

  const relativePath = path.relative(repoRoot, absolutePath);
  const outputPath = path.join(transpileRoot, relativePath).replace(/\.ts$/, '.mjs');
  const sourceText = await readFile(absolutePath, 'utf8');
  const relativeSpecifiers = [];

  for (const importedFile of ts.preProcessFile(sourceText, true, true).importedFiles) {
    const specifier = importedFile.fileName;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
    relativeSpecifiers.push(specifier);
    await transpileTsModule(resolveRelativeTsImport(absolutePath, specifier), seen);
  }

  const transpiled = ts.transpileModule(sourceText, {
    fileName: absolutePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  const diagnostics = transpiled.diagnostics ?? [];
  assert.equal(
    diagnostics.length,
    0,
    diagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n'),
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rewriteRelativeImportSpecifiers(transpiled.outputText, relativeSpecifiers));
}

async function importTsModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const cached = moduleCache.get(absolutePath);
  if (cached) return cached;

  await transpileTsModule(absolutePath);
  const outputPath = path.join(transpileRoot, relativePath).replace(/\.ts$/, '.mjs');
  const loaded = await import(pathToFileURL(outputPath).href);
  moduleCache.set(absolutePath, loaded);
  return loaded;
}

const minimalFooterModule = await importTsModule('extensions/minimal-footer/index.ts');
const { loadConfig, renderFooterLines } = minimalFooterModule.__testing;

function setEnv(t, key, value) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });
}

function setupTempDirs(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'minimal-footer-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const projectDir = path.join(rootDir, 'workspace', 'sample-repo');
  const nestedDir = path.join(projectDir, 'packages', 'app', 'src');

  mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  mkdirSync(path.join(projectDir, '.pi'), { recursive: true });
  mkdirSync(nestedDir, { recursive: true });

  setEnv(t, 'PI_CODING_AGENT_DIR', agentDir);
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  return { agentDir, projectDir, nestedDir };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function captureConsoleError(run) {
  const messages = [];
  const original = console.error;
  console.error = (...args) => {
    messages.push(args.map(String).join(' '));
  };

  try {
    return { result: run(), messages };
  } finally {
    console.error = original;
  }
}

const plainTheme = {
  fg(_color, text) {
    return text;
  },
};

test('minimal-footer loadConfig prefers trusted project config over global config and ignores untrusted project overrides', (t) => {
  const { agentDir, projectDir, nestedDir } = setupTempDirs(t);

  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    context: {
      showPercent: false,
      dumbZone: {
        thresholdTokens: 150000,
        label: 'GLOBAL ZONE',
        color: 'warning',
      },
    },
    codexUsage: {
      requestTimeoutMs: 2222,
      windows: {
        primary: { label: 'work' },
        secondary: { enabled: false, label: 'week' },
      },
    },
    experimentalMarker: {
      label: 'exp',
      color: 'accent',
    },
    gitStatus: {
      enabled: false,
      refreshIntervalMs: 12345,
      gitTimeoutMs: 654,
      ghTimeoutMs: 987,
    },
  });

  writeJson(path.join(projectDir, '.pi', 'minimal-footer.json'), {
    context: {
      showPercent: true,
      dumbZone: {
        enabled: false,
        thresholdTokens: 275000,
        label: 'PROJECT ZONE',
      },
    },
    codexUsage: {
      windows: {
        secondary: { enabled: true, label: '7day' },
      },
    },
    experimentalMarker: {
      enabled: false,
    },
    gitStatus: {
      enabled: true,
      gitTimeoutMs: 1111,
    },
  });

  const trustedConfig = loadConfig({
    cwd: nestedDir,
    isProjectTrusted() {
      return true;
    },
  });

  assert.deepEqual(trustedConfig, {
    context: {
      showPercent: true,
      dumbZone: {
        enabled: false,
        thresholdTokens: 275000,
        label: 'PROJECT ZONE',
        color: 'warning',
      },
    },
    codexUsage: {
      enabled: true,
      cacheTtlMs: 300000,
      requestTimeoutMs: 2222,
      windows: {
        primary: {
          enabled: true,
          label: 'work',
        },
        secondary: {
          enabled: true,
          label: '7day',
        },
      },
    },
    experimentalMarker: {
      enabled: false,
      label: 'exp',
      color: 'accent',
    },
    gitStatus: {
      enabled: true,
      refreshIntervalMs: 12345,
      gitTimeoutMs: 1111,
      ghTimeoutMs: 987,
    },
  });

  const untrustedConfig = loadConfig({
    cwd: nestedDir,
    isProjectTrusted() {
      return false;
    },
  });

  assert.deepEqual(untrustedConfig, {
    context: {
      showPercent: false,
      dumbZone: {
        enabled: true,
        thresholdTokens: 150000,
        label: 'GLOBAL ZONE',
        color: 'warning',
      },
    },
    codexUsage: {
      enabled: true,
      cacheTtlMs: 300000,
      requestTimeoutMs: 2222,
      windows: {
        primary: {
          enabled: true,
          label: 'work',
        },
        secondary: {
          enabled: false,
          label: 'week',
        },
      },
    },
    experimentalMarker: {
      enabled: true,
      label: 'exp',
      color: 'accent',
    },
    gitStatus: {
      enabled: false,
      refreshIntervalMs: 12345,
      gitTimeoutMs: 654,
      ghTimeoutMs: 987,
    },
  });
});

test('minimal-footer loadConfig falls back when project config is malformed or contains invalid values', (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  const projectConfigPath = path.join(projectDir, '.pi', 'minimal-footer.json');

  writeJson(path.join(agentDir, 'extensions', 'minimal-footer.json'), {
    context: {
      showPercent: false,
      dumbZone: {
        enabled: false,
        thresholdTokens: 123456,
        label: 'GLOBAL',
        color: 'accent',
      },
    },
    codexUsage: {
      enabled: false,
      cacheTtlMs: 999,
      requestTimeoutMs: 2222,
      windows: {
        primary: { enabled: false, label: 'five' },
        secondary: { enabled: true, label: 'seven' },
      },
    },
    experimentalMarker: {
      enabled: false,
      label: 'global-exp',
      color: 'text',
    },
    gitStatus: {
      enabled: false,
      refreshIntervalMs: 4444,
      gitTimeoutMs: 555,
      ghTimeoutMs: 666,
    },
  });

  writeFileSync(projectConfigPath, '{ this is not valid json\n');
  const malformed = captureConsoleError(() =>
    loadConfig({
      cwd: projectDir,
      isProjectTrusted() {
        return true;
      },
    }),
  );

  assert.equal(malformed.messages.length, 1);
  assert.match(malformed.messages[0], /Warning: Could not parse .*minimal-footer\.json:/);
  assert.deepEqual(malformed.result, {
    context: {
      showPercent: false,
      dumbZone: {
        enabled: false,
        thresholdTokens: 123456,
        label: 'GLOBAL',
        color: 'accent',
      },
    },
    codexUsage: {
      enabled: false,
      cacheTtlMs: 999,
      requestTimeoutMs: 2222,
      windows: {
        primary: {
          enabled: false,
          label: 'five',
        },
        secondary: {
          enabled: true,
          label: 'seven',
        },
      },
    },
    experimentalMarker: {
      enabled: false,
      label: 'global-exp',
      color: 'text',
    },
    gitStatus: {
      enabled: false,
      refreshIntervalMs: 4444,
      gitTimeoutMs: 555,
      ghTimeoutMs: 666,
    },
  });

  writeJson(projectConfigPath, {
    context: {
      showPercent: 'yes',
      dumbZone: {
        enabled: 'no',
        thresholdTokens: -5,
        label: '   ',
        color: 'magenta',
      },
    },
    codexUsage: {
      enabled: 'true',
      cacheTtlMs: -1,
      requestTimeoutMs: 0,
      windows: {
        primary: { enabled: 'no', label: '   ' },
        secondary: { enabled: 'nope', label: 7 },
      },
    },
    experimentalMarker: {
      enabled: 'on',
      label: '',
      color: 'purple',
    },
    gitStatus: {
      enabled: 'y',
      refreshIntervalMs: 0,
      gitTimeoutMs: -1,
      ghTimeoutMs: 'soon',
    },
  });

  assert.deepEqual(
    loadConfig({
      cwd: projectDir,
      isProjectTrusted() {
        return true;
      },
    }),
    malformed.result,
  );
});

test('minimal-footer renderFooterLines renders branch, repo, context, thinking, dumb-zone, usage, and experimental marker from fake data', (t) => {
  setEnv(t, 'PI_EXPERIMENTAL', '1');

  const config = {
    context: {
      showPercent: true,
      dumbZone: {
        enabled: true,
        thresholdTokens: 200000,
        label: 'DUMB ZONE',
        color: 'error',
      },
    },
    codexUsage: {
      enabled: true,
      cacheTtlMs: 300000,
      requestTimeoutMs: 10000,
      windows: {
        primary: {
          enabled: true,
          label: '5h',
        },
        secondary: {
          enabled: true,
          label: '7d',
        },
      },
    },
    experimentalMarker: {
      enabled: true,
      label: 'xp',
      color: 'warning',
    },
    gitStatus: {
      enabled: true,
      refreshIntervalMs: 8000,
      gitTimeoutMs: 1500,
      ghTimeoutMs: 3000,
    },
  };

  assert.deepEqual(
    renderFooterLines({
      width: 40,
      cwd: '/tmp/workspace/sample-repo',
      config,
      branch: 'feature/footer-tests',
      gitStatus: '!1 +2 ↑3 • PR #44',
      contextUsage: {
        percent: 87.4,
        tokens: 250000,
      },
      modelId: 'gpt-5.5',
      modelProvider: 'openai-codex',
      thinkingLevel: 'high',
      theme: plainTheme,
      usageSnapshot: {
        primary: { usedPercent: 12.4 },
        secondary: { usedPercent: 67.6 },
        fetchedAt: 123,
      },
    }),
    [
      'feature/footer-tests · !1 +2 ↑3 • PR #44',
      'sample-repo',
      '87.4% · DUMB ZONE · 5h 12% · 7d 68% · xp',
      'gpt-5.5 high',
    ],
  );
});
