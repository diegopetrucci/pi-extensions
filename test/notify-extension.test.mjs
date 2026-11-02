import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { createExtensionHarness } from "./extension-test-helpers.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let importCounter = 0;

async function loadFreshExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath));
  moduleUrl.searchParams.set("test", `${Date.now()}-${importCounter++}`);
  const extensionModule = await import(moduleUrl.href);
  return extensionModule.default;
}

function setupTempDirs(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "notify-extension-test-"));
  const agentDir = path.join(rootDir, "agent");
  const projectDir = path.join(rootDir, "project");

  mkdirSync(path.join(agentDir, "extensions"), { recursive: true });
  mkdirSync(path.join(projectDir, CONFIG_DIR_NAME), { recursive: true });
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));

  return { agentDir, projectDir };
}

function setAgentDirEnv(t, agentDir) {
  const original = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (original === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
      return;
    }
    process.env.PI_CODING_AGENT_DIR = original;
  });
}

function writeNotifyConfig(filePath, config) {
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function patchExecFile(t, implementation) {
  const childProcess = require("node:child_process");
  const original = childProcess.execFile;
  const calls = [];

  childProcess.execFile = (command, args, options, callback) => {
    let actualArgs = args;
    let actualOptions = options;
    let actualCallback = callback;

    if (typeof actualArgs === "function") {
      actualCallback = actualArgs;
      actualArgs = [];
      actualOptions = undefined;
    } else if (typeof actualOptions === "function") {
      actualCallback = actualOptions;
      actualOptions = undefined;
    }

    calls.push({
      command,
      args: Array.isArray(actualArgs) ? [...actualArgs] : [],
      options: actualOptions,
    });

    implementation({
      command,
      args: Array.isArray(actualArgs) ? [...actualArgs] : [],
      options: actualOptions,
      callback: actualCallback,
    });
    return { pid: 1, kill() {} };
  };

  syncBuiltinESMExports();
  t.after(() => {
    childProcess.execFile = original;
    syncBuiltinESMExports();
  });

  return calls;
}

function captureStdout(t) {
  const writes = [];
  const original = process.stdout.write;

  process.stdout.write = (chunk, encoding, callback) => {
    writes.push(String(chunk));
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  t.after(() => {
    process.stdout.write = original;
  });

  return writes;
}

function captureConsoleErrors(t) {
  const errors = [];
  const original = console.error;

  console.error = (...args) => {
    errors.push(args.map((value) => String(value)).join(" "));
  };

  t.after(() => {
    console.error = original;
  });

  return errors;
}

function setEnvVar(t, name, value) {
  const original = process.env[name];

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  t.after(() => {
    if (original === undefined) {
      delete process.env[name];
      return;
    }
    process.env[name] = original;
  });
}

function setProcessPlatform(t, value) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    value,
  });

  t.after(() => {
    if (descriptor) {
      Object.defineProperty(process, "platform", descriptor);
    }
  });
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Asserts both OSC 99 chunks share one UUID id (optionally tmux-wrapped) and returns it. */
function assertOsc99(writes, title, body, { tmux = false } = {}) {
  assert.equal(writes.length, 2);
  const wrap = (seq) => (tmux ? `\x1bPtmux;${seq.replaceAll("\x1b", "\x1b\x1b")}\x1b\\` : seq);
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = new RegExp(
    `^${escape(wrap(`\x1b]99;i=@:d=0;${title}\x1b\\`)).replace("@", `(${UUID})`)}$`,
  );
  const m = writes[0].match(first);
  assert.ok(m, `unexpected first chunk: ${JSON.stringify(writes[0])}`);
  assert.equal(writes[1], wrap(`\x1b]99;i=${m[1]}:d=1:p=body;${body}\x1b\\`));
  return m[1];
}

test("notify subscribes to settled runs instead of agent_end", async () => {
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();

  notifyExtension(pi);

  assert.equal(typeof handlers.get("agent_settled"), "function");
  assert.equal(handlers.has("agent_end"), false);
});

