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

test('inline-bash expands inline commands without UI notifications when no UI is available', async () => {
  const inlineBash = await loadExtension('extensions/inline-bash/index.ts');
  const { pi, handlers, execCalls } = createPi({
    async execImpl(command, args, options) {
      assert.equal(command, 'bash');
      assert.deepEqual(args, ['-c', 'pwd']);
      assert.deepEqual(options, { timeout: 30000 });
      return { stdout: '/tmp/no-ui\n', stderr: '', code: 0 };
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get('input');
  assert.equal(typeof inputHandler, 'function');

  const result = await inputHandler(
    { source: 'user', text: 'cwd=!{pwd}', images: [] },
    { hasUI: false },
  );

  assert.deepEqual(result, {
    action: 'transform',
    text: 'cwd=/tmp/no-ui',
    images: [],
  });
  assert.deepEqual(execCalls, [['bash', ['-c', 'pwd'], { timeout: 30000 }]]);
});

test('inline-bash renders pi.exec throw failures inline without crashing', async () => {
  const inlineBash = await loadExtension('extensions/inline-bash/index.ts');
  const notifications = [];
  const { pi, handlers } = createPi({
    async execImpl() {
      throw 'shell stub crashed';
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get('input');
  assert.equal(typeof inputHandler, 'function');

  const result = await inputHandler(
    { source: 'user', text: 'oops=!{pwd}', images: [] },
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
    text: 'oops=[error: shell stub crashed]',
    images: [],
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, 'info');
  assert.match(notifications[0].message, /!\{pwd\} \(shell stub crashed\) -> ""/);
});

test('inline-bash truncates very large command output', async () => {
  const inlineBash = await loadExtension('extensions/inline-bash/index.ts');
  const hugeOutput = `${'x'.repeat(50010)}\n`;
  const { pi, handlers } = createPi({
    async execImpl() {
      return { stdout: hugeOutput, stderr: '', code: 0 };
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get('input');
  assert.equal(typeof inputHandler, 'function');

  const result = await inputHandler(
    { source: 'user', text: 'blob=!{python - <<\'PY\'}', images: [] },
    { hasUI: false },
  );

  const expectedText = `blob=${'x'.repeat(50000)}\n[inline-bash output truncated after 50000 characters]`;

  assert.equal(result.action, 'transform');
  assert.deepEqual(result.images, []);
  assert.equal(result.text, expectedText);
});

test('inline-bash expands repeated inline patterns in a single prompt', async () => {
  const inlineBash = await loadExtension('extensions/inline-bash/index.ts');
  const outputs = ['/tmp/one\n', '/tmp/two\n'];
  const { pi, handlers, execCalls } = createPi({
    async execImpl(command, args) {
      assert.equal(command, 'bash');
      assert.equal(args[1], 'pwd');
      return { stdout: outputs.shift(), stderr: '', code: 0 };
    },
  });
  inlineBash(pi);

  const inputHandler = handlers.get('input');
  assert.equal(typeof inputHandler, 'function');

  const result = await inputHandler(
    { source: 'user', text: 'first=!{pwd}; second=!{pwd}', images: [] },
    { hasUI: false },
  );

  assert.deepEqual(result, {
    action: 'transform',
    text: 'first=/tmp/one; second=/tmp/two',
    images: [],
  });
  assert.deepEqual(execCalls, [
    ['bash', ['-c', 'pwd'], { timeout: 30000 }],
    ['bash', ['-c', 'pwd'], { timeout: 30000 }],
  ]);
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

test('permission-gate ignores non-bash tool events', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const result = await toolCallHandler(
    { toolName: 'read', input: { command: 'sudo rm -rf /tmp/example' } },
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

test('permission-gate blocks destructive rm variants and shell wrappers when no UI is available', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  for (const command of [
    'rm -rf /tmp/example',
    'rm -fr /tmp/example',
    'rm -r -f /tmp/example',
    'rm -f -r /tmp/example',
    'rm -Rf /tmp/example',
    'rm -fR /tmp/example',
    'rm --recursive --force /tmp/example',
    'rm --force --recursive /tmp/example',
    'rm /tmp/example -rf',
    '/bin/rm -rf /tmp/example',
    'command rm -rf /tmp/example',
    'command -- rm -rf /tmp/example',
    'env rm -rf /tmp/example',
    'env -u PATH rm -rf /tmp/example',
    'env -uPATH rm -rf /tmp/example',
    'env --unset PATH rm -rf /tmp/example',
    'env --unset=PATH rm -rf /tmp/example',
    'env -C /tmp rm -rf example',
    'env -C/tmp rm -rf example',
    'env --chdir /tmp rm -rf example',
    'env --chdir=/tmp rm -rf example',
    'xargs rm -rf < paths.txt',
    'xargs -n1 rm -rf < paths.txt',
    'xargs -n 1 rm -rf < paths.txt',
    'xargs --max-args=1 rm -rf < paths.txt',
    'xargs -P4 rm -rf < paths.txt',
    'xargs -P 4 rm -rf < paths.txt',
    'xargs --max-procs=4 rm -rf < paths.txt',
    'xargs -I{} rm -rf {}',
    'xargs -I {} rm -rf {}',
    'xargs --replace={} rm -rf {}',
    'xargs -apaths.txt rm -rf',
    'xargs -a paths.txt rm -rf',
    'xargs --arg-file=paths.txt rm -rf',
    'find . -name tmp -exec rm -rf {} +',
    'find . -execdir rm -rf {} +',
    'printf ok $(rm -rf /tmp/example)',
    'echo "$(rm -rf /tmp/example)"',
    'echo "before `rm -rf /tmp/example` after"',
    'sh -c "rm -rf /tmp/example"',
    "sh -c 'rm -rf /tmp/example'",
    '/bin/bash -c "rm -rf /tmp/example"',
    'bash -lc "rm -rf /tmp/example"',
    'zsh -fc "rm -rf /tmp/example"',
    'dash -c "rm -rf /tmp/example"',
    'ksh -c "rm -rf /tmp/example"',
    'command /bin/bash -c "rm -rf /tmp/example"',
    'env SHELL=/bin/sh sh -c "rm -rf /tmp/example"',
    'eval "rm -rf /tmp/example"',
    "eval 'rm -rf /tmp/example'",
    'eval rm -rf /tmp/example',
    '(rm -rf /tmp/example)',
  ]) {
    const result = await toolCallHandler(
      { toolName: 'bash', input: { command } },
      { hasUI: false },
    );

    assert.deepEqual(result, {
      block: true,
      reason: 'Dangerous command blocked (no UI for confirmation)',
    }, command);
  }
});

test('permission-gate keeps wrapper handling shallow with explicit expected outcomes', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const expectedOutcomes = [
    { command: 'command -v rm', blocked: false },
    { command: 'command -V rm', blocked: false },
    { command: 'env --help', blocked: false },
    { command: 'env --version', blocked: false },
    { command: 'xargs --help', blocked: false },
    { command: 'xargs --version', blocked: false },
    { command: 'rm -- -rf', blocked: false },
    { command: 'rm -r -- -f', blocked: false },
    { command: 'rm -f -- -R', blocked: false },
    { command: 'env -u PATH printf ok', blocked: false },
    { command: 'xargs -n1 printf ok < paths.txt', blocked: false },
    { command: 'command -p rm -rf /tmp/example', blocked: true },
    { command: 'env --unset=PATH rm -rf /tmp/example', blocked: true },
    { command: 'xargs --replace={} rm -rf {}', blocked: true },
    { command: 'env /bin/bash -lc "rm -rf /tmp/example"', blocked: true },
    { command: 'eval rm -rf /tmp/example', blocked: true },
  ];

  for (const { command, blocked } of expectedOutcomes) {
    const result = await toolCallHandler(
      { toolName: 'bash', input: { command } },
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

    assert.equal(Boolean(result?.block), blocked, command);
    if (blocked) {
      assert.deepEqual(result, { block: true, reason: 'Blocked by user' }, command);
    } else {
      assert.equal(result, undefined, command);
    }
  }

  assert.equal(prompted, true);
});

test('permission-gate blocks malformed bash inputs without prompting', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const missingCommand = await toolCallHandler(
    { toolName: 'bash', input: {} },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return 'Yes';
        },
      },
    },
  );
  const arrayCommand = await toolCallHandler(
    { toolName: 'bash', input: { command: ['rm', '-rf', '/tmp/example'] } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return 'Yes';
        },
      },
    },
  );

  assert.deepEqual(missingCommand, {
    block: true,
    reason: 'Malformed bash command blocked',
  });
  assert.deepEqual(arrayCommand, {
    block: true,
    reason: 'Malformed bash command blocked',
  });
  assert.equal(prompted, false);
});

test('permission-gate blocks malformed write/edit inputs without prompting', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const missingWritePath = await toolCallHandler(
    { toolName: 'write', input: { content: 'x' } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return 'Yes';
        },
      },
    },
  );
  const nonStringWriteContent = await toolCallHandler(
    { toolName: 'write', input: { path: '.env', content: ['x'] } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return 'Yes';
        },
      },
    },
  );
  const blankEditPath = await toolCallHandler(
    { toolName: 'edit', input: { path: '   ', edits: [] } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return 'Yes';
        },
      },
    },
  );
  const malformedEditShape = await toolCallHandler(
    { toolName: 'edit', input: { path: '.env', edits: [{ oldText: 'a', newText: 1 }] } },
    {
      hasUI: true,
      ui: {
        async select() {
          prompted = true;
          return 'Yes';
        },
      },
    },
  );

  assert.deepEqual(missingWritePath, {
    block: true,
    reason: 'Malformed write input blocked',
  });
  assert.deepEqual(nonStringWriteContent, {
    block: true,
    reason: 'Malformed write input blocked',
  });
  assert.deepEqual(blankEditPath, {
    block: true,
    reason: 'Malformed edit input blocked',
  });
  assert.deepEqual(malformedEditShape, {
    block: true,
    reason: 'Malformed edit input blocked',
  });
  assert.equal(prompted, false);
});

