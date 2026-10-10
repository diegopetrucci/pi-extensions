/**
 * Guard behaviour tests for the Pi-mirroring path checks in four extensions.
 *
 * Verifies that file:// URLs, percent-encoded file URLs, and tilde paths
 * pointing outside the allowed root are blocked, while in-root reads are
 * allowed. Also covers BUG-006: the Librarian guard canonicalizes workspace
 * and cacheRoot so that symlinked workspace aliases work correctly.
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
} from "@earendil-works/pi-coding-agent";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function loadTestUtils(relativePath) {
  const url = pathToFileURL(path.join(repoRoot, relativePath)).href;
  const mod = await import(url);
  return mod.__test__;
}

// ---------------------------------------------------------------------------
// Shared: assertToolPathInsideCwd and guard factory hooks for
// code-reviewer, triage-comments, and agent-workflow-audit
// ---------------------------------------------------------------------------

const crUtils = await loadTestUtils("extensions/code-reviewer/index.ts");
const tcUtils = await loadTestUtils("extensions/triage-comments/index.ts");
const awaUtils = await loadTestUtils("extensions/agent-workflow-audit/index.ts");

const assertFns = {
  "code-reviewer": crUtils.assertToolPathInsideCwd,
  "triage-comments": tcUtils.assertToolPathInsideCwd,
  "agent-workflow-audit": awaUtils.assertToolPathInsideCwd,
};

/**
 * Creates a handlers map from a guard ExtensionFactory (same pattern as
 * the Librarian tests). Returns a Map of eventName -> handler.
 */
function createGuardHandlerMap(guardFactory) {
  const handlers = new Map();
  guardFactory({
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
  });
  return handlers;
}

const guardFactories = {
  "code-reviewer": (cwd) => crUtils.createCodeReviewerRuntimeGuardExtension({ cwd, maxTurns: 5 }),
  "triage-comments": (cwd) => tcUtils.createTriageRuntimeGuardExtension({ cwd, maxTurns: 5 }),
  "agent-workflow-audit": (cwd) =>
    awaUtils.createAuditRuntimeGuardExtension({ cwd, maxTurns: 5, planOnly: false }),
};

/**
 * Calls the tool_call hook via the guard factory and returns the hook result.
 */
async function callGuardHook(guardFactory, toolName, inputPath) {
  const handlers = createGuardHandlerMap(guardFactory);
  await handlers.get("turn_start")?.({ turnIndex: 0 });
  return handlers.get("tool_call")?.({ toolName, input: { path: inputPath } });
}

// ---------------------------------------------------------------------------
// file:/// URL to outside root is blocked
// ---------------------------------------------------------------------------

for (const [extName, assertFn] of Object.entries(assertFns)) {
  test(`${extName}: file:// URL pointing outside root is blocked`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-guard-`));
    const outside = mkdtempSync(path.join(os.tmpdir(), `${extName}-outside-`));
    t.after(() => {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    });
    writeFileSync(path.join(outside, "secret.txt"), "SECRET");

    const url = pathToFileURL(path.join(outside, "secret.txt")).href;
    const reason = await assertFn(root, url, "read");
    assert.ok(reason, `${extName}: file:// URL to outside must be blocked`);
  });
}

// ---------------------------------------------------------------------------
// Percent-encoded file URL to outside is blocked
// ---------------------------------------------------------------------------

