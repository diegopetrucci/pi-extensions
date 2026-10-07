/**
 * End-to-end integration test: MCP servers connect inside SDK subagent sessions.
 *
 * Each of the four SDK-session extensions (code-reviewer, librarian, triage-comments,
 * agent-workflow-audit) is loaded via ts.transpileModule, exactly as
 * code-reviewer-runtime.test.mjs does.  The real helpers exported through __test__ are
 * used for every scenario.
 *
 * Scenarios:
 *   A. resolveSubagentProjectTrusted unit tests (all 4 extensions)
 *   B. trust integration (one extension end-to-end):
 *        host untrusted  → project mcp server NOT spawned; global server connects
 *        host trusted + same cwd → project server connects
 *        host trusted + different cwd → project server NOT spawned
 *        older-host stub (no isProjectTrusted) → project server NOT spawned
 *   C. direct-exposure per extension (MCP tool active + dangerous tools absent + server exits)
 *   D. deferred-exposure per extension: tool_search active; real tool_search.execute()
 *      loads the deferred mcp__ tool (no model required)
 *   E. absent-factories fallback (session builds cleanly; zero MCP tools)
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import { realpathSync } from "node:fs";
import test from "node:test";

import ts from "typescript";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureServerPath = path.join(repoRoot, "test/fixtures/mcp-fixture-server.mjs");

// ---------------------------------------------------------------------------
// Extension loader (ts.transpileModule → temp .mjs, dynamic import)
// ---------------------------------------------------------------------------

const moduleCache = new Map();
const compiledDirs = [];

async function loadExtension(relativeSource) {
  if (moduleCache.has(relativeSource)) return moduleCache.get(relativeSource);
  const sourcePath = path.resolve(repoRoot, relativeSource);
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = await mkdtemp(path.join(repoRoot, "test/.tmp-sdk-mcp-"));
  compiledDirs.push(dir);
  const mjs = path.join(dir, "index.mjs");
  await writeFile(mjs, compiled, "utf8");
  const mod = await import(pathToFileURL(mjs).href);
  moduleCache.set(relativeSource, mod);
  return mod;
}

test.after(async () => {
  for (const dir of compiledDirs) await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Extension table
// ---------------------------------------------------------------------------

const EXTENSIONS = [
  {
    label: "code-reviewer",
    source: "extensions/code-reviewer/index.ts",
    makeGuard: (mod, cwd) =>
      mod.__test__.createCodeReviewerRuntimeGuardExtension({ cwd, maxTurns: 5 }),
    baseTools: ["read", "grep", "find", "ls", "bash"],
  },
  {
    label: "librarian",
    source: "extensions/librarian/index.ts",
    makeGuard: (mod, cwd) =>
      mod.__test__.createLibrarianRuntimeGuardExtension({
        maxTurns: 5,
        workspace: cwd,
        cacheRoot: cwd,
        cacheEnabled: false,
      }),
    baseTools: ["read", "bash"],
  },
  {
    label: "triage-comments",
    source: "extensions/triage-comments/index.ts",
    makeGuard: (mod, cwd) => mod.__test__.createTriageRuntimeGuardExtension({ cwd, maxTurns: 5 }),
    baseTools: ["read", "grep", "find", "ls", "bash"],
  },
  {
    label: "agent-workflow-audit",
    source: "extensions/agent-workflow-audit/index.ts",
    makeGuard: (mod, cwd) =>
      mod.__test__.createAuditRuntimeGuardExtension({ cwd, maxTurns: 5, planOnly: false }),
    baseTools: ["read", "grep", "find", "ls", "bash"],
  },
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function setEnv(t, key, value) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });
}

async function waitUntil(predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return predicate();
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPidFile(pidFile) {
  try {
    const { readFileSync } = await import("node:fs");
    return Number(readFileSync(pidFile, "utf8").trim());
  } catch {
    return undefined;
  }
}

/**
 * Build a DefaultResourceLoader using the extension's real guard + MCP factories.
 * `projectTrusted` is passed to SettingsManager.inMemory.
 */
