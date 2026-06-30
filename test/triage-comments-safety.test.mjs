import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

async function loadTriageTestUtils() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/triage-comments/index.ts')).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.__test__;
}

function createGuardHandlers(factory) {
  const handlers = new Map();
  factory({
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
  });
  return handlers;
}

test('triage-comments parses paste, PR, URL, and help command forms', async () => {
  const { parseTriageCommandArgs } = await loadTriageTestUtils();

  assert.deepEqual(parseTriageCommandArgs(''), {});
  assert.deepEqual(parseTriageCommandArgs('--help'), { help: true });
  assert.deepEqual(parseTriageCommandArgs('paste reconsider naming'), {
    mode: 'paste',
    pastePrefill: 'reconsider naming',
  });
  assert.deepEqual(parseTriageCommandArgs('pr #42'), {
    mode: 'pr',
    target: '#42',
  });
  assert.deepEqual(parseTriageCommandArgs('https://github.com/acme/widgets/pull/7'), {
    mode: 'pr',
    target: 'https://github.com/acme/widgets/pull/7',
  });
  assert.match(parseTriageCommandArgs('bogus').error, /Unknown \/triage-comments option: bogus/);
});

test('triage-comments prepares aliases and normalizes GitHub-like comment input', async () => {
  const { normalizeInput, prepareArguments } = await loadTriageTestUtils();
  const prepared = prepareArguments({
    selectedComments: [
      {
        databaseId: 42,
        body: '  tighten the null check  ',
        user: { login: 'octocat' },
        path: 'src/index.ts',
        line: '7',
        diff_hunk: '@@ -1,1 +1,1 @@',
      },
      '  second comment  ',
    ],
    prContext: { number: 18, url: 'https://github.com/acme/widgets/pull/18' },
    baseContext: { branch: 'main' },
    diffContext: '  diff summary  ',
    extraContext: '  caller context  ',
  });

  assert.deepEqual(prepared.comments, [
    {
      databaseId: 42,
      body: '  tighten the null check  ',
      user: { login: 'octocat' },
      path: 'src/index.ts',
      line: '7',
      diff_hunk: '@@ -1,1 +1,1 @@',
    },
    '  second comment  ',
  ]);
  assert.deepEqual(prepared.pr, { number: 18, url: 'https://github.com/acme/widgets/pull/18' });
  assert.deepEqual(prepared.base, { branch: 'main' });
  assert.equal(prepared.diff, '  diff summary  ');

  const normalized = normalizeInput(prepared);
  assert.equal(normalized.comments.length, 2);
  assert.deepEqual(normalized.comments[0], {
    index: 1,
    id: '42',
    body: 'tighten the null check',
    path: 'src/index.ts',
    line: 7,
    startLine: undefined,
    side: undefined,
    diffHunk: '@@ -1,1 +1,1 @@',
    author: 'octocat',
    url: undefined,
    createdAt: undefined,
    context: undefined,
    metadata: undefined,
  });
  assert.deepEqual(normalized.comments[1], {
    index: 2,
    body: 'second comment',
  });
  assert.deepEqual(normalized.pr, { number: 18, url: 'https://github.com/acme/widgets/pull/18' });
  assert.deepEqual(normalized.base, { branch: 'main' });
  assert.equal(normalized.diff, 'diff summary');
  assert.equal(normalized.context, 'caller context');
});

test('triage-comments normalization rejects empty comment payloads', async () => {
  const { normalizeInput } = await loadTriageTestUtils();

  assert.throws(
    () => normalizeInput({ comments: ['   ', { body: ' ' }] }),
    /expected comments to include at least one non-empty comment body/,
  );
});

test('triage-comments path sandbox rejects symlink escapes outside the checkout', async (t) => {
  const { assertToolPathInsideCwd } = await loadTriageTestUtils();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-guard-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-guard-outside-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  await fs.writeFile(path.join(root, 'README.md'), 'ok\n');
  await fs.symlink(outside, path.join(root, 'escape'));

  assert.equal(await assertToolPathInsideCwd(root, 'README.md', 'read'), undefined);
  assert.match(
    await assertToolPathInsideCwd(root, 'escape', 'read'),
    /read is limited to the local checkout:/,
  );
});

test('triage-comments bash guard allows read-only inspection commands and blocks mutating shells', async () => {
  const { getBlockedBashReason } = await loadTriageTestUtils();

  for (const command of ['git status --short', 'git branch --show-current', 'gh pr view 18', 'gh api repos/acme/widgets/pulls/18', 'pwd -P']) {
    assert.equal(getBlockedBashReason(command), undefined, command);
  }

  const blockedCases = [
    ['git checkout main', /blocks git checkout/],
    ['gh pr review 18', /blocks mutating gh commands/],
    ['gh api graphql', /blocks gh api graphql/],
    ['gh api repos/acme/widgets/pulls/18 -f q=1', /allows read-only gh api calls only; request fields and input files are blocked/],
    ['node script.js', /blocks node/],
    ['pwd src', /allows pwd only with no arguments or -P\/-L/],
    ['git -C .. status', /only allows git -C \./],
    ['git diff | cat', /allows one git, gh, or pwd invocation only/],
  ];

  for (const [command, pattern] of blockedCases) {
    assert.match(getBlockedBashReason(command), pattern, command);
  }
});

test('triage-comments runtime guard enforces read-only tools, default timeout, and final-turn blocking', async (t) => {
  const { createTriageRuntimeGuardExtension } = await loadTriageTestUtils();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-runtime-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const handlers = createGuardHandlers(createTriageRuntimeGuardExtension({ cwd: root, maxTurns: 3 }));
  const turnStart = handlers.get('turn_start');
  const toolCall = handlers.get('tool_call');
  const toolResult = handlers.get('tool_result');

  assert.equal(typeof turnStart, 'function');
  assert.equal(typeof toolCall, 'function');
  assert.equal(typeof toolResult, 'function');

  assert.deepEqual(
    await toolCall({ toolName: 'write', input: { path: 'x' } }),
    {
      block: true,
      reason: 'triage_comments exposes read-only tools only; write is not allowed.',
    },
  );

  await turnStart({ turnIndex: 0 });
  const bashInput = { command: 'gh pr view 18', timeout: 'bad' };
  assert.equal(await toolCall({ toolName: 'bash', input: bashInput }), undefined);
  assert.equal(bashInput.timeout, 30);

  assert.deepEqual(
    await toolResult({ content: [{ type: 'text', text: 'ok' }] }),
    {
      content: [
        { type: 'text', text: 'ok' },
        { type: 'text', text: '\n\n[triage_comments turn budget] turn 1/3' },
      ],
    },
  );

  await turnStart({ turnIndex: 2 });
  assert.deepEqual(
    await toolCall({ toolName: 'read', input: { path: 'README.md' } }),
    {
      block: true,
      reason: 'Tool use is disabled on final triage_comments turn 3/3. Answer now with the evidence already gathered.',
    },
  );
});