test("notify uses trusted project config over global config and ignores untrusted project config", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, "TMUX", undefined);

  writeNotifyConfig(path.join(agentDir, "extensions", "notify.json"), {
    enabled: true,
    onlyWhenInteractive: false,
    title: "Global Title",
    body: "Global Body",
    channels: {
      terminal: true,
      desktop: true,
      bell: false,
      sound: false,
    },
    terminal: {
      backend: "osc99",
    },
    desktop: {
      backend: "none",
    },
  });

  writeNotifyConfig(path.join(projectDir, CONFIG_DIR_NAME, "notify.json"), {
    title: "Project Title",
    body: "Project Body",
    channels: {
      bell: true,
    },
    terminal: {
      backend: "osc777",
    },
  });

  const execCalls = patchExecFile(t, ({ callback }) => callback(null, "", ""));
  const writes = captureStdout(t);
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(writes, ["\x1b]777;notify;Project Title;Project Body\x07", "\x07"]);
  assert.equal(execCalls.length, 0);

  writes.length = 0;

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => false,
    },
  );

  assertOsc99(writes, "Global Title", "Global Body");
  assert.equal(execCalls.length, 0);
});

test("notify respects enabled and onlyWhenInteractive gating", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  const configPath = path.join(agentDir, "extensions", "notify.json");
  const execCalls = patchExecFile(t, ({ callback }) => callback(null, "", ""));
  const writes = captureStdout(t);
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  writeNotifyConfig(configPath, {
    enabled: false,
    onlyWhenInteractive: false,
    channels: {
      terminal: true,
      desktop: true,
      bell: true,
      sound: false,
    },
    terminal: {
      backend: "osc777",
    },
    desktop: {
      backend: "linux",
    },
  });

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(writes, []);
  assert.equal(execCalls.length, 0);

  writeNotifyConfig(configPath, {
    enabled: true,
    onlyWhenInteractive: true,
    channels: {
      terminal: true,
      desktop: true,
      bell: true,
      sound: false,
    },
    terminal: {
      backend: "osc777",
    },
    desktop: {
      backend: "linux",
    },
  });

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: false,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(writes, []);
  assert.equal(execCalls.length, 0);
});

test("notify skips none backends and swallows desktop and sound delivery failures", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeNotifyConfig(path.join(agentDir, "extensions", "notify.json"), {
    enabled: true,
    onlyWhenInteractive: false,
    title: "Ready",
    body: "Waiting",
    channels: {
      terminal: false,
      desktop: true,
      bell: false,
      sound: true,
    },
    desktop: {
      backend: "linux",
    },
    sound: {
      backend: "command",
      command: "printf fail",
    },
  });

  const execCalls = patchExecFile(t, ({ command, callback }) =>
    callback(new Error(`failed: ${command}`)),
  );
  const writes = captureStdout(t);
  const originalShell = process.env.SHELL;
  process.env.SHELL = "/bin/test-shell";
  t.after(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL;
      return;
    }
    process.env.SHELL = originalShell;
  });

  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  await assert.doesNotReject(() =>
    handler(
      {},
      {
        cwd: projectDir,
        hasUI: true,
        isProjectTrusted: () => true,
      },
    ),
  );

  assert.deepEqual(writes, []);
  assert.deepEqual(
    execCalls.map(({ command, args }) => ({ command, args })),
    [
      { command: "notify-send", args: ["Ready", "Waiting"] },
      { command: "/bin/test-shell", args: ["-lc", "printf fail"] },
    ],
  );
});

test("notify auto-selects terminal backends and preserves OSC formatting", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, "TMUX", undefined);

  writeNotifyConfig(path.join(agentDir, "extensions", "notify.json"), {
    enabled: true,
    onlyWhenInteractive: false,
    title: "Edge Title",
    body: "Edge Body",
    channels: {
      terminal: true,
      desktop: false,
      bell: false,
      sound: false,
    },
    terminal: {
      backend: "auto",
    },
  });

  patchExecFile(t, ({ callback }) => callback(null, "", ""));
  const writes = captureStdout(t);
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  setEnvVar(t, "KITTY_WINDOW_ID", "window-1");
  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assertOsc99(writes, "Edge Title", "Edge Body");

  writes.length = 0;
  delete process.env.KITTY_WINDOW_ID;

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(writes, ["\x1b]777;notify;Edge Title;Edge Body\x07"]);
});

