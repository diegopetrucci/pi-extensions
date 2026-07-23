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

test('triage-comments aggregates usage across assistant and compaction session events', async () => {
  const { aggregateAssistantUsage, addSessionEventUsage } = await loadTriageTestUtils();

  assert.deepEqual(
    aggregateAssistantUsage([
      { role: 'assistant', usage: { input: 3, output: 4, cacheRead: 1, cacheWrite: 2, reasoning: 1, totalTokens: 7, cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.02, total: 0.33 } } },
      { role: 'user', usage: { input: 500 } },
      { role: 'assistant', usage: { input: 5, output: 6, cacheRead: 7, cacheWrite: 8, cacheWrite1h: 2, totalTokens: 11, cost: { input: 0.5, output: 0.6, cacheRead: 0.7, cacheWrite: 0.8, total: 2.6 } } },
    ]),
    {
      input: 8,
      output: 10,
      cacheRead: 8,
      cacheWrite: 10,
      cacheWrite1h: 2,
      reasoning: 1,
      totalTokens: 18,
      cost: { input: 0.6, output: 0.8, cacheRead: 0.71, cacheWrite: 0.8200000000000001, total: 2.93 },
    },
  );
  const explicitZeros = aggregateAssistantUsage([{ role: 'assistant', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, reasoning: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }]);
  assert.equal(explicitZeros.cacheWrite1h, 0);
  assert.equal(explicitZeros.reasoning, 0);
  const unreported = aggregateAssistantUsage([]);
  assert.equal('cacheWrite1h' in unreported, false);
  assert.equal('reasoning' in unreported, false);

  const eventTotal = aggregateAssistantUsage([]);
  addSessionEventUsage(eventTotal, {
    type: 'compaction_end',
    result: {
      usage: {
        input: 1,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        cacheWrite1h: 5,
        reasoning: 6,
        totalTokens: 7,
        cost: { input: 0.1, output: 0.2, cacheRead: 0.3, cacheWrite: 0.4, total: 1 },
      },
    },
  });
  addSessionEventUsage(eventTotal, {
    type: 'message_end',
    message: {
      role: 'assistant',
      usage: {
        input: 8,
        output: 9,
        cacheRead: 10,
        cacheWrite: 11,
        totalTokens: 12,
        cost: { input: 0.8, output: 0.9, cacheRead: 1, cacheWrite: 1.1, total: 3.8 },
      },
    },
  });
  assert.deepEqual(eventTotal, {
    input: 9,
    output: 11,
    cacheRead: 13,
    cacheWrite: 15,
    cacheWrite1h: 5,
    reasoning: 6,
    totalTokens: 19,
    cost: { input: 0.9, output: 1.1, cacheRead: 1.3, cacheWrite: 1.5, total: 4.8 },
  });
});

test('triage-comments classifies final assistant outcomes', async () => {
  const { inspectFinalAssistant } = await loadTriageTestUtils();

  assert.deepEqual(inspectFinalAssistant([]), {
    ok: false,
    reason: 'triage_comments subagent produced no assistant message',
  });
  assert.deepEqual(
    inspectFinalAssistant([{ role: 'assistant', stopReason: 'error', errorMessage: 'provider unavailable', content: [{ type: 'text', text: 'partial' }] }]),
    {
      ok: false,
      reason: 'triage_comments subagent error: provider unavailable',
      stopReason: 'error',
      errorMessage: 'provider unavailable',
    },
  );
  assert.deepEqual(inspectFinalAssistant([{ role: 'assistant', stopReason: 'aborted', content: [{ type: 'text', text: 'partial' }] }]), {
    ok: false,
    reason: 'triage_comments subagent aborted before producing a usable answer',
    stopReason: 'aborted',
  });
  assert.deepEqual(inspectFinalAssistant([{ role: 'assistant', stopReason: 'stop', content: [] }]), {
    ok: false,
    reason: 'triage_comments subagent produced no final assistant text (stopReason: stop)',
    stopReason: 'stop',
    errorMessage: undefined,
  });
  assert.deepEqual(inspectFinalAssistant([{ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'ok' }] }]), {
    ok: true,
    answer: 'ok',
    stopReason: 'stop',
  });
});

test('triage-comments distinguishes caller aborts from internal timeouts', async () => {
  const { classifyRunFailure } = await loadTriageTestUtils();

  assert.deepEqual(classifyRunFailure(new Error('triage_comments timed out after 480 seconds.'), false), {
    status: 'error',
    message: 'triage_comments timed out after 480 seconds.',
    error: 'triage_comments timed out after 480 seconds.',
  });
  assert.deepEqual(classifyRunFailure(new Error('triage_comments subagent aborted before producing a usable answer'), false), {
    status: 'error',
    message: 'triage_comments subagent aborted before producing a usable answer',
    error: 'triage_comments subagent aborted before producing a usable answer',
  });
  assert.deepEqual(classifyRunFailure(Object.assign(new Error('unexpected abort'), { name: 'AbortError' }), false), {
    status: 'error',
    message: 'unexpected abort',
    error: 'unexpected abort',
  });
  assert.deepEqual(classifyRunFailure(new Error('provider error after caller abort'), true), {
    status: 'aborted',
    message: 'Aborted',
    error: undefined,
  });
});

test('triage_comments tool_result marks only terminal failures as errors', async () => {
  const extensionModule = await import(pathToFileURL(path.join(repoRoot, 'extensions/triage-comments/index.ts')).href);
  const handlers = new Map();
  extensionModule.default({
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    registerCommand() {},
    registerTool() {},
  });

  const toolResult = handlers.get('tool_result');
  assert.equal(typeof toolResult, 'function');
  assert.deepEqual(await toolResult({ toolName: 'triage_comments', details: { status: 'error' } }), { isError: true });
  assert.equal(await toolResult({ toolName: 'triage_comments', details: { status: 'aborted' } }), undefined);
  assert.equal(await toolResult({ toolName: 'triage_comments', details: { status: 'done' } }), undefined);
  assert.equal(await toolResult({ toolName: 'bash', details: { status: 'error' } }), undefined);
});

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
