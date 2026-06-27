import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

async function loadExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath)).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.default;
}

function createPi({ execImpl } = {}) {
  const handlers = new Map();
  const execCalls = [];

  return {
    pi: {
      on(eventName, handler) {
        handlers.set(eventName, handler);
      },
      async exec(...args) {
        execCalls.push(args);
        if (!execImpl) {
          throw new Error('pi.exec should not have been called');
        }
        return execImpl(...args);
      },
    },
    handlers,
    execCalls,
  };
}

test('inline-bash skips extension-origin input before any shell expansion', async () => {
  const inlineBash = await loadExtension('extensions/inline-bash/index.ts');
  const { pi, handlers, execCalls } = createPi();
  inlineBash(pi);

  const inputHandler = handlers.get('input');
  assert.equal(typeof inputHandler, 'function');

  const result = await inputHandler(
    { source: 'extension', text: 'Check !{pwd}', images: ['image-1'] },
    { hasUI: true, ui: { notify() {} } },
  );

  assert.deepEqual(result, { action: 'continue' });
  assert.equal(execCalls.length, 0);
});

test('inline-bash skips whole-line bash commands', async () => {
  const inlineBash = await loadExtension('extensions/inline-bash/index.ts');
  const { pi, handlers, execCalls } = createPi();
  inlineBash(pi);

  const inputHandler = handlers.get('input');
  assert.equal(typeof inputHandler, 'function');

  const result = await inputHandler(
    { source: 'user', text: '  !echo !{pwd}', images: [] },
    { hasUI: true, ui: { notify() {} } },
  );

  assert.deepEqual(result, { action: 'continue' });
  assert.equal(execCalls.length, 0);
});

test('inline-bash expands user inline commands through the extension API', async () => {
  const inlineBash = await loadExtension('extensions/inline-bash/index.ts');
  const notifications = [];
  const { pi, handlers, execCalls } = createPi({
    async execImpl(command, args, options) {
      assert.equal(command, 'bash');
      assert.deepEqual(options, { timeout: 30000 });

      if (args[1] === 'pwd') {
        return { stdout: ' /tmp/project \n', stderr: '', code: 0 };
      }

      if (args[1] === 'git branch --show-current') {
        return { stdout: 'main\n', stderr: '', code: 0 };
      }

      throw new Error(`unexpected command: ${args[1]}`);
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get('input');
  assert.equal(typeof inputHandler, 'function');

  const images = [{ alt: 'diagram' }];
  const result = await inputHandler(
    {
      source: 'user',
      text: 'cwd=!{pwd}; branch=!{git branch --show-current}',
      images,
    },
    {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, {
    action: 'transform',
    text: 'cwd=/tmp/project; branch=main',
    images,
  });
  assert.deepEqual(
    execCalls,
    [
      ['bash', ['-c', 'pwd'], { timeout: 30000 }],
      ['bash', ['-c', 'git branch --show-current'], { timeout: 30000 }],
    ],
  );
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, 'info');
  assert.match(notifications[0].message, /Expanded 2 inline command\(s\):/);
  assert.match(notifications[0].message, /!\{pwd\} -> "\/tmp\/project"/);
  assert.match(notifications[0].message, /!\{git branch --show-current\} -> "main"/);
});

test('inline-bash surfaces command failures safely without throwing', async () => {
  const inlineBash = await loadExtension('extensions/inline-bash/index.ts');
  const notifications = [];
  const { pi, handlers } = createPi({
    async execImpl(command, args) {
      assert.equal(command, 'bash');
      assert.equal(args[1], 'rm -rf /tmp/example');
      return { stdout: '', stderr: 'permission denied\n', code: 1 };
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get('input');
  assert.equal(typeof inputHandler, 'function');

  const result = await inputHandler(
    { source: 'user', text: 'danger=!{rm -rf /tmp/example}', images: [] },
    {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, {
    action: 'transform',
    text: 'danger=permission denied',
    images: [],
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, 'info');
  assert.match(notifications[0].message, /!\{rm -rf \/tmp\/example\} \(exit code 1\) -> "permission denied"/);
});

test('permission-gate blocks dangerous bash commands when no UI is available', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const result = await toolCallHandler(
    { toolName: 'bash', input: { command: 'rm -rf /tmp/example' } },
    { hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: 'Dangerous command blocked (no UI for confirmation)',
  });
});

test('permission-gate respects interactive allow/deny decisions for dangerous bash commands', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  const prompts = [];

  const denyRegistration = createPi();
  permissionGate(denyRegistration.pi);
  const toolCallHandler = denyRegistration.handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const blocked = await toolCallHandler(
    { toolName: 'bash', input: { command: 'sudo rm -rf /tmp/example' } },
    {
      hasUI: true,
      ui: {
        async select(prompt, options) {
          prompts.push({ prompt, options });
          return 'No';
        },
      },
    },
  );

  assert.deepEqual(blocked, { block: true, reason: 'Blocked by user' });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].prompt, /sudo rm -rf \/tmp\/example/);
  assert.deepEqual(prompts[0].options, ['Yes', 'No']);

  const allowed = await toolCallHandler(
    { toolName: 'bash', input: { command: 'sudo rm -rf /tmp/example' } },
    {
      hasUI: true,
      ui: {
        async select() {
          return 'Yes';
        },
      },
    },
  );

  assert.equal(allowed, undefined);
});

test('permission-gate allows non-dangerous bash commands without prompting', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const result = await toolCallHandler(
    { toolName: 'bash', input: { command: 'printf "hello"' } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return 'No';
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(prompted, false);
});
