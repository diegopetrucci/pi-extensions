import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function loadExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath)).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.default;
}

function createPi({ execImpl } = {}) {
  const handlers = new Map();
  const execCalls = [];

  return {
    pi: {
      on(eventName, handler) {
        handlers.set(eventName, handler);
      },
      async exec(...args) {
        execCalls.push(args);
        if (!execImpl) {
          throw new Error("pi.exec should not have been called");
        }
        return execImpl(...args);
      },
    },
    handlers,
    execCalls,
  };
}

function createToolEventRecorder(events) {
  return (pi) => {
    for (const eventName of [
      "tool_call",
      "tool_result",
      "tool_execution_start",
      "tool_execution_update",
      "tool_execution_end",
    ]) {
      pi.on(eventName, async (event) => {
        events.push({
          type: event.type,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          parentToolCallId: event.parentToolCallId,
          input: event.input,
          args: event.args,
          isError: event.isError,
          content: event.content?.map((block) =>
            block.type === "text" ? block.text : `[${block.type}]`,
          ),
          structuredContent: event.structuredContent,
          resultStructuredContent: event.result?.structuredContent,
        });
      });
    }
  };
}

function createNestedChainTool() {
  return {
    name: "chain_fixture",
    label: "chain_fixture",
    description: "Test-only nested tool chain",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
      additionalProperties: false,
    },
    async execute(_toolCallId, { command }, _signal, _onUpdate, ctx) {
      const outcome = await ctx.executeTool("bash", { command });
      const text = outcome.result.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\\n");
      return {
        content: [{ type: "text", text }],
        details: { childIsError: outcome.isError },
      };
    },
  };
}