for (const [extName, assertFn] of Object.entries(assertFns)) {
  test(`${extName}: percent-encoded file URL outside root is blocked`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-guard-`));
    const outside = mkdtempSync(path.join(os.tmpdir(), `${extName}-outside-`));
    t.after(() => {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    });
    writeFileSync(path.join(outside, ".env"), "SECRET=1");

    const encoded = pathToFileURL(path.join(outside, ".env")).href.replace(
      encodeURIComponent(".env"),
      "%2Eenv",
    );
    const reason = await assertFn(root, encoded, "read");
    assert.ok(reason, `${extName}: encoded file URL to outside must be blocked`);
  });
}

// ---------------------------------------------------------------------------
// Tilde path outside root is blocked
// ---------------------------------------------------------------------------

for (const [extName, assertFn] of Object.entries(assertFns)) {
  test(`${extName}: tilde path outside root is blocked`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-guard-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));

    // ~/.<something> resolves to the home directory — outside any temp root
    const reason = await assertFn(root, "~/.zshrc", "read");
    assert.ok(reason, `${extName}: tilde path outside root must be blocked`);
  });
}

// ---------------------------------------------------------------------------
// Controls: in-root paths are allowed
// ---------------------------------------------------------------------------

for (const [extName, assertFn] of Object.entries(assertFns)) {
  test(`${extName}: relative in-root read is allowed`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-guard-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(path.join(root, "readme.txt"), "ok");

    const reason = await assertFn(root, "readme.txt", "read");
    assert.equal(reason, undefined, `${extName}: relative in-root read must be allowed`);
  });

  test(`${extName}: absolute in-root read is allowed`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-guard-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(path.join(root, "readme.txt"), "ok");

    const reason = await assertFn(root, path.join(root, "readme.txt"), "read");
    assert.equal(reason, undefined, `${extName}: absolute in-root read must be allowed`);
  });

  // Note: file:// URLs to in-root files are handled by the Pi-effective check.
  // The legacy resolveToolPath (restored to origin/main) treats them as relative
  // strings, producing ${root}/file://... paths that may fail isInside on macOS
  // (where /var resolves to /private/var). Relative and absolute in-root reads
  // remain the correct controls.
}

// ---------------------------------------------------------------------------
// SDK integration: gate blocks → read tool does not return outside content
// ---------------------------------------------------------------------------

for (const [extName, assertFn] of Object.entries(assertFns)) {
  test(`${extName}: gate blocks outside read; SDK read succeeds when gate allows`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-sdk-`));
    const outside = mkdtempSync(path.join(os.tmpdir(), `${extName}-sdk-outside-`));
    t.after(() => {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    });
    writeFileSync(path.join(outside, "secret.txt"), "OUTSIDE_CONTENT");
    writeFileSync(path.join(root, "safe.txt"), "INSIDE_CONTENT");

    // Outside file URL: gate must block
    const outsideUrl = pathToFileURL(path.join(outside, "secret.txt")).href;
    const blockReason = await assertFn(root, outsideUrl, "read");
    assert.ok(blockReason, `${extName}: file:// URL to outside must be blocked`);

    // Inside file: gate must allow
    const insideReason = await assertFn(root, "safe.txt", "read");
    assert.equal(insideReason, undefined, `${extName}: in-root read must be allowed`);

    // Verify SDK read tool reads the inside file when gate allows
    const readTool = createReadTool(root);
    const result = await readTool.execute("sdk-test", { path: "safe.txt" }, undefined, undefined, {
      cwd: root,
    });
    assert.ok(
      JSON.stringify(result).includes("INSIDE_CONTENT"),
      `${extName}: SDK read must return inside content when gate allows`,
    );
  });
}

// ---------------------------------------------------------------------------
// Librarian guard: file:// URL, encoded URL, tilde outside workspace blocked
// ---------------------------------------------------------------------------

async function loadLibrarianGuard() {
  const mod = await loadTestUtils("extensions/librarian/index.ts");
  return mod.createLibrarianRuntimeGuardExtension;
}

function createLibrarianHandlers(factory) {
  const handlers = new Map();
  factory({
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
  });
  return handlers;
}

