import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { EventEmitter } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import { createExtensionHarness } from './extension-test-helpers.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const transpileRoot = await mkdtemp(path.join(repoRoot, '.tmp-annotate-command-orchestration-'));
let importCounter = 0;

await writeFile(path.join(transpileRoot, 'package.json'), '{"type":"module"}\n');
after(async () => {
  await rm(transpileRoot, { recursive: true, force: true });
});

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createMockWindow(name = 'window') {
  class MockWindow extends EventEmitter {
    constructor() {
      super();
      this.name = name;
      this.sendCalls = [];
      this.closeCalls = 0;
    }

    send(js) {
      this.sendCalls.push(js);
    }

    close() {
      this.closeCalls += 1;
    }
  }

  return new MockWindow();
}

function createCommandContext({ hasUI = true, mode = 'tui', editorText = '', branch = [], cwd = '/repo' } = {}) {
  const notifications = [];
  const pasted = [];

  return {
    notifications,
    pasted,
    ctx: {
      hasUI,
      mode,
      cwd,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        getEditorText() {
          return editorText;
        },
        pasteToEditor(text) {
          pasted.push(text);
        },
      },
      sessionManager: {
        getBranch() {
          return branch;
        },
      },
    },
  };
}

function parseReviewWindowMessage(js) {
  const match = /^window\.__reviewReceive\((.*)\);$/s.exec(js);
  assert.ok(match, `Expected review window message, got: ${js}`);
  return JSON.parse(match[1]);
}

async function importTsEntryWithStubs(relativePath, stubs, state) {
  const absolutePath = path.join(repoRoot, relativePath);
  const sourceText = await readFile(absolutePath, 'utf8');
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

  const moduleId = ++importCounter;
  const moduleDir = path.join(transpileRoot, `module-${moduleId}`);
  const entryPath = path.join(moduleDir, 'index.mjs');
  const stateKey = `__annotateCommandOrchestrationState${moduleId}`;
  globalThis[stateKey] = state;

  await mkdir(moduleDir, { recursive: true });
  await writeFile(entryPath, transpiled.outputText);

  for (const [specifier, content] of Object.entries(stubs(stateKey))) {
    const stubPath = path.join(moduleDir, specifier);
    await mkdir(path.dirname(stubPath), { recursive: true });
    await writeFile(stubPath, content);
  }

  return import(`${pathToFileURL(entryPath).href}?v=${moduleId}`);
}

function createAnnotateLastMessageState(overrides = {}) {
  return {
    windows: [],
    openCalls: [],
    composeCalls: [],
    buildHtmlCalls: [],
    findCalls: 0,
    composePromptResult: 'ANNOTATE LAST MESSAGE PROMPT',
    htmlResult: '<html>annotate-last-message</html>',
    hasFeedback(payload) {
      return payload.overallComment.trim().length > 0
        || payload.inlineComments.some((comment) => comment.body.trim().length > 0)
        || payload.sectionComments.some((comment) => comment.body.trim().length > 0);
    },
    findResult: {
      ok: true,
      data: {
        text: 'Latest assistant message',
        lines: [{ number: 1, text: 'Latest assistant message' }],
        sections: [{ id: 'section-1', index: 1, startLine: 1, endLine: 1, preview: 'Latest assistant message', text: 'Latest assistant message' }],
      },
    },
    ...overrides,
  };
}

function createAnnotateGitDiffState(overrides = {}) {
  const reviewFile = {
    id: 'file-1',
    path: 'src/app.ts',
    worktreeStatus: 'modified',
    hasWorkingTreeFile: true,
    inGitDiff: true,
    gitDiff: {
      status: 'modified',
      oldPath: 'src/app.ts',
      newPath: 'src/app.ts',
      displayPath: 'src/app.ts',
      hasOriginal: true,
      hasModified: true,
    },
    kind: 'text',
    mimeType: null,
  };

  return {
    windows: [],
    openCalls: [],
    buildHtmlCalls: [],
    composeCalls: [],
    clipboardReads: [],
    clipboardWrites: [],
    getReviewWindowDataCalls: [],
    getReviewWindowDataResults: [
      {
        repoRoot: '/repo',
        files: [reviewFile],
        commits: [],
        branchBaseRef: 'origin/main',
        branchMergeBaseSha: 'abc123',
        repositoryHasHead: true,
      },
    ],
    commitFilesResults: new Map(),
    loadFileResults: new Map(),
    watchers: [],
    disposedWatchers: 0,
    composePromptResult: 'ANNOTATE GIT DIFF PROMPT',
    htmlResult: '<html>annotate-git-diff</html>',
    clipboardReadResult: 'clipboard text',
    clipboardWriteError: null,
    ...overrides,
  };
}

