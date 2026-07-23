import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFIG_DIR_NAME, initTheme } from '@earendil-works/pi-coding-agent';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const reviewModule = await import(pathToFileURL(path.join(repoRoot, 'extensions/review/index.ts')).href);
const reviewExtension = reviewModule.default;
const reviewTestApi = reviewModule.__test__;

initTheme('dark');

function createReviewStateContext({ branchEntries = [], entries = branchEntries, mode = 'tui' } = {}) {
  const widgetCalls = [];
  const notifications = [];

  return {
    widgetCalls,
    notifications,
    ctx: {
      hasUI: true,
      mode,
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

function createResponseQueue(values, fallback = undefined) {
  const queue = Array.isArray(values) ? [...values] : values === undefined ? [] : [values];
  return (...args) => {
    if (queue.length === 0) {
      return typeof fallback === 'function' ? fallback(...args) : fallback;
    }
    const next = queue.shift();
    return typeof next === 'function' ? next(...args) : next;
  };
}

function createReviewHarness({ execImpl } = {}) {
  const harness = createExtensionHarness({ execImpl });
  const appendEntries = [];
  const sentUserMessages = [];

  harness.pi.appendEntry = (customType, data) => {
    appendEntries.push({ customType, data });
  };
  harness.pi.sendUserMessage = (message, options) => {
    sentUserMessages.push({ message, options });
  };

  reviewExtension(harness.pi);

  return {
    ...harness,
    appendEntries,
    sentUserMessages,
    reviewHandler: harness.commands.get('review').handler,
    endReviewHandler: harness.commands.get('end-review').handler,
  };
}

function createReviewCommandContext({
  hasUI = true,
  mode = 'tui',
  entries = [],
  branchEntries = entries,
  leafId = 'leaf-1',
  selectResponses,
  editorResponses,
  customResponses,
  navigateTreeImpl,
  abortImpl,
  initialEditorText = '',
} = {}) {
  const notifications = [];
  const selectCalls = [];
  const editorCalls = [];
  const customCalls = [];
  const navigateCalls = [];
  const setEditorTextCalls = [];
  const widgetCalls = [];
  const waitForIdleCalls = [];
  const abortCalls = [];
  let editorText = initialEditorText;

  const nextSelect = createResponseQueue(selectResponses);
  const nextEditor = createResponseQueue(editorResponses);
  const nextCustom = createResponseQueue(customResponses);

  return {
    notifications,
    selectCalls,
    editorCalls,
    customCalls,
    navigateCalls,
    setEditorTextCalls,
    widgetCalls,
    waitForIdleCalls,
    abortCalls,
    ctx: {
      hasUI,
      mode,
      cwd: repoRoot,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        async select(prompt, items) {
          selectCalls.push({ prompt, items });
          return nextSelect(prompt, items);
        },
        async editor(prompt, initialValue) {
          editorCalls.push({ prompt, initialValue });
          return nextEditor(prompt, initialValue);
        },
        async custom(renderer) {
          customCalls.push({ renderer });
          return nextCustom(renderer);
        },
        setEditorText(text) {
          editorText = text;
          setEditorTextCalls.push(text);
        },
        getEditorText() {
          return editorText;
        },
        setWidget(name, widget) {
          widgetCalls.push({ name, widget });
        },
      },
      sessionManager: {
        getEntries() {
          return entries;
        },
        getBranch() {
          return branchEntries;
        },
        getLeafId() {
          return leafId;
        },
      },
      async navigateTree(id, options) {
        navigateCalls.push({ id, options });
        if (navigateTreeImpl) {
          return navigateTreeImpl(id, options);
        }
        return { cancelled: false };
      },
      abort() {
        abortCalls.push(true);
        return abortImpl?.();
      },
      async waitForIdle() {
        waitForIdleCalls.push(true);
      },
      isIdle() {
        return true;
      },
      hasPendingMessages() {
        return false;
      },
    },
  };
}

function createCleanGitExec({
  status = '',
  currentBranch = 'feature/review-tests',
  defaultBranch = 'main',
  branches = [currentBranch, defaultBranch],
} = {}) {
  return async (command, args) => {
    assert.equal(command, 'git');

    if (args[0] === 'rev-parse' && args[1] === '--git-dir') {
      return { stdout: '.git\n', stderr: '', code: 0 };
    }
    if (args[0] === 'status' && args[1] === '--porcelain') {
      return { stdout: status, stderr: '', code: 0 };
    }
    if (args[0] === 'branch' && args[1] === '--show-current') {
      return { stdout: `${currentBranch}\n`, stderr: '', code: 0 };
    }
    if (args[0] === 'symbolic-ref' && args[1] === 'refs/remotes/origin/HEAD') {
      return { stdout: `origin/${defaultBranch}\n`, stderr: '', code: 0 };
    }
    if (args[0] === 'branch' && args[1] === '--format=%(refname:short)') {
      return { stdout: `${branches.join('\n')}\n`, stderr: '', code: 0 };
    }

    throw new Error(`Unexpected git call: ${args.join(' ')}`);
  };
}

test('review loads trusted project guidelines from next to the runtime config directory', async (t) => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'review-guidelines-test-'));
  const projectDir = path.join(rootDir, 'workspace', 'sample-project');
  const nestedDir = path.join(projectDir, 'packages', 'app');

  mkdirSync(path.join(projectDir, CONFIG_DIR_NAME), { recursive: true });
  mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
  mkdirSync(nestedDir, { recursive: true });
  writeFileSync(path.join(projectDir, 'REVIEW_GUIDELINES.md'), '  Focus on trusted project rules.\n');
  writeFileSync(path.join(projectDir, 'docs', 'REVIEW_GUIDELINES.md'), 'Ignore me.\n');
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  await assert.doesNotReject(async () => {
    assert.equal(
      await reviewTestApi.loadProjectReviewGuidelines(nestedDir),
      'Focus on trusted project rules.',
    );
    assert.equal(await reviewTestApi.loadProjectReviewGuidelines(path.join(rootDir, 'workspace')), null);
  });
});

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