async function createPi99HostFixture({ responses, tools, customTools = [] }) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-0-99-permission-fixture-"));
  writeFileSync(path.join(cwd, "fixture.txt"), "nested-safe\\n");
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const settingsManager = SettingsManager.create(cwd, cwd);
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(cwd, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const faux = fauxProvider({
    provider: "pi-0-99-fixture",
    api: "faux",
    models: [{ id: "fixture", name: "fixture" }],
  });
  modelRuntime.registerNativeProvider(faux.provider);
  faux.setResponses(responses);
  const events = [];
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [
      createToolEventRecorder(events),
      permissionGate,
      createCodemodeExtension(),
    ],
  });
  await resourceLoader.reload();

  try {
    const { session } = await createAgentSession({
      cwd,
      agentDir: cwd,
      modelRuntime,
      model: faux.getModel(),
      resourceLoader,
      sessionManager: SessionManager.inMemory(),
      settingsManager,
      tools,
      customTools,
    });
    return {
      cwd,
      events,
      session,
      dispose() {
        session.dispose();
        rmSync(cwd, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

test("inline-bash skips extension-origin input before any shell expansion", async () => {
  const inlineBash = await loadExtension("extensions/inline-bash/index.ts");
  const { pi, handlers, execCalls } = createPi();
  inlineBash(pi);

  const inputHandler = handlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const result = await inputHandler(
    { source: "extension", text: "Check !{pwd}", images: ["image-1"] },
    { hasUI: true, ui: { notify() {} } },
  );

  assert.deepEqual(result, { action: "continue" });
  assert.equal(execCalls.length, 0);
});

test("inline-bash skips whole-line bash commands", async () => {
  const inlineBash = await loadExtension("extensions/inline-bash/index.ts");
  const { pi, handlers, execCalls } = createPi();
  inlineBash(pi);

  const inputHandler = handlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const result = await inputHandler(
    { source: "user", text: "  !echo !{pwd}", images: [] },
    { hasUI: true, ui: { notify() {} } },
  );

  assert.deepEqual(result, { action: "continue" });
  assert.equal(execCalls.length, 0);
});

test("inline-bash expands user inline commands through the extension API", async () => {
  const inlineBash = await loadExtension("extensions/inline-bash/index.ts");
  const notifications = [];
  const { pi, handlers, execCalls } = createPi({
    async execImpl(command, args, options) {
      assert.equal(command, "bash");
      assert.deepEqual(options, { timeout: 30000, signal: undefined });

      if (args[1] === "pwd") {
        return { stdout: " /tmp/project \n", stderr: "", code: 0 };
      }

      if (args[1] === "git branch --show-current") {
        return { stdout: "main\n", stderr: "", code: 0 };
      }

      throw new Error(`unexpected command: ${args[1]}`);
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const images = [{ alt: "diagram" }];
  const result = await inputHandler(
    {
      source: "user",
      text: "cwd=!{pwd}; branch=!{git branch --show-current}",
      images,
    },
    {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, {
    action: "transform",
    text: "cwd=/tmp/project; branch=main",
    images,
  });
  assert.deepEqual(execCalls, [
    ["bash", ["-c", "pwd"], { timeout: 30000, signal: undefined }],
    ["bash", ["-c", "git branch --show-current"], { timeout: 30000, signal: undefined }],
  ]);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, "info");
  assert.match(notifications[0].message, /Expanded 2 inline command\(s\):/);
  assert.match(notifications[0].message, /!\{pwd\} -> "\/tmp\/project"/);
  assert.match(notifications[0].message, /!\{git branch --show-current\} -> "main"/);
});

test("inline-bash expands inline commands without UI notifications when no UI is available", async () => {
  const inlineBash = await loadExtension("extensions/inline-bash/index.ts");
  const { pi, handlers, execCalls } = createPi({
    async execImpl(command, args, options) {
      assert.equal(command, "bash");
      assert.deepEqual(args, ["-c", "pwd"]);
      assert.deepEqual(options, { timeout: 30000, signal: undefined });
      return { stdout: "/tmp/no-ui\n", stderr: "", code: 0 };
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const result = await inputHandler(
    { source: "user", text: "cwd=!{pwd}", images: [] },
    { hasUI: false },
  );

  assert.deepEqual(result, {
    action: "transform",
    text: "cwd=/tmp/no-ui",
    images: [],
  });
  assert.deepEqual(execCalls, [["bash", ["-c", "pwd"], { timeout: 30000, signal: undefined }]]);
});

test("inline-bash renders pi.exec throw failures inline without crashing", async () => {
  const inlineBash = await loadExtension("extensions/inline-bash/index.ts");
  const notifications = [];
  const { pi, handlers } = createPi({
    async execImpl() {
      throw "shell stub crashed";
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const result = await inputHandler(
    { source: "user", text: "oops=!{pwd}", images: [] },
    {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, {
    action: "transform",
    text: "oops=[error: shell stub crashed]",
    images: [],
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, "info");
  assert.match(notifications[0].message, /!\{pwd\} \(shell stub crashed\) -> ""/);
});

test("inline-bash truncates very large command output", async () => {
  const inlineBash = await loadExtension("extensions/inline-bash/index.ts");
  const hugeOutput = `${"x".repeat(50010)}\n`;
  const { pi, handlers } = createPi({
    async execImpl() {
      return { stdout: hugeOutput, stderr: "", code: 0 };
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const result = await inputHandler(
    { source: "user", text: "blob=!{python - <<'PY'}", images: [] },
    { hasUI: false },
  );

  const expectedText = `blob=${"x".repeat(50000)}\n[inline-bash output truncated after 50000 characters]`;

  assert.equal(result.action, "transform");
  assert.deepEqual(result.images, []);
  assert.equal(result.text, expectedText);
});

test("inline-bash expands repeated inline patterns in a single prompt", async () => {
  const inlineBash = await loadExtension("extensions/inline-bash/index.ts");
  const outputs = ["/tmp/one\n", "/tmp/two\n"];
  const { pi, handlers, execCalls } = createPi({
    async execImpl(command, args) {
      assert.equal(command, "bash");
      assert.equal(args[1], "pwd");
      return { stdout: outputs.shift(), stderr: "", code: 0 };
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const result = await inputHandler(
    { source: "user", text: "first=!{pwd}; second=!{pwd}", images: [] },
    { hasUI: false },
  );

  assert.deepEqual(result, {
    action: "transform",
    text: "first=/tmp/one; second=/tmp/two",
    images: [],
  });
  assert.deepEqual(execCalls, [
    ["bash", ["-c", "pwd"], { timeout: 30000, signal: undefined }],
    ["bash", ["-c", "pwd"], { timeout: 30000, signal: undefined }],
  ]);
});

test("inline-bash surfaces command failures safely without throwing", async () => {
  const inlineBash = await loadExtension("extensions/inline-bash/index.ts");
  const notifications = [];
  const { pi, handlers } = createPi({
    async execImpl(command, args) {
      assert.equal(command, "bash");
      assert.equal(args[1], "rm -rf /tmp/example");
      return { stdout: "", stderr: "permission denied\n", code: 1 };
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const result = await inputHandler(
    { source: "user", text: "danger=!{rm -rf /tmp/example}", images: [] },
    {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, {
    action: "transform",
    text: "danger=permission denied",
    images: [],
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, "info");
  assert.match(
    notifications[0].message,
    /!\{rm -rf \/tmp\/example\} \(exit code 1\) -> "permission denied"/,
  );
});

test("permission-gate ignores non-shell tool events", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const result = await toolCallHandler(
    { toolName: "read", input: { command: "sudo rm -rf /tmp/example" } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "No";
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(prompted, false);
});

test("permission-gate keeps arbitrary MCP names outside the named-tool policy boundary", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  const result = await toolCallHandler(
    {
      toolName: "mcp__fixture__delete_everything",
      input: { command: "rm -rf /tmp/example" },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    { hasUI: false },
  );

  assert.equal(result, undefined);
});

test("permission-gate passes Pi dialog cancellation through and fails closed on UI failure", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");
  const controller = new AbortController();
  let dialogOptions;

  const cancelled = await toolCallHandler(
    { toolName: "bash", input: { command: "sudo rm -rf /tmp/example" } },
    {
      hasUI: true,
      signal: controller.signal,
      ui: {
        async select(_prompt, _choices, options) {
          dialogOptions = options;
          controller.abort();
          return "Yes";
        },
      },
    },
  );

  assert.equal(dialogOptions.signal, controller.signal);
  assert.deepEqual(cancelled, { block: true, reason: "Confirmation cancelled" });

  const rejected = await toolCallHandler(
    { toolName: "write", input: { path: ".env", content: "SECRET=1" } },
    {
      hasUI: true,
      ui: {
        async select() {
          throw new Error("fixture dialog closed");
        },
      },
    },
  );

  assert.deepEqual(rejected, { block: true, reason: "Confirmation unavailable" });
});

test("permission-gate keeps concurrent confirmation decisions correlated to their own calls", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");
  const prompts = [];
  const ui = {
    async select(prompt) {
      prompts.push(prompt);
      await Promise.resolve();
      return prompt.includes("alpha") ? "No" : "Yes";
    },
  };

  const [alpha, beta] = await Promise.all([
    toolCallHandler(
      { toolCallId: "parallel-alpha", toolName: "bash", input: { command: "sudo rm -rf alpha" } },
      { hasUI: true, ui },
    ),
    toolCallHandler(
      { toolCallId: "parallel-beta", toolName: "bash", input: { command: "sudo rm -rf beta" } },
      { hasUI: true, ui },
    ),
  ]);

  assert.deepEqual(alpha, { block: true, reason: "Blocked by user" });
  assert.equal(beta, undefined);
  assert.equal(prompts.length, 2);
  assert.ok(prompts.some((prompt) => prompt.includes("alpha")));
  assert.ok(prompts.some((prompt) => prompt.includes("beta")));
});

test("permission-gate rejects named PowerShell calls before validation, prompting, or execution", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  let promptCount = 0;
  const { pi, handlers, execCalls } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");
  const ui = {
    async select() {
      promptCount += 1;
      return "Yes";
    },
  };
  const cases = [
    {
      description: "benign input without UI",
      input: { command: "Write-Output 'hello'" },
      ctx: { hasUI: false },
    },
    {
      description: "destructive input with UI",
      input: { command: "Remove-Item -Recurse -Force C:\\temp\\example" },
      ctx: { hasUI: true, ui },
    },
    {
      description: "malformed input with UI",
      input: {},
      ctx: { hasUI: true, ui },
    },
    {
      description: "malformed input without UI",
      input: null,
      ctx: { hasUI: false },
    },
  ];

  for (const { description, input, ctx } of cases) {
    const result = await toolCallHandler(
      {
        toolCallId: `powershell-${description.replaceAll(" ", "-")}`,
        parentToolCallId: "codemode-root",
        toolName: "powershell",
        input,
      },
      ctx,
    );

    assert.deepEqual(
      result,
      { block: true, reason: "Unsupported powershell tool blocked" },
      description,
    );
  }

  assert.equal(promptCount, 0);
  assert.equal(execCalls.length, 0);
});

test("permission-gate blocks destructive rm variants and shell wrappers when no UI is available", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  for (const command of [
    "rm -rf /tmp/example",
    "rm -fr /tmp/example",
    "rm -r -f /tmp/example",
    "rm -f -r /tmp/example",
    "rm -Rf /tmp/example",
    "rm -fR /tmp/example",
    "rm --recursive --force /tmp/example",
    "rm --force --recursive /tmp/example",
    "rm /tmp/example -rf",
    "/bin/rm -rf /tmp/example",
    "time rm -rf /tmp/example",
    "/usr/bin/time /bin/rm -rf /tmp/example",
    "nohup rm -rf /tmp/example",
    "nice rm -rf /tmp/example",
    "nice -n 5 rm -rf /tmp/example",
    "timeout 5 rm -rf /tmp/example",
    "stdbuf -oL rm -rf /tmp/example",
    "busybox rm -rf /tmp/example",
    'busybox sh -c "rm -rf /tmp/example"',
    "time nohup /bin/rm -rf /tmp/example",
    "command rm -rf /tmp/example",
    "command -- rm -rf /tmp/example",
    "env rm -rf /tmp/example",
    "env -u PATH rm -rf /tmp/example",
    "env -uPATH rm -rf /tmp/example",
    "env --unset PATH rm -rf /tmp/example",
    "env --unset=PATH rm -rf /tmp/example",
    "env -C /tmp rm -rf example",
    "env -C/tmp rm -rf example",
    "env --chdir /tmp rm -rf example",
    "env --chdir=/tmp rm -rf example",
    "xargs rm -rf < paths.txt",
    "xargs -n1 rm -rf < paths.txt",
    "xargs -n 1 rm -rf < paths.txt",
    "xargs --max-args=1 rm -rf < paths.txt",
    "xargs -P4 rm -rf < paths.txt",
    "xargs -P 4 rm -rf < paths.txt",
    "xargs --max-procs=4 rm -rf < paths.txt",
    "xargs -I{} rm -rf {}",
    "xargs -I {} rm -rf {}",
    "xargs --replace={} rm -rf {}",
    "xargs --replace rm -rf",
    "xargs -apaths.txt rm -rf",
    "xargs -a paths.txt rm -rf",
    "xargs --arg-file=paths.txt rm -rf",
    "xargs -E EOF rm -rf < paths.txt",
    "xargs -EEOF rm -rf < paths.txt",
    "xargs --eof=EOF rm -rf < paths.txt",
    "xargs --eof EOF rm -rf",
    "xargs --eof rm -rf",
    "xargs --max-lines rm -rf",
    "find . -name tmp -exec rm -rf {} +",
    "find . -execdir rm -rf {} +",
    "find . -exec time rm -rf {} +",
    "find . -exec /usr/bin/env rm -rf {} +",
    "printf ok $(rm -rf /tmp/example)",
    'echo "$(rm -rf /tmp/example)"',
    'echo "before `rm -rf /tmp/example` after"',
    'sh -c "rm -rf /tmp/example"',
    'sh -c "time rm -rf /tmp/example"',
    "sh -c 'rm -rf /tmp/example'",
    '/bin/bash -c "rm -rf /tmp/example"',
    'bash -lc "rm -rf /tmp/example"',
    'zsh -fc "rm -rf /tmp/example"',
    'dash -c "rm -rf /tmp/example"',
    'ksh -c "rm -rf /tmp/example"',
    'command /bin/bash -c "rm -rf /tmp/example"',
    'env SHELL=/bin/sh sh -c "rm -rf /tmp/example"',
    'eval "rm -rf /tmp/example"',
    "eval 'rm -rf /tmp/example'",
    "eval rm -rf /tmp/example",
    "eval time rm -rf /tmp/example",
    "(rm -rf /tmp/example)",
  ]) {
    const result = await toolCallHandler(
      { toolName: "bash", input: { command } },
      { hasUI: false },
    );

    assert.deepEqual(
      result,
      {
        block: true,
        reason: "Dangerous command blocked (no UI for confirmation)",
      },
      command,
    );
  }
});

test("permission-gate keeps wrapper handling shallow with explicit expected outcomes", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const expectedOutcomes = [
    { command: "command -v rm", blocked: false },
    { command: "command -V rm", blocked: false },
    { command: "command -v rm rm -rf", blocked: false },
    { command: "env --help", blocked: false },
    { command: "env --help ignored rm -rf", blocked: false },
    { command: "env --version", blocked: false },
    { command: "xargs --help", blocked: false },
    { command: "xargs --help ignored rm -rf", blocked: false },
    { command: "xargs --version", blocked: false },
    { command: "rm -- -rf", blocked: false },
    { command: "rm -r -- -f", blocked: false },
    { command: "rm -f -- -R", blocked: false },
    { command: "time rm -- -rf", blocked: false },
    { command: "nohup rm -r /tmp/example", blocked: false },
    { command: "busybox rm -f /tmp/example", blocked: false },
    { command: "env -u PATH printf ok", blocked: false },
    { command: "xargs -n1 printf ok < paths.txt", blocked: false },
    { command: "xargs -E EOF printf ok < paths.txt", blocked: false },
    { command: "xargs --eof=EOF printf ok < paths.txt", blocked: false },
    { command: "xargs --eof EOF printf ok", blocked: false },
    { command: "xargs -E rm -rf", blocked: false },
    { command: "xargs --eof=rm -rf", blocked: false },
    { command: "xargs -I rm -rf", blocked: false },
    { command: "xargs --replace=rm -rf", blocked: false },
    { command: "xargs -L rm -rf", blocked: false },
    { command: "xargs --max-lines=rm -rf", blocked: false },
    { command: "xargs -s 64 printf ok < paths.txt", blocked: false },
    { command: "xargs --max-chars=64 printf ok < paths.txt", blocked: false },
    { command: "xargs --max-chars 64 printf ok", blocked: false },
    { command: "xargs -d : printf ok < paths.txt", blocked: false },
    { command: "xargs --delimiter=: printf ok < paths.txt", blocked: false },
    { command: "xargs --delimiter : printf ok", blocked: false },
    { command: "xargs -L 2 printf ok < paths.txt", blocked: false },
    { command: "xargs --max-lines=2 printf ok < paths.txt", blocked: false },
    { command: "xargs --max-lines 2 printf ok", blocked: false },
    { command: "command -p rm -rf /tmp/example", blocked: true },
    { command: "time rm -rf /tmp/example", blocked: true },
    { command: "nohup rm -rf /tmp/example", blocked: true },
    { command: "busybox rm -rf /tmp/example", blocked: true },
    { command: "env --unset=PATH rm -rf /tmp/example", blocked: true },
    { command: "xargs --replace={} rm -rf {}", blocked: true },
    { command: "xargs --replace rm -rf", blocked: true },
    { command: "xargs -E EOF rm -rf < paths.txt", blocked: true },
    { command: "xargs --eof EOF rm -rf", blocked: true },
    { command: "xargs --eof rm -rf", blocked: true },
    { command: "xargs -s 64 rm -rf < paths.txt", blocked: true },
    { command: "xargs --max-chars 64 rm -rf", blocked: true },
    { command: "xargs -d : rm -rf < paths.txt", blocked: true },
    { command: "xargs --delimiter : rm -rf", blocked: true },
    { command: "xargs -L 2 rm -rf < paths.txt", blocked: true },
    { command: "xargs --max-lines 2 rm -rf", blocked: true },
    { command: "xargs --max-lines rm -rf", blocked: true },
    { command: 'env /bin/bash -lc "rm -rf /tmp/example"', blocked: true },
    { command: "eval rm -rf /tmp/example", blocked: true },
    {
      command: ["printf ok", ...Array.from({ length: 100 }, (_, index) => `arg${index}`)].join(" "),
      blocked: false,
    },
  ];

  for (const { command, blocked } of expectedOutcomes) {
    const result = await toolCallHandler(
      { toolName: "bash", input: { command } },
      {
        hasUI: true,
        ui: {
          async select() {
            prompted = true;
            return "No";
          },
        },
      },
    );

    assert.equal(Boolean(result?.block), blocked, command);
    if (blocked) {
      assert.deepEqual(result, { block: true, reason: "Blocked by user" }, command);
    } else {
      assert.equal(result, undefined, command);
    }
  }

  assert.equal(prompted, true);
});

test("permission-gate blocks malformed shell inputs without prompting", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const missingCommand = await toolCallHandler(
    { toolName: "bash", input: {} },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "Yes";
        },
      },
    },
  );
  const arrayCommand = await toolCallHandler(
    { toolName: "bash", input: { command: ["rm", "-rf", "/tmp/example"] } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "Yes";
        },
      },
    },
  );
  const invalidBashTimeout = await toolCallHandler(
    { toolName: "bash", input: { command: "printf ok", timeout: "5" } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "Yes";
        },
      },
    },
  );

  assert.deepEqual(missingCommand, {
    block: true,
    reason: "Malformed bash command blocked",
  });
  assert.deepEqual(arrayCommand, {
    block: true,
    reason: "Malformed bash command blocked",
  });
  assert.deepEqual(invalidBashTimeout, {
    block: true,
    reason: "Malformed bash command blocked",
  });
  assert.equal(prompted, false);
});

test("permission-gate blocks malformed write/edit inputs without prompting", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const missingWritePath = await toolCallHandler(
    { toolName: "write", input: { content: "x" } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "Yes";
        },
      },
    },
  );
  const nonStringWriteContent = await toolCallHandler(
    { toolName: "write", input: { path: ".env", content: ["x"] } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "Yes";
        },
      },
    },
  );
  const blankEditPath = await toolCallHandler(
    { toolName: "edit", input: { path: "   ", edits: [] } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "Yes";
        },
      },
    },
  );
  const malformedEditShape = await toolCallHandler(
    { toolName: "edit", input: { path: ".env", edits: [{ oldText: "a", newText: 1 }] } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "Yes";
        },
      },
    },
  );

  assert.deepEqual(missingWritePath, {
    block: true,
    reason: "Malformed write input blocked",
  });
  assert.deepEqual(nonStringWriteContent, {
    block: true,
    reason: "Malformed write input blocked",
  });
  assert.deepEqual(blankEditPath, {
    block: true,
    reason: "Malformed edit input blocked",
  });
  assert.deepEqual(malformedEditShape, {
    block: true,
    reason: "Malformed edit input blocked",
  });
  assert.equal(prompted, false);
});

test("permission-gate blocks protected write/edit paths without UI after normalization", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const protectedWrite = await toolCallHandler(
    { toolName: "write", input: { path: "scratch/../.git/config", content: "x" } },
    { hasUI: false },
  );
  const protectedEdit = await toolCallHandler(
    {
      toolName: "edit",
      input: {
        path: "./tmp/../node_modules/pkg/index.js",
        edits: [{ oldText: "a", newText: "b" }],
      },
    },
    { hasUI: false },
  );
  const protectedEnv = await toolCallHandler(
    { toolName: "write", input: { path: "/tmp/project/.env.production", content: "SECRET=1" } },
    { hasUI: false },
  );

  assert.deepEqual(protectedWrite, {
    block: true,
    reason: "Protected path blocked (write without UI confirmation): scratch/../.git/config",
  });
  assert.deepEqual(protectedEdit, {
    block: true,
    reason:
      "Protected path blocked (edit without UI confirmation): ./tmp/../node_modules/pkg/index.js",
  });
  assert.deepEqual(protectedEnv, {
    block: true,
    reason: "Protected path blocked (write without UI confirmation): /tmp/project/.env.production",
  });
});

test("permission-gate blocks leading-at and case-insensitive protected path bypasses", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const cases = [
    { toolName: "write", input: { path: "@.git/config", content: "x" } },
    { toolName: "write", input: { path: "@/repo/NODE_MODULES/pkg/index.js", content: "x" } },
    {
      toolName: "edit",
      input: { path: "@config/.ENV.Production", edits: [{ oldText: "a", newText: "b" }] },
    },
    { toolName: "write", input: { path: "@config/../.GiT/config", content: "x" } },
  ];

  for (const event of cases) {
    const result = await toolCallHandler(event, { hasUI: false });
    assert.equal(result?.block, true, `expected ${event.input.path} to be blocked`);
    assert.match(result.reason, /Protected path blocked/);
  }
});

test("permission-gate respects interactive allow/deny decisions for protected write/edit paths", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const prompts = [];
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const blocked = await toolCallHandler(
    { toolName: "write", input: { path: ".env", content: "SECRET=1" } },
    {
      hasUI: true,
      ui: {
        async select(prompt, options) {
          prompts.push({ prompt, options });
          return "No";
        },
      },
    },
  );

  assert.deepEqual(blocked, { block: true, reason: "Blocked by user" });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].prompt, /Protected path write request/);
  assert.match(prompts[0].prompt, /\.env/);
  assert.deepEqual(prompts[0].options, ["Yes", "No"]);

  const allowed = await toolCallHandler(
    {
      toolName: "edit",
      input: { path: "config/../.git/config", edits: [{ oldText: "a", newText: "b" }] },
    },
    {
      hasUI: true,
      ui: {
        async select() {
          return "Yes";
        },
      },
    },
  );

  assert.equal(allowed, undefined);
});

