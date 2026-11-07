import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";

import { createExtensionHarness } from "./extension-test-helpers.mjs";
import { loadRoleTestUtils } from "./support/provider-policy-contract-support.mjs";

function createUsage({
  input,
  output,
  cacheRead,
  cacheWrite,
  cacheWrite1h,
  reasoning,
  totalTokens,
  cost,
}) {
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

function messageEndEvent({ text, stopReason = "stop", errorMessage, usage }) {
  return {
    type: "message_end",
    message: {
      role: "assistant",
      content: text ? [{ type: "text", text }] : [],
      stopReason,
      ...(errorMessage ? { errorMessage } : {}),
      ...(usage ? { usage } : {}),
    },
  };
}

function compactionEndEvent({ usage }) {
  return {
    type: "compaction_end",
    result: usage ? { usage } : {},
  };
}

function createSpawnQueue(scripts) {
  const calls = [];
  const invocations = [];
  const spawnImpl = (command, args, options) => {
    invocations.push({ command, args, options });
    const script = scripts.shift();
    if (!script) throw new Error("unexpected spawn call");
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
  return { spawnImpl, calls, invocations };
}

function endProcess(proc, { code = 0, signalCode = null, closeCode = code } = {}) {
  proc.exitCode = code;
  proc.signalCode = signalCode;
  proc.emit("exit", code, signalCode);
  proc.emit("close", closeCode, signalCode);
}

function emitJsonLines(proc, events, code = 0) {
  const payload = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
  proc.stdout.emit("data", Buffer.from(payload));
  endProcess(proc, { code });
}

function createToolContext(model) {
  return {
    cwd: "/repo",
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

test("oracle aggregates usage across fallback attempts, exposes parent tool usage, and marks terminal errors", async () => {
  const { createOracleExtension } = await loadRoleTestUtils("oracle");
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
        emitJsonLines(proc, [
          messageEndEvent({
            stopReason: "error",
            errorMessage: "404 model not found",
            usage: firstUsage,
          }),
        ]);
      },
    },
    {
      start(proc) {
        emitJsonLines(proc, [
          compactionEndEvent({ usage: compactionUsage }),
          messageEndEvent({ text: "oracle success", usage: secondUsage }),
        ]);
      },
    },
  ]);

  const harness = createExtensionHarness();
  createOracleExtension(harness.pi, { spawnImpl });
  const tool = harness.tools.get("oracle");
  const toolResult = harness.handlers.get("tool_result");

  assert.ok(
    tool.promptGuidelines.every((guideline) => /oracle/i.test(guideline)),
    "every oracle guideline names oracle",
  );
  assert.match(tool.promptGuidelines.join(" "), /read, grep, find, and ls/i);
  assert.match(tool.promptGuidelines.join(" "), /bash inspection tool/i);

  const result = await tool.execute(
    "oracle-call",
    { task: "Audit this", model: "openai/ghost" },
    undefined,
    undefined,
    createToolContext({ provider: "anthropic", id: "claude-sonnet-5", reasoning: true }),
  );

  assert.equal(result.content[0].text, "oracle success");
  assert.deepEqual(result.usage, {
    input: 34,
    output: 9,
    cacheRead: 9,
    cacheWrite: 6,
    cacheWrite1h: 8,
    reasoning: 18,
    totalTokens: 61,
    cost: {
      input: 0.44999999999999996,
      output: 0.66,
      cacheRead: 0.11,
      cacheWrite: 0.13999999999999999,
      total: 1.36,
    },
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
    costFromProvider: false,
    turns: 2,
    contextTokens: 32,
  });
  assert.deepEqual(await toolResult({ toolName: "oracle", details: { exitCode: 1 } }), {
    isError: true,
  });
  assert.equal(await toolResult({ toolName: "oracle", details: { exitCode: 0 } }), undefined);
});