test("notify wraps terminal notifications in tmux passthrough and leaves the bell bare", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, "TMUX", "/private/tmp/tmux-501/default,60431,9");

  writeNotifyConfig(path.join(agentDir, "extensions", "notify.json"), {
    enabled: true,
    onlyWhenInteractive: false,
    title: "Tmux Title",
    body: "Tmux Body",
    channels: {
      terminal: true,
      desktop: false,
      bell: true,
      sound: false,
    },
    terminal: {
      backend: "osc777",
    },
  });

  patchExecFile(t, ({ callback }) => callback(null, "", ""));
  const writes = captureStdout(t);
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(writes, [
    "\x1bPtmux;\x1b\x1b]777;notify;Tmux Title;Tmux Body\x07\x1b\\",
    "\x07",
  ]);
});

test("notify wraps both OSC 99 writes and doubles their ESC terminators inside tmux", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, "TMUX", "/private/tmp/tmux-501/default,60431,9");

  writeNotifyConfig(path.join(agentDir, "extensions", "notify.json"), {
    enabled: true,
    onlyWhenInteractive: false,
    title: "Kitty Title",
    body: "Kitty Body",
    channels: {
      terminal: true,
      desktop: false,
      bell: false,
      sound: false,
    },
    terminal: {
      backend: "osc99",
    },
  });

  patchExecFile(t, ({ callback }) => callback(null, "", ""));
  const writes = captureStdout(t);
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  const firstId = assertOsc99(writes, "Kitty Title", "Kitty Body", { tmux: true });

  writes.length = 0;
  await handler({}, { cwd: projectDir, hasUI: true, isProjectTrusted: () => true });
  const secondId = assertOsc99(writes, "Kitty Title", "Kitty Body", { tmux: true });
  assert.notEqual(secondId, firstId);
});

test("notify honours tmuxPassthrough overrides in both directions", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  const configPath = path.join(agentDir, "extensions", "notify.json");
  const baseConfig = {
    enabled: true,
    onlyWhenInteractive: false,
    title: "Override Title",
    body: "Override Body",
    channels: {
      terminal: true,
      desktop: false,
      bell: false,
      sound: false,
    },
  };

  patchExecFile(t, ({ callback }) => callback(null, "", ""));
  const writes = captureStdout(t);
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  // never: stay bare even though tmux would swallow it, for setups that
  // handle forwarding themselves.
  setEnvVar(t, "TMUX", "/private/tmp/tmux-501/default,60431,9");
  writeNotifyConfig(configPath, {
    ...baseConfig,
    terminal: { backend: "osc777", tmuxPassthrough: "never" },
  });

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(writes, ["\x1b]777;notify;Override Title;Override Body\x07"]);

  // always: wrap even without $TMUX, for multiplexers started outside the
  // inherited environment.
  writes.length = 0;
  setEnvVar(t, "TMUX", undefined);
  writeNotifyConfig(configPath, {
    ...baseConfig,
    terminal: { backend: "osc777", tmuxPassthrough: "always" },
  });

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(writes, [
    "\x1bPtmux;\x1b\x1b]777;notify;Override Title;Override Body\x07\x1b\\",
  ]);
});