async function makeSession(mod, { cwd, agentDir, projectTrusted, guardFactory, tools }) {
  const { createMcpSubagentFactories } = mod.__test__;
  const settingsManager = SettingsManager.inMemory({}, { projectTrusted });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [guardFactory, ...createMcpSubagentFactories()],
    systemPromptOverride: () => "Test subagent.",
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await resourceLoader.reload();
  const created = await createAgentSession({
    cwd,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    tools,
  });
  await created.session.bindExtensions({ mode: "json" });
  return created.session;
}

// ============================================================================
// A. resolveSubagentProjectTrusted — unit tests (all 4 extensions)
// ============================================================================

for (const ext of EXTENSIONS) {
  test(`${ext.label}: resolveSubagentProjectTrusted — fails closed when host untrusted`, async () => {
    const mod = await loadExtension(ext.source);
    const { resolveSubagentProjectTrusted } = mod.__test__;
    const cwd = os.tmpdir();
    const ctx = { cwd, isProjectTrusted: () => false };
    assert.equal(resolveSubagentProjectTrusted(ctx, cwd), false, "untrusted host → false");
  });

  test(`${ext.label}: resolveSubagentProjectTrusted — true when trusted and same cwd`, async () => {
    const mod = await loadExtension(ext.source);
    const { resolveSubagentProjectTrusted } = mod.__test__;
    const cwd = realpathSync(os.tmpdir());
    const ctx = { cwd, isProjectTrusted: () => true };
    assert.equal(resolveSubagentProjectTrusted(ctx, cwd), true, "trusted + same cwd → true");
  });

  test(`${ext.label}: resolveSubagentProjectTrusted — false when trusted but different cwd`, async () => {
    const mod = await loadExtension(ext.source);
    const { resolveSubagentProjectTrusted } = mod.__test__;
    const hostCwd = realpathSync(os.tmpdir());
    const subagentCwd = repoRoot; // definitely different
    const ctx = { cwd: hostCwd, isProjectTrusted: () => true };
    assert.equal(
      resolveSubagentProjectTrusted(ctx, subagentCwd),
      false,
      "trusted + different cwd → false",
    );
  });

  test(`${ext.label}: resolveSubagentProjectTrusted — fails closed on older host (no isProjectTrusted)`, async () => {
    const mod = await loadExtension(ext.source);
    const { resolveSubagentProjectTrusted } = mod.__test__;
    const cwd = realpathSync(os.tmpdir());
    const stubCtx = { cwd }; // no isProjectTrusted method
    assert.equal(resolveSubagentProjectTrusted(stubCtx, cwd), false, "older host stub → false");
  });
}

// ============================================================================
// B. Trust integration (code-reviewer as representative extension)
//    Global agentDir/mcp.json  → global server
//    Project cwd/.pi/mcp.json  → project server
// ============================================================================

async function makeTrustFixture(root) {
  const agentDir = path.join(root, "agent");
  const projectDir = path.join(root, "project");
  const piDir = path.join(projectDir, ".pi");
  const globalPidFile = path.join(root, "global.pid");
  const projectPidFile = path.join(root, "project.pid");

  await Promise.all([mkdir(agentDir, { recursive: true }), mkdir(piDir, { recursive: true })]);

  // Global mcp.json (in agentDir)
  await writeFile(
    path.join(agentDir, "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          global_fixture: {
            command: "node",
            args: [fixtureServerPath],
            exposure: "direct",
            env: { MCP_FIXTURE_PID_FILE: globalPidFile },
          },
        },
      },
      null,
      2,
    ),
  );

  // Project mcp.json (in projectDir/.pi/)
  await writeFile(
    path.join(piDir, "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          project_fixture: {
            command: "node",
            args: [fixtureServerPath],
            exposure: "direct",
            env: { MCP_FIXTURE_PID_FILE: projectPidFile },
          },
        },
      },
      null,
      2,
    ),
  );

  return { agentDir, projectDir, globalPidFile, projectPidFile };
}