test('review verdict parsing ignores rubric phrasing, handles quoted verdicts, and findings parsing ignores priority legends', { concurrency: false }, () => {
  reviewTestApi.resetReviewRuntimeState();

  const rubricText = [
    '## Verdict',
    '- correct or needs attention',
  ].join('\n');

  const quotedVerdictText = [
    '## Verdict',
    '- "Needs Attention"',
  ].join('\n');

  const priorityLegendText = [
    '## Findings',
    '- [P0] - Drop everything to fix',
    '- [P1] - Urgent',
    '',
    'Verdict: correct',
  ].join('\n');

  assert.equal(reviewTestApi.hasNeedsAttentionVerdict(rubricText), false);
  assert.equal(reviewTestApi.hasNeedsAttentionVerdict(quotedVerdictText), true);
  assert.equal(reviewTestApi.hasBlockingReviewFindings(priorityLegendText), false);
});

test('review parses PR references strictly from numbers and GitHub pull request URLs', { concurrency: false }, () => {
  reviewTestApi.resetReviewRuntimeState();

  assert.equal(reviewTestApi.parsePrReference('42'), 42);
  assert.equal(reviewTestApi.parsePrReference(' 0042 '), 42);
  assert.equal(reviewTestApi.parsePrReference('https://github.com/owner/repo/pull/42/files#discussion_r1'), 42);
  assert.equal(reviewTestApi.parsePrReference('github.com/owner/repo/pull/7'), 7);
  assert.equal(reviewTestApi.parsePrReference('https://www.github.com/owner/repo/pull/9'), 9);
  assert.equal(reviewTestApi.parsePrReference('123abc'), null);
  assert.equal(reviewTestApi.parsePrReference('https://github.com/owner/repo/issues/42'), null);
  assert.equal(reviewTestApi.parsePrReference('https://notgithub.com/owner/repo/pull/42'), null);
  assert.equal(reviewTestApi.parsePrReference('https://example.com/github.com/owner/repo/pull/42'), null);
  assert.equal(reviewTestApi.parsePrReference('ftp://github.com/owner/repo/pull/42'), null);
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

test('review state and settings helpers keep the latest entries and normalize stored values', { concurrency: false }, () => {
  reviewTestApi.resetReviewRuntimeState();

  const parsedState = reviewTestApi.getReviewState({
    sessionManager: {
      getBranch() {
        return [
          {
            type: 'custom',
            customType: 'review-session',
            data: { active: true, originId: 'origin-old' },
          },
          {
            type: 'custom',
            customType: 'review-session',
            data: { active: false, originId: 'origin-new' },
          },
        ];
      },
    },
  });

  const parsedSettings = reviewTestApi.getReviewSettings({
    sessionManager: {
      getEntries() {
        return [
          {
            type: 'custom',
            customType: 'review-settings',
            data: { loopFixingEnabled: true, customInstructions: ' keep me ' },
          },
          {
            type: 'custom',
            customType: 'review-settings',
            data: { loopFixingEnabled: false, customInstructions: '   ' },
          },
        ];
      },
    },
  });

  assert.deepEqual(parsedState, { active: false, originId: 'origin-new' });
  assert.deepEqual(parsedSettings, {
    loopFixingEnabled: false,
    customInstructions: undefined,
  });
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

test('review state restoration skips component widgets outside TUI mode', { concurrency: false }, () => {
  reviewTestApi.resetReviewRuntimeState();

  const { ctx, widgetCalls } = createReviewStateContext({
    mode: 'rpc',
    branchEntries: [
      {
        type: 'custom',
        customType: 'review-session',
        data: { active: true, originId: 'origin-rpc' },
      },
    ],
  });

  reviewTestApi.applyReviewState(ctx);

  assert.deepEqual(reviewTestApi.getReviewRuntimeState(), {
    reviewOriginId: 'origin-rpc',
    endReviewInProgress: false,
    reviewLoopFixingEnabled: false,
    reviewCustomInstructions: undefined,
    reviewLoopInProgress: false,
  });
  assert.deepEqual(widgetCalls, [{ name: 'review', widget: undefined }]);
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

  const mergeBasePullRequestPrompt = await reviewTestApi.buildReviewPrompt(
    mergeBasePi,
    { type: 'pullRequest', prNumber: 12, baseBranch: 'main', title: 'Fix parser' },
    { includeLocalChanges: true },
  );
  assert.match(mergeBasePullRequestPrompt, /Review pull request #12 \("Fix parser"\) against the base branch 'main'/);
  assert.match(mergeBasePullRequestPrompt, /Run `git diff abc123def` to inspect the changes that would be merged\./);
  assert.match(mergeBasePullRequestPrompt, /Also include local working-tree changes/);

  const fallbackPi = createGitPi(async () => ({ stdout: '', stderr: 'missing upstream', code: 1 }));
  const branchFallbackPrompt = await reviewTestApi.buildReviewPrompt(
    fallbackPi,
    { type: 'baseBranch', branch: 'release' },
  );
  assert.match(branchFallbackPrompt, /Start by finding the merge diff between the current branch and release's upstream/i);

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

  const minimalPrompt = reviewTestApi.composeReviewPrompt('Review the target.', {
    customInstructions: '   ',
    extraInstruction: '',
    projectGuidelines: '  ',
  });
  assert.doesNotMatch(minimalPrompt, /Shared custom review instructions/);
  assert.doesNotMatch(minimalPrompt, /Additional user-provided review instruction/);
  assert.doesNotMatch(minimalPrompt, /This project has additional instructions for code reviews/);
});

test('review command guards non-TUI, active-review, and missing-git-repo paths before starting work', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const rpcHarness = createReviewHarness();
  const rpcContext = createReviewCommandContext({ hasUI: true, mode: 'rpc' });
  await rpcHarness.reviewHandler('', rpcContext.ctx);
  assert.deepEqual(rpcContext.notifications, [{ message: 'Review requires interactive mode', level: 'error' }]);
  assert.deepEqual(rpcHarness.execCalls, []);
  assert.deepEqual(rpcHarness.sentUserMessages, []);

  const noUiHarness = createReviewHarness();
  const noUiContext = createReviewCommandContext({ hasUI: false, mode: 'rpc' });
  await noUiHarness.reviewHandler('', noUiContext.ctx);
  assert.deepEqual(noUiContext.notifications, [{ message: 'Review requires interactive mode', level: 'error' }]);
  assert.deepEqual(noUiHarness.execCalls, []);
  assert.deepEqual(noUiHarness.sentUserMessages, []);

  reviewTestApi.resetReviewRuntimeState();
  const activeReviewState = createReviewStateContext({
    branchEntries: [
      {
        type: 'custom',
        customType: 'review-session',
        data: { active: true, originId: 'origin-active' },
      },
    ],
  });
  reviewTestApi.applyReviewState(activeReviewState.ctx);

  const activeHarness = createReviewHarness({ execImpl: createCleanGitExec() });
  const activeContext = createReviewCommandContext();
  await activeHarness.reviewHandler('', activeContext.ctx);
  assert.deepEqual(activeContext.notifications, [
    { message: 'Already in a review. Use /end-review to finish first.', level: 'warning' },
  ]);
  assert.deepEqual(activeHarness.execCalls, []);
  assert.deepEqual(activeHarness.sentUserMessages, []);

  reviewTestApi.resetReviewRuntimeState();
  const missingRepoHarness = createReviewHarness({
    execImpl: async (command, args) => {
      assert.equal(command, 'git');
      assert.deepEqual(args, ['rev-parse', '--git-dir']);
      return { stdout: '', stderr: 'fatal: not a git repository', code: 128 };
    },
  });
  const missingRepoContext = createReviewCommandContext();
  await missingRepoHarness.reviewHandler('', missingRepoContext.ctx);
  assert.deepEqual(missingRepoContext.notifications, [{ message: 'Not a git repository', level: 'error' }]);
  assert.equal(missingRepoContext.customCalls.length, 0);
  assert.deepEqual(missingRepoHarness.sentUserMessages, []);
});

test('review command rejects invalid PR args without gh or checkout and cancels cleanly', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const harness = createReviewHarness({ execImpl: createCleanGitExec() });
  const context = createReviewCommandContext({ customResponses: [null] });

  await harness.reviewHandler('pr definitely-not-a-pr', context.ctx);

  assert.deepEqual(context.notifications, [
    { message: 'Invalid PR reference. Enter a number or GitHub PR URL.', level: 'error' },
    { message: 'PR review failed. Returning to review menu.', level: 'warning' },
    { message: 'Review cancelled', level: 'info' },
  ]);
  assert.equal(context.customCalls.length, 1);
  assert.deepEqual(harness.sentUserMessages, []);
  assert.ok(harness.execCalls.every(([command]) => command === 'git'));
  assert.ok(harness.execCalls.every(([, args]) => !args.includes('checkout')));
});

test('review command loops back to the selector when session-mode selection is cancelled from a selector target', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const harness = createReviewHarness({ execImpl: createCleanGitExec() });
  const context = createReviewCommandContext({
    entries: [{ type: 'message', message: { role: 'user', text: 'start review' }, id: 'user-1' }],
    customResponses: ['uncommitted', null],
    selectResponses: [undefined],
  });

  await harness.reviewHandler('', context.ctx);

  assert.equal(context.customCalls.length, 2);
  assert.deepEqual(context.selectCalls.map((call) => call.prompt), ['Start review in:']);
  assert.deepEqual(context.notifications, [{ message: 'Review cancelled', level: 'info' }]);
  assert.deepEqual(harness.sentUserMessages, []);
});

test('review command blocks loop-fixing commit targets before starting a review turn', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const settingsState = createReviewStateContext({
    entries: [
      {
        type: 'custom',
        customType: 'review-settings',
        data: { loopFixingEnabled: true },
      },
    ],
  });
  reviewTestApi.applyReviewSettings(settingsState.ctx);

  const harness = createReviewHarness({ execImpl: createCleanGitExec() });
  const context = createReviewCommandContext();

  await harness.reviewHandler('commit abc123def Fix parser', context.ctx);

  assert.deepEqual(context.notifications, [{ message: 'Loop mode does not work with commit review.', level: 'error' }]);
  assert.equal(context.selectCalls.length, 0);
  assert.deepEqual(harness.sentUserMessages, []);
});

test('end-review exits early when no review is active and never opens the finish selector', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const harness = createReviewHarness();
  const context = createReviewCommandContext();

  await harness.endReviewHandler('', context.ctx);

  assert.equal(context.selectCalls.length, 0);
  assert.deepEqual(context.notifications, [
    {
      message: 'Not in a review branch (use /review first, or review was started in current session mode)',
      level: 'info',
    },
  ]);
  assert.deepEqual(harness.appendEntries, []);
});

test('end-review keeps RPC-capable selection dialogs but skips the custom summary loader outside TUI mode', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const branchEntries = [
    {
      type: 'custom',
      customType: 'review-session',
      data: { active: true, originId: 'origin-rpc-end-review' },
    },
  ];
  const activeReviewState = createReviewStateContext({ branchEntries });
  reviewTestApi.applyReviewState(activeReviewState.ctx);

  const harness = createReviewHarness();
  const context = createReviewCommandContext({
    hasUI: true,
    mode: 'rpc',
    branchEntries,
    selectResponses: ['Return and summarize'],
  });

  await harness.endReviewHandler('', context.ctx);

  assert.deepEqual(context.selectCalls.map((call) => call.prompt), ['Finish review:']);
  assert.equal(context.customCalls.length, 0);
  assert.equal(context.navigateCalls.length, 1);
  assert.deepEqual(context.navigateCalls[0], {
    id: 'origin-rpc-end-review',
    options: {
      summarize: true,
      customInstructions: reviewTestApi.REVIEW_SUMMARY_PROMPT,
      replaceInstructions: true,
    },
  });
  assert.deepEqual(context.setEditorTextCalls, ['Act on the review findings']);
  assert.deepEqual(context.notifications, [{ message: 'Review complete! Returned and summarized.', level: 'info' }]);
  assert.deepEqual(harness.appendEntries, [{ customType: 'review-session', data: { active: false } }]);
});