test('permission-gate blocks protected write/edit paths without UI after normalization', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const protectedWrite = await toolCallHandler(
    { toolName: 'write', input: { path: 'scratch/../.git/config', content: 'x' } },
    { hasUI: false },
  );
  const protectedEdit = await toolCallHandler(
    {
      toolName: 'edit',
      input: { path: './tmp/../node_modules/pkg/index.js', edits: [{ oldText: 'a', newText: 'b' }] },
    },
    { hasUI: false },
  );
  const protectedEnv = await toolCallHandler(
    { toolName: 'write', input: { path: '/tmp/project/.env.production', content: 'SECRET=1' } },
    { hasUI: false },
  );

  assert.deepEqual(protectedWrite, {
    block: true,
    reason: 'Protected path blocked (write without UI confirmation): scratch/../.git/config',
  });
  assert.deepEqual(protectedEdit, {
    block: true,
    reason: 'Protected path blocked (edit without UI confirmation): ./tmp/../node_modules/pkg/index.js',
  });
  assert.deepEqual(protectedEnv, {
    block: true,
    reason: 'Protected path blocked (write without UI confirmation): /tmp/project/.env.production',
  });
});

test('permission-gate blocks leading-at and case-insensitive protected path bypasses', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const cases = [
    { toolName: 'write', input: { path: '@.git/config', content: 'x' } },
    { toolName: 'write', input: { path: '@/repo/NODE_MODULES/pkg/index.js', content: 'x' } },
    {
      toolName: 'edit',
      input: { path: '@config/.ENV.Production', edits: [{ oldText: 'a', newText: 'b' }] },
    },
    { toolName: 'write', input: { path: '@config/../.GiT/config', content: 'x' } },
  ];

  for (const event of cases) {
    const result = await toolCallHandler(event, { hasUI: false });
    assert.equal(result?.block, true, `expected ${event.input.path} to be blocked`);
    assert.match(result.reason, /Protected path blocked/);
  }
});

