import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExtensionHarness } from './extension-test-helpers.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let importCounter = 0;

async function loadFreshExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath));
  moduleUrl.searchParams.set('test', `${Date.now()}-${importCounter++}`);
  const extensionModule = await import(moduleUrl.href);
  return extensionModule.default;
}

function setupTempDirs(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'notify-extension-test-'));
  const agentDir = path.join(rootDir, 'agent');
  const projectDir = path.join(rootDir, 'project');

  mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  mkdirSync(path.join(projectDir, '.pi'), { recursive: true });
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
  const childProcess = require('node:child_process');
  const original = childProcess.execFile;
  const calls = [];

  childProcess.execFile = (command, args, options, callback) => {
    let actualArgs = args;
    let actualOptions = options;
    let actualCallback = callback;

    if (typeof actualArgs === 'function') {
      actualCallback = actualArgs;
      actualArgs = [];
      actualOptions = undefined;
    } else if (typeof actualOptions === 'function') {
      actualCallback = actualOptions;
      actualOptions = undefined;
    }

    calls.push({
      command,
      args: Array.isArray(actualArgs) ? [...actualArgs] : [],
      options: actualOptions,
    });

    implementation({ command, args: Array.isArray(actualArgs) ? [...actualArgs] : [], options: actualOptions, callback: actualCallback });
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
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
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
    errors.push(args.map((value) => String(value)).join(' '));
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
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    value,
  });

  t.after(() => {
    if (descriptor) {
      Object.defineProperty(process, 'platform', descriptor);
    }
  });
}

test('notify uses trusted project config over global config and ignores untrusted project config', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeNotifyConfig(path.join(agentDir, 'extensions', 'notify.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    title: 'Global Title',
    body: 'Global Body',
    channels: {
      terminal: true,
      desktop: true,
      bell: false,
      sound: false,
    },
    terminal: {
      backend: 'osc99',
    },
    desktop: {
      backend: 'none',
    },
  });

  writeNotifyConfig(path.join(projectDir, '.pi', 'notify.json'), {
    title: 'Project Title',
    body: 'Project Body',
    channels: {
      bell: true,
    },
    terminal: {
      backend: 'osc777',
    },
  });

  const execCalls = patchExecFile(t, ({ callback }) => callback(null, '', ''));
  const writes = captureStdout(t);
  const notifyExtension = await loadFreshExtension('extensions/notify/index.ts');
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get('agent_end');
  assert.equal(typeof handler, 'function');

  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(writes, [
    '\x1b]777;notify;Project Title;Project Body\x07',
    '\x07',
  ]);
  assert.equal(execCalls.length, 0);

  writes.length = 0;

  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => false,
  });

  assert.deepEqual(writes, [
    '\x1b]99;i=1:d=0;Global Title\x1b\\',
    '\x1b]99;i=1:p=body;Global Body\x1b\\',
  ]);
  assert.equal(execCalls.length, 0);
});

test('notify respects enabled and onlyWhenInteractive gating', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  const configPath = path.join(agentDir, 'extensions', 'notify.json');
  const execCalls = patchExecFile(t, ({ callback }) => callback(null, '', ''));
  const writes = captureStdout(t);
  const notifyExtension = await loadFreshExtension('extensions/notify/index.ts');
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get('agent_end');
  assert.equal(typeof handler, 'function');

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
      backend: 'osc777',
    },
    desktop: {
      backend: 'linux',
    },
  });

  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

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
      backend: 'osc777',
    },
    desktop: {
      backend: 'linux',
    },
  });

  await handler({}, {
    cwd: projectDir,
    hasUI: false,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(writes, []);
  assert.equal(execCalls.length, 0);
});

test('notify skips none backends and swallows desktop and sound delivery failures', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeNotifyConfig(path.join(agentDir, 'extensions', 'notify.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    title: 'Ready',
    body: 'Waiting',
    channels: {
      terminal: false,
      desktop: true,
      bell: false,
      sound: true,
    },
    desktop: {
      backend: 'linux',
    },
    sound: {
      backend: 'command',
      command: 'printf fail',
    },
  });

  const execCalls = patchExecFile(t, ({ command, callback }) => callback(new Error(`failed: ${command}`)));
  const writes = captureStdout(t);
  const originalShell = process.env.SHELL;
  process.env.SHELL = '/bin/test-shell';
  t.after(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL;
      return;
    }
    process.env.SHELL = originalShell;
  });

  const notifyExtension = await loadFreshExtension('extensions/notify/index.ts');
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get('agent_end');
  assert.equal(typeof handler, 'function');

  await assert.doesNotReject(() =>
    handler({}, {
      cwd: projectDir,
      hasUI: true,
      isProjectTrusted: () => true,
    }),
  );

  assert.deepEqual(writes, []);
  assert.deepEqual(execCalls.map(({ command, args }) => ({ command, args })), [
    { command: 'notify-send', args: ['Ready', 'Waiting'] },
    { command: '/bin/test-shell', args: ['-lc', 'printf fail'] },
  ]);
});