test('end-review escape is idempotent, catches synchronous abort failure, and waits for navigation', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const branchEntries = [
    {
      type: 'custom',
      customType: 'review-session',
      data: { active: true, originId: 'origin-loader-cancel' },
    },
  ];
  const activeReviewState = createReviewStateContext({ branchEntries });
  reviewTestApi.applyReviewState(activeReviewState.ctx);

  let resolveNavigation;
  const navigationSettled = new Promise((resolve) => {
    resolveNavigation = resolve;
  });

  const harness = createReviewHarness();
  const context = createReviewCommandContext({
    hasUI: true,
    mode: 'tui',
    branchEntries,
    selectResponses: ['Return and summarize'],
    customResponses: [async (renderer) => {
      let resolveDone;
      const doneResult = new Promise((resolve) => {
        resolveDone = resolve;
      });
      const loader = renderer(
        { requestRender() {} },
        { fg(_key, text) { return text; } },
        {},
        resolveDone,
      );
      loader.loader.onAbort();
      loader.loader.onAbort();
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(context.abortCalls.length, 1);
      assert.equal(context.navigateCalls.length, 1);
      assert.equal(harness.appendEntries.length, 0);
      resolveNavigation({ cancelled: true });
      const result = await doneResult;
      loader.dispose?.();
      return result;
    }],
    navigateTreeImpl: () => navigationSettled,
    abortImpl: () => {
      throw new Error('synchronous abort failure');
    },
  });

  await harness.endReviewHandler('', context.ctx);

  assert.equal(context.customCalls.length, 1);
  assert.deepEqual(context.notifications, [{ message: 'Navigation cancelled. Use /end-review to try again.', level: 'info' }]);
  assert.deepEqual(context.setEditorTextCalls, []);
  assert.deepEqual(harness.appendEntries, []);
  assert.deepEqual(harness.sentUserMessages, []);
  assert.equal(reviewTestApi.getReviewRuntimeState().reviewOriginId, 'origin-loader-cancel');
});