test("trust integration: host untrusted → global server connects, project server NOT spawned", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sdk-mcp-trust-untrusted-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const { agentDir, projectDir, globalPidFile, projectPidFile } = await makeTrustFixture(root);
  setEnv(t, "PI_CODING_AGENT_DIR", agentDir);

  const mod = await loadExtension("extensions/code-reviewer/index.ts");
  const { SUBAGENT_MCP_TOOLS, disposeSubagentSession, createCodeReviewerRuntimeGuardExtension } =
    mod.__test__;

  const session = await makeSession(mod, {
    cwd: projectDir,
    agentDir,
    projectTrusted: false, // host is NOT trusted
    guardFactory: createCodeReviewerRuntimeGuardExtension({ cwd: projectDir, maxTurns: 5 }),
    tools: ["read", ...SUBAGENT_MCP_TOOLS],
  });

  // Global server must connect.
  const globalConnected = await waitUntil(() =>
    session.getActiveToolNames().includes("mcp__global_fixture__fixture_tool"),
  );
  assert.ok(globalConnected, "global mcp server must connect when host is untrusted");

  // Project server must NOT be spawned.
  // Wait briefly to allow any spurious spawn (it should not happen).
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(
    existsSync(projectPidFile),
    false,
    "project mcp server must NOT be spawned when host is untrusted",
  );
  assert.equal(
    session.getActiveToolNames().includes("mcp__project_fixture__fixture_tool"),
    false,
    "project mcp tool must not be active when host is untrusted",
  );

  await disposeSubagentSession(session);

  // Global server must have been killed.
  await waitUntil(() => existsSync(globalPidFile));
  const globalPid = await readPidFile(globalPidFile);
  if (globalPid) {
    const killed = await waitUntil(() => !isAlive(globalPid), { timeoutMs: 4000 });
    assert.ok(killed, "global mcp server must exit after session shutdown");
  }
});

test("trust integration: host trusted + same cwd → project server connects", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sdk-mcp-trust-trusted-same-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const { agentDir, projectDir, globalPidFile, projectPidFile } = await makeTrustFixture(root);
  setEnv(t, "PI_CODING_AGENT_DIR", agentDir);

  const mod = await loadExtension("extensions/code-reviewer/index.ts");
  const { SUBAGENT_MCP_TOOLS, disposeSubagentSession, createCodeReviewerRuntimeGuardExtension } =
    mod.__test__;

  const session = await makeSession(mod, {
    cwd: projectDir,
    agentDir,
    projectTrusted: true, // host IS trusted
    guardFactory: createCodeReviewerRuntimeGuardExtension({ cwd: projectDir, maxTurns: 5 }),
    tools: ["read", ...SUBAGENT_MCP_TOOLS],
  });

  // Both servers must connect.
  const globalOk = await waitUntil(() =>
    session.getActiveToolNames().includes("mcp__global_fixture__fixture_tool"),
  );
  assert.ok(globalOk, "global mcp server must connect");

  const projectOk = await waitUntil(() =>
    session.getActiveToolNames().includes("mcp__project_fixture__fixture_tool"),
  );
  assert.ok(projectOk, "project mcp server must connect when host is trusted and cwd matches");

  await disposeSubagentSession(session);
});

