import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createExtensionHarness } from './extension-test-helpers.mjs';
import { loadRoleTestUtils } from './support/provider-policy-contract-support.mjs';

function createUsage({ input, output, cacheRead, cacheWrite, cacheWrite1h, reasoning, totalTokens, cost }) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    ...(cacheWrite1h !== undefined ? { cacheWrite1h } : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
    totalTokens,
    cost,
  };
}

function messageEndEvent({ text, stopReason = 'stop', errorMessage, usage }) {
  return {
    type: 'message_end',
    message: {
      role: 'assistant',
      content: text ? [{ type: 'text', text }] : [],
      stopReason,
      ...(errorMessage ? { errorMessage } : {}),
      ...(usage ? { usage } : {}),
    },
  };
}

function compactionEndEvent({ usage }) {
  return {
    type: 'compaction_end',
    result: usage ? { usage } : {},
  };
}

function createSpawnQueue(scripts) {
  const calls = [];
  const spawnImpl = () => {
    const script = scripts.shift();
    if (!script) throw new Error('unexpected spawn call');
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.exitCode = null;
    proc.signalCode = null;
    proc.killSignals = [];
    proc.kill = (signal) => {
      proc.killSignals.push(signal);
      script.onKill?.(signal, proc);
      return true;
    };
    calls.push(proc);
    process.nextTick(() => script.start(proc));
    return proc;
  };
  return { spawnImpl, calls };
}

function endProcess(proc, { code = 0, signalCode = null, closeCode = code } = {}) {
  proc.exitCode = code;
  proc.signalCode = signalCode;
  proc.emit('exit', code, signalCode);
  proc.emit('close', closeCode, signalCode);
}

function emitJsonLines(proc, events, code = 0) {
  const payload = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  proc.stdout.emit('data', Buffer.from(payload));
  endProcess(proc, { code });
}

function createToolContext(model) {
  return {
    cwd: '/repo',
    hasUI: false,
    model,
    modelRegistry: {
      async getAvailable() {
        return [model];
      },
    },
  };
}

function withFakeTimers(t, run) {
  const timers = [];
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => {
    const handle = { fn, ms, cleared: false };
    timers.push(handle);
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    if (handle) handle.cleared = true;
  };
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });
  return run(timers);
}

test('oracle aggregates usage across fallback attempts, exposes parent tool usage, and marks terminal errors', async () => {
  const { createOracleExtension } = await loadRoleTestUtils('oracle');
  const firstUsage = createUsage({
    input: 10,
    output: 3,
    cacheRead: 2,
    cacheWrite: 1,
    cacheWrite1h: 1,
    reasoning: 4,
    totalTokens: 16,
    cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.02, total: 0.33 },
  });
  const compactionUsage = createUsage({
    input: 4,
    output: 1,
    cacheRead: 3,
    cacheWrite: 2,
    cacheWrite1h: 5,
    reasoning: 8,
    totalTokens: 13,
    cost: { input: 0.05, output: 0.06, cacheRead: 0.07, cacheWrite: 0.08, total: 0.26 },
  });
  const secondUsage = createUsage({
    input: 20,
    output: 5,
    cacheRead: 4,
    cacheWrite: 3,
    cacheWrite1h: 2,
    reasoning: 6,
    totalTokens: 32,
    cost: { input: 0.3, output: 0.4, cacheRead: 0.03, cacheWrite: 0.04, total: 0.77 },
  });
  const { spawnImpl } = createSpawnQueue([
    {
      start(proc) {
        emitJsonLines(proc, [messageEndEvent({ stopReason: 'error', errorMessage: '404 model not found', usage: firstUsage })]);
      },
    },
    {
      start(proc) {
        emitJsonLines(proc, [compactionEndEvent({ usage: compactionUsage }), messageEndEvent({ text: 'oracle success', usage: secondUsage })]);
      },
    },
  ]);

  const harness = createExtensionHarness();
  createOracleExtension(harness.pi, { spawnImpl });
  const tool = harness.tools.get('oracle');
  const toolResult = harness.handlers.get('tool_result');

  assert.ok(tool.promptGuidelines.every((guideline) => /oracle/i.test(guideline)), 'every oracle guideline names oracle');
  assert.match(tool.promptGuidelines.join(' '), /read, grep, find, and ls/i);
  assert.match(tool.promptGuidelines.join(' '), /bash inspection tool/i);

  const result = await tool.execute('oracle-call', { task: 'Audit this', model: 'openai/ghost' }, undefined, undefined, createToolContext({ provider: 'anthropic', id: 'claude-sonnet-5', reasoning: true }));

  assert.equal(result.content[0].text, 'oracle success');
  assert.deepEqual(result.usage, {
    input: 34,
    output: 9,
    cacheRead: 9,
    cacheWrite: 6,
    cacheWrite1h: 8,
    reasoning: 18,
    totalTokens: 61,
    cost: { input: 0.44999999999999996, output: 0.66, cacheRead: 0.11, cacheWrite: 0.13999999999999999, total: 1.36 },
  });
  assert.deepEqual(result.details.usage, {
    input: 34,
    output: 9,
    cacheRead: 9,
    cacheWrite: 6,
    cacheWrite1h: 8,
    reasoning: 18,
    totalTokens: 61,
    cost: 1.36,
    costInput: 0.44999999999999996,
    costOutput: 0.66,
    costCacheRead: 0.11,
    costCacheWrite: 0.13999999999999999,
    turns: 2,
    contextTokens: 32,
  });
  assert.deepEqual(await toolResult({ toolName: 'oracle', details: { exitCode: 1 } }), { isError: true });
  assert.equal(await toolResult({ toolName: 'oracle', details: { exitCode: 0 } }), undefined);
});