test('end-review late success after escape clears review state, warns, and suppresses follow-up actions', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const branchEntries = [
    {
      type: 'custom',
      customType: 'review-session',
      data: { active: true, originId: 'origin-loader-async-cancel' },
    },
  ];
  const activeReviewState = createReviewStateContext({ branchEntries });
  reviewTestApi.applyReviewState(activeReviewState.ctx);

  let resolveNavigation;
  const navigationSettled = new Promise((resolve) => {
    resolveNavigation = resolve;
  });

  let loader;
  const harness = createReviewHarness();
  const context = createReviewCommandContext({
    hasUI: true,
    mode: 'tui',
    branchEntries,
    selectResponses: ['Return and summarize'],
    customResponses: [(renderer) => new Promise((resolve) => {
      loader = renderer(
        { requestRender() {} },
        { fg(_key, text) { return text; } },
        {},
        (result) => {
          loader.dispose?.();
          resolve(result);
        },
      );
    })],
    navigateTreeImpl: () => navigationSettled,
    abortImpl: async () => {
      throw new Error('async abort failure');
    },
  });

  let handlerSettled = false;
  const endReviewRun = harness.endReviewHandler('', context.ctx).then(() => {
    handlerSettled = true;
  });

  await Promise.resolve();
  assert.ok(loader);

  loader.loader.onAbort();
  loader.loader.onAbort();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(context.abortCalls.length, 1);
  assert.equal(context.navigateCalls.length, 1);
  assert.equal(handlerSettled, false);
  assert.deepEqual(context.notifications, []);
  assert.deepEqual(context.setEditorTextCalls, []);
  assert.deepEqual(harness.appendEntries, []);
  assert.deepEqual(harness.sentUserMessages, []);

  branchEntries.splice(0, branchEntries.length, {
    type: 'custom',
    customType: 'review-session',
    data: { active: false },
  });
  reviewTestApi.applyReviewState(context.ctx);
  resolveNavigation({ cancelled: false });
  await endReviewRun;

  assert.equal(context.customCalls.length, 1);
  assert.deepEqual(context.notifications, [{
    message: 'Cancellation arrived too late; review already completed, and no follow-up was queued.',
    level: 'warning',
  }]);
  assert.deepEqual(context.setEditorTextCalls, []);
  assert.deepEqual(harness.appendEntries, [{ customType: 'review-session', data: { active: false } }]);
  assert.deepEqual(harness.sentUserMessages, []);
  assert.equal(reviewTestApi.getReviewRuntimeState().reviewOriginId, undefined);
});