test("permission-gate matches protected path segments exactly and skips safe env templates", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const safeGitNamedFile = await toolCallHandler(
    { toolName: "write", input: { path: "docs/.gitignore", content: "x" } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "No";
        },
      },
    },
  );
  const safeNodeModulesNamedDir = await toolCallHandler(
    {
      toolName: "edit",
      input: {
        path: "vendor/node_modules-cache/index.js",
        edits: [{ oldText: "a", newText: "b" }],
      },
    },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "No";
        },
      },
    },
  );
  const safeEnvExample = await toolCallHandler(
    { toolName: "write", input: { path: ".env.example", content: "KEY=" } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "No";
        },
      },
    },
  );
  const safeNestedEnvTemplate = await toolCallHandler(
    { toolName: "write", input: { path: "config/.env.production.template", content: "KEY=" } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "No";
        },
      },
    },
  );
  const safeEnvrc = await toolCallHandler(
    { toolName: "write", input: { path: ".envrc", content: "layout node" } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "No";
        },
      },
    },
  );

  assert.equal(safeGitNamedFile, undefined);
  assert.equal(safeNodeModulesNamedDir, undefined);
  assert.equal(safeEnvExample, undefined);
  assert.equal(safeNestedEnvTemplate, undefined);
  assert.equal(safeEnvrc, undefined);
  assert.equal(prompted, false);
});