test("librarian: file:// URL outside workspace is blocked", async (t) => {
  const createGuard = await loadLibrarianGuard();
  const workspace = mkdtempSync(path.join(os.tmpdir(), "lib-guard-ws-"));
  const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "lib-guard-cache-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "lib-guard-outside-"));
  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(cacheRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(path.join(outside, "secret.txt"), "SECRET");

  const handlers = createLibrarianHandlers(
    createGuard({ maxTurns: 5, workspace, cacheRoot, cacheEnabled: false }),
  );
  await handlers.get("turn_start")({ turnIndex: 0 });
  const outsideUrl = pathToFileURL(path.join(outside, "secret.txt")).href;
  const result = await handlers.get("tool_call")({
    toolName: "read",
    input: { path: outsideUrl },
  });
  assert.equal(result?.block, true, "librarian: file:// URL to outside must be blocked");
});

test("librarian: percent-encoded file URL outside workspace is blocked", async (t) => {
  const createGuard = await loadLibrarianGuard();
  const workspace = mkdtempSync(path.join(os.tmpdir(), "lib-guard-ws-"));
  const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "lib-guard-cache-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "lib-guard-outside-"));
  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(cacheRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(path.join(outside, ".env"), "SECRET=1");

  const handlers = createLibrarianHandlers(
    createGuard({ maxTurns: 5, workspace, cacheRoot, cacheEnabled: false }),
  );
  await handlers.get("turn_start")({ turnIndex: 0 });
  const encoded = pathToFileURL(path.join(outside, ".env")).href.replace(
    encodeURIComponent(".env"),
    "%2Eenv",
  );
  const result = await handlers.get("tool_call")({ toolName: "read", input: { path: encoded } });
  assert.equal(result?.block, true, "librarian: encoded file URL to outside must be blocked");
});

test("librarian: tilde path outside workspace is blocked", async (t) => {
  const createGuard = await loadLibrarianGuard();
  const workspace = mkdtempSync(path.join(os.tmpdir(), "lib-guard-ws-"));
  const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "lib-guard-cache-"));
  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  const handlers = createLibrarianHandlers(
    createGuard({ maxTurns: 5, workspace, cacheRoot, cacheEnabled: false }),
  );
  await handlers.get("turn_start")({ turnIndex: 0 });
  const result = await handlers.get("tool_call")({
    toolName: "read",
    input: { path: "~/.zshrc" },
  });
  assert.equal(result?.block, true, "librarian: tilde path outside workspace must be blocked");
});

test("librarian: in-workspace read is allowed", async (t) => {
  const createGuard = await loadLibrarianGuard();
  const workspace = mkdtempSync(path.join(os.tmpdir(), "lib-guard-ws-"));
  const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "lib-guard-cache-"));
  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(cacheRoot, { recursive: true, force: true });
  });
  writeFileSync(path.join(workspace, "evidence.md"), "ok");

  const handlers = createLibrarianHandlers(
    createGuard({ maxTurns: 5, workspace, cacheRoot, cacheEnabled: false }),
  );
  await handlers.get("turn_start")({ turnIndex: 0 });
  const result = await handlers.get("tool_call")({
    toolName: "read",
    input: { path: path.join(workspace, "evidence.md") },
  });
  assert.equal(result, undefined, "librarian: canonical in-workspace read must be allowed");
});

// ---------------------------------------------------------------------------
// BUG-006: Librarian allows reads when workspace is given via a symlinked alias
// ---------------------------------------------------------------------------

test("librarian BUG-006: relative in-workspace read allowed when workspace is a symlink", async (t) => {
  const createGuard = await loadLibrarianGuard();
  const realWorkspace = mkdtempSync(path.join(os.tmpdir(), "lib-real-ws-"));
  const symlinkWorkspace = path.join(os.tmpdir(), `lib-sym-ws-${Date.now()}`);
  const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "lib-guard-cache-"));
  t.after(() => {
    rmSync(realWorkspace, { recursive: true, force: true });
    try {
      rmSync(symlinkWorkspace, { force: true });
    } catch {}
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  writeFileSync(path.join(realWorkspace, "evidence.md"), "inside");
  symlinkSync(realWorkspace, symlinkWorkspace);

  // Guard is created with the symlinked path as workspace
  const handlers = createLibrarianHandlers(
    createGuard({ maxTurns: 5, workspace: symlinkWorkspace, cacheRoot, cacheEnabled: false }),
  );
  await handlers.get("turn_start")({ turnIndex: 0 });

  // Absolute read via the canonical (real) path must be allowed
  const result = await handlers.get("tool_call")({
    toolName: "read",
    input: { path: path.join(realWorkspace, "evidence.md") },
  });
  assert.equal(
    result,
    undefined,
    "canonical absolute in-workspace read via symlinked guard must be allowed",
  );
});

test("librarian BUG-006: symlink escaping workspace is still blocked", async (t) => {
  const createGuard = await loadLibrarianGuard();
  const workspace = mkdtempSync(path.join(os.tmpdir(), "lib-guard-ws-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "lib-guard-outside-"));
  const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "lib-guard-cache-"));
  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    rmSync(cacheRoot, { recursive: true, force: true });
  });
  writeFileSync(path.join(outside, "secret.txt"), "SECRET");
  symlinkSync(path.join(outside, "secret.txt"), path.join(workspace, "escape"));

  const handlers = createLibrarianHandlers(
    createGuard({ maxTurns: 5, workspace, cacheRoot, cacheEnabled: false }),
  );
  await handlers.get("turn_start")({ turnIndex: 0 });
  const result = await handlers.get("tool_call")({
    toolName: "read",
    input: { path: path.join(workspace, "escape") },
  });
  assert.equal(result?.block, true, "symlink escaping workspace must be blocked");
});