test("contrarian aggregates usage across fallback attempts, exposes parent tool usage, and marks terminal errors", async () => {
  const { createContrarianExtension } = await loadRoleTestUtils("contrarian");
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
        emitJsonLines(proc, [
          messageEndEvent({
            stopReason: "error",
            errorMessage: "404 model not found",
            usage: firstUsage,
          }),
        ]);
      },
    },
    {
      start(proc) {
        emitJsonLines(proc, [
          compactionEndEvent({ usage: compactionUsage }),
          messageEndEvent({ text: "contrarian success", usage: secondUsage }),
        ]);
      },
    },
  ]);

  const harness = createExtensionHarness();
  createContrarianExtension(harness.pi, { spawnImpl });
  const tool = harness.tools.get("contrarian");
  const toolResult = harness.handlers.get("tool_result");

  assert.ok(
    tool.promptGuidelines.every((guideline) => /contrarian/i.test(guideline)),
    "every contrarian guideline names contrarian",
  );
  assert.match(tool.promptGuidelines.join(" "), /read, grep, find, and ls/i);
  assert.match(tool.promptGuidelines.join(" "), /bash inspection tool/i);

  const result = await tool.execute(
    "contrarian-call",
    { task: "Challenge this", model: "openai/ghost" },
    undefined,
    undefined,
    createToolContext({ provider: "anthropic", id: "claude-sonnet-5", reasoning: true }),
  );

  assert.equal(result.content[0].text, "contrarian success");
  assert.deepEqual(result.usage, {
    input: 20,
    output: 7,
    cacheRead: 6,
    cacheWrite: 5,
    cacheWrite1h: 0,
    totalTokens: 34,
    cost: {
      input: 0.2,
      output: 0.22999999999999998,
      cacheRead: 0.059000000000000004,
      cacheWrite: 0.07,
      total: 0.559,
    },
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
    costFromProvider: false,
    turns: 2,
    contextTokens: 18,
  });
  assert.equal(
    Object.hasOwn(result.usage, "reasoning"),
    false,
    "unreported parent reasoning stays undefined",
  );
  assert.equal(
    Object.hasOwn(result.details.usage, "reasoning"),
    false,
    "unreported detail reasoning stays undefined",
  );
  assert.equal(
    result.usage.cacheWrite1h,
    0,
    "an explicitly reported parent cacheWrite1h zero is retained",
  );
  assert.equal(
    result.details.usage.cacheWrite1h,
    0,
    "an explicitly reported detail cacheWrite1h zero is retained",
  );
  assert.deepEqual(await toolResult({ toolName: "contrarian", details: { exitCode: 1 } }), {
    isError: true,
  });
  assert.equal(await toolResult({ toolName: "contrarian", details: { exitCode: 0 } }), undefined);
});

test("oracle and contrarian preserve discovered resources and keep explicit tool allowlists", async () => {
  const selection = {
    modelRef: "anthropic/claude-sonnet-5",
    provider: "anthropic",
    modelId: "claude-sonnet-5",
    thinkingLevel: "high",
    autoSelected: true,
    selectionReason: "test",
  };
  const suppressedResourceFlags = [
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
  ];

  const oracle = await loadRoleTestUtils("oracle");
  const oracleSpawn = createSpawnQueue([
    {
      start(proc) {
        emitJsonLines(proc, [messageEndEvent({ text: "oracle" })]);
      },
    },
  ]);
  const oracleResult = await oracle.runOracle(
    selection,
    { task: "inspect" },
    undefined,
    undefined,
    "/repo",
    oracleSpawn.spawnImpl,
  );
  assert.equal(oracleResult.ok, true);
  const oracleArgs = oracleSpawn.invocations[0].args;
  assert.ok(oracleArgs.includes("--no-session"));
  assert.ok(
    suppressedResourceFlags.every((flag) => !oracleArgs.includes(flag)),
    "oracle must not suppress discovered resources",
  );
  assert.deepEqual(
    oracleArgs.slice(
      oracleArgs.indexOf("--tools") + 1,
      oracleArgs.indexOf("--append-system-prompt"),
    ),
    [
      "read,grep,find,ls,mcp__*,tool_search,list_mcp_resources,list_mcp_resource_templates,read_mcp_resource",
    ],
  );

  const contrarian = await loadRoleTestUtils("contrarian");
  const contrarianSpawn = createSpawnQueue([
    {
      start(proc) {
        emitJsonLines(proc, [messageEndEvent({ text: "contrarian" })]);
      },
    },
  ]);
  const contrarianResult = await contrarian.runContrarian(
    selection,
    { task: "inspect", includeBash: true },
    undefined,
    undefined,
    "/repo",
    contrarianSpawn.spawnImpl,
  );
  assert.equal(contrarianResult.ok, true);
  const contrarianArgs = contrarianSpawn.invocations[0].args;
  assert.ok(contrarianArgs.includes("--no-session"));
  assert.ok(
    suppressedResourceFlags.every((flag) => !contrarianArgs.includes(flag)),
    "contrarian must not suppress discovered resources",
  );
  assert.deepEqual(
    contrarianArgs.slice(
      contrarianArgs.indexOf("--tools") + 1,
      contrarianArgs.indexOf("--append-system-prompt"),
    ),
    [
      "read,grep,find,ls,bash,mcp__*,tool_search,list_mcp_resources,list_mcp_resource_templates,read_mcp_resource",
    ],
  );
});

