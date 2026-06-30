import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const moduleCache = new Map();
const transpileRoot = await mkdtemp(path.join(repoRoot, '.tmp-footer-status-'));
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
  const moduleUrl = pathToFileURL(outputPath).href;
  const loaded = await import(moduleUrl);
  moduleCache.set(absolutePath, loaded);
  return loaded;
}

function createFakeClock() {
  const handles = [];
  return {
    handles,
    clock: {
      setInterval(callback, ms) {
        const handle = { callback, ms, cleared: false };
        handles.push(handle);
        return handle;
      },
      clearInterval(handle) {
        handle.cleared = true;
      },
    },
  };
}

function createScriptedRunner(steps) {
  const calls = [];
  const queue = [...steps];
  const runner = async (command, args, options) => {
    calls.push({ command, args: [...args], cwd: options.cwd, signal: options.signal });
    const step = queue.shift();
    assert.ok(step, `Unexpected ${command} invocation`);
    assert.equal(command, step.command);
    if (typeof step.assert === 'function') step.assert({ command, args: [...args], options });
    if (typeof step.result === 'function') return step.result({ command, args: [...args], options });
    return step.result;
  };

  return { calls, runner, queue };
}

function createStatusOutput({
  branch = 'feature/footer-tests',
  ahead = 0,
  behind = 0,
  trackedLines = [],
  conflicts = 0,
  untracked = 0,
} = {}) {
  const lines = [`# branch.head ${branch}`, `# branch.ab +${ahead} -${behind}`];
  lines.push(...trackedLines);
  for (let index = 0; index < conflicts; index += 1) {
    lines.push(`u UU N... 100644 100644 100644 100644 conflicted-${index}.ts`);
  }
  for (let index = 0; index < untracked; index += 1) {
    lines.push(`? untracked-${index}.ts`);
  }
  return `${lines.join('\n')}\n`;
}

const gitFooterTesting = (await importTsModule('extensions/git-footer/index.ts')).__testing;
const minimalFooterTesting = (await importTsModule('extensions/minimal-footer/index.ts')).__testing;

const suites = [
  {
    name: 'git-footer',
    testing: gitFooterTesting,
    supportsCanRun: false,
  },
  {
    name: 'minimal-footer',
    testing: minimalFooterTesting,
    supportsCanRun: true,
  },
];

test('footer status helpers parse porcelain v2 output for git-footer and minimal-footer', async (t) => {
  for (const { name, testing } of suites) {
    await t.test(name, () => {
      const parsed = testing.parseGitStatusPorcelainV2(
        [
          '# branch.head feature/footer-status\r',
          '# branch.ab +3 -2',
          '1 MM N... 100644 100644 100644 1234567890abcdef src/app.ts',
          '2 A. N... 100644 100644 100644 1234567890abcdef R100 src/old.ts\tsrc/new.ts',
          '1 .M N... 100644 100644 100644 1234567890abcdef src/dirty.ts',
          'u UU N... 100644 100644 100644 100644 conflicted.ts',
          '? scratch.ts',
        ].join('\n'),
      );

      assert.deepEqual(parsed, {
        branch: 'feature/footer-status',
        staged: 2,
        unstaged: 2,
        untracked: 1,
        conflict: 1,
        ahead: 3,
        behind: 2,
      });

      assert.deepEqual(testing.parseGitStatusPorcelainV2('# branch.head (detached)\n'), {
        branch: 'detached',
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflict: 0,
        ahead: 0,
        behind: 0,
      });
    });
  }
});

test('footer status helpers parse PR JSON and ignore invalid payloads', async (t) => {
  for (const { name, testing } of suites) {
    await t.test(name, () => {
      assert.deepEqual(
        testing.parsePullRequestJson('{"number":17,"state":"OPEN","isDraft":false,"url":"https://example.test/pr/17","title":"Add tests","extra":true}'),
        {
          number: 17,
          state: 'OPEN',
          isDraft: false,
          url: 'https://example.test/pr/17',
          title: 'Add tests',
        },
      );
      assert.deepEqual(testing.parsePullRequestJson('{"number":"44"}'), { number: '44' });
      assert.equal(testing.parsePullRequestJson(''), undefined);
      assert.equal(testing.parsePullRequestJson('not json'), undefined);
      assert.equal(testing.parsePullRequestJson('[]'), undefined);
    });
  }
});

test('footer status helpers format git and PR footer segments consistently', async (t) => {
  for (const { name, testing } of suites) {
    await t.test(name, () => {
      const status = {
        branch: 'feature/footer-status',
        staged: 2.9,
        unstaged: 0,
        untracked: -1,
        conflict: 1,
        ahead: 3,
        behind: Number.NaN,
      };

      assert.equal(testing.formatGitStatusFooterSegment(status), '!1 +2 ↑3');
      assert.equal(testing.formatPullRequestFooterSegment({ number: ' 44 ' }), 'PR #44');
      assert.equal(testing.formatPullRequestFooterSegment({ number: ' 0 ' }), undefined);
      assert.equal(testing.formatGitFooterStatus(status, { number: 44 }), '!1 +2 ↑3 • PR #44');
      assert.equal(
        testing.formatGitFooterStatus(
          {
            branch: 'feature/footer-status',
            staged: 0,
            unstaged: 0,
            untracked: 0,
            conflict: 0,
            ahead: 0,
            behind: 0,
          },
          undefined,
        ),
        undefined,
      );
    });
  }
});