test("permission-gate only excludes terminal env example/template suffixes", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const safeUppercaseTemplate = await toolCallHandler(
    { toolName: "write", input: { path: ".ENV.PRODUCTION.TEMPLATE", content: "KEY=" } },
    { hasUI: false },
  );
  const unsafeExampleSecret = await toolCallHandler(
    { toolName: "write", input: { path: ".env.example.secret", content: "SECRET=1" } },
    { hasUI: false },
  );
  const unsafeTemplateLocal = await toolCallHandler(
    {
      toolName: "edit",
      input: { path: ".ENV.TEMPLATE.LOCAL", edits: [{ oldText: "a", newText: "b" }] },
    },
    { hasUI: false },
  );

  assert.equal(safeUppercaseTemplate, undefined);
  assert.equal(unsafeExampleSecret?.block, true);
  assert.match(unsafeExampleSecret.reason, /Protected path blocked/);
  assert.equal(unsafeTemplateLocal?.block, true);
  assert.match(unsafeTemplateLocal.reason, /Protected path blocked/);
});

test("permission-gate respects interactive allow/deny decisions for dangerous bash commands", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const prompts = [];

  const denyRegistration = createPi();
  permissionGate(denyRegistration.pi);
  const toolCallHandler = denyRegistration.handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const blocked = await toolCallHandler(
    { toolName: "bash", input: { command: "sudo rm -rf /tmp/example" } },
    {
      hasUI: true,
      ui: {
        async select(prompt, options) {
          prompts.push({ prompt, options });
          return "No";
        },
      },
    },
  );

  assert.deepEqual(blocked, { block: true, reason: "Blocked by user" });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].prompt, /sudo rm -rf \/tmp\/example/);
  assert.deepEqual(prompts[0].options, ["Yes", "No"]);

  const allowed = await toolCallHandler(
    { toolName: "bash", input: { command: "sudo rm -rf /tmp/example" } },
    {
      hasUI: true,
      ui: {
        async select() {
          return "Yes";
        },
      },
    },
  );

  assert.equal(allowed, undefined);
});