test("librarian BUG-006: read allowed from cache root when cache is enabled", async (t) => {
  const createGuard = await loadLibrarianGuard();
  const workspace = mkdtempSync(path.join(os.tmpdir(), "lib-guard-ws-"));
  const realCacheRoot = mkdtempSync(path.join(os.tmpdir(), "lib-real-cache-"));
  const symlinkCache = path.join(os.tmpdir(), `lib-sym-cache-${Date.now()}`);
  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(realCacheRoot, { recursive: true, force: true });
    try {
      rmSync(symlinkCache, { force: true });
    } catch {}
  });
  writeFileSync(path.join(realCacheRoot, "cached.md"), "cached content");
  symlinkSync(realCacheRoot, symlinkCache);

  // Guard created with symlinked cache root
  const handlers = createLibrarianHandlers(
    createGuard({ maxTurns: 5, workspace, cacheRoot: symlinkCache, cacheEnabled: true }),
  );
  await handlers.get("turn_start")({ turnIndex: 0 });

  // Read via real cache root path must be allowed
  const result = await handlers.get("tool_call")({
    toolName: "read",
    input: { path: path.join(realCacheRoot, "cached.md") },
  });
  assert.equal(
    result,
    undefined,
    "canonical in-cache read via symlinked cache guard must be allowed",
  );
});

// ---------------------------------------------------------------------------
// SDK integration: Librarian guard blocks → read tool does not serve outside content
// ---------------------------------------------------------------------------

test("librarian: gate blocks outside read; SDK read succeeds when gate allows", async (t) => {
  const createGuard = await loadLibrarianGuard();
  const workspace = mkdtempSync(path.join(os.tmpdir(), "lib-sdk-ws-"));
  const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "lib-sdk-cache-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "lib-sdk-outside-"));
  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(cacheRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(path.join(outside, "secret.txt"), "OUTSIDE_CONTENT");
  writeFileSync(path.join(workspace, "evidence.md"), "INSIDE_CONTENT");

  const handlers = createLibrarianHandlers(
    createGuard({ maxTurns: 5, workspace, cacheRoot, cacheEnabled: false }),
  );
  await handlers.get("turn_start")({ turnIndex: 0 });

  // Outside file URL: gate must block
  const outsideUrl = pathToFileURL(path.join(outside, "secret.txt")).href;
  const blockResult = await handlers.get("tool_call")({
    toolName: "read",
    input: { path: outsideUrl },
  });
  assert.equal(blockResult?.block, true, "librarian: outside file URL must be blocked");

  // Inside file: gate must allow, and SDK read tool returns inside content
  const allowResult = await handlers.get("tool_call")({
    toolName: "read",
    input: { path: path.join(workspace, "evidence.md") },
  });
  assert.equal(allowResult, undefined, "librarian: in-workspace read must be allowed");

  const readTool = createReadTool(workspace);
  const sdkResult = await readTool.execute(
    "sdk-test",
    { path: path.join(workspace, "evidence.md") },
    undefined,
    undefined,
    { cwd: workspace },
  );
  assert.ok(
    JSON.stringify(sdkResult).includes("INSIDE_CONTENT"),
    "SDK read must return inside content when librarian gate allows",
  );
});

// ---------------------------------------------------------------------------
// Hook-based guard factory tests: file://, encoded URL, tilde blocked
// (drives the registered tool_call hook, not assertToolPathInsideCwd directly)
// ---------------------------------------------------------------------------

for (const [extName, makeFactory] of Object.entries(guardFactories)) {
  test(`${extName} hook: file:// URL outside root is blocked`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-hook-`));
    const outside = mkdtempSync(path.join(os.tmpdir(), `${extName}-hook-out-`));
    t.after(() => {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    });
    writeFileSync(path.join(outside, "secret.txt"), "SECRET");
    const url = pathToFileURL(path.join(outside, "secret.txt")).href;
    const result = await callGuardHook(makeFactory(root), "read", url);
    assert.equal(result?.block, true, `${extName} hook: file:// URL to outside must be blocked`);
  });

  test(`${extName} hook: tilde path outside root is blocked`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-hook-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const result = await callGuardHook(makeFactory(root), "read", "~/.zshrc");
    assert.equal(result?.block, true, `${extName} hook: tilde path outside root must be blocked`);
  });

  test(`${extName} hook: relative in-root read is allowed; SDK read returns inside content`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-hook-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(path.join(root, "safe.txt"), "INSIDE_CONTENT");
    const result = await callGuardHook(makeFactory(root), "read", "safe.txt");
    assert.equal(result, undefined, `${extName} hook: in-root relative read must be allowed`);
    // When allowed, SDK tool must not return outside sentinel content
    const readTool = createReadTool(root);
    const sdkResult = await readTool.execute(
      "sdk-test",
      { path: "safe.txt" },
      undefined,
      undefined,
      { cwd: root },
    );
    assert.ok(
      JSON.stringify(sdkResult).includes("INSIDE_CONTENT"),
      `${extName}: SDK read must return inside content`,
    );
  });

  test(`${extName} hook: canonical absolute in-root read is allowed`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-hook-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(path.join(root, "safe.txt"), "ok");
    const absPath = path.join(root, "safe.txt");
    const result = await callGuardHook(makeFactory(root), "read", absPath);
    assert.equal(
      result,
      undefined,
      `${extName} hook: canonical absolute in-root read must be allowed`,
    );
  });
}