test("oracle and contrarian assemble the final assistant turn without leaking thinking or stale tool-only text", async () => {
  const selection = {
    modelRef: "anthropic/claude-sonnet-5",
    provider: "anthropic",
    modelId: "claude-sonnet-5",
    thinkingLevel: "high",
    autoSelected: true,
    selectionReason: "test",
  };
  const events = [
    { type: "message_start", message: { role: "assistant", content: [] } },
    {
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "private reasoning" },
    },
    {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "intermediate " },
    },
    { type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 0 } },
    {
      type: "message_update",
      assistantMessageEvent: { type: "toolcall_delta", contentIndex: 0, delta: '{"path":"."}' },
    },
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", name: "read" }],
        stopReason: "toolUse",
      },
    },
    { type: "message_start", message: { role: "assistant", content: [] } },
    {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "public final" },
    },
    { type: "message_end", message: { role: "assistant", content: [], stopReason: "stop" } },
  ];
  const oracle = await loadRoleTestUtils("oracle");
  const oracleUpdates = [];
  const oracleSpawn = createSpawnQueue([
    {
      start(proc) {
        emitJsonLines(proc, events);
      },
    },
  ]);
  const oracleResult = await oracle.runOracle(
    selection,
    { task: "inspect" },
    undefined,
    (update) => oracleUpdates.push(update),
    "/repo",
    oracleSpawn.spawnImpl,
  );
  assert.equal(oracleResult.ok, true);
  assert.equal(oracleResult.output, "public final");
  assert.equal(
    oracleUpdates.some((update) => update.content[0].text.includes("private reasoning")),
    false,
  );

  const contrarian = await loadRoleTestUtils("contrarian");
  const contrarianSpawn = createSpawnQueue([
    {
      start(proc) {
        emitJsonLines(proc, events);
      },
    },
  ]);
  const contrarianResult = await contrarian.runContrarian(
    selection,
    { task: "inspect" },
    undefined,
    undefined,
    "/repo",
    contrarianSpawn.spawnImpl,
  );
  assert.equal(contrarianResult.ok, true);
  assert.equal(contrarianResult.output, "public final");

  const missingFinalEvents = [
    { type: "message_start", message: { role: "assistant", content: [] } },
    {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "stale answer" },
    },
    { type: "message_end", message: { role: "assistant", content: [], stopReason: "stop" } },
    { type: "message_start", message: { role: "assistant", content: [] } },
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", name: "read" }],
        stopReason: "toolUse",
      },
    },
  ];
  const missingSpawn = createSpawnQueue([
    {
      start(proc) {
        emitJsonLines(proc, missingFinalEvents);
      },
    },
  ]);
  const missingResult = await oracle.runOracle(
    selection,
    { task: "inspect" },
    undefined,
    undefined,
    "/repo",
    missingSpawn.spawnImpl,
  );
  assert.equal(missingResult.ok, false);
  assert.match(missingResult.error, /without returning any text/);
});