test('contrarian aggregates usage across fallback attempts, exposes parent tool usage, and marks terminal errors', async () => {
  const { createContrarianExtension } = await loadRoleTestUtils('contrarian');
  const firstUsage = createUsage({
    input: 7,
    output: 2,
    cacheRead: 1,
    cacheWrite: 0,
    totalTokens: 10,
    cost: { input: 0.07, output: 0.08, cacheRead: 0.009, cacheWrite: 0, total: 0.159 },
  });
  const compactionUsage = createUsage({
    input: 2,
    output: 1,
    cacheRead: 3,
    cacheWrite: 4,
    cacheWrite1h: 0,
    totalTokens: 6,
    cost: { input: 0.02, output: 0.03, cacheRead: 0.04, cacheWrite: 0.05, total: 0.14 },
  });
  const secondUsage = createUsage({
    input: 11,
    output: 4,
    cacheRead: 2,
    cacheWrite: 1,
    cacheWrite1h: 0,
    totalTokens: 18,
    cost: { input: 0.11, output: 0.12, cacheRead: 0.01, cacheWrite: 0.02, total: 0.26 },
  });
  const { spawnImpl } = createSpawnQueue([
    {
      start(proc) {
        emitJsonLines(proc, [messageEndEvent({ stopReason: 'error', errorMessage: '404 model not found', usage: firstUsage })]);
      },
    },
    {
      start(proc) {
        emitJsonLines(proc, [compactionEndEvent({ usage: compactionUsage }), messageEndEvent({ text: 'contrarian success', usage: secondUsage })]);
      },
    },
  ]);

  const harness = createExtensionHarness();
  createContrarianExtension(harness.pi, { spawnImpl });
  const tool = harness.tools.get('contrarian');
  const toolResult = harness.handlers.get('tool_result');

  assert.ok(tool.promptGuidelines.every((guideline) => /contrarian/i.test(guideline)), 'every contrarian guideline names contrarian');
  assert.match(tool.promptGuidelines.join(' '), /read, grep, find, and ls/i);
  assert.match(tool.promptGuidelines.join(' '), /bash inspection tool/i);

  const result = await tool.execute('contrarian-call', { task: 'Challenge this', model: 'openai/ghost' }, undefined, undefined, createToolContext({ provider: 'anthropic', id: 'claude-sonnet-5', reasoning: true }));

  assert.equal(result.content[0].text, 'contrarian success');
  assert.deepEqual(result.usage, {
    input: 20,
    output: 7,
    cacheRead: 6,
    cacheWrite: 5,
    cacheWrite1h: 0,
    totalTokens: 34,
    cost: { input: 0.2, output: 0.22999999999999998, cacheRead: 0.059000000000000004, cacheWrite: 0.07, total: 0.559 },
  });
  assert.deepEqual(result.details.usage, {
    input: 20,
    output: 7,
    cacheRead: 6,
    cacheWrite: 5,
    cacheWrite1h: 0,
    totalTokens: 34,
    cost: 0.559,
    costInput: 0.2,
    costOutput: 0.22999999999999998,
    costCacheRead: 0.059000000000000004,
    costCacheWrite: 0.07,
    turns: 2,
    contextTokens: 18,
  });
  assert.equal(Object.hasOwn(result.usage, 'reasoning'), false, 'unreported parent reasoning stays undefined');
  assert.equal(Object.hasOwn(result.details.usage, 'reasoning'), false, 'unreported detail reasoning stays undefined');
  assert.equal(result.usage.cacheWrite1h, 0, 'an explicitly reported parent cacheWrite1h zero is retained');
  assert.equal(result.details.usage.cacheWrite1h, 0, 'an explicitly reported detail cacheWrite1h zero is retained');
  assert.deepEqual(await toolResult({ toolName: 'contrarian', details: { exitCode: 1 } }), { isError: true });
  assert.equal(await toolResult({ toolName: 'contrarian', details: { exitCode: 0 } }), undefined);
});