test('footer status caches use fake runners and clocks without invoking real git or gh', async (t) => {
  for (const { name, testing } of suites) {
    await t.test(name, async () => {
      const fakeClock = createFakeClock();
      let changes = 0;
      const { calls, runner } = createScriptedRunner([
        {
          command: 'git',
          result: {
            stdout: createStatusOutput({
              branch: 'feature/footer-tests',
              ahead: 1,
              trackedLines: ['1 M. N... 100644 100644 100644 1234567890abcdef src/app.ts'],
              untracked: 1,
            }),
            stderr: '',
            exitCode: 0,
          },
        },
        {
          command: 'gh',
          result: {
            stdout: '{"number":7,"state":"OPEN"}',
            stderr: '',
            exitCode: 0,
          },
        },
        {
          command: 'git',
          result: {
            stdout: createStatusOutput({ branch: '(detached)' }),
            stderr: '',
            exitCode: 0,
          },
        },
      ]);

      const cache = new testing.GitFooterCache({
        cwd: () => '/tmp/footer-status',
        runner,
        clock: fakeClock.clock,
        refreshIntervalMs: 4321,
        onChange: () => {
          changes += 1;
        },
      });

      await cache.refresh();

      assert.equal(fakeClock.handles.length, 1);
      assert.equal(fakeClock.handles[0].ms, 4321);
      assert.deepEqual(cache.getStatusSnapshot(), {
        branch: 'feature/footer-tests',
        staged: 1,
        unstaged: 0,
        untracked: 1,
        conflict: 0,
        ahead: 1,
        behind: 0,
      });
      assert.deepEqual(cache.getPullRequestSnapshot(), {
        number: 7,
        state: 'OPEN',
      });
      assert.equal(changes, 1);
      assert.deepEqual(
        calls.map(({ command, args, cwd }) => ({ command, args, cwd })),
        [
          { command: 'git', args: [...testing.GIT_STATUS_ARGS], cwd: '/tmp/footer-status' },
          { command: 'gh', args: [...testing.GH_PR_VIEW_ARGS], cwd: '/tmp/footer-status' },
        ],
      );

      await cache.refresh();

      assert.deepEqual(cache.getStatusSnapshot(), {
        branch: 'detached',
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflict: 0,
        ahead: 0,
        behind: 0,
      });
      assert.equal(cache.getPullRequestSnapshot(), undefined);
      assert.equal(changes, 2);
      assert.deepEqual(
        calls.map(({ command }) => command),
        ['git', 'gh', 'git'],
      );

      cache.dispose();
      assert.equal(fakeClock.handles[0].cleared, true);
    });
  }
});

test('footer status caches dedupe in-flight refreshes and abort runners on dispose', async (t) => {
  for (const { name, testing } of suites) {
    await t.test(name, async () => {
      const fakeClock = createFakeClock();
      const calls = [];
      let resolveGit;
      const runner = (command, args, options) => {
        calls.push({ command, args: [...args], signal: options.signal });
        if (command === 'git') {
          return new Promise((resolve) => {
            resolveGit = resolve;
            options.signal.addEventListener(
              'abort',
              () => resolve({ stdout: '', stderr: 'aborted', exitCode: null }),
              { once: true },
            );
          });
        }
        return Promise.resolve({ stdout: '{"number":1}', stderr: '', exitCode: 0 });
      };

      const cache = new testing.GitFooterCache({
        cwd: () => '/tmp/footer-status',
        runner,
        clock: fakeClock.clock,
      });

      const firstRefresh = cache.refresh();
      const secondRefresh = cache.refresh();
      assert.equal(firstRefresh, secondRefresh);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].command, 'git');

      cache.dispose();
      assert.equal(fakeClock.handles[0].cleared, true);
      assert.equal(calls[0].signal.aborted, true);

      resolveGit?.({ stdout: '', stderr: 'aborted', exitCode: null });
      await firstRefresh;
      await cache.refresh();
      assert.equal(calls.length, 1);
    });
  }
});

test('minimal-footer cache clears cached status when project git becomes unavailable', async () => {
  const fakeClock = createFakeClock();
  let canRun = true;
  let changes = 0;
  const { calls, runner } = createScriptedRunner([
    {
      command: 'git',
      result: {
        stdout: createStatusOutput({ branch: 'feature/minimal-footer', ahead: 2 }),
        stderr: '',
        exitCode: 0,
      },
    },
    {
      command: 'gh',
      result: {
        stdout: '{"number":19}',
        stderr: '',
        exitCode: 0,
      },
    },
  ]);

  const cache = new minimalFooterTesting.GitFooterCache({
    cwd: () => '/tmp/minimal-footer',
    canRun: () => canRun,
    runner,
    clock: fakeClock.clock,
    onChange: () => {
      changes += 1;
    },
  });

  await cache.refresh();
  assert.deepEqual(cache.getStatusSnapshot(), {
    branch: 'feature/minimal-footer',
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflict: 0,
    ahead: 2,
    behind: 0,
  });
  assert.deepEqual(cache.getPullRequestSnapshot(), { number: 19 });
  assert.equal(changes, 1);
  assert.equal(calls.length, 2);

  canRun = false;
  await cache.refresh();

  assert.equal(cache.getStatusSnapshot(), undefined);
  assert.equal(cache.getPullRequestSnapshot(), undefined);
  assert.equal(calls.length, 2);
  assert.equal(changes, 2);

  await cache.refresh();
  assert.equal(changes, 2);

  cache.dispose();
});