test('permission-gate respects interactive allow/deny decisions for protected write/edit paths', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  const prompts = [];
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const blocked = await toolCallHandler(
    { toolName: 'write', input: { path: '.env', content: 'SECRET=1' } },
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
  assert.match(prompts[0].prompt, /Protected path write request/);
  assert.match(prompts[0].prompt, /\.env/);
  assert.deepEqual(prompts[0].options, ['Yes', 'No']);

  const allowed = await toolCallHandler(
    {
      toolName: 'edit',
      input: { path: 'config/../.git/config', edits: [{ oldText: 'a', newText: 'b' }] },
    },
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

test('permission-gate matches protected path segments exactly and skips safe env templates', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const safeGitNamedFile = await toolCallHandler(
    { toolName: 'write', input: { path: 'docs/.gitignore', content: 'x' } },
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
  const safeNodeModulesNamedDir = await toolCallHandler(
    {
      toolName: 'edit',
      input: { path: 'vendor/node_modules-cache/index.js', edits: [{ oldText: 'a', newText: 'b' }] },
    },
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
  const safeEnvExample = await toolCallHandler(
    { toolName: 'write', input: { path: '.env.example', content: 'KEY=' } },
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
  const safeNestedEnvTemplate = await toolCallHandler(
    { toolName: 'write', input: { path: 'config/.env.production.template', content: 'KEY=' } },
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
  const safeEnvrc = await toolCallHandler(
    { toolName: 'write', input: { path: '.envrc', content: 'layout node' } },
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

  assert.equal(safeGitNamedFile, undefined);
  assert.equal(safeNodeModulesNamedDir, undefined);
  assert.equal(safeEnvExample, undefined);
  assert.equal(safeNestedEnvTemplate, undefined);
  assert.equal(safeEnvrc, undefined);
  assert.equal(prompted, false);
});

test('permission-gate only excludes terminal env example/template suffixes', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const safeUppercaseTemplate = await toolCallHandler(
    { toolName: 'write', input: { path: '.ENV.PRODUCTION.TEMPLATE', content: 'KEY=' } },
    { hasUI: false },
  );
  const unsafeExampleSecret = await toolCallHandler(
    { toolName: 'write', input: { path: '.env.example.secret', content: 'SECRET=1' } },
    { hasUI: false },
  );
  const unsafeTemplateLocal = await toolCallHandler(
    {
      toolName: 'edit',
      input: { path: '.ENV.TEMPLATE.LOCAL', edits: [{ oldText: 'a', newText: 'b' }] },
    },
    { hasUI: false },
  );

  assert.equal(safeUppercaseTemplate, undefined);
  assert.equal(unsafeExampleSecret?.block, true);
  assert.match(unsafeExampleSecret.reason, /Protected path blocked/);
  assert.equal(unsafeTemplateLocal?.block, true);
  assert.match(unsafeTemplateLocal.reason, /Protected path blocked/);
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

test('permission-gate preserves benign quoted display text while still catching substitutions', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  for (const command of [
    'printf "%s\\n" "rm -rf /tmp/example"',
    'echo "rm -rf /tmp/example"',
    "printf '%s\n' 'rm -rf /tmp/example'",
    'rm -r /tmp/example',
    'rm -f /tmp/example',
    'env printf "%s\\n" "rm -rf /tmp/example"',
  ]) {
    const result = await toolCallHandler(
      { toolName: 'bash', input: { command } },
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

    assert.equal(result, undefined, command);
  }

  const backtickSubstitution = await toolCallHandler(
    { toolName: 'bash', input: { command: 'echo `rm -rf /tmp/example`' } },
    { hasUI: false },
  );

  assert.equal(prompted, false);
  assert.deepEqual(backtickSubstitution, {
    block: true,
    reason: 'Dangerous command blocked (no UI for confirmation)',
  });
});

test('permission-gate distinguishes safe and dangerous command boundaries', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  let prompted = false;
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  const safeResult = await toolCallHandler(
    {
      toolName: 'bash',
      input: { command: 'echo "safe & rm -Rf /tmp/example" && chmod 755 ./script.sh && rmdir ./tmp && rm -r /tmp/example && rm -R /tmp/example && rm -f /tmp/example' },
    },
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
  const dangerousRecursiveRm = await toolCallHandler(
    { toolName: 'bash', input: { command: 'printf ok & rm -fr /tmp/example' } },
    { hasUI: false },
  );
  const dangerousChmod = await toolCallHandler(
    { toolName: 'bash', input: { command: 'chmod 777 ./script.sh' } },
    { hasUI: false },
  );

  assert.equal(safeResult, undefined);
  assert.equal(prompted, false);
  assert.deepEqual(dangerousRecursiveRm, {
    block: true,
    reason: 'Dangerous command blocked (no UI for confirmation)',
  });
  assert.deepEqual(dangerousChmod, {
    block: true,
    reason: 'Dangerous command blocked (no UI for confirmation)',
  });
});
