import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

let tempDir;
let runtime;

async function loadRuntime() {
  if (runtime) return runtime;
  const source = await readFile(path.resolve("extensions/repo-scout/index.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  tempDir = await mkdtemp(path.join(path.resolve("test"), ".tmp-repo-scout-"));
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

test("registers the repo_scout tool with the expected params", async () => {
  const mod = await loadRuntime();
  const tools = [];
  mod.default({
    on() {},
    registerTool: (tool) => tools.push(tool),
    getThinkingLevel: () => "off",
  });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "repo_scout");
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["task", "cwd"]);
  assert.equal(tools[0].parameters.required, undefined);
});

test("runtime guard is read-only, blocks unsafe bash, and enforces turn budget", async (t) => {
  const mod = await loadRuntime();
  const { createRepoScoutRuntimeGuardExtension, SUBAGENT_MCP_TOOLS } = mod.__test__;
  assert.ok(SUBAGENT_MCP_TOOLS.includes("mcp__*"));
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-scout-guard-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "repo-scout-outside-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "src"));
  const handlers = createGuardHandlers(
    createRepoScoutRuntimeGuardExtension({ cwd: root, maxTurns: 3 }),
  );
  const call = (toolName, input = {}) => handlers.get("tool_call")({ toolName, input });

  for (const name of ["write", "edit", "subagent"]) {
    const result = await call(name, { path: "x" });
    assert.equal(result?.block, true, `${name} should be blocked`);
  }
  assert.equal(await call("mcp__server__tool"), undefined);
  assert.equal((await call("read", { path: path.join(outside, "x") }))?.block, true);
  assert.equal((await call("ls", { path: "../" }))?.block, true);

  for (const command of [
    "git diff --cached --no-color",
    "git status --short --untracked-files=all",
  ]) {
    const input = { command };
    assert.equal(await call("bash", input), undefined, command);
    assert.equal(input.timeout, 30);
    assert.match(input.command, /'--no-pager'.*'--no-ext-diff'|'--no-pager'.*'status'/);
  }
  for (const command of [
    "git commit -m x",
    "git add .",
    "git diff > out.txt",
    "git diff | cat",
    "git status && rm -rf .",
    "rm -rf src",
    "npm publish",
    "gh pr merge 1",
    "gh api -X POST repos/o/r/issues",
    "git diff --ext-diff",
  ]) {
    assert.equal((await call("bash", { command }))?.block, true, `${command} should be blocked`);
  }

  await handlers.get("turn_start")({ turnIndex: 2 });
  const final = await call("read", { path: "src" });
  assert.equal(final.block, true);
  assert.match(final.reason, /final repo_scout turn 3\/3/);
});

test("system prompt carries TLH scan process and report format without supervisor wording", async () => {
  const mod = await loadRuntime();
  const { buildSystemPrompt, buildUserPrompt } = mod.__test__;
  const prompt = buildSystemPrompt({
    cwd: "/repo",
    maxTurns: 8,
    maxRunSeconds: 480,
  });
  for (const needle of [
    "git rev-parse --show-toplevel",
    "# Repository scout report",
    "## Detected stack",
    "## Conventions",
    "## Commands",
    "## Project hotspots",
    "## Do and don't patterns",
    "## Open questions",
    "Report blockers in your final result",
  ]) {
    assert.ok(prompt.includes(needle), `prompt should include ${needle}`);
  }
  for (const banned of [/contact_supervisor/, /\barchitect\b/, /tk show/, /supervisor/]) {
    assert.ok(!banned.test(prompt.toLowerCase()), `prompt should not match ${banned}`);
  }
  assert.match(buildUserPrompt({ task: "FOCUS-1" }, "/repo"), /FOCUS-1/);
  assert.match(buildUserPrompt({}, "/repo"), /general repository orientation/);
});

test("thinking is fixed to medium and clamped to model capabilities", async () => {
  const mod = await loadRuntime();
  const { resolveThinkingLevel } = mod.__test__;
  const run = (model) => resolveThinkingLevel(model, "medium").effective;
  assert.equal(run({ provider: "p", id: "m", reasoning: true }), "medium");
  assert.equal(run({ provider: "p", id: "m", reasoning: false }), "off");
  assert.equal(
    run({
      provider: "p",
      id: "m",
      reasoning: true,
      thinkingLevelMap: { medium: null },
    }),
    "high",
  );
});

test("run details suffix is appended and empty output yields a failure summary", async () => {
  const mod = await loadRuntime();
  const details = {
    status: "done",
    cwd: "/repo",
    turns: 2,
    toolCalls: [{ name: "bash", args: { command: "git diff" } }],
    startedAt: 0,
    endedAt: 1500,
    modelRef: "p/m",
    effectiveThinkingLevel: "medium",
  };
  const report = mod.__test__.appendRunDetails("# Repository scout report", details);
  assert.match(report, /Run details: model p\/m; thinking medium; 2 turn\(s\); 1 tool call\(s\)/);
  assert.match(report, /bash git diff/);
  assert.match(mod.__test__.appendRunDetails("", details), /No report was produced/);
});

test("git branch guard uses a strict read-only flag allowlist", async (t) => {
  const mod = await loadRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-scout-branch-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const handlers = createGuardHandlers(
    mod.__test__.createRepoScoutRuntimeGuardExtension({ cwd: root, maxTurns: 10 }),
  );
  const call = (command) => handlers.get("tool_call")({ toolName: "bash", input: { command } });
  for (const command of [
    "git branch -v -dv x",
    "git branch -dv x",
    "git branch --del x",
    "git branch -Mv a b",
    "git branch --mov a b",
  ]) {
    assert.equal((await call(command))?.block, true, command);
  }
  for (const command of [
    "git branch",
    "git branch -a",
    "git branch -vv",
    "git branch --show-current",
    "git branch --contains HEAD",
    "git branch --list 'feat/*'",
  ]) {
    assert.equal(await call(command), undefined, command);
  }
});