test("oracle cancellation only escalates to SIGKILL when the child stays alive past the grace period", async (t) => {
  const { runOracle } = await loadRoleTestUtils("oracle");
  const selection = {
    modelRef: "anthropic/claude-sonnet-5",
    provider: "anthropic",
    modelId: "claude-sonnet-5",
    thinkingLevel: "xhigh",
    autoSelected: true,
    selectionReason: "test",
  };

  await withFakeTimers(t, async (timers) => {
    const graceful = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === "SIGTERM")
            process.nextTick(() => endProcess(proc, { code: 143, signalCode: "SIGTERM" }));
        },
      },
    ]);
    const gracefulController = new AbortController();
    gracefulController.abort();
    const gracefulResult = await runOracle(
      selection,
      { task: "cancel" },
      gracefulController.signal,
      undefined,
      "/repo",
      graceful.spawnImpl,
    );
    assert.equal(gracefulResult.ok, false);
    assert.deepEqual(graceful.calls[0].killSignals, ["SIGTERM"]);
    assert.equal(timers[0].cleared, true);

    const exitBeforeClose = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === "SIGTERM") {
            proc.exitCode = 143;
            proc.signalCode = "SIGTERM";
            process.nextTick(() => proc.emit("exit", 143, "SIGTERM"));
            process.nextTick(() => process.nextTick(() => proc.emit("close", 143, "SIGTERM")));
          }
        },
      },
    ]);
    const exitBeforeCloseController = new AbortController();
    exitBeforeCloseController.abort();
    const exitBeforeClosePromise = runOracle(
      selection,
      { task: "cancel" },
      exitBeforeCloseController.signal,
      undefined,
      "/repo",
      exitBeforeClose.spawnImpl,
    );
    await Promise.resolve();
    const exitBeforeCloseResult = await exitBeforeClosePromise;
    assert.equal(exitBeforeCloseResult.ok, false);
    assert.deepEqual(exitBeforeClose.calls[0].killSignals, ["SIGTERM"]);
    assert.equal(timers.length, 1);

    const forced = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === "SIGKILL")
            process.nextTick(() => endProcess(proc, { code: 137, signalCode: "SIGKILL" }));
        },
      },
    ]);
    const forcedController = new AbortController();
    forcedController.abort();
    const forcedPromise = runOracle(
      selection,
      { task: "cancel" },
      forcedController.signal,
      undefined,
      "/repo",
      forced.spawnImpl,
    );
    await Promise.resolve();
    timers[1].fn();
    const forcedResult = await forcedPromise;
    assert.equal(forcedResult.ok, false);
    assert.deepEqual(forced.calls[0].killSignals, ["SIGTERM", "SIGKILL"]);
    assert.equal(timers[1].cleared, true);
  });
});

test("contrarian cancellation only escalates to SIGKILL when the child stays alive past the grace period", async (t) => {
  const { runContrarian } = await loadRoleTestUtils("contrarian");
  const selection = {
    modelRef: "anthropic/claude-sonnet-5",
    provider: "anthropic",
    modelId: "claude-sonnet-5",
    thinkingLevel: "high",
    autoSelected: true,
    selectionReason: "test",
  };

  await withFakeTimers(t, async (timers) => {
    const graceful = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === "SIGTERM")
            process.nextTick(() => endProcess(proc, { code: 143, signalCode: "SIGTERM" }));
        },
      },
    ]);
    const gracefulController = new AbortController();
    gracefulController.abort();
    const gracefulResult = await runContrarian(
      selection,
      { task: "cancel" },
      gracefulController.signal,
      undefined,
      "/repo",
      graceful.spawnImpl,
    );
    assert.equal(gracefulResult.ok, false);
    assert.deepEqual(graceful.calls[0].killSignals, ["SIGTERM"]);
    assert.equal(timers[0].cleared, true);

    const exitBeforeClose = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === "SIGTERM") {
            proc.exitCode = 143;
            proc.signalCode = "SIGTERM";
            process.nextTick(() => proc.emit("exit", 143, "SIGTERM"));
            process.nextTick(() => process.nextTick(() => proc.emit("close", 143, "SIGTERM")));
          }
        },
      },
    ]);
    const exitBeforeCloseController = new AbortController();
    exitBeforeCloseController.abort();
    const exitBeforeClosePromise = runContrarian(
      selection,
      { task: "cancel" },
      exitBeforeCloseController.signal,
      undefined,
      "/repo",
      exitBeforeClose.spawnImpl,
    );
    await Promise.resolve();
    const exitBeforeCloseResult = await exitBeforeClosePromise;
    assert.equal(exitBeforeCloseResult.ok, false);
    assert.deepEqual(exitBeforeClose.calls[0].killSignals, ["SIGTERM"]);
    assert.equal(timers.length, 1);

    const forced = createSpawnQueue([
      {
        start() {},
        onKill(signal, proc) {
          if (signal === "SIGKILL")
            process.nextTick(() => endProcess(proc, { code: 137, signalCode: "SIGKILL" }));
        },
      },
    ]);
    const forcedController = new AbortController();
    forcedController.abort();
    const forcedPromise = runContrarian(
      selection,
      { task: "cancel" },
      forcedController.signal,
      undefined,
      "/repo",
      forced.spawnImpl,
    );
    await Promise.resolve();
    timers[1].fn();
    const forcedResult = await forcedPromise;
    assert.equal(forcedResult.ok, false);
    assert.deepEqual(forced.calls[0].killSignals, ["SIGTERM", "SIGKILL"]);
    assert.equal(timers[1].cleared, true);
  });
});