test("notify selects the expected desktop backend commands for auto detection", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, "WT_SESSION", undefined);
  setEnvVar(t, "WSL_DISTRO_NAME", undefined);

  writeNotifyConfig(path.join(agentDir, "extensions", "notify.json"), {
    enabled: true,
    onlyWhenInteractive: false,
    title: "Pi's App",
    body: "Ready's body",
    channels: {
      terminal: false,
      desktop: true,
      bell: false,
      sound: false,
    },
    desktop: {
      backend: "auto",
    },
  });

  const execCalls = patchExecFile(t, ({ callback }) => callback(null, "", ""));
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  setProcessPlatform(t, "linux");
  setEnvVar(t, "WT_SESSION", "wt-session");
  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  const windowsCall = execCalls.shift();
  assert.equal(windowsCall?.command, "powershell.exe");
  assert.deepEqual(windowsCall?.args.slice(0, 2), ["-NoProfile", "-Command"]);
  assert.match(windowsCall?.args[2] ?? "", /ToastNotificationManager/);
  assert.match(windowsCall?.args[2] ?? "", /CreateTextNode\('Ready''s body'\)/);
  assert.match(windowsCall?.args[2] ?? "", /CreateToastNotifier\('Pi''s App'\)/);
  assert.deepEqual(windowsCall?.options, { timeout: 10_000 });

  delete process.env.WT_SESSION;
  setProcessPlatform(t, "darwin");
  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(execCalls.shift(), {
    command: "osascript",
    args: ["-e", 'display notification "Ready\'s body" with title "Pi\'s App"'],
    options: { timeout: 10_000 },
  });

  setProcessPlatform(t, "linux");
  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(execCalls.shift(), {
    command: "notify-send",
    args: ["Pi's App", "Ready's body"],
    options: { timeout: 10_000 },
  });
  assert.equal(execCalls.length, 0);
});

test("notify selects sound commands and falls back from canberra to paplay on linux", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, "WT_SESSION", undefined);
  setEnvVar(t, "WSL_DISTRO_NAME", undefined);

  writeNotifyConfig(path.join(agentDir, "extensions", "notify.json"), {
    enabled: true,
    onlyWhenInteractive: false,
    channels: {
      terminal: false,
      desktop: false,
      bell: false,
      sound: true,
    },
    sound: {
      backend: "auto",
      frequencyHz: 880,
      durationMs: 120,
      linuxSoundId: "complete",
    },
  });

  const execCalls = patchExecFile(t, ({ command, callback }) => {
    if (command === "canberra-gtk-play") {
      callback(new Error("missing canberra"));
      return;
    }
    callback(null, "", "");
  });
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  setProcessPlatform(t, "linux");
  setEnvVar(t, "WT_SESSION", "wt-session");
  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(execCalls.shift(), {
    command: "powershell.exe",
    args: ["-NoProfile", "-Command", "[console]::beep(880, 120)"],
    options: { timeout: 10_000 },
  });

  delete process.env.WT_SESSION;
  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(execCalls.splice(0), [
    {
      command: "canberra-gtk-play",
      args: ["-i", "complete"],
      options: { timeout: 10_000 },
    },
    {
      command: "paplay",
      args: ["/usr/share/sounds/freedesktop/stereo/complete.oga"],
      options: { timeout: 10_000 },
    },
  ]);
});

test("notify falls back to valid config and warns when project config JSON is invalid", async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, "TMUX", undefined);

  writeNotifyConfig(path.join(agentDir, "extensions", "notify.json"), {
    enabled: true,
    onlyWhenInteractive: false,
    title: "Global Title",
    body: "Global Body",
    channels: {
      terminal: true,
      desktop: false,
      bell: false,
      sound: false,
    },
    terminal: {
      backend: "osc777",
    },
  });

  const invalidProjectConfigPath = path.join(projectDir, CONFIG_DIR_NAME, "notify.json");
  writeFileSync(invalidProjectConfigPath, "{ invalid json\n");

  patchExecFile(t, ({ callback }) => callback(null, "", ""));
  const writes = captureStdout(t);
  const consoleErrors = captureConsoleErrors(t);
  const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get("agent_settled");
  assert.equal(typeof handler, "function");

  await handler(
    {},
    {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    },
  );

  assert.deepEqual(writes, ["\x1b]777;notify;Global Title;Global Body\x07"]);
  assert.equal(consoleErrors.length, 1);
  assert.match(
    consoleErrors[0],
    new RegExp(
      `Warning: Could not parse ${invalidProjectConfigPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`,
    ),
  );
});