function annotateLastMessageStubs(stateKey) {
  return {
    './quiet-glimpse.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export async function openQuietGlimpse(html, options = {}) {
        state.openCalls.push({ html, options });
        const window = state.windows.shift();
        if (!window) throw new Error('No mock window queued');
        return window;
      }
    `,
    './prompt.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export function composeAnnotateLastMessagePrompt(sourceData, payload) {
        state.composeCalls.push({ sourceData, payload });
        return state.composePromptResult;
      }
      export function hasAnnotateLastMessageFeedback(payload) {
        return state.hasFeedback(payload);
      }
    `,
    './session.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export function findLastAssistantMessage() {
        state.findCalls += 1;
        return state.findResult;
      }
    `,
    './ui.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export function buildAnnotateLastMessageHtml(data) {
        state.buildHtmlCalls.push(data);
        return state.htmlResult;
      }
    `,
  };
}

function annotateGitDiffStubs(stateKey) {
  return {
    './clipboard.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export function readSystemClipboard() {
        state.clipboardReads.push(true);
        if (state.clipboardReadError) throw state.clipboardReadError;
        return state.clipboardReadResult;
      }
      export function writeSystemClipboard(text) {
        state.clipboardWrites.push(text);
        if (state.clipboardWriteError) throw state.clipboardWriteError;
      }
    `,
    './git.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export async function getReviewWindowData(pi, cwd) {
        state.getReviewWindowDataCalls.push({ cwd });
        const next = state.getReviewWindowDataResults.shift();
        if (next instanceof Error) throw next;
        if (next == null) throw new Error('No mocked review data queued');
        return next;
      }
      export async function getCommitFiles(pi, repoRoot, sha) {
        const next = state.commitFilesResults.get(sha);
        if (next instanceof Error) throw next;
        return next ?? [];
      }
      export function isWorkingTreeCommitSha(sha) {
        return sha === '__tlh_working_tree__';
      }
      export async function loadReviewFileContents(pi, repoRoot, file, scope, commitSha) {
        const key = [scope, commitSha ?? '', file.id].join(':');
        const next = state.loadFileResults.get(key);
        if (next instanceof Error) throw next;
        if (next == null) throw new Error('No mocked file contents queued');
        return next;
      }
    `,
    './prompt.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export function composeReviewPrompt(files, payload) {
        state.composeCalls.push({ files, payload });
        return state.composePromptResult;
      }
    `,
    './quiet-glimpse.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export async function openQuietGlimpse(html, options = {}) {
        state.openCalls.push({ html, options });
        const window = state.windows.shift();
        if (!window) throw new Error('No mock window queued');
        return window;
      }
    `,
    './ui.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export function buildReviewHtml(data) {
        state.buildHtmlCalls.push(data);
        return state.htmlResult;
      }
    `,
    './watch.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export function createRepoChangeWatcher(repoRoot, onChange, options = {}) {
        const watcher = {
          repoRoot,
          onChange,
          options,
          disposed: false,
          dispose() {
            if (watcher.disposed) return;
            watcher.disposed = true;
            state.disposedWatchers += 1;
          },
        };
        state.watchers.push(watcher);
        return watcher;
      }
    `,
  };
}

async function loadAnnotateLastMessageExtension(state) {
  const module = await importTsEntryWithStubs('extensions/annotate-last-message/index.ts', annotateLastMessageStubs, state);
  return module.default;
}

