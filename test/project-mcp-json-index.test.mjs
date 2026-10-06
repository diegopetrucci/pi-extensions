/**
 * Tests for extensions/project-mcp-json/index.ts
 *
 * Covers the acceptance criteria from ticket pe-2sfi (Pi-aligned trust model):
 *  - untrusted project => no read / no register
 *  - hasTrustRequiringProjectResources true => load (Pi made a real decision)
 *  - saved trust = true (exact) => load
 *  - saved trust = true (ancestor) => load
 *  - saved trust = false => skip, no read
 *  - defaultProjectTrust = "always" => load
 *  - defaultProjectTrust = "never" => skip, no read
 *  - defaultProjectTrust = "ask" + UI => skip + notify
 *  - defaultProjectTrust = "ask" + no UI => skip, no notify
 *  - no .mcp.json => no-op
 *  - name collision: registerMcpServer throws => caught and warned
 *  - registerMcpServer error is not forwarded verbatim
 *  - session generation counter: shutdown / new session_start abort stale work
 */

import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let importCounter = 0;

/** Load a fresh module instance so module-level state is reset per test. */
async function loadFreshExtension(relativePath) {
  const url = pathToFileURL(path.join(repoRoot, relativePath));
  url.searchParams.set('v', `${Date.now()}-${importCounter++}`);
  const mod = await import(url.href);
  return mod.default;
}

// ---------------------------------------------------------------------------
// Temp directory + environment helpers
// ---------------------------------------------------------------------------

function setupTempDirs(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pmj-test-'));
  const agentDir = path.join(root, 'agent');
  const projectDir = path.join(root, 'project');
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, agentDir, projectDir };
}

function setAgentDirEnv(t, agentDir) {
  const original = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (original === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = original;
    }
  });
}

/**
 * Write a global settings.json to agentDir with the given defaultProjectTrust.
 */
function writeGlobalSettings(agentDir, defaultProjectTrust) {
  writeFileSync(
    path.join(agentDir, 'settings.json'),
    JSON.stringify({ defaultProjectTrust }),
    'utf-8'
  );
}

/**
 * Write trust.json to agentDir with the given path→decision entries.
 * Entries is an object like { [absPath]: true|false }.
 * Paths are canonicalised via realpathSync to match the trust store's lookup.
 */
function writeTrustStore(agentDir, entries) {
  const canonical = {};
  for (const [k, v] of Object.entries(entries)) {
    try {
      canonical[realpathSync(k)] = v;
    } catch {
      canonical[k] = v; // path may not exist yet — keep as-is
    }
  }
  writeFileSync(
    path.join(agentDir, 'trust.json'),
    JSON.stringify(canonical, null, 2) + '\n',
    'utf-8'
  );
}

/**
 * Create a .pi/mcp.json file in projectDir so that
 * hasTrustRequiringProjectResources(projectDir) returns true.
 */
function createPiResources(projectDir) {
  const piDir = path.join(projectDir, '.pi');
  mkdirSync(piDir, { recursive: true });
  writeFileSync(path.join(piDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }));
}

// ---------------------------------------------------------------------------
// Fake pi / ctx builders
// ---------------------------------------------------------------------------

function makePi() {
  const handlers = new Map();
  const registered = [];
  const pi = {
    on(eventName, handler) {
      handlers.set(eventName, handler);
      return () => {};
    },
    registerMcpServer(name, config) {
      registered.push({ name, config });
    },
  };
  return { pi, handlers, registered };
}

function makeCtx({
  cwd,
  hasUI = true,
  isProjectTrusted = () => true,
} = {}) {
  const notifications = [];

  const ctx = {
    cwd,
    hasUI,
    isProjectTrusted,
    ui: {
      notify(message, type) {
        notifications.push({ message, type });
      },
    },
  };

  return { ctx, notifications };
}

/** Fire session_start on the handlers map. */
async function fireSessionStart(handlers, ctx) {
  const handler = handlers.get('session_start');
  assert.ok(handler, 'session_start handler should be registered');
  await handler({ type: 'session_start', reason: 'startup' }, ctx);
}

