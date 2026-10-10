/**
 * Tests for the Pi-mirroring path resolution in permission-gate.
 *
 * These tests cover paths that bypass the lexical normalizeToolPath check but
 * are caught by the resolveToCwd helper that mirrors Pi's built-in tool
 * resolution (BUG-004 / ticket pe-t1p6).
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createEditTool, createWriteTool } from "@earendil-works/pi-coding-agent";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function loadExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath)).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.default;
}

async function loadExtensionModule(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath)).href;
  return import(moduleUrl);
}

function createPi() {
  const handlers = new Map();
  return {
    pi: {
      on(eventName, handler) {
        handlers.set(eventName, handler);
      },
    },
    handlers,
  };
}

// ---------------------------------------------------------------------------
// resolveToCwd helper unit tests
// ---------------------------------------------------------------------------

test("resolveToCwd: resolves absolute path unchanged", async () => {
  const { resolveToCwd } = await loadExtensionModule("extensions/permission-gate/index.ts");
  const cwd = "/some/project";
  assert.equal(resolveToCwd("/tmp/foo.txt", cwd), "/tmp/foo.txt");
});

test("resolveToCwd: resolves relative path against cwd", async () => {
  const { resolveToCwd } = await loadExtensionModule("extensions/permission-gate/index.ts");
  const cwd = "/some/project";
  assert.equal(resolveToCwd("foo.txt", cwd), "/some/project/foo.txt");
  assert.equal(resolveToCwd("a/b.txt", cwd), "/some/project/a/b.txt");
});

test("resolveToCwd: strips leading @ before resolving", async () => {
  const { resolveToCwd } = await loadExtensionModule("extensions/permission-gate/index.ts");
  const cwd = "/project";
  assert.equal(resolveToCwd("@.env", cwd), "/project/.env");
  assert.equal(resolveToCwd("@/tmp/.env", cwd), "/tmp/.env");
});

test("resolveToCwd: expands ~ and ~/", async () => {
  const { resolveToCwd } = await loadExtensionModule("extensions/permission-gate/index.ts");
  const home = os.homedir();
  const cwd = "/project";
  assert.equal(resolveToCwd("~", cwd), path.resolve(home));
  assert.equal(resolveToCwd("~/.env", cwd), path.join(home, ".env"));
  assert.equal(resolveToCwd("~/project/.env", cwd), path.join(home, "project/.env"));
});

test("resolveToCwd: resolves file:// URL (plain path)", async () => {
  const { resolveToCwd } = await loadExtensionModule("extensions/permission-gate/index.ts");
  const cwd = "/project";
  assert.equal(resolveToCwd("file:///tmp/safe.txt", cwd), "/tmp/safe.txt");
  assert.equal(resolveToCwd("file:///tmp/.env", cwd), "/tmp/.env");
});

test("resolveToCwd: resolves percent-encoded file:// URL", async () => {
  const { resolveToCwd } = await loadExtensionModule("extensions/permission-gate/index.ts");
  const cwd = "/project";
  // %2E decodes to "." so %2Eenv decodes to ".env"
  assert.equal(resolveToCwd("file:///tmp/%2Eenv", cwd), "/tmp/.env");
});

test("resolveToCwd: throws for non-local file:// host", async () => {
  const { resolveToCwd } = await loadExtensionModule("extensions/permission-gate/index.ts");
  assert.throws(() => resolveToCwd("file://notlocalhost/.env", "/project"), {
    name: "TypeError",
  });
});

test("resolveToCwd: normalises Unicode spaces in path", async () => {
  const { resolveToCwd } = await loadExtensionModule("extensions/permission-gate/index.ts");
  // U+00A0 is a non-breaking space, which Pi normalises to regular space
  const pathWithNBSP = "/tmp/my\u00A0file.txt";
  const result = resolveToCwd(pathWithNBSP, "/project");
  assert.equal(result, "/tmp/my file.txt");
});

// ---------------------------------------------------------------------------
// Gate: percent-encoded .env file URLs are blocked (write and edit)
// ---------------------------------------------------------------------------

test("permission-gate: percent-encoded .env file URL write is blocked without UI", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");
  assert.equal(typeof toolCallHandler, "function");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-pi-resolve-"));
  try {
    const envPath = path.join(tmpDir, ".env");
    writeFileSync(envPath, "ORIGINAL=1");

    // Construct a percent-encoded URL that decodes to .env
    const encodedUrl = pathToFileURL(envPath).href.replace(encodeURIComponent(".env"), "%2Eenv");

    const decision = await toolCallHandler(
      { toolName: "write", input: { path: encodedUrl, content: "HACKED=1" } },
      { hasUI: false, cwd: tmpDir },
    );

    assert.equal(decision?.block, true, "encoded .env URL write should be blocked");
    assert.match(decision.reason, /Protected path blocked/);
    // File must be unchanged — the gate blocked the write before the tool ran
    assert.equal(readFileSync(envPath, "utf-8"), "ORIGINAL=1");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("permission-gate: percent-encoded .env file URL edit is blocked without UI", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-pi-resolve-"));
  try {
    const envPath = path.join(tmpDir, ".env");
    writeFileSync(envPath, "ORIGINAL=1");

    const encodedUrl = pathToFileURL(envPath).href.replace(encodeURIComponent(".env"), "%2Eenv");

    const decision = await toolCallHandler(
      {
        toolName: "edit",
        input: { path: encodedUrl, edits: [{ oldText: "ORIGINAL=1", newText: "HACKED=1" }] },
      },
      { hasUI: false, cwd: tmpDir },
    );

    assert.equal(decision?.block, true, "encoded .env URL edit should be blocked");
    assert.match(decision.reason, /Protected path blocked/);
    assert.equal(readFileSync(envPath, "utf-8"), "ORIGINAL=1");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Gate: relative path with cwd inside node_modules or .git is protected
// ---------------------------------------------------------------------------

test("permission-gate: relative write to fixture.txt blocked when cwd is inside node_modules", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-pi-resolve-"));
  try {
    // Simulate cwd inside node_modules
    const cwdInsideNodeModules = path.join(tmpDir, "node_modules", "mylib");
    mkdirSync(cwdInsideNodeModules, { recursive: true });
    const fixturePath = path.join(cwdInsideNodeModules, "fixture.txt");
    writeFileSync(fixturePath, "ORIGINAL");

    const decision = await toolCallHandler(
      { toolName: "write", input: { path: "fixture.txt", content: "HACKED" } },
      { hasUI: false, cwd: cwdInsideNodeModules },
    );

    assert.equal(decision?.block, true, "relative write inside node_modules cwd should be blocked");
    assert.match(decision.reason, /Protected path blocked/);
    // Reason must show the resolved absolute path so the user understands why
    // the plain relative path is protected (Pi-resolved check, not lexical).
    assert.match(
      decision.reason,
      /resolves to/,
      "reason should include 'resolves to' for Pi-resolved-only protection",
    );
    assert.match(
      decision.reason,
      /node_modules/,
      "reason should include node_modules in resolved path",
    );
    assert.equal(readFileSync(fixturePath, "utf-8"), "ORIGINAL");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("permission-gate: relative edit to fixture.txt blocked when cwd is inside node_modules", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-pi-resolve-"));
  try {
    const cwdInsideNodeModules = path.join(tmpDir, "node_modules", "mylib");
    mkdirSync(cwdInsideNodeModules, { recursive: true });
    const fixturePath = path.join(cwdInsideNodeModules, "fixture.txt");
    writeFileSync(fixturePath, "ORIGINAL");

    const decision = await toolCallHandler(
      {
        toolName: "edit",
        input: {
          path: "fixture.txt",
          edits: [{ oldText: "ORIGINAL", newText: "HACKED" }],
        },
      },
      { hasUI: false, cwd: cwdInsideNodeModules },
    );

    assert.equal(decision?.block, true, "relative edit inside node_modules cwd should be blocked");
    assert.match(decision.reason, /Protected path blocked/);
    assert.equal(readFileSync(fixturePath, "utf-8"), "ORIGINAL");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("permission-gate: relative write to fixture.txt blocked when cwd is inside .git", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-pi-resolve-"));
  try {
    const cwdInsideGit = path.join(tmpDir, ".git", "hooks");
    mkdirSync(cwdInsideGit, { recursive: true });
    const fixturePath = path.join(cwdInsideGit, "fixture.txt");
    writeFileSync(fixturePath, "ORIGINAL");

    const decision = await toolCallHandler(
      { toolName: "write", input: { path: "fixture.txt", content: "HACKED" } },
      { hasUI: false, cwd: cwdInsideGit },
    );

    assert.equal(decision?.block, true, "relative write inside .git cwd should be blocked");
    assert.match(decision.reason, /Protected path blocked/);
    assert.equal(readFileSync(fixturePath, "utf-8"), "ORIGINAL");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Gate: tilde path to .env is protected
// ---------------------------------------------------------------------------

test("permission-gate: tilde path to .env file is protected", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  // ~/project/.env resolves to <home>/project/.env — basename is .env → protected
  const decision = await toolCallHandler(
    { toolName: "write", input: { path: "~/project/.env", content: "HACKED=1" } },
    { hasUI: false, cwd: "/some/project" },
  );

  assert.equal(decision?.block, true, "tilde .env path should be protected");
  assert.match(decision.reason, /Protected path blocked/);
});

// ---------------------------------------------------------------------------
// Gate: invalid file URL fails closed
// ---------------------------------------------------------------------------

test("permission-gate: non-local file URL host fails closed (write blocked without UI)", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const decision = await toolCallHandler(
    { toolName: "write", input: { path: "file://notlocalhost/.env", content: "HACKED=1" } },
    { hasUI: false, cwd: "/project" },
  );

  assert.equal(decision?.block, true, "non-local file URL should fail closed");
  assert.match(decision.reason, /Protected path blocked/);
});

test("permission-gate: non-local file URL host fails closed (edit blocked without UI)", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const decision = await toolCallHandler(
    {
      toolName: "edit",
      input: {
        path: "file://notlocalhost/.env",
        edits: [{ oldText: "a", newText: "b" }],
      },
    },
    { hasUI: false, cwd: "/project" },
  );

  assert.equal(decision?.block, true, "non-local file URL edit should fail closed");
  assert.match(decision.reason, /Protected path blocked/);
});

// ---------------------------------------------------------------------------
// Gate: controls — safe paths are allowed
// ---------------------------------------------------------------------------

test("permission-gate: ordinary file:// URL to non-protected file is allowed", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-pi-resolve-"));
  try {
    const safePath = path.join(tmpDir, "safe.txt");
    const fileUrl = pathToFileURL(safePath).href;

    const decision = await toolCallHandler(
      { toolName: "write", input: { path: fileUrl, content: "hello" } },
      { hasUI: false, cwd: tmpDir },
    );

    assert.equal(decision, undefined, "file:// URL to safe file should be allowed");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("permission-gate: relative write to safe file with normal cwd is allowed", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-pi-resolve-"));
  try {
    const decision = await toolCallHandler(
      { toolName: "write", input: { path: "output.txt", content: "hello" } },
      { hasUI: false, cwd: tmpDir },
    );

    assert.equal(decision, undefined, "relative write to safe file should be allowed");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("permission-gate: .env.example is allowed even with Pi-style resolution", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-pi-resolve-"));
  try {
    const examplePath = path.join(tmpDir, ".env.example");
    const fileUrl = pathToFileURL(examplePath).href;

    const decision = await toolCallHandler(
      { toolName: "write", input: { path: fileUrl, content: "KEY=" } },
      { hasUI: false, cwd: tmpDir },
    );

    assert.equal(decision, undefined, ".env.example file URL should be allowed");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// SDK integration: gate blocks → file unchanged; gate allows → SDK tool writes
// ---------------------------------------------------------------------------

test("permission-gate SDK integration: blocked write leaves file unchanged", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-sdk-integration-"));
  try {
    const envPath = path.join(tmpDir, ".env");
    writeFileSync(envPath, "ORIGINAL=1");

    // Percent-encoded .env URL — the gate must block it
    const encodedUrl = pathToFileURL(envPath).href.replace(encodeURIComponent(".env"), "%2Eenv");
    const gateDecision = await toolCallHandler(
      { toolName: "write", input: { path: encodedUrl, content: "HACKED=1" } },
      { hasUI: false, cwd: tmpDir },
    );

    assert.equal(gateDecision?.block, true, "gate must block the encoded .env write");
    // File unchanged because the gate intercepted the call; no SDK tool is run after a block.
    assert.equal(readFileSync(envPath, "utf-8"), "ORIGINAL=1");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("permission-gate SDK integration: allowed write reaches file via SDK tool", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-sdk-integration-"));
  try {
    const safePath = path.join(tmpDir, "output.txt");

    const gateDecision = await toolCallHandler(
      { toolName: "write", input: { path: "output.txt", content: "hello from sdk" } },
      { hasUI: false, cwd: tmpDir },
    );

    assert.equal(gateDecision, undefined, "gate should allow the safe write");

    // Gate allowed it — now call the real SDK write tool
    const writeTool = createWriteTool(tmpDir);
    await writeTool.execute(
      "sdk-test",
      { path: "output.txt", content: "hello from sdk" },
      undefined,
      undefined,
      {
        cwd: tmpDir,
      },
    );
    assert.equal(readFileSync(safePath, "utf-8"), "hello from sdk");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("permission-gate SDK integration: blocked edit leaves file unchanged", async () => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-sdk-integration-"));
  try {
    const envPath = path.join(tmpDir, ".env");
    writeFileSync(envPath, "ORIGINAL=1\n");

    const encodedUrl = pathToFileURL(envPath).href.replace(encodeURIComponent(".env"), "%2Eenv");

    const gateDecision = await toolCallHandler(
      {
        toolName: "edit",
        input: {
          path: encodedUrl,
          edits: [{ oldText: "ORIGINAL=1\n", newText: "HACKED=1\n" }],
        },
      },
      { hasUI: false, cwd: tmpDir },
    );

    assert.equal(gateDecision?.block, true, "gate must block the encoded .env edit");
    // File unchanged because the gate intercepted the call; no SDK tool is run after a block.
    assert.equal(readFileSync(envPath, "utf-8"), "ORIGINAL=1\n");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// SDK integration: gate allows → SDK edit tool actually edits the file
// ---------------------------------------------------------------------------

test("permission-gate SDK integration: allowed edit reaches file via SDK tool", async (t) => {
  const permissionGate = await loadExtension("extensions/permission-gate/index.ts");
  const { pi, handlers } = createPi();
  permissionGate(pi);
  const toolCallHandler = handlers.get("tool_call");

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pg-sdk-edit-allowed-"));
  try {
    const safePath = path.join(tmpDir, "notes.txt");
    writeFileSync(safePath, "original content\n");

    // Gate must allow a plain relative edit to a non-protected file
    const gateDecision = await toolCallHandler(
      {
        toolName: "edit",
        input: {
          path: "notes.txt",
          edits: [{ oldText: "original content\n", newText: "updated content\n" }],
        },
      },
      { hasUI: false, cwd: tmpDir },
    );

    assert.equal(gateDecision, undefined, "gate should allow the safe edit");

    // Gate allowed it — now call the real SDK edit tool and verify the change lands
    const editTool = createEditTool(tmpDir);
    await editTool.execute(
      "sdk-test",
      {
        path: "notes.txt",
        edits: [{ oldText: "original content\n", newText: "updated content\n" }],
      },
      undefined,
      undefined,
      { cwd: tmpDir },
    );
    assert.equal(readFileSync(safePath, "utf-8"), "updated content\n");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