test("trust integration: host trusted + different cwd → project server NOT spawned", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sdk-mcp-trust-diff-cwd-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const { agentDir, projectDir, projectPidFile } = await makeTrustFixture(root);
  const differentCwd = root; // NOT projectDir
  setEnv(t, "PI_CODING_AGENT_DIR", agentDir);

  const mod = await loadExtension("extensions/code-reviewer/index.ts");
  const {
    SUBAGENT_MCP_TOOLS,
    disposeSubagentSession,
    createCodeReviewerRuntimeGuardExtension,
    resolveSubagentProjectTrusted,
  } = mod.__test__;

  // Derive projectTrusted via the real helper: trusted host whose cwd is projectDir,
  // but subagent runs in differentCwd — realpaths differ, so helper returns false.
  const hostCtx = { cwd: realpathSync(projectDir), isProjectTrusted: () => true };
  const projectTrusted = resolveSubagentProjectTrusted(hostCtx, differentCwd);
  assert.equal(
    projectTrusted,
    false,
    "trusted host + different cwd → projectTrusted must be false",
  );

  const session = await makeSession(mod, {
    cwd: differentCwd,
    agentDir,
    projectTrusted,
    guardFactory: createCodeReviewerRuntimeGuardExtension({ cwd: differentCwd, maxTurns: 5 }),
    tools: ["read", ...SUBAGENT_MCP_TOOLS],
  });

  await new Promise((r) => setTimeout(r, 300));
  assert.equal(
    existsSync(projectPidFile),
    false,
    "project mcp server must NOT be spawned when subagent runs in a different directory",
  );
  assert.equal(
    session.getActiveToolNames().includes("mcp__project_fixture__fixture_tool"),
    false,
    "project mcp tool must not be active when cwd differs",
  );

  await disposeSubagentSession(session);
});

test("trust integration: older-host stub (no isProjectTrusted) → project server NOT spawned", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sdk-mcp-trust-oldhost-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const { agentDir, projectDir, projectPidFile } = await makeTrustFixture(root);
  setEnv(t, "PI_CODING_AGENT_DIR", agentDir);

  const mod = await loadExtension("extensions/code-reviewer/index.ts");
  const { resolveSubagentProjectTrusted } = mod.__test__;

  // Simulate what the extension does on an older host: ctx has no isProjectTrusted.
  const stubCtx = { cwd: projectDir }; // no isProjectTrusted method
  const projectTrusted = resolveSubagentProjectTrusted(stubCtx, projectDir);
  assert.equal(projectTrusted, false, "older host stub must produce projectTrusted=false");

  // Build session with projectTrusted=false (fail-closed result)
  const { SUBAGENT_MCP_TOOLS, disposeSubagentSession, createCodeReviewerRuntimeGuardExtension } =
    mod.__test__;
  const session = await makeSession(mod, {
    cwd: projectDir,
    agentDir,
    projectTrusted: false,
    guardFactory: createCodeReviewerRuntimeGuardExtension({ cwd: projectDir, maxTurns: 5 }),
    tools: ["read", ...SUBAGENT_MCP_TOOLS],
  });

  await new Promise((r) => setTimeout(r, 300));
  assert.equal(
    existsSync(projectPidFile),
    false,
    "project mcp server must NOT be spawned on older-host (fail-closed)",
  );

  await disposeSubagentSession(session);
});

// ============================================================================
// C. direct-exposure per extension — tool active, dangerous absent, server exits
// ============================================================================

