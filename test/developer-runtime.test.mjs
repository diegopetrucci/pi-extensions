import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

let tempDir;
let runtime;

async function loadRuntime() {
  if (runtime) return runtime;
  const source = await readFile(path.resolve("extensions/developer/index.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  tempDir = await mkdtemp(path.join(path.resolve("test"), ".tmp-developer-"));
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

test("registers the developer tool with the expected params", async () => {
  const mod = await loadRuntime();
  const tools = [];
  mod.default({
    on() {},
    registerTool: (tool) => tools.push(tool),
    getThinkingLevel: () => "off",
  });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "developer");
  assert.deepEqual(Object.keys(tools[0].parameters.properties), [
    "task",
    "ticket",
    "context",
    "cwd",
  ]);
  assert.deepEqual(tools[0].parameters.required, ["task"]);
});

test("exposes write/edit/bash plus MCP tools and nothing else", async () => {
  const mod = await loadRuntime();
  const { BUILTIN_TOOL_NAMES, SUBAGENT_MCP_TOOLS, createDeveloperRuntimeGuardExtension } =
    mod.__test__;
  assert.deepEqual(
    [...BUILTIN_TOOL_NAMES],
    ["read", "write", "edit", "grep", "find", "ls", "bash"],
  );
  assert.ok(SUBAGENT_MCP_TOOLS.includes("mcp__*"));

  const cwd = await mkdtemp(path.join(os.tmpdir(), "developer-guard-"));
  try {
    const handlers = createGuardHandlers(
      createDeveloperRuntimeGuardExtension({ cwd, maxTurns: 5 }),
    );
    const toolCall = handlers.get("tool_call");
    const call = (toolName, input = {}) => toolCall({ toolName, input });

    assert.equal((await call("subagent")).block, true);
    assert.equal(await call("mcp__server__tool"), undefined);
    assert.equal(await call("read", { path: "/etc/hosts" }), undefined);

    // bash is unrestricted; only a default timeout is applied.
    const bash = { command: "git status && npm test | tee out.txt" };
    assert.equal(await call("bash", bash), undefined);
    assert.equal(bash.command, "git status && npm test | tee out.txt");
    assert.equal(typeof bash.timeout, "number");

    await handlers.get("turn_start")({ turnIndex: 4 });
    const final = await call("read", { path: "a.txt" });
    assert.equal(final.block, true);
    assert.match(final.reason, /final developer turn/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("write/edit are limited to the checkout, including via symlinks", async () => {
  const mod = await loadRuntime();
  const { createDeveloperRuntimeGuardExtension } = mod.__test__;
  const base = await mkdtemp(path.join(os.tmpdir(), "developer-paths-"));
  const cwd = path.join(base, "repo");
  const outside = path.join(base, "outside");
  await mkdir(cwd);
  await mkdir(outside);
  await symlink(outside, path.join(cwd, "link"));
  await symlink(path.join(outside, "x.txt"), path.join(cwd, "filelink"));
  try {
    const toolCall = createGuardHandlers(
      createDeveloperRuntimeGuardExtension({ cwd, maxTurns: 5 }),
    ).get("tool_call");

    for (const toolName of ["write", "edit"]) {
      const blocked = [
        "../outside/x.txt",
        path.join(outside, "x.txt"),
        "link/new.txt",
        "link/sub/new.txt",
        "filelink",
        "~/developer-test-file",
        undefined,
        "",
      ];
      for (const p of blocked) {
        const result = await toolCall({ toolName, input: { path: p } });
        assert.equal(result?.block, true, `${toolName} ${String(p)} should be blocked`);
      }
      for (const p of ["a.txt", "nested/dir/b.txt", path.join(cwd, "c.txt"), "@d.txt"]) {
        const result = await toolCall({ toolName, input: { path: p } });
        assert.equal(result, undefined, `${toolName} ${p} should be allowed`);
      }
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("system prompt keeps TLH rules and drops supervisor/architect wording", async () => {
  const mod = await loadRuntime();
  const prompt = mod.__test__.buildSystemPrompt({
    cwd: "/repo",
    maxTurns: 40,
    maxRunSeconds: 1800,
  });
  for (const needle of [
    "human-owned",
    "git stash",
    "git restore",
    "git reset",
    "git clean",
    "Implement only what the task asks for",
    "Completion report",
    "Files changed",
    "Report blockers in your final result",
  ]) {
    assert.ok(prompt.includes(needle), `prompt should include ${needle}`);
  }
  for (const banned of ["contact_supervisor", "architect", "tk show", "supervisor"]) {
    assert.ok(!prompt.toLowerCase().includes(banned), `prompt should not include ${banned}`);
  }
  const user = mod.__test__.buildUserPrompt({ task: "Do X", ticket: "T-1" }, "/repo");
  assert.match(user, /Do X/);
  assert.match(user, /T-1/);
});

test("run details suffix is appended and empty output yields a failure report", async () => {
  const mod = await loadRuntime();
  const details = {
    status: "done",
    cwd: "/repo",
    task: "t",
    turns: 2,
    toolCalls: [{ name: "write", args: { path: "a.txt" } }],
    startedAt: 0,
    endedAt: 1500,
    modelRef: "p/m",
    effectiveThinkingLevel: "high",
  };
  const report = mod.__test__.appendRunDetails("## Summary\n- ok", details);
  assert.match(report, /Run details: model p\/m; thinking high; 2 turn\(s\); 1 tool call\(s\)/);
  assert.match(report, /write a\.txt/);
  assert.match(mod.__test__.appendRunDetails("", details), /No completion report was produced/);
});

test("thinking is inherited and clamped to model capabilities", async () => {
  const mod = await loadRuntime();
  const { resolveThinkingLevel, normalizeThinkingLevel } = mod.__test__;
  assert.equal(normalizeThinkingLevel("bogus"), undefined);
  assert.equal(
    resolveThinkingLevel({ provider: "p", id: "m", reasoning: true }, "medium").effective,
    "medium",
  );
  assert.equal(
    resolveThinkingLevel({ provider: "p", id: "m", reasoning: false }, "high").effective,
    "off",
  );
  assert.equal(
    resolveThinkingLevel({ provider: "p", id: "m", reasoning: true }, "xhigh").effective,
    "high",
  );
});