test("oracle and contrarian decode stdout correctly when multibyte UTF-8 is split across chunks", async () => {
  const expected = "caf\u00e9 \u6771\u4eac \ud83d\udd2e";
  const selection = {
    modelRef: "fixture/test",
    provider: "fixture",
    modelId: "test",
    thinkingLevel: "off",
    autoSelected: false,
    selectionReason: "diagnostic",
  };

  function makeMessageEnd(text) {
    return {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text }],
        stopReason: "stop",
      },
    };
  }

  const payload = Buffer.from(JSON.stringify(makeMessageEnd(expected)) + "\n");

  // Locate multibyte sequences in the serialised payload.
  // \u00e9 = 0xC3 0xA9  (2 bytes)
  // \u6771 = 0xE6 0x9D 0xB1  (3 bytes)
  // \ud83d\udd2e = 0xF0 0x9F 0x94 0xAE  (4 bytes)
  const ePos = payload.indexOf(Buffer.from([0xc3, 0xa9]));
  const higashiPos = payload.indexOf(Buffer.from([0xe6, 0x9d, 0xb1]));
  const crystalBallPos = payload.indexOf(Buffer.from([0xf0, 0x9f, 0x94, 0xae]));

  assert.ok(ePos >= 0, "\u00e9 bytes found in payload");
  assert.ok(higashiPos >= 0, "\u6771 bytes found in payload");
  assert.ok(crystalBallPos >= 0, "\ud83d\udd2e bytes found in payload");

  const splits = [
    { label: "2-byte char", at: ePos + 1 },
    { label: "3-byte char", at: higashiPos + 1 },
    { label: "4-byte char", at: crystalBallPos + 1 },
  ];

  for (const { label, at } of splits) {
    for (const role of ["oracle", "contrarian"]) {
      const utils = await loadRoleTestUtils(role);
      const runner = role === "oracle" ? utils.runOracle : utils.runContrarian;

      const { spawnImpl } = createSpawnQueue([
        {
          start(proc) {
            proc.stdout.emit("data", payload.subarray(0, at));
            proc.stdout.emit("data", payload.subarray(at));
            endProcess(proc, { code: 0 });
          },
        },
      ]);

      const result = await runner(
        selection,
        { task: "test" },
        undefined,
        undefined,
        "/repo",
        spawnImpl,
      );
      assert.equal(result.ok, true, `${role} split within ${label}: ok`);
      assert.equal(result.output, expected, `${role} split within ${label}: text preserved`);
    }
  }

  // Multiple messages: the second message_end should win and its multibyte text must survive the split.
  const event1 = {
    type: "message_start",
    message: { role: "assistant", content: [] },
  };
  const event2 = makeMessageEnd("first \u00fcber message");
  const event3 = {
    type: "message_start",
    message: { role: "assistant", content: [] },
  };
  const event4 = makeMessageEnd(expected);
  const multiPayload = Buffer.from(
    [event1, event2, event3, event4].map((e) => JSON.stringify(e)).join("\n") + "\n",
  );
  const multiCrystalBallPos = multiPayload.indexOf(Buffer.from([0xf0, 0x9f, 0x94, 0xae]));
  assert.ok(multiCrystalBallPos >= 0, "\ud83d\udd2e bytes found in multi-message payload");

  for (const role of ["oracle", "contrarian"]) {
    const utils = await loadRoleTestUtils(role);
    const runner = role === "oracle" ? utils.runOracle : utils.runContrarian;

    const { spawnImpl } = createSpawnQueue([
      {
        start(proc) {
          const splitAt = multiCrystalBallPos + 1;
          proc.stdout.emit("data", multiPayload.subarray(0, splitAt));
          proc.stdout.emit("data", multiPayload.subarray(splitAt));
          endProcess(proc, { code: 0 });
        },
      },
    ]);

    const result = await runner(
      selection,
      { task: "test" },
      undefined,
      undefined,
      "/repo",
      spawnImpl,
    );
    assert.equal(result.ok, true, `${role} multiple messages: ok`);
    assert.equal(result.output, expected, `${role} multiple messages: last message text preserved`);
  }
});