for (const ext of EXTENSIONS) {
  test(`${ext.label}: direct-exposure MCP tool is active; dangerous tools absent; server exits on disposeSubagentSession`, async (t) => {
    assert.ok(existsSync(fixtureServerPath));

    const root = await mkdtemp(path.join(os.tmpdir(), `sdk-mcp-direct-${ext.label}-`));
    t.after(() => rm(root, { recursive: true, force: true }));

    const pidFile = path.join(root, "server.pid");
    const agentDir = path.join(root, "agent");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      path.join(agentDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            fixture: {
              command: "node",
              args: [fixtureServerPath],
              exposure: "direct",
              env: { MCP_FIXTURE_PID_FILE: pidFile },
            },
          },
        },
        null,
        2,
      ),
    );

    setEnv(t, "PI_CODING_AGENT_DIR", agentDir);

    const mod = await loadExtension(ext.source);
    const { SUBAGENT_MCP_TOOLS, disposeSubagentSession } = mod.__test__;
    const guardFactory = ext.makeGuard(mod, root);
    const session = await makeSession(mod, {
      cwd: root,
      agentDir,
      projectTrusted: false,
      guardFactory,
      tools: [...ext.baseTools, ...SUBAGENT_MCP_TOOLS],
    });

    const appeared = await waitUntil(() =>
      session.getActiveToolNames().includes("mcp__fixture__fixture_tool"),
    );
    assert.ok(appeared, `${ext.label}: mcp__fixture__fixture_tool must become active`);
    assert.ok(session.getCallableToolNames().includes("mcp__fixture__fixture_tool"), "callable");
    const fixtureDef = session.getToolDefinition("mcp__fixture__fixture_tool");
    assert.ok(fixtureDef, "definition exists");

    // Execute the direct MCP tool end-to-end and assert the fixture server responds.
    const callResult = await fixtureDef.execute(
      "direct-test-call-id",
      { input: "hello from direct test" },
      undefined,
      undefined,
      undefined,
    );
    assert.ok(
      Array.isArray(callResult.content) &&
        callResult.content.some((c) => c.text?.includes("fixture_tool called with")),
      `${ext.label}: fixture_tool must return expected content; got: ${JSON.stringify(callResult.content)}`,
    );

    for (const blocked of ["write", "edit", "codemode"]) {
      assert.equal(session.getActiveToolNames().includes(blocked), false, `${blocked} not active`);
      assert.equal(session.getToolDefinition(blocked), undefined, `${blocked} no definition`);
    }

    await waitUntil(() => existsSync(pidFile));
    const pid = await readPidFile(pidFile);
    assert.ok(pid && pid > 0, "fixture server must write a valid PID");

    await disposeSubagentSession(session);

    const dead = await waitUntil(() => !isAlive(pid), { timeoutMs: 4000 });
    assert.ok(dead, `${ext.label}: server (PID ${pid}) must exit after session_shutdown`);
  });
}

// ============================================================================
// D. deferred-exposure — tool_search.execute() (no model) loads the mcp__ tool
// ============================================================================

for (const ext of EXTENSIONS) {
  test(`${ext.label}: deferred-exposure — real tool_search.execute() activates the mcp__ tool`, async (t) => {
    assert.ok(existsSync(fixtureServerPath));

    const root = await mkdtemp(path.join(os.tmpdir(), `sdk-mcp-deferred-${ext.label}-`));
    t.after(() => rm(root, { recursive: true, force: true }));

    const agentDir = path.join(root, "agent");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      path.join(agentDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            fixture: { command: "node", args: [fixtureServerPath], exposure: "deferred" },
          },
        },
        null,
        2,
      ),
    );

    setEnv(t, "PI_CODING_AGENT_DIR", agentDir);

    const mod = await loadExtension(ext.source);
    const { SUBAGENT_MCP_TOOLS, disposeSubagentSession } = mod.__test__;
    const guardFactory = ext.makeGuard(mod, root);
    const session = await makeSession(mod, {
      cwd: root,
      agentDir,
      projectTrusted: false,
      guardFactory,
      tools: [...ext.baseTools, ...SUBAGENT_MCP_TOOLS],
    });

    // Wait for deferred server to connect and register its tools.
    const toolRegistered = await waitUntil(() =>
      session.getCallableToolNames().includes("mcp__fixture__fixture_tool"),
    );
    assert.ok(toolRegistered, "deferred mcp__ tool must be callable after server connects");

    // tool_search must be ACTIVE (ensureDiscoveryActive activates it for deferred servers).
    assert.ok(
      session.getActiveToolNames().includes("tool_search"),
      `${ext.label}: tool_search must be active for deferred server`,
    );

    // The deferred tool must NOT be active at startup.
    assert.equal(
      session.getActiveToolNames().includes("mcp__fixture__fixture_tool"),
      false,
      `${ext.label}: deferred tool must NOT be active before tool_search runs`,
    );

    // Execute tool_search directly — no model needed; it only calls searchAndLoad.
    const toolSearchDef = session.getToolDefinition("tool_search");
    assert.ok(toolSearchDef, "tool_search definition must exist");

    const searchResult = await toolSearchDef.execute(
      "test-call-id",
      { query: "fixture tool" },
      undefined,
      undefined,
      undefined, // ctx is not used by tool_search's execute
    );
    assert.ok(
      searchResult.content?.some((c) => c.text?.includes("fixture_tool")),
      `tool_search must return a result mentioning fixture_tool; got: ${JSON.stringify(searchResult.content)}`,
    );

    // After tool_search, the deferred mcp__ tool must be active.
    assert.ok(
      session.getActiveToolNames().includes("mcp__fixture__fixture_tool"),
      `${ext.label}: deferred tool must be ACTIVE after tool_search.execute()`,
    );

    // Execute the deferred mcp__ tool end-to-end and assert the fixture server responds.
    const deferredDef = session.getToolDefinition("mcp__fixture__fixture_tool");
    assert.ok(deferredDef, "deferred tool definition must exist after tool_search load");
    const deferredResult = await deferredDef.execute(
      "deferred-test-call-id",
      { input: "hello from deferred test" },
      undefined,
      undefined,
      undefined,
    );
    assert.ok(
      Array.isArray(deferredResult.content) &&
        deferredResult.content.some((c) => c.text?.includes("fixture_tool called with")),
      `${ext.label}: deferred fixture_tool must return expected content; got: ${JSON.stringify(deferredResult.content)}`,
    );

    await disposeSubagentSession(session);
  });
}

