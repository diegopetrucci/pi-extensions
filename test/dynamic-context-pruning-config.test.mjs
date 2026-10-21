import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(repoRoot, "extensions/dynamic-context-pruning/index.ts");

function setEnv(t, key, value) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });
}

function setupAgentDir(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "dynamic-context-pruning-config-test-"));
  const agentDir = path.join(rootDir, "agent");
  mkdirSync(path.join(agentDir, "extensions"), { recursive: true });
  setEnv(t, "PI_CODING_AGENT_DIR", agentDir);
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  return agentDir;
}

test("config path follows the sibling-extension convention: <agentDir>/extensions/<name>.json", async (t) => {
  const agentDir = setupAgentDir(t);
  const dcp = await import(pathToFileURL(modulePath).href);
  const configPath = dcp.__testing.getConfigPath();
  assert.equal(configPath, path.join(agentDir, "extensions", "dynamic-context-pruning.json"));
});

test("writeConfig then readConfig round-trips enabled/protections/thresholds", async (t) => {
  setupAgentDir(t);
  const dcp = await import(pathToFileURL(modulePath).href);
  const custom = dcp.normalizeConfig({
    enabled: false,
    protections: { toolNames: ["my-tool"], pathGlobs: ["**/*.secret"], recentTurns: 7 },
    thresholds: { minCharsSaved: 999 },
  });

  await dcp.__testing.writeConfig(custom);
  const raw = JSON.parse(readFileSync(dcp.__testing.getConfigPath(), "utf8"));
  assert.equal(raw.enabled, false);
  assert.equal(raw.protections.recentTurns, 7);
  assert.equal(raw.thresholds.minCharsSaved, 999);
  assert.equal(typeof raw.updatedAt, "string");

  const reloaded = await dcp.__testing.readConfig();
  assert.deepEqual(reloaded, custom);
});

test("readConfig falls back to defaults when no config file exists", async (t) => {
  setupAgentDir(t);
  const dcp = await import(pathToFileURL(modulePath).href);
  const config = await dcp.__testing.readConfig();
  assert.deepEqual(config, dcp.defaultConfig());
});

test("normalizeConfig then resolveBreakEvenThreshold preserves state defaults and legacy fallback semantics", async () => {
  const dcp = await import(pathToFileURL(modulePath).href);
  const cases = [
    {
      name: "no config",
      raw: undefined,
      expectedGlobal: 22,
      expectedByState: { idle: 22, mid_loop: 1 },
    },
    {
      name: "global-only config",
      raw: { gate: { breakEvenThreshold: 50 } },
      expectedGlobal: 50,
      expectedByState: { idle: 22, mid_loop: 1 },
    },
    {
      name: "global-only zero",
      raw: { gate: { breakEvenThreshold: 0 } },
      expectedGlobal: 0,
      expectedByState: { idle: 22, mid_loop: 1 },
    },
    {
      name: "explicit zero state overrides",
      raw: {
        gate: {
          breakEvenThreshold: 50,
          breakEvenThresholdByState: { idle: 0, mid_loop: 0 },
        },
      },
      expectedGlobal: 50,
      expectedByState: { idle: 0, mid_loop: 0 },
    },
    {
      name: "partial state overrides",
      raw: {
        gate: { breakEvenThreshold: 50, breakEvenThresholdByState: { idle: 7 } },
      },
      expectedGlobal: 50,
      expectedByState: { idle: 7, mid_loop: 1 },
    },
    {
      name: "full state overrides",
      raw: {
        gate: {
          breakEvenThreshold: 50,
          breakEvenThresholdByState: { idle: 7, mid_loop: 13 },
        },
      },
      expectedGlobal: 50,
      expectedByState: { idle: 7, mid_loop: 13 },
    },
    {
      name: "invalid global and state values",
      raw: {
        gate: {
          breakEvenThreshold: "not-a-number",
          breakEvenThresholdByState: { idle: -1, mid_loop: "also-not-a-number" },
        },
      },
      expectedGlobal: 22,
      expectedByState: { idle: 22, mid_loop: 1 },
    },
  ];

  for (const { name, raw, expectedGlobal, expectedByState } of cases) {
    const config = dcp.normalizeConfig(raw);
    assert.equal(config.gate.breakEvenThreshold, expectedGlobal, `${name}: global field`);
    assert.equal(
      dcp.resolveBreakEvenThreshold(config.gate, "idle"),
      expectedByState.idle,
      `${name}: idle threshold`,
    );
    assert.equal(
      dcp.resolveBreakEvenThreshold(config.gate, "mid_loop"),
      expectedByState.mid_loop,
      `${name}: mid_loop threshold`,
    );
  }
});