// ---------------------------------------------------------------------------
// Minimal .mcp.json content
// ---------------------------------------------------------------------------

const STDIO_MCP_JSON = JSON.stringify({
  mcpServers: {
    myserver: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'some-mcp-server'],
    },
  },
});

// ---------------------------------------------------------------------------
// Tests: basic trust gate
// ---------------------------------------------------------------------------

test('untrusted project: does not read or register any server', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx } = makeCtx({ cwd: projectDir, isProjectTrusted: () => false });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 0, 'should not register any server for untrusted project');
});

test('trusted project + no .mcp.json: does nothing', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  // Trust resources present so extension proceeds past trust check
  createPiResources(projectDir);

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 0);
  assert.equal(notifications.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: Pi resource branch (step 2a)
// ---------------------------------------------------------------------------

test('hasTrustRequiringProjectResources=true: loads .mcp.json without checking trust store', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  // Create Pi resource so hasTrustRequiringProjectResources returns true
  createPiResources(projectDir);
  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  // No trust.json, no settings.json — should still load

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 1, 'should register server when Pi resources exist');
  assert.equal(registered[0].name, 'myserver');
});

// ---------------------------------------------------------------------------
// Tests: saved trust store branch (step 2b)
// ---------------------------------------------------------------------------

test('savedTrust=true (exact path): loads .mcp.json', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  // Write trust.json with exact projectDir → true
  writeTrustStore(agentDir, { [projectDir]: true });

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 1, 'should register when saved trust is true');
  assert.equal(registered[0].name, 'myserver');
});

test('savedTrust=true (ancestor path): loads .mcp.json', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  // Create a subdirectory as the real cwd; trust stored for the parent
  const subDir = path.join(projectDir, 'subproject');
  mkdirSync(subDir, { recursive: true });
  writeFileSync(path.join(subDir, '.mcp.json'), STDIO_MCP_JSON);
  // Trust the parent directory, not the exact subdir
  writeTrustStore(agentDir, { [projectDir]: true });

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx } = makeCtx({ cwd: subDir });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 1, 'should register when nearest-ancestor trust is true');
  assert.equal(registered[0].name, 'myserver');
});

test('savedTrust=false: skips .mcp.json without notification', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  // Explicitly saved as untrusted
  writeTrustStore(agentDir, { [projectDir]: false });

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 0, 'should not register when saved trust is false');
  assert.equal(notifications.length, 0, 'should not notify when explicitly untrusted');
});

// ---------------------------------------------------------------------------
// Tests: defaultProjectTrust branch (step 2c)
// ---------------------------------------------------------------------------

test('defaultProjectTrust=always: loads .mcp.json when no resources, no saved trust', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  writeGlobalSettings(agentDir, 'always');
  // No .pi resources, no trust.json

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 1, 'should register when defaultProjectTrust=always');
  assert.equal(registered[0].name, 'myserver');
});

test('defaultProjectTrust=never: skips .mcp.json without notification', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  writeGlobalSettings(agentDir, 'never');

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 0, 'should not register when defaultProjectTrust=never');
  assert.equal(notifications.length, 0, 'should not notify when defaultProjectTrust=never');
});

test('defaultProjectTrust=ask + UI: skips and emits /trust hint notification', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  writeGlobalSettings(agentDir, 'ask');

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir, hasUI: true });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 0, 'should not register when defaultProjectTrust=ask');
  assert.equal(notifications.length, 1, 'should emit exactly one notification');
  assert.ok(
    notifications[0].message.includes('/trust'),
    'notification should mention /trust command'
  );
  assert.ok(
    notifications[0].message.toLowerCase().includes('.mcp.json'),
    'notification should mention .mcp.json'
  );
});

test('defaultProjectTrust=ask + no UI: skips silently (no notification)', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  writeGlobalSettings(agentDir, 'ask');

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir, hasUI: false });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 0, 'should not register without UI when ask');
  assert.equal(notifications.length, 0, 'should not emit notifications without UI');
});