for (const [name, config, warning] of [
  ["numeric title", { title: 42 }, "wrong type for title"],
  ["null body", { body: null }, "wrong type for body"],
  ["string enabled", { enabled: "false" }, "wrong type for enabled"],
  [
    "string interactive flag",
    { onlyWhenInteractive: "false" },
    "wrong type for onlyWhenInteractive",
  ],
  ...["terminal", "desktop", "bell", "sound"].map((field) => [
    `string channel ${field}`,
    { channels: { [field]: "false" } },
    `wrong type for channels.${field}`,
  ]),
  [
    "string frequency",
    { sound: { frequencyHz: "1000); Write-Output injected; #" } },
    "wrong type for sound.frequencyHz",
  ],
  ["string duration", { sound: { durationMs: "250" } }, "wrong type for sound.durationMs"],
  ...["name", "linuxSoundId", "command"].map((field) => [
    `numeric sound ${field}`,
    { sound: { [field]: 42 } },
    `wrong type for sound.${field}`,
  ]),
  ...["terminal", "desktop", "sound"].map((section) => [
    `invalid ${section} backend`,
    { [section]: { backend: "invalid" } },
    `invalid value for ${section}.backend`,
  ]),
  [
    "invalid tmux passthrough",
    { terminal: { tmuxPassthrough: "invalid" } },
    "invalid value for terminal.tmuxPassthrough",
  ],
  ...[null, [], "invalid"].map((value) => [
    `root ${JSON.stringify(value)}`,
    value,
    "expected an object.",
  ]),
  ...["channels", "terminal", "desktop", "sound"].flatMap((section) =>
    [null, [], "invalid"].map((value) => [
      `${section} ${JSON.stringify(value)}`,
      { [section]: value },
      `expected an object for ${section}`,
    ]),
  ),
]) {
  test(`notify ignores ${name} and warns`, async (t) => {
    const { agentDir, projectDir } = setupTempDirs(t);
    setAgentDirEnv(t, agentDir);
    setEnvVar(t, "TMUX", undefined);
    setEnvVar(t, "KITTY_WINDOW_ID", undefined);
    setEnvVar(t, "WT_SESSION", "test-session");
    writeNotifyConfig(path.join(agentDir, "extensions", "notify.json"), {
      channels: { bell: false, sound: true },
    });
    const configPath = path.join(projectDir, CONFIG_DIR_NAME, "notify.json");
    writeNotifyConfig(configPath, config);
    const errors = captureConsoleErrors(t);
    const writes = captureStdout(t);
    const calls = patchExecFile(t, ({ callback }) => callback(null, "", ""));
    const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
    const { pi, handlers } = createExtensionHarness();
    notifyExtension(pi);

    await assert.doesNotReject(() =>
      handlers.get("agent_settled")(
        {},
        {
          cwd: projectDir,
          hasUI: true,
          isProjectTrusted: () => true,
        },
      ),
    );

    assert.deepEqual(writes, ["\x1b]777;notify;Pi;Ready for input\x07"]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].command, "powershell.exe");
    assert.match(calls[0].args[2], /CreateToastNotifier\('Pi'\)/);
    assert.match(calls[0].args[2], /CreateTextNode\('Ready for input'\)/);
    assert.deepEqual(calls[1], {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", "[console]::beep(1000, 250)"],
      options: { timeout: 10_000 },
    });
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes(configPath));
    assert.ok(errors[0].includes(warning), errors[0]);
  });
}

for (const field of ["frequencyHz", "durationMs"]) {
  test(`notify rejects non-finite ${field} and handles command timeouts`, async (t) => {
    const { agentDir, projectDir } = setupTempDirs(t);
    setAgentDirEnv(t, agentDir);
    writeFileSync(
      path.join(agentDir, "extensions", "notify.json"),
      `{
      "channels": { "terminal": false, "desktop": false, "bell": false, "sound": true },
      "sound": { "backend": "windows-beep", "${field}": 1e400 }
    }`,
    );
    const errors = captureConsoleErrors(t);
    const calls = patchExecFile(t, ({ options, callback }) => {
      assert.deepEqual(options, { timeout: 10_000 });
      callback(Object.assign(new Error("timed out"), { killed: true, signal: "SIGTERM" }));
    });
    const notifyExtension = await loadFreshExtension("extensions/notify/index.ts");
    const { pi, handlers } = createExtensionHarness();
    notifyExtension(pi);

    await assert.doesNotReject(() =>
      handlers.get("agent_settled")(
        {},
        {
          cwd: projectDir,
          hasUI: true,
        },
      ),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[2], "[console]::beep(1000, 250)");
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes(`invalid value for sound.${field}`));
  });
}