test('notify auto-selects terminal backends and preserves OSC formatting', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeNotifyConfig(path.join(agentDir, 'extensions', 'notify.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    title: 'Edge Title',
    body: 'Edge Body',
    channels: {
      terminal: true,
      desktop: false,
      bell: false,
      sound: false,
    },
    terminal: {
      backend: 'auto',
    },
  });

  patchExecFile(t, ({ callback }) => callback(null, '', ''));
  const writes = captureStdout(t);
  const notifyExtension = await loadFreshExtension('extensions/notify/index.ts');
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get('agent_end');
  assert.equal(typeof handler, 'function');

  setEnvVar(t, 'KITTY_WINDOW_ID', 'window-1');
  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(writes, [
    '\x1b]99;i=1:d=0;Edge Title\x1b\\',
    '\x1b]99;i=1:p=body;Edge Body\x1b\\',
  ]);

  writes.length = 0;
  delete process.env.KITTY_WINDOW_ID;

  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(writes, [
    '\x1b]777;notify;Edge Title;Edge Body\x07',
  ]);
});

test('notify selects the expected desktop backend commands for auto detection', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, 'WT_SESSION', undefined);
  setEnvVar(t, 'WSL_DISTRO_NAME', undefined);

  writeNotifyConfig(path.join(agentDir, 'extensions', 'notify.json'), {
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
      backend: 'auto',
    },
  });

  const execCalls = patchExecFile(t, ({ callback }) => callback(null, '', ''));
  const notifyExtension = await loadFreshExtension('extensions/notify/index.ts');
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get('agent_end');
  assert.equal(typeof handler, 'function');

  setProcessPlatform(t, 'linux');
  setEnvVar(t, 'WT_SESSION', 'wt-session');
  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  const windowsCall = execCalls.shift();
  assert.equal(windowsCall?.command, 'powershell.exe');
  assert.deepEqual(windowsCall?.args.slice(0, 2), ['-NoProfile', '-Command']);
  assert.match(windowsCall?.args[2] ?? '', /ToastNotificationManager/);
  assert.match(windowsCall?.args[2] ?? '', /CreateTextNode\('Ready''s body'\)/);
  assert.match(windowsCall?.args[2] ?? '', /CreateToastNotifier\('Pi''s App'\)/);
  assert.equal(windowsCall?.options, undefined);

  delete process.env.WT_SESSION;
  setProcessPlatform(t, 'darwin');
  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(execCalls.shift(), {
    command: 'osascript',
    args: ['-e', 'display notification "Ready\'s body" with title "Pi\'s App"'],
    options: undefined,
  });

  setProcessPlatform(t, 'linux');
  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(execCalls.shift(), {
    command: 'notify-send',
    args: ["Pi's App", "Ready's body"],
    options: undefined,
  });
  assert.equal(execCalls.length, 0);
});

test('notify selects sound commands and falls back from canberra to paplay on linux', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);
  setEnvVar(t, 'WT_SESSION', undefined);
  setEnvVar(t, 'WSL_DISTRO_NAME', undefined);

  writeNotifyConfig(path.join(agentDir, 'extensions', 'notify.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    channels: {
      terminal: false,
      desktop: false,
      bell: false,
      sound: true,
    },
    sound: {
      backend: 'auto',
      frequencyHz: 880,
      durationMs: 120,
      linuxSoundId: 'complete',
    },
  });

  const execCalls = patchExecFile(t, ({ command, callback }) => {
    if (command === 'canberra-gtk-play') {
      callback(new Error('missing canberra'));
      return;
    }
    callback(null, '', '');
  });
  const notifyExtension = await loadFreshExtension('extensions/notify/index.ts');
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get('agent_end');
  assert.equal(typeof handler, 'function');

  setProcessPlatform(t, 'linux');
  setEnvVar(t, 'WT_SESSION', 'wt-session');
  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(execCalls.shift(), {
    command: 'powershell.exe',
    args: ['-NoProfile', '-Command', '[console]::beep(880, 120)'],
    options: undefined,
  });

  delete process.env.WT_SESSION;
  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(execCalls.splice(0), [
    {
      command: 'canberra-gtk-play',
      args: ['-i', 'complete'],
      options: undefined,
    },
    {
      command: 'paplay',
      args: ['/usr/share/sounds/freedesktop/stereo/complete.oga'],
      options: undefined,
    },
  ]);
});

test('notify falls back to valid config and warns when project config JSON is invalid', async (t) => {
  const { agentDir, projectDir } = setupTempDirs(t);
  setAgentDirEnv(t, agentDir);

  writeNotifyConfig(path.join(agentDir, 'extensions', 'notify.json'), {
    enabled: true,
    onlyWhenInteractive: false,
    title: 'Global Title',
    body: 'Global Body',
    channels: {
      terminal: true,
      desktop: false,
      bell: false,
      sound: false,
    },
    terminal: {
      backend: 'osc777',
    },
  });

  const invalidProjectConfigPath = path.join(projectDir, '.pi', 'notify.json');
  writeFileSync(invalidProjectConfigPath, '{ invalid json\n');

  patchExecFile(t, ({ callback }) => callback(null, '', ''));
  const writes = captureStdout(t);
  const consoleErrors = captureConsoleErrors(t);
  const notifyExtension = await loadFreshExtension('extensions/notify/index.ts');
  const { pi, handlers } = createExtensionHarness();
  notifyExtension(pi);

  const handler = handlers.get('agent_end');
  assert.equal(typeof handler, 'function');

  await handler({}, {
    cwd: projectDir,
    hasUI: true,
    isProjectTrusted: () => true,
  });

  assert.deepEqual(writes, ['\x1b]777;notify;Global Title;Global Body\x07']);
  assert.equal(consoleErrors.length, 1);
  assert.match(consoleErrors[0], new RegExp(`Warning: Could not parse ${invalidProjectConfigPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`));
});