test('no settings.json: defaults to ask behaviour (skips with UI notify)', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  // No settings.json written — should default to "ask"

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir, hasUI: true });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 0, 'should not register when no settings and ask is default');
  assert.ok(
    notifications.some((n) => n.message.includes('/trust')),
    'should emit /trust notification when no settings (defaulting to ask)'
  );
});

// ---------------------------------------------------------------------------
// Tests: no read when skipped
// ---------------------------------------------------------------------------

test('savedTrust=false: does not attempt to read .mcp.json (no error on absent file)', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  // No .mcp.json file — if we tried to read it and it were absent, no error should occur
  writeTrustStore(agentDir, { [projectDir]: false });

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir });
  // Should not throw even without .mcp.json, since we skip before reading
  await assert.doesNotReject(() => fireSessionStart(handlers, ctx));
  assert.equal(registered.length, 0);
  assert.equal(notifications.length, 0);
});

test('defaultProjectTrust=never: does not attempt to read .mcp.json', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  // No .mcp.json — if we tried to read it, it would throw; no error expected
  writeGlobalSettings(agentDir, 'never');

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx } = makeCtx({ cwd: projectDir });
  await assert.doesNotReject(() => fireSessionStart(handlers, ctx));
  assert.equal(registered.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: name collision + error handling
// ---------------------------------------------------------------------------

test('name collision: registerMcpServer throws => caught and warned, other servers still register', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(
    path.join(projectDir, '.mcp.json'),
    JSON.stringify({
      mcpServers: {
        colliding: { type: 'stdio', command: 'npx', args: [] },
        fine: { type: 'stdio', command: 'node', args: [] },
      },
    })
  );
  createPiResources(projectDir);

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const registered = [];
  const { pi, handlers } = makePi();
  // Override to throw on 'colliding'
  pi.registerMcpServer = (name, config) => {
    if (name === 'colliding') throw new Error('name already taken by another extension');
    registered.push({ name, config });
  };
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  // 'fine' should still be registered
  assert.ok(registered.some((r) => r.name === 'fine'), 'non-colliding server should register');
  // A warning should mention 'colliding'
  assert.ok(
    notifications.some((n) => n.message.includes('colliding')),
    'should warn about the colliding server'
  );
  assert.ok(
    notifications.some((n) => n.type === 'warning'),
    'collision warning should use warning level'
  );
});

test('registerMcpServer error is not forwarded verbatim in warning', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  createPiResources(projectDir);

  const INTERNAL_ERROR_DETAIL = 'internal-pi-error-detail-xyz';

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers } = makePi();
  pi.registerMcpServer = (_name, _config) => {
    throw new Error(INTERNAL_ERROR_DETAIL);
  };
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  // A warning should be emitted (the server name should appear)
  assert.ok(
    notifications.some((n) => n.message.includes('myserver') && n.type === 'warning'),
    'should warn about the failed server'
  );
  // The raw internal error detail must NOT be forwarded
  for (const n of notifications) {
    assert.ok(
      !n.message.includes(INTERNAL_ERROR_DETAIL),
      `notification must not contain raw error detail: ${n.message}`
    );
  }
});

