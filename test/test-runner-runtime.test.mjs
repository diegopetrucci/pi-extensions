import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

let tempDir;
let runtime;

async function loadRuntime() {
  if (runtime) return runtime;
  const source = await readFile(path.resolve("extensions/test-runner/index.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  tempDir = await mkdtemp(path.join(path.resolve("test"), ".tmp-test-runner-"));
  const compiledPath = path.join(tempDir, "index.mjs");
  await writeFile(compiledPath, compiled, "utf8");
  runtime = await import(pathToFileURL(compiledPath).href);
  return runtime;
}

test.after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

function createGuardHandlers(factory) {
  const handlers = new Map();
  factory({
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
  });
  return handlers;
}

test("registers test_runner with steps/context/cwd params", async () => {
  const mod = await loadRuntime();
  const tools = [];
  mod.default({
    on() {},
    registerTool: (tool) => tools.push(tool),
    getThinkingLevel: () => "off",
  });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "test_runner");
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["steps", "context", "cwd"]);
  assert.deepEqual(tools[0].parameters.required, ["steps"]);
  assert.equal(tools[0].parameters.properties.steps.type, "array");
});

test("rejects empty or non-string steps before running anything", async () => {
  const mod = await loadRuntime();
  const tools = [];
  mod.default({ on() {}, registerTool: (tool) => tools.push(tool) });
  const execute = tools[0].execute;
  for (const steps of [[], ["npm test", " "], undefined, [1]]) {
    await assert.rejects(
      execute("id", { steps }, undefined, undefined, { cwd: process.cwd() }),
      /non-empty array of non-empty strings/,
    );
  }
});

test("exposes only bash plus MCP tools; bash is unrestricted with a default timeout", async () => {
  const mod = await loadRuntime();
  const { BUILTIN_TOOL_NAMES, SUBAGENT_MCP_TOOLS, createTestRunnerRuntimeGuardExtension } =
    mod.__test__;
  assert.deepEqual([...BUILTIN_TOOL_NAMES], ["bash"]);
  assert.ok(SUBAGENT_MCP_TOOLS.includes("mcp__*"));

  const handlers = createGuardHandlers(
    createTestRunnerRuntimeGuardExtension({ cwd: "/repo", maxTurns: 5 }),
  );
  const toolCall = handlers.get("tool_call");
  const call = (toolName, input = {}) => toolCall({ toolName, input });

  for (const name of ["read", "write", "edit", "grep", "find", "ls", "subagent"]) {
    assert.equal((await call(name, { path: "a" })).block, true, `${name} should be blocked`);
  }
  assert.equal(await call("mcp__server__tool"), undefined);

  const bash = { command: "npm ci && npm test | tee out.txt" };
  assert.equal(await call("bash", bash), undefined);
  assert.equal(bash.command, "npm ci && npm test | tee out.txt");
  assert.equal(bash.timeout, mod.__test__.DEFAULT_BASH_TIMEOUT_SECONDS);

  const explicit = { command: "x", timeout: 5 };
  await call("bash", explicit);
  assert.equal(explicit.timeout, 5);

  await handlers.get("turn_start")({ turnIndex: 4 });
  const final = await call("bash", { command: "ls" });
  assert.equal(final.block, true);
  assert.match(final.reason, /final test-runner turn/);
});

test("prompts include exact steps in order and TLH rules without supervisor wording", async () => {
  const mod = await loadRuntime();
  const { buildSystemPrompt, buildUserPrompt } = mod.__test__;
  const system = buildSystemPrompt({
    cwd: "/repo",
    maxTurns: 60,
    maxRunSeconds: 3600,
  });
  for (const needle of [
    "Never edit files, install dependencies, fix failures",
    "Stop after the first failed step",
    "PASS or FAIL",
    "overall result",
    "report it in your final result",
    "bash is unrestricted",
  ]) {
    assert.ok(system.includes(needle), `system prompt should include ${needle}`);
  }
  for (const banned of ["contact_supervisor", "architect", "tk show", "supervisor", "ticket"]) {
    assert.ok(!system.toLowerCase().includes(banned), `prompt should not include ${banned}`);
  }

  const steps = ["npm ci", "npm run typecheck && echo 'a  b'", "node --test test/x.test.mjs"];
  const user = buildUserPrompt({ steps, context: "ctx here" }, "/repo");
  const positions = steps.map((step, i) => user.indexOf(`${i + 1}. ${step}`));
  assert.ok(
    positions.every((p) => p >= 0),
    "all steps present verbatim and numbered",
  );
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions,
  );
  assert.match(user, /ctx here/);
});

test("thinking defaults to low and is clamped to model capabilities", async () => {
  const mod = await loadRuntime();
  const { resolveThinkingLevel } = mod.__test__;
  assert.equal(mod.__test__.DEFAULT_THINKING_LEVEL, "low");
  assert.equal(
    resolveThinkingLevel({ provider: "p", id: "m", reasoning: true }, "low").effective,
    "low",
  );
  assert.equal(
    resolveThinkingLevel({ provider: "p", id: "m", reasoning: false }, "low").effective,
    "off",
  );
  assert.equal(
    resolveThinkingLevel(
      {
        provider: "p",
        id: "m",
        reasoning: true,
        thinkingLevelMap: { low: null },
      },
      "low",
    ).effective,
    "medium",
  );
});

test("run details suffix is appended and empty output yields a FAIL report", async () => {
  const mod = await loadRuntime();
  const details = {
    status: "done",
    cwd: "/repo",
    steps: ["npm test"],
    turns: 2,
    toolCalls: [{ name: "bash", args: { command: "npm test" } }],
    startedAt: 0,
    endedAt: 1500,
    modelRef: "p/m",
    effectiveThinkingLevel: "low",
  };
  const report = mod.__test__.appendRunDetails("PASS", details);
  assert.match(report, /Run details: model p\/m; thinking low; 2 turn\(s\); 1 tool call\(s\)/);
  assert.match(report, /bash npm test/);
  assert.match(mod.__test__.appendRunDetails("", details), /Overall result\n- FAIL/);
});