test("permission-gate allows non-dangerous bash commands without prompting", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const result = await toolCallHandler(
    { toolName: "bash", input: { command: 'printf "hello"' } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "No";
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(prompted, false);
});

test("permission-gate preserves benign quoted display text while still catching substitutions", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  for (const command of [
    'printf "%s\\n" "rm -rf /tmp/example"',
    'echo "rm -rf /tmp/example"',
    "printf '%s\n' 'rm -rf /tmp/example'",
    "rm -r /tmp/example",
    "rm -f /tmp/example",
    'env printf "%s\\n" "rm -rf /tmp/example"',
  ]) {
    const result = await toolCallHandler(
      { toolName: "bash", input: { command } },
      {
        hasUI: true,
        ui: {
          async select() {
            prompted = true;
            return "No";
          },
        },
      },
    );

    assert.equal(result, undefined, command);
  }

  const backtickSubstitution = await toolCallHandler(
    { toolName: "bash", input: { command: "echo `rm -rf /tmp/example`" } },
    { hasUI: false },
  );

  assert.equal(prompted, false);
  assert.deepEqual(backtickSubstitution, {
    block: true,
    reason: "Dangerous command blocked (no UI for confirmation)",
  });
});

test("permission-gate distinguishes safe and dangerous command boundaries", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const safeResult = await toolCallHandler(
    {
      toolName: "bash",
      input: {
        command:
          'echo "safe & rm -Rf /tmp/example" && chmod 755 ./script.sh && rmdir ./tmp && rm -r /tmp/example && rm -R /tmp/example && rm -f /tmp/example',
      },
    },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return "No";
        },
      },
    },
  );
  const dangerousRecursiveRm = await toolCallHandler(
    { toolName: "bash", input: { command: "printf ok & rm -fr /tmp/example" } },
    { hasUI: false },
  );
  const dangerousChmod = await toolCallHandler(
    { toolName: "bash", input: { command: "chmod 777 ./script.sh" } },
    { hasUI: false },
  );

  assert.equal(safeResult, undefined);
  assert.equal(prompted, false);
  assert.deepEqual(dangerousRecursiveRm, {
    block: true,
    reason: "Dangerous command blocked (no UI for confirmation)",
  });
  assert.deepEqual(dangerousChmod, {
    block: true,
    reason: "Dangerous command blocked (no UI for confirmation)",
  });
});