// ============================================================================
// E. absent-factories fallback (older-host simulation)
// ============================================================================

test("absent-factories fallback: session builds cleanly when namespace lacks MCP factories", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sdk-mcp-no-factories-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const agentDir = path.join(root, "agent");
  await mkdir(agentDir, { recursive: true });
  setEnv(t, "PI_CODING_AGENT_DIR", agentDir);

  const settingsManager = SettingsManager.inMemory({}, { projectTrusted: false });
  const resourceLoader = new DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [], // no MCP factories — older host simulation
    systemPromptOverride: () => "Test subagent.",
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await resourceLoader.reload();

  const created = await createAgentSession({
    cwd: root,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(root),
    tools: ["read", "mcp__*", "tool_search"],
  });

  await assert.doesNotReject(
    () => created.session.bindExtensions({ mode: "json" }),
    "bindExtensions must not throw without MCP extension",
  );

  const active = created.session.getActiveToolNames();
  assert.deepEqual(
    active.filter((n) => n.startsWith("mcp__")),
    [],
    "no mcp__ tools without MCP extension",
  );
  assert.equal(
    active.includes("tool_search"),
    false,
    "no tool_search without tool-search extension",
  );

  created.session.dispose();

  // Verify createMcpSubagentFactories is a correct Array-returning function on Pi 1.0.4.
  const mod = await loadExtension("extensions/code-reviewer/index.ts");
  const factories = mod.__test__.createMcpSubagentFactories();
  assert.ok(Array.isArray(factories), "createMcpSubagentFactories must return an array");
  // On Pi 1.0.4 both createMcpExtension and createToolSearchExtension are present.
  assert.equal(factories.length, 2, "Pi 1.0.4 must provide 2 MCP factories");
});

// ============================================================================
// F. isMcpCompatibleVersion — unit tests (all 4 extensions)
//    Tests: 0.99.0, 1.0.3, 1.0.4, 1.1.0, 2.0.0, missing, garbage
// ============================================================================

const VERSION_CASES = [
  { version: "0.99.0", expected: false },
  { version: "1.0.3", expected: false },
  { version: "1.0.4", expected: true },
  { version: "1.1.0", expected: true },
  { version: "2.0.0", expected: true },
  { version: undefined, expected: false },
  { version: "garbage", expected: false },
  { version: "", expected: false },
  { version: "1.0.4-alpha.1", expected: true }, // prerelease ignored conservatively
];

