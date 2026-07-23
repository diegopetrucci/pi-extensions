import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let importCounter = 0;

async function loadFreshLibrarianExtension() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts'));
  moduleUrl.searchParams.set('test', `${Date.now()}-${importCounter++}`);
  const extensionModule = await import(moduleUrl.href);
  return extensionModule.default;
}

function setEnv(t, key, value) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });
}

function setupLibrarianEnv(t, { extensionPathConflict = false } = {}) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'librarian-command-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const cacheRoot = path.join(rootDir, 'cache');
  const configPath = path.join(agentDir, 'extensions', 'librarian.json');

  mkdirSync(agentDir, { recursive: true });
  if (extensionPathConflict) {
    writeFileSync(path.join(agentDir, 'extensions'), 'conflict\n');
  } else {
    mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  }

  setEnv(t, 'PI_CODING_AGENT_DIR', agentDir);
  setEnv(t, 'PI_LIBRARIAN_CACHE_ROOT', cacheRoot);
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  return { agentDir, cacheRoot, configPath };
}

function createCommandContext() {
  const notifications = [];
  return {
    notifications,
    ctx: {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  };
}

function getCommand(harness, name) {
  const command = harness.commands.get(name);
  assert.ok(command, `expected ${name} command to be registered`);
  return command;
}

function getHandler(harness, name) {
  const handler = harness.handlers.get(name);
  assert.equal(typeof handler, 'function', `expected ${name} handler to be registered`);
  return handler;
}

function completionValues(result) {
  return result?.map((entry) => entry.value) ?? [];
}

test('librarian aggregates usage across assistant and compaction session events', async () => {
  const { aggregateAssistantUsage, addSessionEventUsage } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;

  assert.deepEqual(
    aggregateAssistantUsage([
      { role: 'assistant', usage: { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, reasoning: 1, totalTokens: 5, cost: { input: 0.2, output: 0.3, cacheRead: 0.4, cacheWrite: 0.5, total: 1.4 } } },
      { role: 'assistant', usage: { input: 7, output: 11, cacheRead: 13, cacheWrite: 17, cacheWrite1h: 19, totalTokens: 18, cost: { input: 0.7, output: 1.1, cacheRead: 1.3, cacheWrite: 1.7, total: 4.8 } } },
    ]),
    {
      input: 9,
      output: 14,
      cacheRead: 17,
      cacheWrite: 22,
      cacheWrite1h: 19,
      reasoning: 1,
      totalTokens: 23,
      cost: { input: 0.8999999999999999, output: 1.4000000000000001, cacheRead: 1.7000000000000002, cacheWrite: 2.2, total: 6.199999999999999 },
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

test('librarian classifies timeout cleanup separately from caller cancellation', async () => {
  const { classifyRunFailure, createLibrarianAbortController } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;
  let childAborts = 0;
  let callerNotifications = 0;
  const controller = createLibrarianAbortController(
    () => { childAborts += 1; },
    () => { callerNotifications += 1; },
  );

  controller.abortForCleanup();
  assert.equal(childAborts, 1);
  assert.equal(callerNotifications, 0);
  assert.equal(controller.callerAborted, false);
  assert.deepEqual(classifyRunFailure(new Error('Librarian timed out after 480 seconds.'), controller.callerAborted), {
    status: 'error',
    message: 'Librarian timed out after 480 seconds.',
    error: 'Librarian timed out after 480 seconds.',
  });

  controller.abortFromCaller();
  assert.equal(childAborts, 2);
  assert.equal(callerNotifications, 1);
  assert.equal(controller.callerAborted, true);
  assert.deepEqual(classifyRunFailure(new Error('provider failure after abort'), controller.callerAborted), {
    status: 'aborted',
    message: 'Aborted',
    error: undefined,
  });
});

test('librarian treats non-caller AbortError as a terminal error', async () => {
  const { classifyRunFailure } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;
  const abortError = Object.assign(new Error('provider aborted unexpectedly'), { name: 'AbortError' });
  assert.deepEqual(classifyRunFailure(abortError, false), {
    status: 'error',
    message: 'provider aborted unexpectedly',
    error: 'provider aborted unexpectedly',
  });
});

test('librarian rejects partial error text, lets caller abort win partial text, and accepts successful text', async () => {
  const { inspectFinalAssistant, resolveLibrarianTerminalOutcome } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;
  const partialError = inspectFinalAssistant([{
    role: 'assistant',
    stopReason: 'error',
    errorMessage: 'provider unavailable',
    content: [{ type: 'text', text: 'partial answer' }],
  }]);
  assert.deepEqual(partialError, {
    ok: false,
    reason: 'the internal subagent stopped with an error: provider unavailable',
    message: {
      role: 'assistant',
      stopReason: 'error',
      errorMessage: 'provider unavailable',
      content: [{ type: 'text', text: 'partial answer' }],
    },
    stopReason: 'error',
    errorMessage: 'provider unavailable',
  });
  assert.deepEqual(resolveLibrarianTerminalOutcome(partialError, false, 1), {
    status: 'error',
    reason: 'the internal subagent stopped with an error: provider unavailable',
  });

  const partialBeforeCallerAbort = inspectFinalAssistant([{
    role: 'assistant',
    stopReason: 'stop',
    content: [{ type: 'text', text: 'partial before caller abort' }],
  }]);
  assert.deepEqual(resolveLibrarianTerminalOutcome(partialBeforeCallerAbort, true, 1), {
    status: 'aborted',
    content: 'Aborted',
  });

  const success = inspectFinalAssistant([{
    role: 'assistant',
    stopReason: 'stop',
    content: [{ type: 'text', text: 'final answer' }],
  }]);
  assert.deepEqual(resolveLibrarianTerminalOutcome(success, false, 1), {
    status: 'done',
    content: 'final answer',
  });
});

test('librarian cleanup preserves recent live owners despite delayed heartbeats', async (t) => {
  const { cleanupExpiredCache, CLEANUP_LOCK_FILE, CLEANUP_LOCK_STALE_MS } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;
  const root = mkdtempSync(path.join(os.tmpdir(), 'librarian-cleanup-test-'));
  const repoDir = path.join(root, 'github.com', 'acme', 'widgets');
  mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  const markerPath = path.join(repoDir, '.pi-librarian-cache-used');
  writeFileSync(markerPath, 'used\n');
  const expired = Date.now() - (8 * 24 * 60 * 60 * 1000);
  const oldDate = new Date(expired);
  utimesSync(markerPath, oldDate, oldDate);
  rmSync(path.join(root, CLEANUP_LOCK_FILE), { force: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const lockPath = path.join(root, CLEANUP_LOCK_FILE);
  const liveOwner = JSON.stringify({ pid: process.pid, hostname: os.hostname(), token: 'live-owner', acquiredAt: new Date().toISOString() });
  writeFileSync(lockPath, liveOwner);
  const delayedHeartbeat = new Date(Date.now() - CLEANUP_LOCK_STALE_MS - 1_000);
  utimesSync(lockPath, delayedHeartbeat, delayedHeartbeat);

  const activeResult = await cleanupExpiredCache(root);
  assert.deepEqual(activeResult, { deleted: 0, errors: [] });
  assert.equal(readFileSync(lockPath, 'utf8'), liveOwner);
  assert.equal(readFileSync(markerPath, 'utf8'), 'used\n');
});

test('librarian cleanup reclaims live-pid locks once their absolute owner lease expires', async (t) => {
  const { cleanupExpiredCache, CLEANUP_LOCK_FILE, CLEANUP_LOCK_MAX_LEASE_MS } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;
  const root = mkdtempSync(path.join(os.tmpdir(), 'librarian-cleanup-test-'));
  const repoDir = path.join(root, 'github.com', 'acme', 'widgets');
  mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  const markerPath = path.join(repoDir, '.pi-librarian-cache-used');
  writeFileSync(markerPath, 'used\n');
  const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
  utimesSync(markerPath, oldDate, oldDate);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const lockPath = path.join(root, CLEANUP_LOCK_FILE);
  const expiredOwner = JSON.stringify({
    pid: process.pid,
    hostname: os.hostname(),
    token: 'expired-live-owner',
    acquiredAt: new Date(Date.now() - CLEANUP_LOCK_MAX_LEASE_MS - 1_000).toISOString(),
  });
  writeFileSync(lockPath, expiredOwner);

  const staleResult = await cleanupExpiredCache(root);
  assert.deepEqual(staleResult, { deleted: 1, errors: [] });
  assert.equal(existsSync(repoDir), false);
  assert.equal(existsSync(lockPath), false);
});

test('librarian cleanup reclaims abandoned locks', async (t) => {
  const { cleanupExpiredCache, CLEANUP_LOCK_FILE, CLEANUP_LOCK_STALE_MS } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;
  const root = mkdtempSync(path.join(os.tmpdir(), 'librarian-cleanup-test-'));
  const repoDir = path.join(root, 'github.com', 'acme', 'widgets');
  mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  const markerPath = path.join(repoDir, '.pi-librarian-cache-used');
  writeFileSync(markerPath, 'used\n');
  const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
  utimesSync(markerPath, oldDate, oldDate);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const lockPath = path.join(root, CLEANUP_LOCK_FILE);
  const abandonedOwner = JSON.stringify({ pid: 2_147_483_647, hostname: os.hostname(), token: 'abandoned-owner', acquiredAt: new Date(0).toISOString() });
  writeFileSync(lockPath, abandonedOwner);
  const delayedHeartbeat = new Date(Date.now() - CLEANUP_LOCK_STALE_MS - 1_000);
  utimesSync(lockPath, delayedHeartbeat, delayedHeartbeat);

  const staleResult = await cleanupExpiredCache(root);
  assert.deepEqual(staleResult, { deleted: 1, errors: [] });
  assert.equal(existsSync(repoDir), false);
  assert.equal(existsSync(lockPath), false);
});

test('librarian cleanup treats fresh empty lock files as active until they go stale', async (t) => {
  const { cleanupExpiredCache, CLEANUP_LOCK_FILE, CLEANUP_LOCK_STALE_MS } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;
  const root = mkdtempSync(path.join(os.tmpdir(), 'librarian-cleanup-test-'));
  const repoDir = path.join(root, 'github.com', 'acme', 'widgets');
  mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  const markerPath = path.join(repoDir, '.pi-librarian-cache-used');
  writeFileSync(markerPath, 'used\n');
  const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
  utimesSync(markerPath, oldDate, oldDate);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const lockPath = path.join(root, CLEANUP_LOCK_FILE);
  writeFileSync(lockPath, '');

  const freshResult = await cleanupExpiredCache(root);
  assert.deepEqual(freshResult, { deleted: 0, errors: [] });
  assert.equal(existsSync(repoDir), true);
  assert.equal(readFileSync(lockPath, 'utf8'), '');

  const staleDate = new Date(Date.now() - CLEANUP_LOCK_STALE_MS - 1_000);
  utimesSync(lockPath, staleDate, staleDate);
  const reclaimedResult = await cleanupExpiredCache(root);
  assert.deepEqual(reclaimedResult, { deleted: 1, errors: [] });
  assert.equal(existsSync(repoDir), false);
  assert.equal(existsSync(lockPath), false);
});

test('librarian cleanup stops if a displaced owner loses canonical lock ownership before deletion', async (t) => {
  const { cleanupExpiredRepos, tryAcquireCleanupLock, CLEANUP_LOCK_FILE } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;
  const root = mkdtempSync(path.join(os.tmpdir(), 'librarian-lock-race-test-'));
  const repoDir = path.join(root, 'github.com', 'acme', 'widgets');
  mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  const markerPath = path.join(repoDir, '.pi-librarian-cache-used');
  writeFileSync(markerPath, 'used\n');
  const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
  utimesSync(markerPath, oldDate, oldDate);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const oldLock = await tryAcquireCleanupLock(root);
  assert.ok(oldLock);
  const lockPath = path.join(root, CLEANUP_LOCK_FILE);
  const displacedPath = `${lockPath}.displaced`;
  renameSync(lockPath, displacedPath);
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, hostname: os.hostname(), token: 'replacement', acquiredAt: new Date().toISOString() }));

  const result = await cleanupExpiredRepos(root, Date.now(), oldLock);
  assert.equal(result.deleted, 0);
  assert.deepEqual(result.errors, ['cleanup lock ownership lost before cache scan; stopping cleanup.']);
  assert.equal(existsSync(repoDir), true);
  assert.equal(readFileSync(lockPath, 'utf8').includes('replacement'), true);
  rmSync(displacedPath, { force: true });
  await oldLock.handle.close().catch(() => undefined);
});

test('librarian old lock handles cannot heartbeat or release a replacement lock', async (t) => {
  const { tryAcquireCleanupLock, heartbeatCleanupLock, releaseCleanupLock, CLEANUP_LOCK_FILE } = (await import(pathToFileURL(path.join(repoRoot, 'extensions/librarian/index.ts')).href)).__test__;
  const root = mkdtempSync(path.join(os.tmpdir(), 'librarian-lock-race-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const oldLock = await tryAcquireCleanupLock(root);
  assert.ok(oldLock);
  const lockPath = path.join(root, CLEANUP_LOCK_FILE);
  const displacedPath = `${lockPath}.displaced`;
  renameSync(lockPath, displacedPath);
  const replacement = JSON.stringify({ pid: process.pid, hostname: os.hostname(), token: 'replacement', acquiredAt: new Date().toISOString() });
  writeFileSync(lockPath, replacement);
  const replacementBefore = statSync(lockPath).mtimeMs;

  await heartbeatCleanupLock(oldLock);
  assert.equal(readFileSync(lockPath, 'utf8'), replacement);
  assert.equal(statSync(lockPath).mtimeMs, replacementBefore);

  await releaseCleanupLock(oldLock);
  assert.equal(readFileSync(lockPath, 'utf8'), replacement);
  rmSync(displacedPath, { force: true });
});

test('librarian-config reports status, mutates defaults, offers completions, and persists preferences in a temp agent dir', async (t) => {
  const { configPath } = setupLibrarianEnv(t);
  const librarianExtension = await loadFreshLibrarianExtension();
  const harness = createExtensionHarness();
  librarianExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness, 'librarian-config');
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);

  assert.deepEqual(completionValues(command.getArgumentCompletions('')), ['status', 'model', 'thinking', 'clear']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('thi')), ['thinking']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('thinking m')), ['minimal', 'medium', 'max']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('thinking max')), ['max']);

  await command.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Librarian defaults: cache=off, model=auto, thinkingLevel=low\./);
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await command.handler('model anthropic/claude-haiku-4-5:high', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian model default updated\./);
  assert.match(notifications.at(-1).message, /model=anthropic\/claude-haiku-4-5/);
  assert.match(notifications.at(-1).message, /thinkingLevel=high/);

  await command.handler('clear model', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian defaults cleared \(model\)\./);
  assert.match(notifications.at(-1).message, /model=auto/);
  assert.match(notifications.at(-1).message, /thinkingLevel=high/);

  await command.handler('thinking medium', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian thinking default set to medium\./);

  const savedPreferences = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(savedPreferences.cacheMode, 'disabled');
  assert.equal(savedPreferences.cacheEnabled, false);
  assert.equal(savedPreferences.thinkingLevel, 'medium');
  assert.equal(savedPreferences.model, undefined);
  assert.equal(typeof savedPreferences.updatedAt, 'string');

  const reloadedExtension = await loadFreshLibrarianExtension();
  const reloadedHarness = createExtensionHarness();
  reloadedExtension(reloadedHarness.pi);

  const reloadedSessionStart = getHandler(reloadedHarness, 'session_start');
  const reloadedCommand = getCommand(reloadedHarness, 'librarian-config');
  const reloadedContext = createCommandContext();

  await reloadedSessionStart({}, reloadedContext.ctx);
  await reloadedCommand.handler('status', reloadedContext.ctx);
  assert.match(reloadedContext.notifications.at(-1).message, /cache=off, model=auto, thinkingLevel=medium\./);
});