test("Pi 0.99 host dispatch guards direct dangerous calls and preserves benign structured results", async () => {
  const fixture = await createPi99HostFixture({
    tools: ["bash"],
    responses: [
      fauxAssistantMessage([
        fauxToolCall("bash", { command: "printf direct-safe" }, { id: "direct-safe" }),
        fauxToolCall(
          "bash",
          { command: "rm -rf ./pi-dzb7-direct-no-exec" },
          { id: "direct-danger" },
        ),
      ]),
    ],
  });

  try {
    await fixture.session.agent.prompt("run direct fixture");

    const toolResults = fixture.session.agent.state.messages.filter(
      (message) => message.role === "toolResult",
    );
    assert.equal(toolResults.length, 2);
    const safeResult = toolResults.find((result) => result.toolCallId === "direct-safe");
    const blockedResult = toolResults.find((result) => result.toolCallId === "direct-danger");
    assert.equal(safeResult.isError, false);
    const safeEvent = fixture.events.find(
      (event) => event.type === "tool_result" && event.toolCallId === "direct-safe",
    );
    assert.equal(safeEvent.structuredContent.output, "direct-safe");
    assert.equal(blockedResult.isError, true);
    assert.match(blockedResult.content[0].text, /Dangerous command blocked/);

    const directCalls = fixture.events.filter((event) => event.type === "tool_call");
    assert.deepEqual(directCalls.map((event) => event.toolCallId).sort(), [
      "direct-danger",
      "direct-safe",
    ]);
    assert.ok(directCalls.every((event) => event.parentToolCallId === undefined));
    const directResults = fixture.events.filter((event) => event.type === "tool_result");
    // Blocked calls have no post-execution tool_result hook; the host still emits
    // their error tool result and tool_execution_end event.
    assert.deepEqual(
      directResults.map((event) => event.toolCallId),
      ["direct-safe"],
    );
    const directEnds = fixture.events.filter((event) => event.type === "tool_execution_end");
    assert.equal(directEnds.length, 2);
    assert.ok(
      directEnds.some((event) => event.toolCallId === "direct-danger" && event.isError === true),
    );
  } finally {
    fixture.dispose();
  }
});