async function loadAnnotateGitDiffExtension(state) {
  const module = await importTsEntryWithStubs('extensions/annotate-git-diff/index.ts', annotateGitDiffStubs, state);
  return module.default;
}

test('annotate-last-message command orchestration covers UI guards, shutdown cleanup, and prompt flows', { concurrency: false }, async (t) => {
  await t.test('guards UI access, blocks concurrent windows, and suppresses late results after shutdown', async () => {
    const firstWindow = createMockWindow('first-window');
    const secondWindow = createMockWindow('second-window');
    const state = createAnnotateLastMessageState({
      windows: [firstWindow, secondWindow],
    });
    const extension = await loadAnnotateLastMessageExtension(state);
    const { pi, commands, handlers } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-last-message').handler;
    const shutdownHandler = handlers.get('session_shutdown');
    const { ctx: noUiCtx, notifications: noUiNotifications } = createCommandContext({ hasUI: false, mode: 'rpc' });
    const { ctx: rpcCtx, notifications: rpcNotifications } = createCommandContext({ hasUI: true, mode: 'rpc' });
    const { ctx, notifications, pasted } = createCommandContext({ editorText: 'Seed prompt' });

    await handler({}, noUiCtx);
    await handler({}, rpcCtx);
    assert.deepEqual(noUiNotifications, [
      { message: 'annotate-last-message requires interactive mode.', level: 'error' },
    ]);
    assert.deepEqual(rpcNotifications, [
      { message: 'annotate-last-message requires interactive mode.', level: 'error' },
    ]);
    assert.equal(state.openCalls.length, 0);

    await handler({}, ctx);
    assert.equal(state.openCalls.length, 1);
    assert.deepEqual(state.openCalls[0], {
      html: '<html>annotate-last-message</html>',
      options: { width: 1440, height: 980, title: 'annotate last message' },
    });
    assert.deepEqual(notifications, [{ message: 'Opened native annotation window.', level: 'info' }]);

    await handler({}, ctx);
    assert.deepEqual(notifications.at(-1), {
      message: 'A last-message annotation window is already open.',
      level: 'warning',
    });

    await shutdownHandler({}, ctx);
    assert.equal(firstWindow.closeCalls, 1);

    firstWindow.emit('message', {
      type: 'submit',
      overallComment: 'late feedback',
      inlineComments: [],
      sectionComments: [],
    });
    await flushAsyncWork();
    assert.deepEqual(pasted, []);
    assert.equal(notifications.length, 2);

    await handler({}, ctx);
    assert.equal(state.openCalls.length, 2);
    secondWindow.emit('message', { type: 'cancel' });
    await flushAsyncWork();
    assert.deepEqual(notifications.slice(-2), [
      { message: 'Opened native annotation window.', level: 'info' },
      { message: 'Annotation cancelled.', level: 'info' },
    ]);
  });

  await t.test('appends composed prompts on submit and reports blank submits without editing', async () => {
    const submitWindow = createMockWindow('submit-window');
    const blankWindow = createMockWindow('blank-window');
    const state = createAnnotateLastMessageState({
      windows: [submitWindow, blankWindow],
    });
    const extension = await loadAnnotateLastMessageExtension(state);
    const { pi, commands, handlers } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-last-message').handler;
    const shutdownHandler = handlers.get('session_shutdown');
    const { ctx, notifications, pasted } = createCommandContext({ editorText: 'Existing editor text' });

    await handler({}, ctx);
    submitWindow.emit('message', {
      type: 'submit',
      overallComment: 'Tighten the recommendation.',
      inlineComments: [],
      sectionComments: [],
    });
    await flushAsyncWork();

    assert.deepEqual(pasted, ['\n\nANNOTATE LAST MESSAGE PROMPT']);
    assert.deepEqual(state.composeCalls, [
      {
        sourceData: state.findResult.data,
        payload: {
          type: 'submit',
          overallComment: 'Tighten the recommendation.',
          inlineComments: [],
          sectionComments: [],
        },
      },
    ]);
    assert.deepEqual(notifications.slice(-2), [
      { message: 'Opened native annotation window.', level: 'info' },
      { message: 'Appended annotation feedback to the editor.', level: 'info' },
    ]);

    await handler({}, ctx);
    blankWindow.emit('message', {
      type: 'submit',
      overallComment: '   ',
      inlineComments: [],
      sectionComments: [],
    });
    await flushAsyncWork();

    assert.deepEqual(pasted, ['\n\nANNOTATE LAST MESSAGE PROMPT']);
    assert.deepEqual(notifications.slice(-2), [
      { message: 'Opened native annotation window.', level: 'info' },
      { message: 'No annotation feedback submitted.', level: 'info' },
    ]);

    await shutdownHandler({}, ctx);
  });

  await t.test('surfaces lookup, launch, and runtime errors without editing the editor', async () => {
    const runtimeWindow = createMockWindow('runtime-window');
    const state = createAnnotateLastMessageState({
      windows: [runtimeWindow],
      findResult: {
        ok: false,
        code: 'empty',
        message: 'Latest assistant message has no text to annotate.',
      },
    });
    const extension = await loadAnnotateLastMessageExtension(state);
    const { pi, commands } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-last-message').handler;
    const { ctx, notifications, pasted } = createCommandContext({ editorText: 'Existing editor text' });

    await handler({}, ctx);
    assert.deepEqual(notifications, [
      { message: 'Latest assistant message has no text to annotate.', level: 'error' },
    ]);
    assert.deepEqual(pasted, []);
    assert.equal(state.openCalls.length, 0);

    state.findResult = createAnnotateLastMessageState().findResult;
    await handler({}, ctx);
    assert.deepEqual(notifications.slice(-1), [
      { message: 'Opened native annotation window.', level: 'info' },
    ]);

    runtimeWindow.emit('error', new Error('native window crashed'));
    await flushAsyncWork();

    assert.deepEqual(pasted, []);
    assert.deepEqual(notifications.slice(-1), [
      { message: 'Annotation failed: native window crashed', level: 'error' },
    ]);

    state.windows.length = 0;
    await handler({}, ctx);
    assert.deepEqual(notifications.slice(-1), [
      { message: 'Annotation failed: No mock window queued', level: 'error' },
    ]);
  });
});

