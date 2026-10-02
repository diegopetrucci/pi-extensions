import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createMockWindow(name = 'window') {
  class MockWindow extends EventEmitter {
    constructor() {
      super();
      this.name = name;
      this.sendCalls = [];
      this.closeCalls = 0;
      this.closed = false;
      this.failure = null;
      this.on('error', () => {});
    }

    send(js) {
      this.sendCalls.push(js);
    }

    close() {
      this.closeCalls += 1;
      if (this.closeError != null) {
        const error = this.closeError;
        this.closeError = null;
        this.emit('error', error);
        throw error;
      }
    }
  }

  return new MockWindow();
}

function createCommandContext({ hasUI = true, mode = 'tui', editorText = '', branch = [], cwd = '/repo', theme = { appearance: 'dark', colors: {} } } = {}) {
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
        theme,
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
    openGate: null,
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
    startUiServerCalls: [],
    uiServers: [],
    disposedUiServers: 0,
    composeCalls: [],
    clipboardReads: [],
    clipboardWrites: [],
    getReviewWindowDataCalls: [],
    commitFilesCalls: [],
    loadFileCalls: [],
    loadFileMergeBases: [],
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
        if (state.openGate) await state.openGate;
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
      export function buildAnnotateLastMessageHtml(data, theme) {
        state.buildHtmlCalls.push({ data, theme });
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
        state.commitFilesCalls.push({ repoRoot, sha });
        const next = state.commitFilesResults.get(sha);
        if (next instanceof Error) throw next;
        return next ?? [];
      }
      export function isWorkingTreeCommitSha(sha) {
        return sha === '__tlh_working_tree__';
      }
      export async function loadReviewFileContents(pi, repoRoot, file, scope, commitSha, branchMergeBaseSha) {
        state.loadFileCalls.push({ fileId: file.id, scope, commitSha: commitSha ?? null });
        state.loadFileMergeBases.push(branchMergeBaseSha);
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
    './review-server.js': `
      const state = globalThis[${JSON.stringify(stateKey)}];
      export async function startReviewUiServer(data) {
        state.startUiServerCalls.push(data);
        if (state.startUiServerError) throw state.startUiServerError;
        if (state.startUiServerGate) await state.startUiServerGate;
        const uiServer = {
          failure: null,
          html: state.htmlResult,
          disposed: false,
          errorListeners: new Set(),
          onError(listener) {
            uiServer.errorListeners.add(listener);
            return () => uiServer.errorListeners.delete(listener);
          },
          fail(error) {
            if (uiServer.disposed || uiServer.failure) return;
            uiServer.failure = error;
            for (const listener of uiServer.errorListeners) listener(error);
          },
          dispose() {
            if (uiServer.disposed) return;
            uiServer.disposed = true;
            uiServer.errorListeners.clear();
            state.disposedUiServers += 1;
          },
        };
        state.uiServers.push(uiServer);
        return uiServer;
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

function createReviewUiElement(id) {
  const listeners = new Map();
  return {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    dataset: {},
    children: [],
    disabled: false,
    hidden: false,
    className: '',
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) ?? [];
      callbacks.push(listener);
      listeners.set(type, callbacks);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
    },
    click() {
      this.dispatchEvent({ type: 'click' });
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    querySelector() {
      return null;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 0, height: 0 };
    },
  };
}

async function loadAnnotateGitDiffUiFixture(initialReviewData) {
  const appSource = await readFile(path.join(repoRoot, 'extensions/annotate-git-diff/web/app.js'), 'utf8');
  const elementIds = [
    'annotate-git-diff-data',
    'sidebar',
    'sidebar-title',
    'sidebar-search-input',
    'toggle-sidebar-button',
    'scope-branch-button',
    'scope-commits-button',
    'scope-all-button',
    'commit-picker',
    'commit-list',
    'window-title',
    'repo-root',
    'file-tree',
    'summary',
    'current-file-label',
    'mode-hint',
    'file-comments-container',
    'editor-container',
    'diff-editor-host',
    'single-editor-host',
    'refresh-review-button',
    'submit-button',
    'cancel-button',
    'overall-comment-button',
    'file-comment-button',
    'toggle-reviewed-button',
    'toggle-unchanged-button',
    'toggle-wrap-button',
    'file-status-badge',
    'file-diff-stats',
    'editor-cover',
    'binary-preview',
    'asset-failure-panel',
    'asset-failure-title',
    'asset-failure-message',
    'asset-failure-detail',
  ];
  const elements = new Map(elementIds.map((id) => [id, createReviewUiElement(id)]));
  elements.get('annotate-git-diff-data').textContent = JSON.stringify(initialReviewData);
  const createdElements = [];
  const sentPayloads = [];
  const windowListeners = new Map();
  const window = {
    __reviewAssetConfig: {},
    glimpse: {
      send(payload) {
        sentPayloads.push(payload);
      },
      close() {},
    },
    addEventListener(type, listener) {
      const callbacks = windowListeners.get(type) ?? [];
      callbacks.push(listener);
      windowListeners.set(type, callbacks);
    },
  };
  const document = {
    body: createReviewUiElement('body'),
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    createElement(tagName) {
      const element = createReviewUiElement(`${tagName}-${createdElements.length}`);
      createdElements.push(element);
      return element;
    },
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
  };
  const context = vm.createContext({
    window,
    document,
    alert() {},
    requestAnimationFrame(callback) {
      callback();
    },
    ResizeObserver: undefined,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(appSource, context, { filename: 'annotate-git-diff/web/app.js' });
  return {
    context,
    window,
    document,
    elements,
    sentPayloads,
    state: vm.runInContext('state', context),
  };
}

test('annotate-last-message command orchestration covers UI guards, shutdown cleanup, and prompt flows', { concurrency: false }, async (t) => {
  await t.test('guards UI access, blocks concurrent windows, and suppresses late results after shutdown', async () => {
    const firstWindow = createMockWindow('first-window');
    const secondWindow = createMockWindow('second-window');
    const closedWindow = createMockWindow('closed-window');
    const state = createAnnotateLastMessageState({
      windows: [firstWindow, secondWindow, closedWindow],
    });
    const extension = await loadAnnotateLastMessageExtension(state);
    const { pi, commands, handlers, sentUserMessages } = createExtensionHarness();
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
    assert.equal(state.buildHtmlCalls.length, 1);
    assert.equal(state.buildHtmlCalls[0].data, state.findResult.data);
    assert.equal(state.buildHtmlCalls[0].theme, ctx.ui.theme);
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
    assert.deepEqual(sentUserMessages, []);
    assert.deepEqual(pasted, []);
    assert.equal(notifications.length, 2);

    await handler({}, ctx);
    assert.equal(state.openCalls.length, 2);
    secondWindow.emit('message', { type: 'cancel' });
    await flushAsyncWork();
    assert.equal(secondWindow.closeCalls, 1);
    assert.deepEqual(notifications.slice(-2), [
      { message: 'Opened native annotation window.', level: 'info' },
      { message: 'Annotation cancelled.', level: 'info' },
    ]);

    await handler({}, ctx);
    closedWindow.emit('closed');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(sentUserMessages, []);
    assert.deepEqual(pasted, []);
  });

  await t.test('suppresses a settled explicit result when shutdown races its delivery', async () => {
    const raceWindow = createMockWindow('settled-before-shutdown-window');
    const state = createAnnotateLastMessageState({ windows: [raceWindow] });
    const extension = await loadAnnotateLastMessageExtension(state);
    const { pi, commands, handlers, sentUserMessages } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-last-message').handler;
    const shutdownHandler = handlers.get('session_shutdown');
    const { ctx, notifications, pasted } = createCommandContext({ editorText: 'Existing editor text' });

    await handler({}, ctx);
    raceWindow.emit('message', {
      type: 'submit',
      overallComment: 'The result settled before shutdown.',
      inlineComments: [],
      sectionComments: [],
    });
    const shutdown = shutdownHandler({}, ctx);
    await shutdown;
    await flushAsyncWork();

    assert.equal(raceWindow.closeCalls, 1);
    assert.deepEqual(sentUserMessages, []);
    assert.deepEqual(pasted, []);
    assert.deepEqual(notifications, [
      { message: 'Opened native annotation window.', level: 'info' },
    ]);
  });

  await t.test('settles accepted last-message submits before synchronous native close failures', async () => {
    const window = createMockWindow('sync-close-error-last-message-window');
    window.closeError = new Error('native close failed');
    const state = createAnnotateLastMessageState({ windows: [window] });
    const extension = await loadAnnotateLastMessageExtension(state);
    const { pi, commands, sentUserMessages } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-last-message').handler;
    const { ctx, notifications } = createCommandContext();
    await handler({}, ctx);
    window.emit('message', {
      type: 'submit',
      overallComment: 'Accepted despite close failure.',
      inlineComments: [],
      sectionComments: [],
    });
    await flushAsyncWork();

    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE LAST MESSAGE PROMPT', options: { deliverAs: 'followUp' } },
    ]);
    assert.equal(notifications.some((notification) => notification.level === 'error'), false);
  });

  await t.test('sends composed prompts once via follow-up and reports blank submits without editing', async () => {
    const submitWindow = createMockWindow('submit-window');
    const blankWindow = createMockWindow('blank-window');
    const invalidWindow = createMockWindow('invalid-window');
    const state = createAnnotateLastMessageState({
      windows: [submitWindow, blankWindow, invalidWindow],
    });
    const extension = await loadAnnotateLastMessageExtension(state);
    const { pi, commands, handlers, sentUserMessages } = createExtensionHarness();
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
    submitWindow.emit('message', {
      type: 'submit',
      overallComment: 'Duplicate feedback must not send.',
      inlineComments: [],
      sectionComments: [],
    });
    await flushAsyncWork();

    assert.equal(submitWindow.closeCalls, 1);
    assert.deepEqual(pasted, []);
    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE LAST MESSAGE PROMPT', options: { deliverAs: 'followUp' } },
    ]);
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
      { message: 'Annotation feedback sent to the agent.', level: 'info' },
    ]);

    await handler({}, ctx);
    blankWindow.emit('message', {
      type: 'submit',
      overallComment: '   ',
      inlineComments: [],
      sectionComments: [],
    });
    await flushAsyncWork();

    assert.equal(blankWindow.closeCalls, 1);
    assert.deepEqual(pasted, []);
    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE LAST MESSAGE PROMPT', options: { deliverAs: 'followUp' } },
    ]);
    assert.deepEqual(notifications.slice(-2), [
      { message: 'Opened native annotation window.', level: 'info' },
      { message: 'No annotation feedback submitted.', level: 'info' },
    ]);

    await handler({}, ctx);
    invalidWindow.emit('message', {
      type: 'submit',
      overallComment: 'Invalid inline comment must be ignored.',
      inlineComments: [{ body: 'missing line number' }],
      sectionComments: [],
    });
    await flushAsyncWork();
    assert.equal(invalidWindow.closeCalls, 0);
    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE LAST MESSAGE PROMPT', options: { deliverAs: 'followUp' } },
    ]);
    assert.deepEqual(pasted, []);

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

    assert.equal(runtimeWindow.closeCalls, 1);
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

  await t.test('blocks concurrent native startup and closes a window that opens after shutdown', async () => {
    const gate = createDeferred();
    const startupWindow = createMockWindow('delayed-startup-window');
    const state = createAnnotateLastMessageState({ windows: [startupWindow], openGate: gate.promise });
    const extension = await loadAnnotateLastMessageExtension(state);
    const { pi, commands, handlers } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-last-message').handler;
    const shutdownHandler = handlers.get('session_shutdown');
    const { ctx, notifications, pasted } = createCommandContext();
    const opening = handler({}, ctx);
    await flushAsyncWork();

    await handler({}, ctx);
    assert.equal(state.openCalls.length, 1);
    assert.deepEqual(notifications, [
      { message: 'A last-message annotation window is already open.', level: 'warning' },
    ]);

    await shutdownHandler({}, ctx);
    gate.resolve();
    await opening;

    assert.equal(startupWindow.closeCalls, 1);
    assert.deepEqual(pasted, []);
    assert.deepEqual(notifications, [
      { message: 'A last-message annotation window is already open.', level: 'warning' },
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
    const { pi, commands, handlers, sentUserMessages } = createExtensionHarness();
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
    assert.equal(state.disposedUiServers, 1);
    assert.equal(state.uiServers[0].disposed, true);
    assert.equal(state.watchers[0].disposed, true);

    firstReviewWindow.emit('message', {
      type: 'submit',
      overallComment: 'late feedback',
      comments: [],
      draft: false,
    });
    await flushAsyncWork();
    assert.deepEqual(pasted, []);
    assert.deepEqual(sentUserMessages, []);
    assert.equal(notifications.length, 2);

    await handler({}, ctx);
    assert.equal(state.openCalls.length, 2);
    secondReviewWindow.emit('message', { type: 'cancel' });
    await flushAsyncWork();
    assert.equal(secondReviewWindow.closeCalls, 1);
    assert.equal(state.disposedUiServers, 2);
    assert.equal(state.uiServers[1].disposed, true);
    assert.deepEqual(notifications.slice(-2), [
      { message: 'Opened native review window.', level: 'info' },
      { message: 'Review cancelled.', level: 'info' },
    ]);
  });

  await t.test('suppresses a settled explicit result when shutdown races its delivery', async () => {
    const raceWindow = createMockWindow('settled-before-shutdown-window');
    const state = createAnnotateGitDiffState({ windows: [raceWindow] });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, handlers, sentUserMessages } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const shutdownHandler = handlers.get('session_shutdown');
    const { ctx, notifications, pasted } = createCommandContext({ editorText: 'Existing editor text' });

    await handler({}, ctx);
    raceWindow.emit('message', {
      type: 'submit',
      overallComment: 'The result settled before shutdown.',
      comments: [],
      draft: false,
    });
    const shutdown = shutdownHandler({}, ctx);
    await shutdown;
    await flushAsyncWork();

    assert.equal(raceWindow.closeCalls, 1);
    assert.deepEqual(sentUserMessages, []);
    assert.deepEqual(pasted, []);
    assert.deepEqual(notifications, [
      { message: 'Opened native review window.', level: 'info' },
    ]);
  });

  await t.test('settles accepted review submits before synchronous native close failures', async () => {
    const window = createMockWindow('sync-close-error-review-window');
    window.closeError = new Error('native close failed');
    const state = createAnnotateGitDiffState({ windows: [window] });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, sentUserMessages } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const { ctx, notifications } = createCommandContext();
    await handler({}, ctx);
    window.emit('message', {
      type: 'submit',
      overallComment: 'Accepted despite close failure.',
      comments: [],
      draft: false,
    });
    await flushAsyncWork();

    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE GIT DIFF PROMPT', options: { deliverAs: 'followUp' } },
    ]);
    assert.equal(notifications.some((notification) => notification.level === 'error'), false);
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
    const { pi, commands, handlers, sentUserMessages } = createExtensionHarness();
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

    assert.equal(helperWindow.closeCalls, 1);
    assert.deepEqual(pasted, ['\n\nANNOTATE GIT DIFF PROMPT']);
    assert.equal(state.disposedUiServers, 1);
    assert.deepEqual(state.composeCalls, [
      {
        files: [...initialReviewData.files, ...refreshedReviewData.files],
        payload: {
          type: 'submit',
          overallComment: 'Please tighten the review summary.',
          comments: [],
          draft: true,
        },
      },
    ]);
    assert.deepEqual(sentUserMessages, []);
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

    assert.equal(blankSubmitWindow.closeCalls, 1);
    assert.deepEqual(pasted, ['\n\nANNOTATE GIT DIFF PROMPT']);
    assert.equal(state.disposedUiServers, 2);
    assert.deepEqual(notifications.slice(-1), [
      { message: 'Opened native review window.', level: 'info' },
    ]);

    await shutdownHandler({}, ctx);
  });

  await t.test('sends explicit submissions once and keeps invalid or draft payloads editor-only', async () => {
    const explicitWindow = createMockWindow('explicit-submit-window');
    const malformedDraftWindow = createMockWindow('malformed-draft-window');
    const invalidWindow = createMockWindow('invalid-submit-window');
    const draftWindow = createMockWindow('draft-submit-window');
    const reviewData = createAnnotateGitDiffState().getReviewWindowDataResults[0];
    const state = createAnnotateGitDiffState({
      windows: [explicitWindow, malformedDraftWindow, invalidWindow, draftWindow],
      getReviewWindowDataResults: [reviewData, reviewData, reviewData, reviewData],
      composePromptResult: 'ANNOTATE GIT DIFF EXPLICIT PROMPT',
    });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, handlers, sentUserMessages } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const shutdownHandler = handlers.get('session_shutdown');
    const { ctx, notifications, pasted } = createCommandContext({ editorText: 'Existing editor text' });

    await handler({}, ctx);
    explicitWindow.emit('message', {
      type: 'submit',
      overallComment: 'Send this review.',
      comments: [],
      draft: false,
    });
    await flushAsyncWork();
    explicitWindow.emit('message', {
      type: 'submit',
      overallComment: 'Duplicate review must not send.',
      comments: [],
      draft: false,
    });
    await flushAsyncWork();

    assert.deepEqual(pasted, []);
    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE GIT DIFF EXPLICIT PROMPT', options: { deliverAs: 'followUp' } },
    ]);
    assert.equal(notifications.at(-1)?.message, 'Review feedback sent to the agent.');

    await handler({}, ctx);
    malformedDraftWindow.emit('message', {
      type: 'submit',
      overallComment: 'Malformed draft discriminator must stay local.',
      comments: [],
      draft: 'false',
    });
    await flushAsyncWork();
    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE GIT DIFF EXPLICIT PROMPT', options: { deliverAs: 'followUp' } },
    ]);
    assert.deepEqual(pasted, ['\n\nANNOTATE GIT DIFF EXPLICIT PROMPT']);

    await handler({}, ctx);
    invalidWindow.emit('message', {
      type: 'submit',
      overallComment: 'Invalid comment shape must be ignored.',
      comments: [{ body: 'missing required fields' }],
      draft: false,
    });
    await flushAsyncWork();
    assert.equal(invalidWindow.closeCalls, 0);
    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE GIT DIFF EXPLICIT PROMPT', options: { deliverAs: 'followUp' } },
    ]);
    assert.deepEqual(pasted, ['\n\nANNOTATE GIT DIFF EXPLICIT PROMPT']);

    await shutdownHandler({}, ctx);
    await handler({}, ctx);
    draftWindow.emit('message', {
      type: 'submit',
      overallComment: 'Explicit draft payload must stay local.',
      comments: [],
      draft: true,
    });
    await flushAsyncWork();
    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE GIT DIFF EXPLICIT PROMPT', options: { deliverAs: 'followUp' } },
    ]);
    assert.deepEqual(pasted, [
      '\n\nANNOTATE GIT DIFF EXPLICIT PROMPT',
      '\n\nANNOTATE GIT DIFF EXPLICIT PROMPT',
    ]);

    await shutdownHandler({}, ctx);
  });

  await t.test('cleans up local UI servers when native startup fails and reports asset startup errors', async () => {
    const state = createAnnotateGitDiffState();
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const { ctx, notifications } = createCommandContext();

    await handler({}, ctx);
    assert.deepEqual(notifications, [
      { message: 'Review failed: No mock window queued', level: 'error' },
    ]);
    assert.equal(state.uiServers.length, 1);
    assert.equal(state.uiServers[0].disposed, true);
    assert.equal(state.disposedUiServers, 1);
    assert.equal(state.watchers.length, 0);

    state.getReviewWindowDataResults.push(state.startUiServerCalls[0]);
    state.startUiServerError = new Error('packaged Monaco assets unavailable');
    await handler({}, ctx);

    assert.deepEqual(notifications.slice(-1), [
      { message: 'Review failed: packaged Monaco assets unavailable', level: 'error' },
    ]);
    assert.equal(state.uiServers.length, 1);
    assert.equal(state.disposedUiServers, 1);
    assert.equal(state.watchers.length, 0);
  });

  await t.test('blocks concurrent startup and disposes a server that finishes opening during shutdown', async () => {
    const gate = createDeferred();
    const state = createAnnotateGitDiffState({ startUiServerGate: gate.promise });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, handlers } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const shutdownHandler = handlers.get('session_shutdown');
    const { ctx, notifications } = createCommandContext();

    const opening = handler({}, ctx);
    await flushAsyncWork();
    await handler({}, ctx);
    assert.deepEqual(notifications, [
      { message: 'A review window is already open.', level: 'warning' },
    ]);
    assert.equal(state.startUiServerCalls.length, 1);

    await shutdownHandler({}, ctx);
    gate.resolve();
    await opening;

    assert.equal(state.openCalls.length, 0);
    assert.equal(state.uiServers.length, 1);
    assert.equal(state.uiServers[0].disposed, true);
    assert.equal(state.disposedUiServers, 1);
    assert.equal(state.watchers.length, 0);
    assert.deepEqual(notifications, [
      { message: 'A review window is already open.', level: 'warning' },
    ]);
  });

  await t.test('closes the native window and watcher when the local UI server fails after startup', async () => {
    const window = createMockWindow('server-failure-window');
    const state = createAnnotateGitDiffState({ windows: [window] });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const { ctx, notifications, pasted } = createCommandContext();
    await handler({}, ctx);

    state.uiServers[0].fail(new Error('loopback listener failed'));
    await flushAsyncWork();

    assert.equal(window.closeCalls, 1);
    assert.equal(state.uiServers[0].disposed, true);
    assert.equal(state.watchers[0].disposed, true);
    assert.deepEqual(pasted, []);
    assert.deepEqual(notifications.slice(-1), [
      { message: 'Review failed: loopback listener failed', level: 'error' },
    ]);
  });

  await t.test('validates request fields and authorizes only advertised revisions before side effects', async () => {
    const window = createMockWindow('request-validation-window');
    const baseReviewData = createAnnotateGitDiffState().getReviewWindowDataResults[0];
    const reviewFile = baseReviewData.files[0];
    const branchOnlyFile = { ...reviewFile, id: 'branch-only-file', path: 'src/branch-only.ts' };
    const commitOnlyFile = { ...reviewFile, id: 'commit-only-file', path: 'src/commit-only.ts' };
    const advertisedCommit = {
      sha: 'advertised-commit',
      shortSha: 'advertis',
      subject: 'Advertised commit',
      authorName: 'TLH',
      authorDate: '2026-01-01',
      kind: 'commit',
    };
    const advertisedWorkingTree = {
      sha: '__tlh_working_tree__',
      shortSha: 'WT',
      subject: 'Uncommitted changes',
      authorName: '',
      authorDate: '',
      kind: 'working-tree',
    };
    const otherAdvertisedCommit = {
      sha: 'other-advertised-commit',
      shortSha: 'other-ad',
      subject: 'Other advertised commit',
      authorName: 'TLH',
      authorDate: '2026-01-01',
      kind: 'commit',
    };
    const refreshedCommit = {
      sha: 'refreshed-commit',
      shortSha: 'refresh',
      subject: 'Refreshed commit',
      authorName: 'TLH',
      authorDate: '2026-01-02',
      kind: 'commit',
    };
    const refreshedReviewData = {
      ...baseReviewData,
      commits: [refreshedCommit],
      branchMergeBaseSha: 'refreshed-base',
    };
    const fileContents = {
      originalContent: 'before',
      modifiedContent: 'after',
      kind: 'text',
      mimeType: null,
      originalExists: true,
      modifiedExists: true,
      originalPreviewUrl: null,
      modifiedPreviewUrl: null,
    };
    const state = createAnnotateGitDiffState({
      windows: [window],
      getReviewWindowDataResults: [{
        ...baseReviewData,
        files: [reviewFile, branchOnlyFile],
        commits: [advertisedCommit, otherAdvertisedCommit, advertisedWorkingTree],
      }, refreshedReviewData],
      commitFilesResults: new Map([
        [advertisedCommit.sha, [reviewFile]],
        [otherAdvertisedCommit.sha, [commitOnlyFile]],
        [advertisedWorkingTree.sha, [reviewFile]],
        [refreshedCommit.sha, [reviewFile]],
      ]),
      loadFileResults: new Map([
        [`commits:${advertisedCommit.sha}:file-1`, fileContents],
        [`commits:${otherAdvertisedCommit.sha}:commit-only-file`, fileContents],
        [`commits:${advertisedWorkingTree.sha}:file-1`, fileContents],
        [`commits:${refreshedCommit.sha}:file-1`, fileContents],
        ['branch::file-1', fileContents],
        ['all::file-1', fileContents],
      ]),
    });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, handlers } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const { ctx } = createCommandContext();
    await handler({}, ctx);

    const initialMessageCount = window.sendCalls.length;
    const maliciousSha = '--output=/tmp/annotate-git-diff-sentinel';
    for (const message of [
      [],
      { type: 'request-file', requestId: 42, fileId: 'file-1', scope: 'branch', commitSha: null },
      { type: 'request-file', requestId: 'file-array', fileId: [], scope: 'branch', commitSha: null },
      { type: 'request-file', requestId: 'scope-array', fileId: 'file-1', scope: [], commitSha: null },
      { type: 'request-file', requestId: 'sha-array', fileId: 'file-1', scope: 'branch', commitSha: [] },
      { type: 'request-commit', requestId: 'commit-array', sha: [] },
      { type: 'request-review-data', requestId: [] },
      { type: 'clipboard-read', requestId: [] },
      { type: 'clipboard-write', text: [] },
    ]) {
      window.emit('message', message);
    }
    await flushAsyncWork();

    assert.equal(window.sendCalls.length, initialMessageCount);
    assert.deepEqual(state.commitFilesCalls, []);
    assert.deepEqual(state.loadFileCalls, []);
    assert.deepEqual(state.clipboardReads, []);
    assert.deepEqual(state.clipboardWrites, []);

    window.emit('message', { type: 'request-commit', requestId: 'unadvertised-commit', sha: maliciousSha });
    window.emit('message', {
      type: 'request-file',
      requestId: 'unadvertised-file',
      fileId: 'file-1',
      scope: 'commits',
      commitSha: maliciousSha,
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'branch-with-commit',
      fileId: 'file-1',
      scope: 'branch',
      commitSha: advertisedCommit.sha,
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'all-with-commit',
      fileId: 'file-1',
      scope: 'all',
      commitSha: advertisedCommit.sha,
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'missing-commit',
      fileId: 'file-1',
      scope: 'commits',
      commitSha: null,
    });
    window.emit('message', {
      type: 'request-commit',
      requestId: 'advertised-commit',
      sha: advertisedCommit.sha,
    });
    window.emit('message', {
      type: 'request-commit',
      requestId: 'advertised-working-tree-commit',
      sha: advertisedWorkingTree.sha,
    });
    window.emit('message', {
      type: 'request-commit',
      requestId: 'other-advertised-commit',
      sha: otherAdvertisedCommit.sha,
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'branch-file',
      fileId: 'file-1',
      scope: 'branch',
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'all-file',
      fileId: 'file-1',
      scope: 'all',
    });
    await flushAsyncWork();

    // Commit-scoped file reads are authorized only after the exact commit's
    // file map has been loaded; a branch/global file id is not sufficient.
    window.emit('message', {
      type: 'request-file',
      requestId: 'advertised-file',
      fileId: 'file-1',
      scope: 'commits',
      commitSha: advertisedCommit.sha,
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'advertised-working-tree-file',
      fileId: 'file-1',
      scope: 'commits',
      commitSha: advertisedWorkingTree.sha,
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'cross-scope-file-id',
      fileId: branchOnlyFile.id,
      scope: 'commits',
      commitSha: advertisedCommit.sha,
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'wrong-commit-file-id',
      fileId: reviewFile.id,
      scope: 'commits',
      commitSha: otherAdvertisedCommit.sha,
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'cross-scope-commit-file-id',
      fileId: commitOnlyFile.id,
      scope: 'branch',
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'other-commit-file',
      fileId: commitOnlyFile.id,
      scope: 'commits',
      commitSha: otherAdvertisedCommit.sha,
    });
    await flushAsyncWork();

    assert.deepEqual(state.commitFilesCalls, [
      { repoRoot: '/repo', sha: advertisedCommit.sha },
      { repoRoot: '/repo', sha: advertisedWorkingTree.sha },
      { repoRoot: '/repo', sha: otherAdvertisedCommit.sha },
    ]);
    assert.deepEqual(state.loadFileCalls, [
      { fileId: 'file-1', scope: 'branch', commitSha: null },
      { fileId: 'file-1', scope: 'all', commitSha: null },
      { fileId: 'file-1', scope: 'commits', commitSha: advertisedCommit.sha },
      { fileId: 'file-1', scope: 'commits', commitSha: advertisedWorkingTree.sha },
      { fileId: commitOnlyFile.id, scope: 'commits', commitSha: otherAdvertisedCommit.sha },
    ]);

    const messages = window.sendCalls.map(parseReviewWindowMessage);
    assert.deepEqual(messages.filter((message) => message.type === 'commit-error'), [
      {
        type: 'commit-error',
        requestId: 'unadvertised-commit',
        sha: maliciousSha,
        message: 'Unknown commit requested.',
      },
    ]);
    assert.deepEqual(
      messages
        .filter((message) => message.type === 'file-error')
        .map(({ requestId, commitSha, message }) => ({ requestId, commitSha, message })),
      [
        { requestId: 'unadvertised-file', commitSha: maliciousSha, message: 'Unknown commit requested.' },
        {
          requestId: 'branch-with-commit',
          commitSha: advertisedCommit.sha,
          message: 'A commit SHA is only valid for commit-scoped file requests.',
        },
        {
          requestId: 'all-with-commit',
          commitSha: advertisedCommit.sha,
          message: 'A commit SHA is only valid for commit-scoped file requests.',
        },
        {
          requestId: 'missing-commit',
          commitSha: null,
          message: 'A commit SHA is required for commit-scoped file requests.',
        },
        { requestId: 'cross-scope-file-id', commitSha: advertisedCommit.sha, message: 'Unknown file requested.' },
        { requestId: 'wrong-commit-file-id', commitSha: otherAdvertisedCommit.sha, message: 'Unknown file requested.' },
        { requestId: 'cross-scope-commit-file-id', commitSha: null, message: 'Unknown file requested.' },
      ],
    );

    window.emit('message', { type: 'request-review-data', requestId: 'refresh-1' });
    await flushAsyncWork();
    window.emit('message', { type: 'request-commit', requestId: 'old-after-refresh', sha: advertisedCommit.sha });
    window.emit('message', { type: 'request-commit', requestId: 'new-after-refresh', sha: refreshedCommit.sha });
    window.emit('message', {
      type: 'request-file',
      requestId: 'working-tree-after-refresh',
      fileId: 'file-1',
      scope: 'commits',
      commitSha: advertisedWorkingTree.sha,
    });
    await flushAsyncWork();

    assert.deepEqual(state.commitFilesCalls, [
      { repoRoot: '/repo', sha: advertisedCommit.sha },
      { repoRoot: '/repo', sha: advertisedWorkingTree.sha },
      { repoRoot: '/repo', sha: otherAdvertisedCommit.sha },
      { repoRoot: '/repo', sha: refreshedCommit.sha },
    ]);
    const refreshedMessages = window.sendCalls.map(parseReviewWindowMessage);
    assert.deepEqual(refreshedMessages.filter((message) => message.requestId === 'old-after-refresh'), [
      {
        type: 'commit-error',
        requestId: 'old-after-refresh',
        sha: advertisedCommit.sha,
        message: 'Unknown commit requested.',
      },
    ]);
    assert.deepEqual(refreshedMessages.filter((message) => message.requestId === 'working-tree-after-refresh'), [
      {
        type: 'file-error',
        requestId: 'working-tree-after-refresh',
        fileId: 'file-1',
        scope: 'commits',
        commitSha: advertisedWorkingTree.sha,
        message: 'Unknown commit requested.',
      },
    ]);
    assert.deepEqual(state.clipboardReads, []);
    assert.deepEqual(state.clipboardWrites, []);

    await handlers.get('session_shutdown')?.({}, ctx);
  });

  await t.test('isolates deferred reads across refresh while retaining immutable commit loads', async () => {
    const window = createMockWindow('snapshot-refresh-window');
    const oldRemovedContents = createDeferred();
    const oldSharedContents = createDeferred();
    const newSharedContents = createDeferred();
    const keptCommitFiles = createDeferred();
    const workingTreeCommitFiles = createDeferred();
    const makeFile = (id, filePath, inGitDiff = true) => ({
      id,
      path: filePath,
      worktreeStatus: inGitDiff ? 'modified' : null,
      hasWorkingTreeFile: true,
      inGitDiff,
      gitDiff: inGitDiff ? {
        status: 'modified',
        oldPath: filePath,
        newPath: filePath,
        displayPath: filePath,
        hasOriginal: true,
        hasModified: true,
      } : null,
      kind: 'text',
      mimeType: null,
    });
    const contents = (text) => ({
      originalContent: `${text}-before`,
      modifiedContent: `${text}-after`,
      kind: 'text',
      mimeType: null,
      originalExists: true,
      modifiedExists: true,
      originalPreviewUrl: null,
      modifiedPreviewUrl: null,
    });
    const oldRemovedFile = makeFile('removed-file', 'src/removed.ts');
    const oldSharedFile = makeFile('shared-file', 'src/old-path.ts');
    const newSharedFile = makeFile('shared-file', 'src/new-path.ts');
    const keptCommit = {
      sha: 'kept-commit',
      shortSha: 'kept-co',
      subject: 'Kept immutable commit',
      authorName: 'TLH',
      authorDate: '2026-01-01',
      kind: 'commit',
    };
    const workingTreeCommit = {
      sha: '__tlh_working_tree__',
      shortSha: 'WT',
      subject: 'Uncommitted changes',
      authorName: '',
      authorDate: '',
      kind: 'working-tree',
    };
    const keptCommitFile = makeFile('kept-commit-file', 'src/kept.ts');
    const workingTreeFile = makeFile('working-tree-file', 'src/live.ts');
    const initialReviewData = {
      repoRoot: '/repo',
      files: [oldRemovedFile, oldSharedFile],
      commits: [keptCommit, workingTreeCommit],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'old-base',
      repositoryHasHead: true,
    };
    const refreshedReviewData = {
      ...initialReviewData,
      files: [newSharedFile],
      commits: [keptCommit],
      branchMergeBaseSha: 'new-base',
    };
    const state = createAnnotateGitDiffState({
      windows: [window],
      getReviewWindowDataResults: [initialReviewData, refreshedReviewData],
      commitFilesResults: new Map([
        [keptCommit.sha, keptCommitFiles.promise],
        [workingTreeCommit.sha, workingTreeCommitFiles.promise],
      ]),
      loadFileResults: new Map([
        ['branch::removed-file', oldRemovedContents.promise],
        ['branch::shared-file', oldSharedContents.promise],
      ]),
    });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, handlers, sentUserMessages } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const { ctx } = createCommandContext();
    await handler({}, ctx);

    window.emit('message', {
      type: 'request-file',
      requestId: 'old-removed-file',
      fileId: oldRemovedFile.id,
      scope: 'branch',
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'old-shared-file',
      fileId: oldSharedFile.id,
      scope: 'branch',
    });
    window.emit('message', { type: 'request-commit', requestId: 'kept-before-refresh', sha: keptCommit.sha });
    window.emit('message', { type: 'request-commit', requestId: 'working-tree-before-refresh', sha: workingTreeCommit.sha });
    await flushAsyncWork();

    window.emit('message', { type: 'request-review-data', requestId: 'refresh-1' });
    await flushAsyncWork();
    state.loadFileResults.set('branch::shared-file', newSharedContents.promise);
    window.emit('message', {
      type: 'request-file',
      requestId: 'new-shared-file',
      fileId: newSharedFile.id,
      scope: 'branch',
    });
    window.emit('message', {
      type: 'request-file',
      requestId: 'removed-after-refresh',
      fileId: oldRemovedFile.id,
      scope: 'branch',
    });
    window.emit('message', { type: 'request-commit', requestId: 'kept-after-refresh', sha: keptCommit.sha });
    await flushAsyncWork();

    oldRemovedContents.resolve(contents('removed-old'));
    oldSharedContents.reject(new Error('stale shared read failed'));
    newSharedContents.resolve(contents('shared-new'));
    keptCommitFiles.resolve([keptCommitFile]);
    workingTreeCommitFiles.resolve([workingTreeFile]);
    await flushAsyncWork();

    const messages = window.sendCalls.map(parseReviewWindowMessage);
    assert.equal(messages.some((message) => message.requestId === 'old-removed-file'), false);
    assert.equal(messages.some((message) => message.requestId === 'old-shared-file'), false);
    assert.equal(messages.some((message) => message.requestId === 'working-tree-before-refresh'), false);
    assert.deepEqual(messages.find((message) => message.requestId === 'removed-after-refresh'), {
      type: 'file-error',
      requestId: 'removed-after-refresh',
      fileId: oldRemovedFile.id,
      scope: 'branch',
      commitSha: null,
      message: 'Unknown file requested.',
    });
    assert.deepEqual(messages.find((message) => message.requestId === 'new-shared-file'), {
      type: 'file-data',
      requestId: 'new-shared-file',
      fileId: newSharedFile.id,
      scope: 'branch',
      commitSha: null,
      ...contents('shared-new'),
    });
    assert.equal(messages.filter((message) => message.type === 'commit-data' && message.sha === keptCommit.sha).length, 2);
    assert.deepEqual(state.commitFilesCalls, [
      { repoRoot: '/repo', sha: keptCommit.sha },
      { repoRoot: '/repo', sha: workingTreeCommit.sha },
    ]);
    assert.deepEqual(state.loadFileCalls, [
      { fileId: oldRemovedFile.id, scope: 'branch', commitSha: null },
      { fileId: oldSharedFile.id, scope: 'branch', commitSha: null },
      { fileId: newSharedFile.id, scope: 'branch', commitSha: null },
    ]);

    window.emit('message', {
      type: 'submit',
      overallComment: '',
      comments: [{
        id: 'historical-comment',
        fileId: oldSharedFile.id,
        scope: 'branch',
        commitSha: null,
        commitShort: null,
        commitKind: null,
        side: 'modified',
        startLine: 2,
        endLine: 2,
        body: 'Keep the historical path.',
      }],
      draft: false,
    });
    await flushAsyncWork();
    assert.equal(state.composeCalls.length, 1);
    assert.equal(state.composeCalls[0].files.find((file) => file.id === oldSharedFile.id)?.path, oldSharedFile.path);
    assert.deepEqual(sentUserMessages, [
      { message: 'ANNOTATE GIT DIFF PROMPT', options: { deliverAs: 'followUp' } },
    ]);

    await handlers.get('session_shutdown')?.({}, ctx);
  });

  await t.test('keeps the newest overlapping refresh snapshot and branch merge base', async () => {
    const window = createMockWindow('overlapping-refresh-window');
    const staleRefresh = createDeferred();
    const newestRefresh = createDeferred();
    const oldFile = {
      ...createAnnotateGitDiffState().getReviewWindowDataResults[0].files[0],
      id: 'overlap-file',
      path: 'src/old.ts',
    };
    const newestFile = { ...oldFile, path: 'src/new.ts' };
    const fileContents = {
      originalContent: 'old base',
      modifiedContent: 'new contents',
      kind: 'text',
      mimeType: null,
      originalExists: true,
      modifiedExists: true,
      originalPreviewUrl: null,
      modifiedPreviewUrl: null,
    };
    const baseReviewData = {
      repoRoot: '/repo',
      files: [oldFile],
      commits: [],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'initial-base',
      repositoryHasHead: true,
    };
    const staleReviewData = { ...baseReviewData, branchMergeBaseSha: 'stale-base' };
    const newestReviewData = {
      ...baseReviewData,
      files: [newestFile],
      branchMergeBaseSha: 'newest-base',
    };
    const state = createAnnotateGitDiffState({
      windows: [window],
      getReviewWindowDataResults: [baseReviewData, staleRefresh.promise, newestRefresh.promise],
      loadFileResults: new Map([['branch::overlap-file', fileContents]]),
    });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, handlers } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const { ctx } = createCommandContext();
    await handler({}, ctx);

    window.emit('message', { type: 'request-review-data', requestId: 'stale-refresh' });
    window.emit('message', { type: 'request-review-data', requestId: 'newest-refresh' });
    newestRefresh.resolve(newestReviewData);
    await flushAsyncWork();
    staleRefresh.resolve(staleReviewData);
    await flushAsyncWork();

    const refreshMessages = window.sendCalls.map(parseReviewWindowMessage);
    assert.deepEqual(refreshMessages.filter((message) => message.type === 'review-data'), [{
      type: 'review-data',
      requestId: 'newest-refresh',
      files: newestReviewData.files,
      commits: newestReviewData.commits,
      branchBaseRef: newestReviewData.branchBaseRef,
      branchMergeBaseSha: newestReviewData.branchMergeBaseSha,
      repositoryHasHead: newestReviewData.repositoryHasHead,
    }]);

    window.emit('message', {
      type: 'request-file',
      requestId: 'newest-file',
      fileId: newestFile.id,
      scope: 'branch',
    });
    await flushAsyncWork();
    assert.equal(state.loadFileMergeBases.at(-1), 'newest-base');
    assert.deepEqual(window.sendCalls.map(parseReviewWindowMessage).find((message) => message.requestId === 'newest-file'), {
      type: 'file-data',
      requestId: 'newest-file',
      fileId: newestFile.id,
      scope: 'branch',
      commitSha: null,
      ...fileContents,
    });

    await handlers.get('session_shutdown')?.({}, ctx);
  });

  await t.test('retries rejected file and immutable commit loads without stale replacement eviction', async () => {
    const window = createMockWindow('retry-refresh-window');
    const oldFileContents = createDeferred();
    const replacementFileContents = createDeferred();
    const retainedCommitFailure = createDeferred();
    const removedCommitFailure = createDeferred();
    const replacementCommitFiles = createDeferred();
    const makeFile = (id, filePath) => ({
      id,
      path: filePath,
      worktreeStatus: 'modified',
      hasWorkingTreeFile: true,
      inGitDiff: true,
      gitDiff: {
        status: 'modified',
        oldPath: filePath,
        newPath: filePath,
        displayPath: filePath,
        hasOriginal: true,
        hasModified: true,
      },
      kind: 'text',
      mimeType: null,
    });
    const oldFile = makeFile('retry-file', 'src/old-retry.ts');
    const refreshedFile = makeFile('retry-file', 'src/new-retry.ts');
    const retainedCommit = {
      sha: 'retained-immutable',
      shortSha: 'retained',
      subject: 'Retained immutable commit',
      authorName: 'TLH',
      authorDate: '2026-01-01',
      kind: 'commit',
    };
    const removedCommit = {
      sha: 'removed-then-readded',
      shortSha: 'removed',
      subject: 'Removed and re-added commit',
      authorName: 'TLH',
      authorDate: '2026-01-02',
      kind: 'commit',
    };
    const commitFile = makeFile('commit-file', 'src/commit.ts');
    const initialReviewData = {
      repoRoot: '/repo',
      files: [oldFile],
      commits: [retainedCommit, removedCommit],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'old-base',
      repositoryHasHead: true,
    };
    const removedReviewData = {
      ...initialReviewData,
      files: [refreshedFile],
      commits: [retainedCommit],
      branchMergeBaseSha: 'refreshed-base',
    };
    const readdedReviewData = {
      ...removedReviewData,
      commits: [retainedCommit, removedCommit],
      branchMergeBaseSha: 'readded-base',
    };
    const successfulFileContents = {
      originalContent: 'before retry',
      modifiedContent: 'after retry',
      kind: 'text',
      mimeType: null,
      originalExists: true,
      modifiedExists: true,
      originalPreviewUrl: null,
      modifiedPreviewUrl: null,
    };
    const state = createAnnotateGitDiffState({
      windows: [window],
      getReviewWindowDataResults: [initialReviewData, removedReviewData, readdedReviewData],
      commitFilesResults: new Map([
        [retainedCommit.sha, retainedCommitFailure.promise],
        [removedCommit.sha, removedCommitFailure.promise],
      ]),
      loadFileResults: new Map([
        ['branch::retry-file', oldFileContents.promise],
      ]),
    });
    const extension = await loadAnnotateGitDiffExtension(state);
    const { pi, commands, handlers } = createExtensionHarness();
    extension(pi);

    const handler = commands.get('annotate-git-diff').handler;
    const { ctx } = createCommandContext();
    await handler({}, ctx);

    // Start old file and commit reads before replacing their authorization snapshot.
    window.emit('message', {
      type: 'request-file',
      requestId: 'old-file-retry',
      fileId: oldFile.id,
      scope: 'branch',
    });
    window.emit('message', {
      type: 'request-commit',
      requestId: 'retained-commit-failure',
      sha: retainedCommit.sha,
    });
    window.emit('message', {
      type: 'request-commit',
      requestId: 'removed-commit-old',
      sha: removedCommit.sha,
    });
    await flushAsyncWork();

    window.emit('message', { type: 'request-review-data', requestId: 'remove-commit' });
    await flushAsyncWork();
    state.loadFileResults.set('branch::retry-file', replacementFileContents.promise);
    window.emit('message', {
      type: 'request-file',
      requestId: 'replacement-file-retry',
      fileId: refreshedFile.id,
      scope: 'branch',
    });

    oldFileContents.reject(new Error('old file rejection'));
    retainedCommitFailure.reject(new Error('retained commit rejection'));
    await flushAsyncWork();
    replacementFileContents.resolve(successfulFileContents);
    await flushAsyncWork();

    // Re-add the removed commit so a replacement promise can occupy its cache key.
    window.emit('message', { type: 'request-review-data', requestId: 'readd-commit' });
    await flushAsyncWork();
    state.commitFilesResults.set(removedCommit.sha, replacementCommitFiles.promise);
    window.emit('message', {
      type: 'request-commit',
      requestId: 'removed-commit-replacement',
      sha: removedCommit.sha,
    });
    await flushAsyncWork();
    removedCommitFailure.reject(new Error('old removed commit rejection'));
    replacementCommitFiles.resolve([commitFile]);
    await flushAsyncWork();

    const messages = window.sendCalls.map(parseReviewWindowMessage);
    assert.equal(messages.some((message) => message.requestId === 'old-file-retry'), false);
    assert.equal(messages.some((message) => message.requestId === 'removed-commit-old'), false);
    assert.deepEqual(messages.find((message) => message.requestId === 'replacement-file-retry'), {
      type: 'file-data',
      requestId: 'replacement-file-retry',
      fileId: refreshedFile.id,
      scope: 'branch',
      commitSha: null,
      ...successfulFileContents,
    });
    assert.deepEqual(messages.find((message) => message.requestId === 'retained-commit-failure'), {
      type: 'commit-error',
      requestId: 'retained-commit-failure',
      sha: retainedCommit.sha,
      message: 'retained commit rejection',
    });
    assert.deepEqual(messages.find((message) => message.requestId === 'removed-commit-replacement'), {
      type: 'commit-data',
      requestId: 'removed-commit-replacement',
      sha: removedCommit.sha,
      files: [commitFile],
    });

    // Both rejection paths evicted only their current promise, so a fresh
    // request for the rejected retained commit can succeed.
    state.commitFilesResults.set(retainedCommit.sha, [commitFile]);
    window.emit('message', {
      type: 'request-commit',
      requestId: 'retained-commit-retry',
      sha: retainedCommit.sha,
    });
    await flushAsyncWork();
    assert.deepEqual(messages.concat(window.sendCalls.map(parseReviewWindowMessage)).find((message) => message.requestId === 'retained-commit-retry'), {
      type: 'commit-data',
      requestId: 'retained-commit-retry',
      sha: retainedCommit.sha,
      files: [commitFile],
    });

    await handlers.get('session_shutdown')?.({}, ctx);
  });

  await t.test('blocks closed and shutdown completions while preserving late draft recovery', async () => {
    const closedWindow = createMockWindow('closed-grace-window');
    const lateCommitFiles = createDeferred();
    const lateRefresh = createDeferred();
    const lateCommit = {
      sha: 'late-commit',
      shortSha: 'late-com',
      subject: 'Late commit',
      authorName: 'TLH',
      authorDate: '2026-01-01',
      kind: 'commit',
    };
    const lateFile = {
      id: 'late-file',
      path: 'src/late.ts',
      worktreeStatus: null,
      hasWorkingTreeFile: false,
      inGitDiff: false,
      gitDiff: null,
      kind: 'text',
      mimeType: null,
    };
    const initialReviewData = {
      repoRoot: '/repo',
      files: [],
      commits: [lateCommit],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'initial-base',
      repositoryHasHead: true,
    };
    const lateReviewData = {
      ...initialReviewData,
      files: [lateFile],
      branchMergeBaseSha: 'late-base',
    };
    const closedState = createAnnotateGitDiffState({
      windows: [closedWindow],
      getReviewWindowDataResults: [initialReviewData, lateRefresh.promise],
      commitFilesResults: new Map([[lateCommit.sha, lateCommitFiles.promise]]),
    });
    const closedExtension = await loadAnnotateGitDiffExtension(closedState);
    const closedHarness = createExtensionHarness();
    closedExtension(closedHarness.pi);
    const closedHandler = closedHarness.commands.get('annotate-git-diff').handler;
    const { ctx: closedCtx, pasted } = createCommandContext();
    await closedHandler({}, closedCtx);

    closedWindow.emit('message', {
      type: 'request-commit',
      requestId: 'late-commit-load',
      sha: lateCommit.sha,
    });
    closedWindow.emit('message', { type: 'request-review-data', requestId: 'late-refresh' });
    await flushAsyncWork();
    const sendsBeforeClose = closedWindow.sendCalls.length;
    const commitCallsBeforeClose = closedState.commitFilesCalls.length;
    const reviewCallsBeforeClose = closedState.getReviewWindowDataCalls.length;

    closedWindow.closed = true;
    closedWindow.emit('closed');
    closedWindow.emit('message', {
      type: 'request-commit',
      requestId: 'rejected-after-close',
      sha: lateCommit.sha,
    });
    closedWindow.emit('message', { type: 'request-review-data', requestId: 'rejected-refresh-after-close' });
    closedWindow.emit('message', { type: 'clipboard-read', requestId: 'rejected-clipboard-after-close' });
    closedWindow.emit('message', { type: 'clipboard-write', text: 'must not write after close' });
    lateCommitFiles.resolve([lateFile]);
    lateRefresh.resolve(lateReviewData);
    await flushAsyncWork();

    assert.equal(closedWindow.sendCalls.length, sendsBeforeClose);
    assert.equal(closedState.commitFilesCalls.length, commitCallsBeforeClose);
    assert.equal(closedState.getReviewWindowDataCalls.length, reviewCallsBeforeClose);
    assert.deepEqual(closedState.clipboardReads, []);
    assert.deepEqual(closedState.clipboardWrites, []);

    closedWindow.emit('message', {
      type: 'submit',
      overallComment: '',
      comments: [{
        id: 'late-draft-comment',
        fileId: lateFile.id,
        scope: 'commits',
        commitSha: lateCommit.sha,
        commitShort: lateCommit.shortSha,
        commitKind: lateCommit.kind,
        side: 'modified',
        startLine: 1,
        endLine: 1,
        body: 'Recover this draft after native close.',
      }],
      draft: true,
    });
    await flushAsyncWork();
    assert.deepEqual(closedState.composeCalls, [{
      files: [],
      payload: {
        type: 'submit',
        overallComment: '',
        comments: [{
          id: 'late-draft-comment',
          fileId: lateFile.id,
          scope: 'commits',
          commitSha: lateCommit.sha,
          commitShort: lateCommit.shortSha,
          commitKind: lateCommit.kind,
          side: 'modified',
          startLine: 1,
          endLine: 1,
          body: 'Recover this draft after native close.',
        }],
        draft: true,
      },
    }]);
    assert.deepEqual(pasted, ['ANNOTATE GIT DIFF PROMPT']);
    assert.deepEqual(closedHarness.sentUserMessages, []);

    const shutdownWindow = createMockWindow('shutdown-grace-window');
    const shutdownCommitFiles = createDeferred();
    const shutdownCommit = { ...lateCommit, sha: 'shutdown-commit' };
    const shutdownState = createAnnotateGitDiffState({
      windows: [shutdownWindow],
      getReviewWindowDataResults: [{ ...initialReviewData, commits: [shutdownCommit] }],
      commitFilesResults: new Map([[shutdownCommit.sha, shutdownCommitFiles.promise]]),
    });
    const shutdownExtension = await loadAnnotateGitDiffExtension(shutdownState);
    const shutdownHarness = createExtensionHarness();
    shutdownExtension(shutdownHarness.pi);
    const shutdownHandler = shutdownHarness.commands.get('annotate-git-diff').handler;
    const shutdown = shutdownHarness.handlers.get('session_shutdown');
    const { ctx: shutdownCtx } = createCommandContext();
    await shutdownHandler({}, shutdownCtx);
    shutdownWindow.emit('message', {
      type: 'request-commit',
      requestId: 'shutdown-commit-load',
      sha: shutdownCommit.sha,
    });
    await flushAsyncWork();
    await shutdown({}, shutdownCtx);
    shutdownWindow.emit('message', {
      type: 'submit',
      overallComment: 'Must not send after shutdown.',
      comments: [],
      draft: false,
    });
    shutdownCommitFiles.resolve([lateFile]);
    await flushAsyncWork();

    assert.deepEqual(shutdownState.commitFilesCalls, [{ repoRoot: '/repo', sha: shutdownCommit.sha }]);
    assert.deepEqual(shutdownState.composeCalls, []);
    assert.deepEqual(shutdownHarness.sentUserMessages, []);
    assert.deepEqual(shutdownWindow.sendCalls, []);
  });

  await t.test('reconciles removed commit UI state through the live review-data handler while preserving comments', async () => {
    const removedCommit = {
      sha: 'ui-removed-commit',
      shortSha: 'ui-remove',
      subject: 'Removed UI commit',
      authorName: 'TLH',
      authorDate: '2026-01-01',
      kind: 'commit',
    };
    const retainedCommit = {
      sha: 'ui-retained-commit',
      shortSha: 'ui-retain',
      subject: 'Retained UI commit',
      authorName: 'TLH',
      authorDate: '2026-01-02',
      kind: 'commit',
    };
    const removedFile = { id: 'ui-removed-file', path: 'src/removed-ui.ts', kind: 'text', inGitDiff: true };
    const retainedFile = { id: 'ui-retained-file', path: 'src/retained-ui.ts', kind: 'text', inGitDiff: true };
    const initialReviewData = {
      repoRoot: '/repo',
      files: [],
      commits: [removedCommit, retainedCommit],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'ui-initial-base',
      repositoryHasHead: true,
    };
    const ui = await loadAnnotateGitDiffUiFixture(initialReviewData);
    const { state } = ui;
    const removedCommitFileKey = `commits:${removedCommit.sha}:${removedFile.id}`;
    const retainedCommitFileKey = `commits:${retainedCommit.sha}:${retainedFile.id}`;
    const retainedContents = {
      originalContent: 'retained-before',
      modifiedContent: 'retained-after',
      kind: 'text',
      mimeType: null,
      originalExists: true,
      modifiedExists: true,
      originalPreviewUrl: null,
      modifiedPreviewUrl: null,
    };
    const historicalComment = {
      id: 'ui-historical-comment',
      fileId: removedFile.id,
      scope: 'commits',
      commitSha: removedCommit.sha,
      commitShort: removedCommit.shortSha,
      commitKind: removedCommit.kind,
      side: 'modified',
      startLine: 2,
      endLine: 2,
      body: 'Keep this comment after the commit disappears.',
    };

    state.commitFilesBySha[removedCommit.sha] = [removedFile];
    state.commitErrors[removedCommit.sha] = 'removed commit failed';
    state.commitRequestIds[removedCommit.sha] = 'removed-pending';
    state.fileContents[removedCommitFileKey] = { ...retainedContents };
    state.fileErrors[removedCommitFileKey] = 'removed file failed';
    state.pendingRequestIds[removedCommitFileKey] = 'removed-file-pending';
    state.reviewedFiles[removedFile.id] = true;
    state.scrollPositions[removedCommitFileKey] = { originalTop: 10, modifiedTop: 20 };

    state.commitFilesBySha[retainedCommit.sha] = [retainedFile];
    state.commitErrors[retainedCommit.sha] = 'retained commit can retry';
    state.commitRequestIds[retainedCommit.sha] = 'retained-pending';
    state.fileContents[retainedCommitFileKey] = retainedContents;
    state.fileErrors[retainedCommitFileKey] = 'retained file can retry';
    state.pendingRequestIds[retainedCommitFileKey] = 'retained-file-pending';
    state.comments = [historicalComment];
    state.selectedCommitSha = removedCommit.sha;
    state.currentScope = 'commits';

    ui.elements.get('refresh-review-button').click();
    const requestId = state.reviewDataRequestId;
    assert.ok(requestId);
    ui.window.__reviewReceive({
      type: 'review-data',
      requestId,
      files: [],
      commits: [retainedCommit],
      branchBaseRef: 'origin/main',
      branchMergeBaseSha: 'ui-new-base',
      repositoryHasHead: true,
    });

    assert.equal(state.commitFilesBySha[removedCommit.sha], undefined);
    assert.equal(state.commitErrors[removedCommit.sha], undefined);
    assert.equal(state.commitRequestIds[removedCommit.sha], undefined);
    assert.equal(state.fileContents[removedCommitFileKey], undefined);
    assert.equal(state.fileErrors[removedCommitFileKey], undefined);
    assert.equal(state.pendingRequestIds[removedCommitFileKey], undefined);
    assert.equal(state.reviewedFiles[removedFile.id], undefined);
    assert.equal(state.scrollPositions[removedCommitFileKey], undefined);
    assert.deepEqual(state.commitFilesBySha[retainedCommit.sha], [retainedFile]);
    assert.equal(state.commitErrors[retainedCommit.sha], undefined);
    assert.equal(state.commitRequestIds[retainedCommit.sha], 'retained-pending');
    assert.deepEqual(state.fileContents[retainedCommitFileKey], retainedContents);
    assert.equal(state.fileErrors[retainedCommitFileKey], undefined);
    assert.equal(state.pendingRequestIds[retainedCommitFileKey], 'retained-file-pending');
    assert.deepEqual(state.comments, [historicalComment]);
    assert.equal(state.selectedCommitSha, retainedCommit.sha);
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
      commits: [{
        sha: 'deadbeef',
        shortSha: 'deadbee',
        subject: 'Fixture commit',
        authorName: 'TLH',
        authorDate: '2026-01-01',
        kind: 'commit',
      }],
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

    assert.equal(failingReviewWindow.closeCalls, 1);
    assert.deepEqual(pasted, []);
    assert.equal(state.disposedWatchers, 1);
    assert.equal(state.disposedUiServers, 1);
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
