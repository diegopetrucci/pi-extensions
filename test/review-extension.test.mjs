import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const reviewModule = await import(pathToFileURL(path.join(repoRoot, 'extensions/review/index.ts')).href);
const reviewExtension = reviewModule.default;
const reviewTestApi = reviewModule.__test__;

function createReviewStateContext({ branchEntries = [], entries = branchEntries } = {}) {
  const widgetCalls = [];
  const notifications = [];

  return {
    widgetCalls,
    notifications,
    ctx: {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        setWidget(name, widget) {
          widgetCalls.push({ name, widget });
        },
      },
      sessionManager: {
        getBranch() {
          return branchEntries;
        },
        getEntries() {
          return entries;
        },
      },
    },
  };
}

function createGitPi(execImpl) {
  return {
    async exec(command, args) {
      return execImpl(command, args);
    },
  };
}

test('review parses blocking findings from findings sections and verdict fallbacks', { concurrency: false }, () => {
  reviewTestApi.resetReviewRuntimeState();

  const messageWithTaggedFinding = [
    '## Findings',
    '```md',
    '- [P0] docs/example.md:1 Example only',
    '```',
    '### [P2] src/review.ts:42 Drops review state on tree switch',
    'This breaks active reviews after navigation.',
    '',
    '## Verdict',
    'correct',
  ].join('\n');

  const messageWithOnlyLowPriority = [
    '## Findings',
    '- [P3] docs/readme.md:12 Tweak copy',
    '',
    'Verdict: correct',
  ].join('\n');

  const messageUsingVerdictFallback = [
    '## Verdict',
    'needs attention',
    '',
    '## Human Reviewer Callouts (Non-Blocking)',
    '- (none)',
  ].join('\n');

  assert.equal(reviewTestApi.hasBlockingReviewFindings(messageWithTaggedFinding), true);
  assert.equal(reviewTestApi.hasBlockingReviewFindings(messageWithOnlyLowPriority), false);
  assert.equal(reviewTestApi.hasBlockingReviewFindings(messageUsingVerdictFallback), true);
});

test('review verdict parsing ignores rubric phrasing that is not an actual needs-attention verdict', { concurrency: false }, () => {
  reviewTestApi.resetReviewRuntimeState();

  const rubricText = [
    '## Verdict',
    '- correct or needs attention',
  ].join('\n');

  assert.equal(reviewTestApi.hasNeedsAttentionVerdict(rubricText), false);
});

test('review parses PR references strictly from numbers and GitHub pull request URLs', { concurrency: false }, () => {
  reviewTestApi.resetReviewRuntimeState();

  assert.equal(reviewTestApi.parsePrReference('42'), 42);
  assert.equal(reviewTestApi.parsePrReference(' 0042 '), 42);
  assert.equal(reviewTestApi.parsePrReference('https://github.com/owner/repo/pull/42/files#discussion_r1'), 42);
  assert.equal(reviewTestApi.parsePrReference('github.com/owner/repo/pull/7'), 7);
  assert.equal(reviewTestApi.parsePrReference('123abc'), null);
  assert.equal(reviewTestApi.parsePrReference('https://github.com/owner/repo/issues/42'), null);
  assert.equal(reviewTestApi.parsePrReference('0'), null);
});

test('review path parsers preserve quoted path arguments and one-off instructions', { concurrency: false }, () => {
  reviewTestApi.resetReviewRuntimeState();

  assert.deepEqual(
    reviewTestApi.parseReviewPaths('src\n"docs/space name"\nREADME.md'),
    ['src', 'docs/space name', 'README.md'],
  );

  assert.deepEqual(
    reviewTestApi.parseArgs('folder "src/my dir" docs README.md --extra "focus on tests"'),
    {
      target: {
        type: 'folder',
        paths: ['src/my dir', 'docs', 'README.md'],
      },
      extraInstruction: 'focus on tests',
    },
  );

  assert.deepEqual(
    reviewTestApi.tokenizeArgs("pr 'https://github.com/acme/repo/pull/12' --extra='security only'"),
    ['pr', 'https://github.com/acme/repo/pull/12', '--extra=security only'],
  );
});