test('review summary prompt preserves the required handoff sections and reviewer callout guidance', { concurrency: false }, () => {
  reviewTestApi.resetReviewRuntimeState();

  const summaryPrompt = reviewTestApi.REVIEW_SUMMARY_PROMPT;
  assert.match(summaryPrompt, /^We are leaving a code-review branch and returning to the main coding branch\./);
  assert.match(summaryPrompt, /## Review Scope[\s\S]*## Verdict[\s\S]*## Findings[\s\S]*## Fix Queue[\s\S]*## Constraints & Preferences[\s\S]*## Human Reviewer Callouts \(Non-Blocking\)/);
  assert.match(summaryPrompt, /If none apply, write "- \(none\)"\./);
  assert.match(summaryPrompt, /These are informational callouts for humans and are not fix items by themselves\./);
});

test('end-review guards no-UI, concurrent runs, stale state cleanup, and cancellation paths', { concurrency: false }, async () => {
  reviewTestApi.resetReviewRuntimeState();

  const noUiHarness = createReviewHarness();
  const noUiContext = createReviewCommandContext({ hasUI: false });
  await noUiHarness.endReviewHandler('', noUiContext.ctx);
  assert.deepEqual(noUiContext.notifications, [{ message: 'End-review requires interactive mode', level: 'error' }]);

  reviewTestApi.resetReviewRuntimeState();
  const activeReviewState = createReviewStateContext({
    branchEntries: [
      {
        type: 'custom',
        customType: 'review-session',
        data: { active: true, originId: 'origin-end-review' },
      },
    ],
  });
  reviewTestApi.applyReviewState(activeReviewState.ctx);

  let resolveFirstSelect;
  const firstSelect = new Promise((resolve) => {
    resolveFirstSelect = resolve;
  });

  const concurrentHarness = createReviewHarness();
  const firstContext = createReviewCommandContext({ selectResponses: [() => firstSelect] });
  const secondContext = createReviewCommandContext();

  const firstRun = concurrentHarness.endReviewHandler('', firstContext.ctx);
  await Promise.resolve();
  await concurrentHarness.endReviewHandler('', secondContext.ctx);
  resolveFirstSelect(undefined);
  await firstRun;

  assert.deepEqual(secondContext.notifications, [{ message: '/end-review is already running', level: 'info' }]);
  assert.deepEqual(firstContext.notifications, [{ message: 'Cancelled. Use /end-review to try again.', level: 'info' }]);

  reviewTestApi.resetReviewRuntimeState();
  const staleHarness = createReviewHarness();
  const staleContext = createReviewCommandContext({
    branchEntries: [
      {
        type: 'custom',
        customType: 'review-session',
        data: { active: true },
      },
    ],
  });
  await staleHarness.endReviewHandler('', staleContext.ctx);
  assert.equal(staleContext.selectCalls.length, 0);
  assert.deepEqual(staleContext.notifications, [
    { message: 'Review state was missing origin info; cleared review status.', level: 'warning' },
  ]);
  assert.deepEqual(staleHarness.appendEntries, [{ customType: 'review-session', data: { active: false } }]);

  reviewTestApi.resetReviewRuntimeState();
  const cancelState = createReviewStateContext({
    branchEntries: [
      {
        type: 'custom',
        customType: 'review-session',
        data: { active: true, originId: 'origin-cancelled-return' },
      },
    ],
  });
  reviewTestApi.applyReviewState(cancelState.ctx);

  const cancelHarness = createReviewHarness();
  const cancelContext = createReviewCommandContext({
    selectResponses: ['Return only'],
    navigateTreeImpl: async () => ({ cancelled: true }),
  });
  await cancelHarness.endReviewHandler('', cancelContext.ctx);

  assert.deepEqual(cancelContext.notifications, [{ message: 'Navigation cancelled. Use /end-review to try again.', level: 'info' }]);
  assert.equal(cancelContext.navigateCalls.length, 1);
  assert.deepEqual(cancelHarness.appendEntries, []);
  assert.equal(reviewTestApi.getReviewRuntimeState().reviewOriginId, 'origin-cancelled-return');
});