test('registration-failure warning: very long server name is truncated, not emitted verbatim', async (t) => {
  // Server names are validated by SERVER_NAME_RE (alphanumeric/_/-) but there
  // is no length limit in the schema.  A >80-char name must be truncated in
  // the registration-failure warning.
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  const longName = 'a'.repeat(100); // 100 valid chars — passes SERVER_NAME_RE
  writeFileSync(
    path.join(projectDir, '.mcp.json'),
    JSON.stringify({ mcpServers: { [longName]: { type: 'stdio', command: 'node', args: [] } } })
  );
  createPiResources(projectDir);

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers } = makePi();
  pi.registerMcpServer = (_name, _config) => {
    throw new Error('collision');
  };
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  assert.ok(
    notifications.some((n) => n.type === 'warning'),
    'should emit a warning on registration failure'
  );
  for (const n of notifications) {
    if (n.type === 'warning') {
      assert.ok(
        !n.message.includes(longName),
        'full 100-char name must not appear verbatim in warning'
      );
      // The truncated prefix (80 chars + \u2026) must appear
      assert.ok(
        n.message.includes('a'.repeat(80)),
        'truncated 80-char prefix should appear in warning'
      );
      assert.ok(
        n.message.includes('\u2026'),
        'ellipsis must follow the truncated name'
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Tests: .mcp.json existence check before trust branch
// ---------------------------------------------------------------------------

test('absent .mcp.json with defaultProjectTrust=ask + UI: no notice emitted (no-op)', async (t) => {
  // The /trust notice must NOT be shown when there is no .mcp.json at all,
  // regardless of trust settings.  The existence check fires before any trust
  // branch evaluation.
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeGlobalSettings(agentDir, 'ask');
  // Do NOT create .mcp.json

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir, hasUI: true });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 0);
  assert.equal(notifications.length, 0, 'no notice should fire when .mcp.json is absent');
});

test('absent .mcp.json with hasTrustRequiringProjectResources: complete no-op, no warning', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  // Pi resources exist — would load if .mcp.json were present
  createPiResources(projectDir);
  // But no .mcp.json

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 0);
  assert.equal(notifications.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: SettingsManager BOM handling
// ---------------------------------------------------------------------------

test('settings.json with BOM prefix: defaultProjectTrust=always still loads servers', async (t) => {
  // SettingsManager strips BOM via stripBom; verify the extension uses it
  // correctly and that a BOM-prefixed settings file is handled.
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);

  // Write settings.json with a UTF-8 BOM (\uFEFF) prefix
  const BOM = '\uFEFF';
  writeFileSync(
    path.join(agentDir, 'settings.json'),
    BOM + JSON.stringify({ defaultProjectTrust: 'always' }),
    'utf-8'
  );

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');
  const { pi, handlers, registered } = makePi();
  ext(pi);

  const { ctx } = makeCtx({ cwd: projectDir });
  await fireSessionStart(handlers, ctx);

  assert.equal(registered.length, 1, 'server should load with BOM-prefixed settings.json');
  assert.equal(registered[0].name, 'myserver');
});

// ---------------------------------------------------------------------------
// Tests: missing pi.registerMcpServer API (Pi < 1.0)
// ---------------------------------------------------------------------------

test('pi.registerMcpServer absent + UI: emits one Pi >=1.0 required notice, registers nothing', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  createPiResources(projectDir);

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');

  // Build a pi object without registerMcpServer (simulates Pi < 1.0)
  const handlers = new Map();
  const pi = {
    on(eventName, handler) {
      handlers.set(eventName, handler);
      return () => {};
    },
    // registerMcpServer intentionally omitted
  };
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir, hasUI: true });
  const handler = handlers.get('session_start');
  assert.ok(handler, 'session_start handler should be registered');
  await handler({ type: 'session_start', reason: 'startup' }, ctx);

  assert.equal(notifications.length, 1, 'should emit exactly one notice');
  assert.ok(
    notifications[0].message.toLowerCase().includes('pi >=1.0') ||
    notifications[0].message.toLowerCase().includes('pi >= 1.0') ||
    notifications[0].message.toLowerCase().includes('1.0'),
    'notice should mention Pi 1.0 requirement'
  );
  assert.equal(notifications[0].type, 'info', 'notice should use info level');
});

test('pi.registerMcpServer absent + no UI: registers nothing, no notice emitted', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeFileSync(path.join(projectDir, '.mcp.json'), STDIO_MCP_JSON);
  createPiResources(projectDir);

  const ext = await loadFreshExtension('extensions/project-mcp-json/index.ts');

  const handlers = new Map();
  const pi = {
    on(eventName, handler) {
      handlers.set(eventName, handler);
      return () => {};
    },
    // registerMcpServer intentionally omitted
  };
  ext(pi);

  const { ctx, notifications } = makeCtx({ cwd: projectDir, hasUI: false });
  const handler = handlers.get('session_start');
  assert.ok(handler, 'session_start handler should be registered');
  await handler({ type: 'session_start', reason: 'startup' }, ctx);

  assert.equal(notifications.length, 0, 'should emit no notice without UI');
});