test("Pi 0.99 codemode host dispatch guards nested shell/file calls, correlates parallel results, and preserves reentrant output", async () => {
  const nestedCode = `
const results = await Promise.allSettled([
  tools.bash({ command: "rm -rf ./pi-dzb7-nested-no-exec" }),
  tools.write({ path: ".git/pi-dzb7-no-write", content: "no" }),
  tools.edit({ path: ".git/pi-dzb7-no-edit", edits: [{ oldText: "x", newText: "y" }] }),
  tools.bash({ command: "printf nested-safe" }),
  tools.read({ path: "fixture.txt" }),
  tools.chain_fixture({ command: "printf chain-safe" }),
  tools.powershell({ command: "Write-Output nested-unsupported" })
]);
return results.map((entry) => entry.status === "fulfilled" ? entry.value : String(entry.reason));
`;
  const fixture = await createPi99HostFixture({
    tools: ["bash", "powershell", "read", "write", "edit", "codemode", "chain_fixture"],
    customTools: [createNestedChainTool()],
    responses: [
      fauxAssistantMessage(fauxToolCall("codemode", { code: nestedCode }, { id: "codemode-root" })),
    ],
  });

  try {
    mkdirSync(path.join(fixture.cwd, ".git"));
    await fixture.session.agent.prompt("run nested fixture");

    const parentResult = fixture.session.agent.state.messages.find(
      (message) => message.role === "toolResult" && message.toolCallId === "codemode-root",
    );
    assert.equal(parentResult.isError, false);
    assert.ok(parentResult.nestedCalls);
    assert.equal(parentResult.nestedCalls.complete, true);
    assert.equal(parentResult.nestedCalls.calls.length, 8);

    const nestedCalls = new Map(parentResult.nestedCalls.calls.map((call) => [call.id, call]));
    assert.equal(nestedCalls.get("codemode-root/1").status, "error");
    assert.equal(nestedCalls.get("codemode-root/2").status, "error");
    assert.equal(nestedCalls.get("codemode-root/3").status, "error");
    assert.equal(nestedCalls.get("codemode-root/4").status, "ok");
    assert.equal(nestedCalls.get("codemode-root/5").status, "ok");
    assert.equal(nestedCalls.get("codemode-root/6").status, "ok");
    assert.equal(nestedCalls.get("codemode-root/6/1").status, "ok");
    assert.equal(nestedCalls.get("codemode-root/7").status, "error");
    assert.match(nestedCalls.get("codemode-root/1").error, /Dangerous command blocked/);
    assert.match(nestedCalls.get("codemode-root/2").error, /Protected path blocked/);
    assert.match(nestedCalls.get("codemode-root/3").error, /Protected path blocked/);
    assert.match(nestedCalls.get("codemode-root/7").error, /Unsupported powershell tool blocked/);
    assert.equal(existsSync(path.join(fixture.cwd, ".git", "pi-dzb7-no-write")), false);
    assert.equal(existsSync(path.join(fixture.cwd, ".git", "pi-dzb7-no-edit")), false);

    const nestedToolCalls = fixture.events.filter(
      (event) => event.type === "tool_call" && event.parentToolCallId,
    );
    assert.equal(nestedToolCalls.length, 8);
    assert.ok(
      nestedToolCalls.every((event) => event.toolCallId.startsWith(`${event.parentToolCallId}/`)),
    );
    assert.ok(
      nestedToolCalls.some(
        (event) =>
          event.toolName === "powershell" &&
          event.toolCallId === "codemode-root/7" &&
          event.parentToolCallId === "codemode-root",
      ),
    );
    assert.ok(
      nestedToolCalls.some(
        (event) =>
          event.toolCallId === "codemode-root/6/1" && event.parentToolCallId === "codemode-root/6",
      ),
    );

    const nestedToolResults = fixture.events.filter(
      (event) => event.type === "tool_result" && event.parentToolCallId,
    );
    // Pi emits tool_result after successful execution; blocked calls still emit
    // tool_execution_end and remain represented in the bounded nestedCalls record.
    assert.equal(nestedToolResults.length, 4);
    const safeBashResult = nestedToolResults.find(
      (event) => event.toolCallId === "codemode-root/4",
    );
    assert.equal(safeBashResult.structuredContent.output, "nested-safe");
    const executionEnds = fixture.events.filter(
      (event) => event.type === "tool_execution_end" && event.parentToolCallId,
    );
    assert.equal(executionEnds.length, 8);
    assert.ok(
      executionEnds.some(
        (event) => event.toolCallId === "codemode-root/1" && event.isError === true,
      ),
    );
    assert.ok(
      executionEnds.some(
        (event) => event.toolCallId === "codemode-root/7" && event.isError === true,
      ),
    );
  } finally {
    fixture.dispose();
  }
});