// ---------------------------------------------------------------------------
// Grep / find / ls: outside paths blocked via hook
// ---------------------------------------------------------------------------

for (const [extName, makeFactory] of Object.entries(guardFactories)) {
  for (const toolName of ["grep", "find", "ls"]) {
    test(`${extName} hook: ${toolName} with file:// URL outside root is blocked`, async (t) => {
      const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-${toolName}-hook-`));
      const outside = mkdtempSync(path.join(os.tmpdir(), `${extName}-${toolName}-out-`));
      t.after(() => {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      });
      const url = pathToFileURL(outside).href;
      const result = await callGuardHook(makeFactory(root), toolName, url);
      assert.equal(
        result?.block,
        true,
        `${extName}: ${toolName} file:// URL outside must be blocked`,
      );
    });

    test(`${extName} hook: ${toolName} with tilde path outside root is blocked`, async (t) => {
      const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-${toolName}-hook-`));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const result = await callGuardHook(makeFactory(root), toolName, "~/");
      assert.equal(
        result?.block,
        true,
        `${extName}: ${toolName} tilde path outside must be blocked`,
      );
    });

    test(`${extName} hook: ${toolName} with in-root path is allowed; SDK tool runs safely`, async (t) => {
      const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-${toolName}-hook-`));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      writeFileSync(path.join(root, "safe.txt"), "INSIDE_CONTENT");
      const result = await callGuardHook(makeFactory(root), toolName, root);
      assert.equal(result, undefined, `${extName}: ${toolName} in-root path must be allowed`);
      // Gate allowed — SDK tool must succeed and must not return outside sentinel content.
      let sdkTool;
      let sdkInput;
      if (toolName === "grep") {
        sdkTool = createGrepTool(root);
        sdkInput = { path: root, pattern: "INSIDE" };
      } else if (toolName === "find") {
        sdkTool = createFindTool(root);
        sdkInput = { path: root, pattern: "*.txt" };
      } else {
        sdkTool = createLsTool(root);
        sdkInput = { path: root };
      }
      const sdkResult = await sdkTool.execute("sdk-test", sdkInput, undefined, undefined, {
        cwd: root,
      });
      assert.ok(
        !JSON.stringify(sdkResult).includes("SECRET"),
        `${extName}: SDK ${toolName} must not return outside sentinel`,
      );
    });
  }
}

// ---------------------------------------------------------------------------
// P1 read-variant bypass: curly-quote symlink reproduction
// ---------------------------------------------------------------------------