test('librarian-cache reports status, toggles cache, offers completions, and persists cache mode in a temp agent dir', async (t) => {
  const { cacheRoot, configPath } = setupLibrarianEnv(t);
  const librarianExtension = await loadFreshLibrarianExtension();
  const harness = createExtensionHarness();
  librarianExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness, 'librarian-cache');
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);

  assert.deepEqual(completionValues(command.getArgumentCompletions('')), ['on', 'off', 'toggle', 'status']);
  assert.deepEqual(completionValues(command.getArgumentCompletions('t')), ['toggle']);

  await command.handler('status', ctx);
  assert.match(notifications.at(-1).message, /Librarian cache is off\./);
  assert.match(notifications.at(-1).message, new RegExp(cacheRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await command.handler('on', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian cache enabled\./);
  assert.match(notifications.at(-1).message, new RegExp(cacheRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await command.handler('toggle', ctx);
  assert.equal(notifications.at(-1).level, 'info');
  assert.match(notifications.at(-1).message, /Librarian cache disabled\./);

  const savedPreferences = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(savedPreferences.cacheMode, 'disabled');
  assert.equal(savedPreferences.cacheEnabled, false);
  assert.equal(savedPreferences.thinkingLevel, 'low');
  assert.equal(savedPreferences.model, undefined);
  assert.equal(typeof savedPreferences.updatedAt, 'string');

  const reloadedExtension = await loadFreshLibrarianExtension();
  const reloadedHarness = createExtensionHarness();
  reloadedExtension(reloadedHarness.pi);

  const reloadedSessionStart = getHandler(reloadedHarness, 'session_start');
  const reloadedCommand = getCommand(reloadedHarness, 'librarian-cache');
  const reloadedContext = createCommandContext();

  await reloadedSessionStart({}, reloadedContext.ctx);
  await reloadedCommand.handler('status', reloadedContext.ctx);
  assert.match(reloadedContext.notifications.at(-1).message, /Librarian cache is off\./);
});

test('librarian-config warns when preferences cannot be saved but still updates the current process state', async (t) => {
  const { configPath } = setupLibrarianEnv(t, { extensionPathConflict: true });
  const librarianExtension = await loadFreshLibrarianExtension();
  const harness = createExtensionHarness();
  librarianExtension(harness.pi);

  const sessionStart = getHandler(harness, 'session_start');
  const command = getCommand(harness, 'librarian-config');
  const { ctx, notifications } = createCommandContext();

  await sessionStart({}, ctx);
  await command.handler('thinking high', ctx);

  assert.equal(notifications.at(-1).level, 'warning');
  assert.match(notifications.at(-1).message, /Preference changed for this process, but could not save/);
  assert.match(notifications.at(-1).message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await command.handler('status', ctx);
  assert.match(notifications.at(-1).message, /thinkingLevel=high\./);
});

test('librarian tool_result marks error results without flagging successful or unrelated tool events', async () => {
  const librarianExtension = await loadFreshLibrarianExtension();
  const harness = createExtensionHarness();
  librarianExtension(harness.pi);

  const toolResult = getHandler(harness, 'tool_result');

  assert.deepEqual(await toolResult({ toolName: 'librarian', details: { status: 'error' } }, {}), { isError: true });
  assert.equal(await toolResult({ toolName: 'librarian', details: { status: 'done' } }, {}), undefined);
  assert.equal(await toolResult({ toolName: 'bash', details: { status: 'error' } }, {}), undefined);
});