for (const ext of EXTENSIONS) {
  for (const { version, expected } of VERSION_CASES) {
    const label = version === undefined ? "undefined" : JSON.stringify(version);
    test(`${ext.label}: isMcpCompatibleVersion(${label}) === ${expected}`, async () => {
      const mod = await loadExtension(ext.source);
      const { isMcpCompatibleVersion } = mod.__test__;
      assert.equal(
        isMcpCompatibleVersion(version),
        expected,
        `isMcpCompatibleVersion(${label}) must be ${expected}`,
      );
    });
  }
}

// ============================================================================
// G. Bind-failure cleanup (table-driven across all 4 extensions)
//    Simulates a bind failure: MCP server is spawned, an extension factory's
//    session_start throws, disposeSubagentSession must still clean up the server.
//    Validates that assigning session BEFORE bindExtensions makes cleanup reachable.
// ============================================================================

for (const ext of EXTENSIONS) {
  test(`${ext.label}: bind-failure cleanup — server exits when disposeSubagentSession called after bindExtensions throws`, async (t) => {
    assert.ok(existsSync(fixtureServerPath));

    const root = await mkdtemp(path.join(os.tmpdir(), `sdk-mcp-bind-fail-${ext.label}-`));
    t.after(() => rm(root, { recursive: true, force: true }));

    const pidFile = path.join(root, "server.pid");
    const agentDir = path.join(root, "agent");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      path.join(agentDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            fixture: {
              command: "node",
              args: [fixtureServerPath],
              exposure: "direct",
              env: { MCP_FIXTURE_PID_FILE: pidFile },
            },
          },
        },
        null,
        2,
      ),
    );

    setEnv(t, "PI_CODING_AGENT_DIR", agentDir);

    const mod = await loadExtension(ext.source);
    const { createMcpSubagentFactories, disposeSubagentSession } = mod.__test__;

    // A factory whose session_start throws — simulates a partial bind failure
    // after the MCP extension has already started its servers.
    const throwingFactory = (piApi) => {
      piApi.on("session_start", async () => {
        throw new Error(`Simulated bind failure in ${ext.label} test`);
      });
    };

    const settingsManager = SettingsManager.inMemory({}, { projectTrusted: false });
    const resourceLoader = new DefaultResourceLoader({
      cwd: root,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      // MCP factory listed first so the server can start; throwing factory runs after.
      extensionFactories: [...createMcpSubagentFactories(), throwingFactory],
      systemPromptOverride: () => "Test subagent.",
      skillsOverride: () => ({ skills: [], diagnostics: [] }),
      agentsFilesOverride: () => ({ agentsFiles: [] }),
    });
    await resourceLoader.reload();

    const created = await createAgentSession({
      cwd: root,
      resourceLoader,
      settingsManager,
      sessionManager: SessionManager.inMemory(root),
      tools: [...ext.baseTools, "mcp__*", "tool_search"],
    });

    // Assign session BEFORE bindExtensions — this is the ordering fix under test.
    // Without the fix (if session were assigned after), a throw from bindExtensions
    // would leave session undefined, making the finally block unable to dispose.
    let session = created.session;
    try {
      await session.bindExtensions({ mode: "json" });
    } catch {
      // Pi may or may not propagate session_start errors; either way we clean up.
    } finally {
      await disposeSubagentSession(session);
      session = undefined;
    }

    // Give the server a moment to write its PID file if it was spawned.
    const pidWritten = await waitUntil(() => existsSync(pidFile), { timeoutMs: 3000 });
    if (pidWritten) {
      const pid = await readPidFile(pidFile);
      if (pid && pid > 0) {
        const dead = await waitUntil(() => !isAlive(pid), { timeoutMs: 4000 });
        assert.ok(
          dead,
          `${ext.label}: server (PID ${pid}) must exit after disposeSubagentSession — validates cleanup works when session is assigned before bindExtensions`,
        );
      }
    }
    // If pidWritten is false: the server was never spawned (Pi rejected the session
    // before MCP connect), which is also a clean outcome — no leak to verify.
  });
}