test("curly-quote variant: escape symlink blocked when path resolves via curly-quote fallback", async (t) => {
  // Attack: filesystem file has curly quote (U+2019) in name, symlinks outside.
  // Pi's read tool falls back to tryCurlyQuoteVariant when the straight-quote
  // path is missing. The guard must check ALL variants.
  const root = mkdtempSync(path.join(os.tmpdir(), "curly-guard-root-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "curly-guard-outside-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(path.join(outside, "secret.txt"), "OUTSIDE_SECRET");
  // Symlink with curly quote in name → outside
  const curlyName = "capture\u2019ecran.txt"; // U+2019 right single quotation mark
  symlinkSync(path.join(outside, "secret.txt"), path.join(root, curlyName));

  // Attacker provides straight-quote path (U+0027); missing file
  const straightPath = "capture'ecran.txt"; // U+0027 apostrophe

  for (const [extName, assertFn] of Object.entries(assertFns)) {
    const reason = await assertFn(root, straightPath, "read");
    assert.ok(reason, `${extName}: curly-quote variant escape symlink must be blocked`);
  }
});

// ---------------------------------------------------------------------------
// Deliberate policy regression: safe primary + escaping curly variant => blocked
// ---------------------------------------------------------------------------

test("deliberate policy: safe primary file + escaping curly-quote variant => blocked (all candidates checked)", async (t) => {
  // The guard checks ALL read-path candidates regardless of existence.
  // Even when the straight-quote primary file exists safely inside root,
  // if the curly-quote variant is a symlink that escapes outside, the read
  // must still be blocked — the guard does not short-circuit on the primary.
  const root = mkdtempSync(path.join(os.tmpdir(), "curly-policy-root-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "curly-policy-outside-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(path.join(outside, "secret.txt"), "OUTSIDE_SECRET");
  // Primary (straight-quote) file exists safely inside root
  const straightName = "capture'ecran.txt"; // U+0027 apostrophe
  writeFileSync(path.join(root, straightName), "SAFE_CONTENT");
  // Curly-quote variant symlinks outside
  const curlyName = "capture\u2019ecran.txt"; // U+2019 right single quotation mark
  symlinkSync(path.join(outside, "secret.txt"), path.join(root, curlyName));

  for (const [extName, assertFn] of Object.entries(assertFns)) {
    const reason = await assertFn(root, straightName, "read");
    assert.ok(
      reason,
      `${extName}: must be blocked because curly-quote variant escapes outside (all candidates checked)`,
    );
  }
});

// ---------------------------------------------------------------------------
// P1 read-variant bypass: NFD variant symlink reproduction
// ---------------------------------------------------------------------------

test("NFD variant: escape symlink blocked when path resolves via NFD fallback", async (t) => {
  // Attack: filesystem file has NFD-encoded name, symlinks outside.
  // Pi's read tool falls back to tryNFDVariant when the NFC path is missing.
  const root = mkdtempSync(path.join(os.tmpdir(), "nfd-guard-root-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "nfd-guard-outside-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(path.join(outside, "secret.txt"), "OUTSIDE_SECRET");
  // NFD filename: café.txt with e + combining acute (U+0301)
  const nfdName = "caf\u00E9.txt".normalize("NFD"); // NFD: cafe + combining acute
  symlinkSync(path.join(outside, "secret.txt"), path.join(root, nfdName));

  // Attacker provides NFC path (precomposed é); NFD file exists as escape
  const nfcPath = "caf\u00E9.txt"; // NFC

  for (const [extName, assertFn] of Object.entries(assertFns)) {
    const reason = await assertFn(root, nfcPath, "read");
    assert.ok(reason, `${extName}: NFD variant escape symlink must be blocked`);
  }
});

// ---------------------------------------------------------------------------
// P2 monotonicity: legacy-monotonicity reproduction
// ---------------------------------------------------------------------------

test("legacy-monotonicity: file:// URL to outside path is blocked (Pi-effective check catches it)", async (t) => {
  // Demonstrates the monotonic two-check design: the original legacy
  // resolveToolPath does not parse file:// URLs (produces ${root}/file://...
  // which may lexically pass isInside on Linux where root has no symlinks).
  // The Pi-effective check catches the actual outside path in all cases.
  const root = mkdtempSync(path.join(os.tmpdir(), "mono-root-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "mono-outside-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(path.join(outside, "secret.txt"), "OUTSIDE_SECRET");
  const outsideUrl = pathToFileURL(path.join(outside, "secret.txt")).href;

  for (const [extName, assertFn] of Object.entries(assertFns)) {
    const reason = await assertFn(root, outsideUrl, "read");
    assert.ok(reason, `${extName}: file:// URL to outside must be blocked (monotonicity)`);
  }
});

// ---------------------------------------------------------------------------
// In-root read through symlinked-alias workspace (three non-librarian guards)
// ---------------------------------------------------------------------------

for (const [extName, makeFactory] of Object.entries(guardFactories)) {
  test(`${extName}: relative in-root read through symlinked-alias workspace is allowed`, async (t) => {
    const realRoot = mkdtempSync(path.join(os.tmpdir(), `${extName}-real-root-`));
    const symlinkRoot = path.join(os.tmpdir(), `${extName}-sym-root-${Date.now()}`);
    t.after(() => {
      rmSync(realRoot, { recursive: true, force: true });
      try {
        rmSync(symlinkRoot, { force: true });
      } catch {}
    });
    writeFileSync(path.join(realRoot, "readme.txt"), "INSIDE_CONTENT");
    symlinkSync(realRoot, symlinkRoot);

    // Guard uses the symlinked alias as its cwd
    const result = await callGuardHook(makeFactory(symlinkRoot), "read", "readme.txt");
    assert.equal(
      result,
      undefined,
      `${extName}: relative in-root read via symlink alias must be allowed`,
    );
  });

  test(`${extName}: missing relative target through alias workspace is allowed`, async (t) => {
    const realRoot = mkdtempSync(path.join(os.tmpdir(), `${extName}-real-root-`));
    const symlinkRoot = path.join(os.tmpdir(), `${extName}-sym-root-${Date.now()}`);
    t.after(() => {
      rmSync(realRoot, { recursive: true, force: true });
      try {
        rmSync(symlinkRoot, { force: true });
      } catch {}
    });
    symlinkSync(realRoot, symlinkRoot);

    // Missing file resolves lexically inside the alias root; must be allowed
    const result = await callGuardHook(makeFactory(symlinkRoot), "read", "nonexistent.txt");
    assert.equal(
      result,
      undefined,
      `${extName}: missing in-root target through alias must be allowed`,
    );
  });
}

// ---------------------------------------------------------------------------
// Escaping symlink: in-root symlink pointing outside is blocked
// ---------------------------------------------------------------------------

for (const [extName, assertFn] of Object.entries(assertFns)) {
  test(`${extName}: escaping symlink inside root is blocked`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), `${extName}-escape-`));
    const outside = mkdtempSync(path.join(os.tmpdir(), `${extName}-escape-out-`));
    t.after(() => {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    });
    writeFileSync(path.join(outside, "secret.txt"), "OUTSIDE_SECRET");
    symlinkSync(path.join(outside, "secret.txt"), path.join(root, "escape-link"));

    const reason = await assertFn(root, "escape-link", "read");
    assert.ok(reason, `${extName}: in-root symlink escaping outside must be blocked`);
  });
}

// ---------------------------------------------------------------------------
// Librarian: missing in-root target through alias workspace is allowed (Fix 3)
// ---------------------------------------------------------------------------

test("librarian BUG-006: missing relative target through alias workspace is allowed", async (t) => {
  const createGuard = await loadLibrarianGuard();
  const realWorkspace = mkdtempSync(path.join(os.tmpdir(), "lib-missing-ws-"));
  const symlinkWorkspace = path.join(os.tmpdir(), `lib-missing-sym-${Date.now()}`);
  const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "lib-missing-cache-"));
  t.after(() => {
    rmSync(realWorkspace, { recursive: true, force: true });
    rmSync(cacheRoot, { recursive: true, force: true });
    try {
      rmSync(symlinkWorkspace, { force: true });
    } catch {}
  });
  symlinkSync(realWorkspace, symlinkWorkspace);

  const handlers = createLibrarianHandlers(
    createGuard({ maxTurns: 5, workspace: symlinkWorkspace, cacheRoot, cacheEnabled: false }),
  );
  await handlers.get("turn_start")({ turnIndex: 0 });

  // Missing file: resolves lexically inside alias workspace → must be allowed
  const result = await handlers.get("tool_call")({
    toolName: "read",
    input: { path: path.join(symlinkWorkspace, "nonexistent.txt") },
  });
  assert.equal(
    result,
    undefined,
    "librarian: missing in-root target through alias workspace must be allowed",
  );
});