test('review restores persisted review state and settings on session events', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const { pi, handlers } = createExtensionHarness();
  reviewExtension(pi);

  let branchEntries = [
    {
      type: 'custom',
      customType: 'review-session',
      data: { active: false },
    },
    {
      type: 'custom',
      customType: 'review-session',
      data: { active: true, originId: 'origin-123' },
    },
  ];
  let entries = [
    {
      type: 'custom',
      customType: 'review-settings',
      data: { loopFixingEnabled: false, customInstructions: '' },
    },
    {
      type: 'custom',
      customType: 'review-settings',
      data: { loopFixingEnabled: true, customInstructions: '  Focus on API edges  ' },
    },
  ];

  const { ctx, widgetCalls } = createReviewStateContext();
  ctx.sessionManager.getBranch = () => branchEntries;
  ctx.sessionManager.getEntries = () => entries;

  const startHandler = handlers.get('session_start');
  const treeHandler = handlers.get('session_tree');
  assert.equal(typeof startHandler, 'function');
  assert.equal(typeof treeHandler, 'function');

  await startHandler({}, ctx);
  assert.deepEqual(reviewTestApi.getReviewRuntimeState(), {
    reviewOriginId: 'origin-123',
    endReviewInProgress: false,
    reviewLoopFixingEnabled: true,
    reviewCustomInstructions: 'Focus on API edges',
    reviewLoopInProgress: false,
  });
  assert.equal(widgetCalls.at(-1).name, 'review');
  assert.equal(typeof widgetCalls.at(-1).widget, 'function');

  branchEntries = [];
  entries = [];
  await treeHandler({}, ctx);

  assert.deepEqual(reviewTestApi.getReviewRuntimeState(), {
    reviewOriginId: undefined,
    endReviewInProgress: false,
    reviewLoopFixingEnabled: false,
    reviewCustomInstructions: undefined,
    reviewLoopInProgress: false,
  });
  assert.deepEqual(widgetCalls.at(-1), { name: 'review', widget: undefined });
});

test('review prompt helpers build merge-base prompts, fallback prompts, and final prompt sections', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const mergeBasePi = createGitPi(async (_command, args) => {
    if (args[0] === 'rev-parse') {
      return { stdout: 'origin/main\n', stderr: '', code: 0 };
    }
    if (args[0] === 'merge-base') {
      return { stdout: 'abc123def\n', stderr: '', code: 0 };
    }
    throw new Error(`Unexpected git call: ${args.join(' ')}`);
  });

  const basePrompt = await reviewTestApi.buildReviewPrompt(
    mergeBasePi,
    { type: 'baseBranch', branch: 'main' },
    { includeLocalChanges: true },
  );
  assert.match(basePrompt, /merge base commit for this comparison is abc123def/i);
  assert.match(basePrompt, /Also include local working-tree changes/);

  const fallbackPi = createGitPi(async () => ({ stdout: '', stderr: 'missing upstream', code: 1 }));
  const pullRequestPrompt = await reviewTestApi.buildReviewPrompt(
    fallbackPi,
    { type: 'pullRequest', prNumber: 12, baseBranch: 'main', title: 'Fix parser' },
  );
  assert.match(pullRequestPrompt, /Start by finding the merge base between the current branch and main/i);

  assert.equal(
    reviewTestApi.getUserFacingHint({
      type: 'pullRequest',
      prNumber: 12,
      baseBranch: 'main',
      title: 'This title is definitely longer than thirty characters',
    }),
    'PR #12: This title is definitely lo...',
  );

  const fullPrompt = reviewTestApi.composeReviewPrompt('Review the target.', {
    customInstructions: '  Shared preference  ',
    extraInstruction: '  Focus on perf  ',
    projectGuidelines: '  Project rule  ',
  });
  assert.match(fullPrompt, /Please perform a code review with the following focus:\n\nReview the target\./);
  assert.match(fullPrompt, /Shared custom review instructions \(applies to all reviews\):\n\nShared preference/);
  assert.match(fullPrompt, /Additional user-provided review instruction:\n\nFocus on perf/);
  assert.match(fullPrompt, /This project has additional instructions for code reviews:\n\nProject rule/);
});