test("oracle and contrarian process unterminated final JSONL line when multibyte UTF-8 is split across chunks", async () => {
  const expected = "caf\u00e9 \u6771\u4eac \ud83d\udd2e";
  const selection = {
    modelRef: "fixture/test",
    provider: "fixture",
    modelId: "test",
    thinkingLevel: "off",
    autoSelected: false,
    selectionReason: "diagnostic",
  };

  // No trailing newline; the close handler must flush the remaining buffer.
  const payload = Buffer.from(
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: expected }],
        stopReason: "stop",
      },
    }),
  );

  // Split 2 bytes into the 4-byte emoji sequence.
  const crystalBallPos = payload.indexOf(Buffer.from([0xf0, 0x9f, 0x94, 0xae]));
  assert.ok(crystalBallPos >= 0, "\ud83d\udd2e bytes found in unterminated payload");
  const splitAt = crystalBallPos + 2;

  for (const role of ["oracle", "contrarian"]) {
    const utils = await loadRoleTestUtils(role);
    const runner = role === "oracle" ? utils.runOracle : utils.runContrarian;

    const { spawnImpl } = createSpawnQueue([
      {
        start(proc) {
          proc.stdout.emit("data", payload.subarray(0, splitAt));
          proc.stdout.emit("data", payload.subarray(splitAt));
          endProcess(proc, { code: 0 });
        },
      },
    ]);

    const result = await runner(
      selection,
      { task: "test" },
      undefined,
      undefined,
      "/repo",
      spawnImpl,
    );
    assert.equal(result.ok, true, `${role} unterminated final line: ok`);
    assert.equal(result.output, expected, `${role} unterminated final line: text preserved`);
  }
});

test("oracle and contrarian decode stderr correctly when multibyte UTF-8 is split across chunks", async () => {
  const expectedStderr = "error: \u00fcberfall\n";
  const selection = {
    modelRef: "fixture/test",
    provider: "fixture",
    modelId: "test",
    thinkingLevel: "off",
    autoSelected: false,
    selectionReason: "diagnostic",
  };

  const stderrPayload = Buffer.from(expectedStderr);
  // \u00fc = 0xC3 0xBC (2 bytes) -- split after first byte
  const umlautPos = stderrPayload.indexOf(Buffer.from([0xc3, 0xbc]));
  assert.ok(umlautPos >= 0, "\u00fc bytes found in stderr payload");

  // stdout needs a valid message_end so the runner succeeds.
  const stdoutPayload = Buffer.from(
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stopReason: "stop",
      },
    }) + "\n",
  );

  for (const role of ["oracle", "contrarian"]) {
    const utils = await loadRoleTestUtils(role);
    const runner = role === "oracle" ? utils.runOracle : utils.runContrarian;

    const { spawnImpl } = createSpawnQueue([
      {
        start(proc) {
          proc.stdout.emit("data", stdoutPayload);
          proc.stderr.emit("data", stderrPayload.subarray(0, umlautPos + 1));
          proc.stderr.emit("data", stderrPayload.subarray(umlautPos + 1));
          endProcess(proc, { code: 0 });
        },
      },
    ]);

    const result = await runner(
      selection,
      { task: "test" },
      undefined,
      undefined,
      "/repo",
      spawnImpl,
    );
    assert.equal(result.ok, true, `${role} stderr split: ok`);
    assert.equal(
      result.details.stderr,
      expectedStderr.trim(),
      `${role} stderr split: text preserved`,
    );
  }
});