test('oracle cancellation only escalates to SIGKILL when the child stays alive past the grace period', async (t) => {
  const { runOracle } = await loadRoleTestUtils('oracle');
  const selection = {
    modelRef: 'anthropic/claude-sonnet-5',
    provider: 'anthropic',
    modelId: 'claude-sonnet-5',
    thinkingLevel: 'xhigh',
    autoSelected: true,
    selectionReason: 'test',
  };

  await withFakeTimers(t, async (timers) => {
    const graceful = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === 'SIGTERM') process.nextTick(() => endProcess(proc, { code: 143, signalCode: 'SIGTERM' }));
        },
      },
    ]);
    const gracefulController = new AbortController();
    gracefulController.abort();
    const gracefulResult = await runOracle(selection, { task: 'cancel' }, gracefulController.signal, undefined, '/repo', graceful.spawnImpl);
    assert.equal(gracefulResult.ok, false);
    assert.deepEqual(graceful.calls[0].killSignals, ['SIGTERM']);
    assert.equal(timers[0].cleared, true);

    const exitBeforeClose = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === 'SIGTERM') {
            proc.exitCode = 143;
            proc.signalCode = 'SIGTERM';
            process.nextTick(() => proc.emit('exit', 143, 'SIGTERM'));
            process.nextTick(() => process.nextTick(() => proc.emit('close', 143, 'SIGTERM')));
          }
        },
      },
    ]);
    const exitBeforeCloseController = new AbortController();
    exitBeforeCloseController.abort();
    const exitBeforeClosePromise = runOracle(selection, { task: 'cancel' }, exitBeforeCloseController.signal, undefined, '/repo', exitBeforeClose.spawnImpl);
    await Promise.resolve();
    const exitBeforeCloseResult = await exitBeforeClosePromise;
    assert.equal(exitBeforeCloseResult.ok, false);
    assert.deepEqual(exitBeforeClose.calls[0].killSignals, ['SIGTERM']);
    assert.equal(timers.length, 1);

    const forced = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === 'SIGKILL') process.nextTick(() => endProcess(proc, { code: 137, signalCode: 'SIGKILL' }));
        },
      },
    ]);
    const forcedController = new AbortController();
    forcedController.abort();
    const forcedPromise = runOracle(selection, { task: 'cancel' }, forcedController.signal, undefined, '/repo', forced.spawnImpl);
    await Promise.resolve();
    timers[1].fn();
    const forcedResult = await forcedPromise;
    assert.equal(forcedResult.ok, false);
    assert.deepEqual(forced.calls[0].killSignals, ['SIGTERM', 'SIGKILL']);
    assert.equal(timers[1].cleared, true);
  });
});

test('contrarian cancellation only escalates to SIGKILL when the child stays alive past the grace period', async (t) => {
  const { runContrarian } = await loadRoleTestUtils('contrarian');
  const selection = {
    modelRef: 'anthropic/claude-sonnet-5',
    provider: 'anthropic',
    modelId: 'claude-sonnet-5',
    thinkingLevel: 'high',
    autoSelected: true,
    selectionReason: 'test',
  };

  await withFakeTimers(t, async (timers) => {
    const graceful = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === 'SIGTERM') process.nextTick(() => endProcess(proc, { code: 143, signalCode: 'SIGTERM' }));
        },
      },
    ]);
    const gracefulController = new AbortController();
    gracefulController.abort();
    const gracefulResult = await runContrarian(selection, { task: 'cancel' }, gracefulController.signal, undefined, '/repo', graceful.spawnImpl);
    assert.equal(gracefulResult.ok, false);
    assert.deepEqual(graceful.calls[0].killSignals, ['SIGTERM']);
    assert.equal(timers[0].cleared, true);

    const exitBeforeClose = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === 'SIGTERM') {
            proc.exitCode = 143;
            proc.signalCode = 'SIGTERM';
            process.nextTick(() => proc.emit('exit', 143, 'SIGTERM'));
            process.nextTick(() => process.nextTick(() => proc.emit('close', 143, 'SIGTERM')));
          }
        },
      },
    ]);
    const exitBeforeCloseController = new AbortController();
    exitBeforeCloseController.abort();
    const exitBeforeClosePromise = runContrarian(selection, { task: 'cancel' }, exitBeforeCloseController.signal, undefined, '/repo', exitBeforeClose.spawnImpl);
    await Promise.resolve();
    const exitBeforeCloseResult = await exitBeforeClosePromise;
    assert.equal(exitBeforeCloseResult.ok, false);
    assert.deepEqual(exitBeforeClose.calls[0].killSignals, ['SIGTERM']);
    assert.equal(timers.length, 1);

    const forced = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === 'SIGKILL') process.nextTick(() => endProcess(proc, { code: 137, signalCode: 'SIGKILL' }));
        },
      },
    ]);
    const forcedController = new AbortController();
    forcedController.abort();
    const forcedPromise = runContrarian(selection, { task: 'cancel' }, forcedController.signal, undefined, '/repo', forced.spawnImpl);
    await Promise.resolve();
    timers[1].fn();
    const forcedResult = await forcedPromise;
    assert.equal(forcedResult.ok, false);
    assert.deepEqual(forced.calls[0].killSignals, ['SIGTERM', 'SIGKILL']);
    assert.equal(timers[1].cleared, true);
  });
});