test('annotate-git-diff command orchestration covers guards, watcher cleanup, prompts, and window helpers', { concurrency: false }, async (t) => {
  await t.test('guards UI access, blocks concurrent review windows, and cleans up watchers on shutdown', async () => {
    const firstReviewWindow = createMockWindow('first-review-window');
    const secondReviewWindow = createMockWindow('second-review-window');
    const state = createAnnotateGitDiffState({
      windows: [firstReviewWindow, secondReviewWindow],
      getReviewWindowDataResults: [
        {
          repoRoot: '/repo',
          files: [{
            id: 'file-1',
            path: 'src/app.ts',
            worktreeStatus: 'modified',
            hasWorkingTreeFile: true,
            inGitDiff: true,
            gitDiff: {
              status: 'modified',
              oldPath: 'src/app.ts',
              newPath: 'src/app.ts',
              displayPath: 'src/app.ts',
              hasOriginal: true,
              hasModified: true,
            },
            kind: 'text',
            mimeType: null,
          }],
          commits: [],
          branchBaseRef: 'origin/main',
          branchMergeBaseSha: 'abc123',
          repositoryHasHead: true,
        },
        {
          repoRoot: '/repo',
          files: [{
            id: 'file-2',
            path: 'src/feature.ts',
            worktreeStatus: 'modified',
            hasWorkingTreeFile: true,
            inGitDiff: true,
            gitDiff: {
              status: 'modified',
              oldPath: 'src/feature.ts',
              newPath: 'src/feature.ts',
              displayPath: 'src/feature.ts',
              hasOriginal: true,
              hasModified: true,
            },
            kind: 'text',
            mimeType: null,
          }],
          commits: [],
          branchBaseRef: 'origin/main',
          branchMergeBaseSha: 'def456',
          repositoryHasHead: true,
        },
      ],
    });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, handlers } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const shutdownHandler = handlers.get('session_shutdown');
    const { ctx: noUiCtx, notifications: noUiNotifications } = createCommandContext({ hasUI: false, mode: 'rpc' });
    const { ctx: rpcCtx, notifications: rpcNotifications } = createCommandContext({ hasUI: true, mode: 'rpc' });
    const { ctx, notifications, pasted } = createCommandContext();

    await handler({}, noUiCtx);
    await handler({}, rpcCtx);
    assert.deepEqual(noUiNotifications, [
      { message: 'annotate-git-diff requires interactive mode.', level: 'error' },
    ]);
    assert.deepEqual(rpcNotifications, [
      { message: 'annotate-git-diff requires interactive mode.', level: 'error' },
    ]);
    assert.equal(state.openCalls.length, 0);

    await handler({}, ctx);
    assert.equal(state.openCalls.length, 1);
    assert.deepEqual(state.openCalls[0], {
      html: '<html>annotate-git-diff</html>',
      options: { width: 1680, height: 1020, title: 'annotate-git-diff' },
    });
    assert.deepEqual(notifications, [{ message: 'Opened native review window.', level: 'info' }]);
    assert.equal(state.watchers.length, 1);
    assert.equal(state.watchers[0].repoRoot, '/repo');
    assert.equal(state.watchers[0].disposed, false);

    await handler({}, ctx);
    assert.deepEqual(notifications.at(-1), {
      message: 'A review window is already open.',
      level: 'warning',
    });

    await shutdownHandler({}, ctx);
    assert.equal(firstReviewWindow.closeCalls, 1);
    assert.equal(state.disposedWatchers, 1);
    assert.equal(state.watchers[0].disposed, true);

    firstReviewWindow.emit('message', {
      type: 'submit',
      overallComment: 'late feedback',
      comments: [],
    });
    await flushAsyncWork();
    assert.deepEqual(pasted, []);
    assert.equal(notifications.length, 2);

    await handler({}, ctx);
    assert.equal(state.openCalls.length, 2);
    secondReviewWindow.emit('message', { type: 'cancel' });
    await flushAsyncWork();
    assert.deepEqual(notifications.slice(-2), [
      { message: 'Opened native review window.', level: 'info' },
      { message: 'Review cancelled.', level: 'info' },
    ]);
  });

  await t.test('handles mocked window messages and only appends prompts for meaningful submissions', async () => {
    const helperWindow = createMockWindow('helper-window');
    const blankSubmitWindow = createMockWindow('blank-submit-window');
    const initialReviewData = {
      repoRoot: '/repo',
      files: [{
        id: 'file-1',
        path: 'src/app.ts',
        worktreeStatus: 'modified',
        hasWorkingTreeFile: true,
        inGitDiff: true,
        gitDiff: {
          status: 'modified',
          oldPath: 'src/app.ts',
          newPath: 'src/app.ts',
          displayPath: 'src/app.ts',
          hasOriginal: true,
          hasModified: true,
        },
        kind: 'text',
        mimeType: null,
      }],
      commits: [],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'abc123',
      repositoryHasHead: true,
    };
    const refreshedReviewData = {
      repoRoot: '/repo',
      files: [{
        id: 'file-2',
        path: 'src/refreshed.ts',
        worktreeStatus: 'modified',
        hasWorkingTreeFile: true,
        inGitDiff: true,
        gitDiff: {
          status: 'modified',
          oldPath: 'src/refreshed.ts',
          newPath: 'src/refreshed.ts',
          displayPath: 'src/refreshed.ts',
          hasOriginal: true,
          hasModified: true,
        },
        kind: 'text',
        mimeType: null,
      }],
      commits: [{
        sha: 'abc123',
        shortSha: 'abc123',
        subject: 'Refresh review data',
        authorName: 'TLH',
        authorDate: '2026-06-29',
        kind: 'commit',
      }],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'refresh456',
      repositoryHasHead: true,
    };
    const blankReviewData = {
      repoRoot: '/repo',
      files: [{
        id: 'file-3',
        path: 'src/blank.ts',
        worktreeStatus: 'modified',
        hasWorkingTreeFile: true,
        inGitDiff: true,
        gitDiff: {
          status: 'modified',
          oldPath: 'src/blank.ts',
          newPath: 'src/blank.ts',
          displayPath: 'src/blank.ts',
          hasOriginal: true,
          hasModified: true,
        },
        kind: 'text',
        mimeType: null,
      }],
      commits: [],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'blank789',
      repositoryHasHead: true,
    };
    const state = createAnnotateGitDiffState({
      windows: [helperWindow, blankSubmitWindow],
      getReviewWindowDataResults: [initialReviewData, refreshedReviewData, blankReviewData],
      clipboardWriteError: new Error('clipboard unavailable'),
    });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, handlers } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const shutdownHandler = handlers.get('session_shutdown');
    const { ctx, notifications, pasted } = createCommandContext({ editorText: 'Existing editor text' });

    await handler({}, ctx);

    helperWindow.emit('message', {
      type: 'request-file',
      requestId: 'missing-file',
      fileId: 'unknown-file',
      scope: 'branch',
      commitSha: null,
    });
    helperWindow.emit('message', { type: 'clipboard-read', requestId: 'clipboard-read-1' });
    helperWindow.emit('message', { type: 'clipboard-write', text: 'copy this review' });
    helperWindow.emit('message', { type: 'request-review-data', requestId: 'refresh-1' });
    await flushAsyncWork();

    assert.deepEqual(state.clipboardReads, [true]);
    assert.deepEqual(state.clipboardWrites, ['copy this review']);
    assert.deepEqual(notifications.slice(0, 2), [
      { message: 'Opened native review window.', level: 'info' },
      { message: 'Failed to copy from review window: clipboard unavailable', level: 'warning' },
    ]);

    const sentMessages = helperWindow.sendCalls.map(parseReviewWindowMessage);
    assert.deepEqual(sentMessages[0], {
      type: 'file-error',
      requestId: 'missing-file',
      fileId: 'unknown-file',
      scope: 'branch',
      commitSha: null,
      message: 'Unknown file requested.',
    });
    assert.deepEqual(sentMessages[1], {
      type: 'clipboard-data',
      requestId: 'clipboard-read-1',
      text: 'clipboard text',
    });
    assert.deepEqual(sentMessages[2], {
      type: 'review-data',
      requestId: 'refresh-1',
      files: refreshedReviewData.files,
      commits: refreshedReviewData.commits,
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'refresh456',
      repositoryHasHead: true,
    });

    helperWindow.emit('message', {
      type: 'submit',
      overallComment: 'Please tighten the review summary.',
      comments: [],
    });
    await flushAsyncWork();

    assert.deepEqual(pasted, ['\n\nANNOTATE GIT DIFF PROMPT']);
    assert.deepEqual(state.composeCalls, [
      {
        files: [...initialReviewData.files, ...refreshedReviewData.files],
        payload: {
          type: 'submit',
          overallComment: 'Please tighten the review summary.',
          comments: [],
        },
      },
    ]);
    assert.deepEqual(notifications.slice(-1), [
      { message: 'Appended review feedback to the editor.', level: 'info' },
    ]);

    await handler({}, ctx);
    blankSubmitWindow.emit('message', {
      type: 'submit',
      overallComment: '   ',
      comments: [],
    });
    await flushAsyncWork();

    assert.deepEqual(pasted, ['\n\nANNOTATE GIT DIFF PROMPT']);
    assert.deepEqual(notifications.slice(-1), [
      { message: 'Opened native review window.', level: 'info' },
    ]);

    await shutdownHandler({}, ctx);
  });

  await t.test('surfaces repository, request, watcher, and runtime errors while cleaning up watchers', async () => {
    const failingReviewWindow = createMockWindow('failing-review-window');
    const initialReviewData = {
      repoRoot: '/repo',
      files: [{
        id: 'file-1',
        path: 'src/app.ts',
        worktreeStatus: 'modified',
        hasWorkingTreeFile: true,
        inGitDiff: true,
        gitDiff: {
          status: 'modified',
          oldPath: 'src/app.ts',
          newPath: 'src/app.ts',
          displayPath: 'src/app.ts',
          hasOriginal: true,
          hasModified: true,
        },
        kind: 'text',
        mimeType: null,
      }],
      commits: [],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'abc123',
      repositoryHasHead: true,
    };
    const state = createAnnotateGitDiffState({
      windows: [failingReviewWindow],
      getReviewWindowDataResults: [new Error('git metadata unavailable')],
    });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const { ctx, notifications, pasted } = createCommandContext({ editorText: 'Existing editor text' });

    await handler({}, ctx);
    assert.deepEqual(notifications, [
      { message: 'Review failed: git metadata unavailable', level: 'error' },
    ]);
    assert.deepEqual(pasted, []);
    assert.equal(state.watchers.length, 0);

    state.getReviewWindowDataResults.push(initialReviewData, new Error('refresh unavailable'));
    state.loadFileResults.set('branch::file-1', new Error('file contents unavailable'));
    state.commitFilesResults.set('deadbeef', new Error('commit metadata unavailable'));
    state.clipboardReadError = new Error('clipboard denied');

    await handler({}, ctx);
    assert.equal(state.watchers.length, 1);

    failingReviewWindow.emit('message', {
      type: 'request-file',
      requestId: 'file-error-1',
      fileId: 'file-1',
      scope: 'branch',
      commitSha: null,
    });
    failingReviewWindow.emit('message', {
      type: 'request-commit',
      requestId: 'commit-error-1',
      sha: 'deadbeef',
    });
    failingReviewWindow.emit('message', {
      type: 'request-review-data',
      requestId: 'refresh-error-1',
    });
    failingReviewWindow.emit('message', {
      type: 'clipboard-read',
      requestId: 'clipboard-error-1',
    });
    await flushAsyncWork();

    const sentMessages = failingReviewWindow.sendCalls.map(parseReviewWindowMessage);
    assert.deepEqual(sentMessages.find((message) => message.type === 'file-error'), {
      type: 'file-error',
      requestId: 'file-error-1',
      fileId: 'file-1',
      scope: 'branch',
      commitSha: null,
      message: 'file contents unavailable',
    });
    assert.deepEqual(sentMessages.find((message) => message.type === 'commit-error'), {
      type: 'commit-error',
      requestId: 'commit-error-1',
      sha: 'deadbeef',
      message: 'commit metadata unavailable',
    });
    assert.deepEqual(sentMessages.find((message) => message.type === 'review-data-error'), {
      type: 'review-data-error',
      requestId: 'refresh-error-1',
      message: 'refresh unavailable',
    });
    assert.deepEqual(sentMessages.find((message) => message.type === 'clipboard-data'), {
      type: 'clipboard-data',
      requestId: 'clipboard-error-1',
      text: '',
      message: 'clipboard denied',
    });

    state.watchers[0].options.onError(new Error('fs watch unavailable'));
    state.watchers[0].options.onError(new Error('ignored duplicate'));
    assert.deepEqual(notifications.slice(-1), [
      { message: 'Review change watcher failed: fs watch unavailable', level: 'warning' },
    ]);
    assert.equal(
      notifications.filter((notification) => notification.message.startsWith('Review change watcher failed:')).length,
      1,
    );

    failingReviewWindow.emit('error', new Error('native host crashed'));
    await flushAsyncWork();

    assert.deepEqual(pasted, []);
    assert.equal(state.disposedWatchers, 1);
    assert.equal(state.watchers[0].disposed, true);
    assert.deepEqual(notifications.slice(-1), [
      { message: 'Review failed: native host crashed', level: 'error' },
    ]);

    state.watchers[0].options.onError(new Error('late watcher error'));
    assert.equal(
      notifications.filter((notification) => notification.message.startsWith('Review change watcher failed:')).length,
      1,
    );
  });
});