// Spawns a real node child that writes each chunk to stdout/stderr and waits for
// an IPC ack from the parent (sent after the parent receives the previous chunk)
// before writing the next, so chunk boundaries are delivered deterministically.
function createRealChildSpawn(chunks) {
  const script = `
    const chunks = JSON.parse(process.argv[1]).map((c) => [c[0], Buffer.from(c[1], "base64")]);
    let i = 0;
    const next = () => {
      if (i >= chunks.length) { process.disconnect(); return; }
      const [stream, buf] = chunks[i++];
      process[stream].write(buf);
    };
    process.on("message", next);
    next();
  `;
  const encoded = JSON.stringify(chunks.map(([stream, buf]) => [stream, buf.toString("base64")]));
  return (_command, _args, options) => {
    const proc = spawn(process.execPath, ["-e", script, encoded], {
      ...options,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const ack = () => {
      if (proc.connected) proc.send("ack");
    };
    proc.stdout.on("data", ack);
    proc.stderr.on("data", ack);
    return proc;
  };
}

test("oracle and contrarian decode split multibyte UTF-8 from a real child process", async () => {
  const expected = "caf\u00e9 \u6771\u4eac \ud83d\udd2e";
  const selection = {
    modelRef: "fixture/test",
    provider: "fixture",
    modelId: "test",
    thinkingLevel: "off",
    autoSelected: false,
    selectionReason: "diagnostic",
  };
  const messageEnd = (text) => ({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      stopReason: "stop",
    },
  });
  const assistantStart = {
    type: "message_start",
    message: { role: "assistant", content: [] },
  };
  const lines = (events) => events.map((e) => JSON.stringify(e)).join("\n");
  const splitInside = (buf, seq, offset) => {
    const pos = buf.indexOf(Buffer.from(seq));
    assert.ok(pos >= 0, "sequence found");
    return [buf.subarray(0, pos + offset), buf.subarray(pos + offset)];
  };
  const seqs = {
    "2-byte": [[0xc3, 0xa9], 1],
    "3-byte": [[0xe6, 0x9d, 0xb1], 1],
    "3-byte (after 2)": [[0xe6, 0x9d, 0xb1], 2],
    "4-byte": [[0xf0, 0x9f, 0x94, 0xae], 1],
    "4-byte (after 3)": [[0xf0, 0x9f, 0x94, 0xae], 3],
  };

  const scenarios = [];
  for (const [label, [seq, offset]] of Object.entries(seqs)) {
    const buf = Buffer.from(lines([messageEnd(expected)]) + "\n");
    scenarios.push({
      label: `split in ${label}`,
      chunks: splitInside(buf, seq, offset),
      expected,
    });
  }
  const multi = Buffer.from(
    lines([assistantStart, messageEnd("first \u00fcber"), assistantStart, messageEnd(expected)]) +
      "\n",
  );
  scenarios.push({
    label: "multiple messages",
    chunks: splitInside(multi, [0xf0, 0x9f, 0x94, 0xae], 2),
    expected,
  });
  const unterminated = Buffer.from(lines([messageEnd(expected)]));
  scenarios.push({
    label: "unterminated final line",
    chunks: splitInside(unterminated, [0xf0, 0x9f, 0x94, 0xae], 2),
    expected,
  });

  for (const role of ["oracle", "contrarian"]) {
    const utils = await loadRoleTestUtils(role);
    const runner = role === "oracle" ? utils.runOracle : utils.runContrarian;
    for (const scenario of scenarios) {
      const spawnImpl = createRealChildSpawn(scenario.chunks.map((c) => ["stdout", c]));
      const result = await runner(
        selection,
        { task: "test" },
        undefined,
        undefined,
        process.cwd(),
        spawnImpl,
      );
      assert.equal(result.ok, true, `${role} ${scenario.label}: ok`);
      assert.equal(result.output, scenario.expected, `${role} ${scenario.label}: text`);
    }

    // stderr split inside a 2-byte character, with a valid stdout message.
    const stderrBuf = Buffer.from("error: \u00fcberfall");
    const [e1, e2] = splitInside(stderrBuf, [0xc3, 0xbc], 1);
    const okLine = Buffer.from(lines([messageEnd("ok")]) + "\n");
    const result = await runner(
      selection,
      { task: "test" },
      undefined,
      undefined,
      process.cwd(),
      createRealChildSpawn([
        ["stdout", okLine],
        ["stderr", e1],
        ["stderr", e2],
      ]),
    );
    assert.equal(result.ok, true, `${role} real stderr: ok`);
    assert.equal(result.details.stderr, "error: \u00fcberfall", `${role} real stderr: text`);
  }
});
