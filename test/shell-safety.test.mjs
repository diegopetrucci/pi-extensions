import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  analyzePowerShellAstPayload,
  analyzePowerShellLexically,
  buildPowerShellAstCommand,
  MAX_POWERSHELL_ANALYSIS_SOURCE_BYTES,
  parsePowerShellAstOutput,
  POWERSHELL_AST_MARKER,
} from '../extensions/permission-gate/powershell-safety.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const execFileAsync = promisify(execFile);

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

async function executePowerShellAnalyzer(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: options.timeout,
      signal: options.signal,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0, killed: false };
  } catch (error) {
    return {
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : String(error),
      code: typeof error?.code === 'number' ? error.code : 1,
      killed: Boolean(error?.killed),
    };
  }
}

function createPowerShellPi() {
  return process.platform === 'win32'
    ? createPi({ execImpl: executePowerShellAnalyzer })
    : createPi();
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

test('permission-gate ignores non-shell tool events', async () => {
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

test('PowerShell fallback analysis covers native syntax and keeps quoted/commented text benign', () => {
  const riskyCommands = [
    "Microsoft.PowerShell.Management\\Remove-Item -Recurse -Force 'C:\\temp\\example'",
    "Remove-Item (Join-Path $env:TEMP example) -Recurse -Force",
    "Write-Output \"result: $(Remove-Item -Recurse -Force 'C:\\temp\\example')\"",
    "Write-Output @\"\nresult: $(Remove-Item -Recurse -Force 'C:\\temp\\example')\n\"@",
    "Remove-Item -Recurse `\n-Force 'C:\\temp\\example'",
    "Remove-Item -Re`curse -Fo`rce 'C:\\temp\\example'",
    "$parameters = @{ Recurse = $true; Force = $true }; Remove-Item @parameters",
    "$parameters = @{ Recurse = $true; Force = $true }; Remove-Item @global:parameters",
    "$command = 'Remove-Item'; & $command -Recurse -Force 'C:\\temp\\example'",
    "Set-Alias zap Remove-Item; zap -Recurse -Force 'C:\\temp\\example'",
    "Set-Item 'Alias:zap' Remove-Item; zap -Recurse -Force 'C:\\temp\\example'",
    "New-Item ('Ali' + 'as:zap') -Value Remove-Item; zap -Recurse -Force 'C:\\temp\\example'",
    "Set-Content 'Function:\\zap' \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"; zap",
    "Remove-Item 'Alias:zap'; zap -Recurse -Force 'C:\\temp\\example'",
    "Push-Location Alias:; New-Item zap -Value Remove-Item; Pop-Location; zap -Recurse -Force 'C:\\temp\\example'",
    "Set-Location Function:; Set-Content zap \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"; zap",
    "Remove-Module commands; zap -Recurse -Force 'C:\\temp\\example'",
    "Import-Module '.\\commands.psm1'; zap -Recurse -Force 'C:\\temp\\example'",
    "& '.\\cleanup.ps1'",
    "start powershell.exe -ArgumentList '-Command Remove-Item -Recurse -Force C:\\temp\\example'",
    "Start-Job -ScriptBlock { Remove-Item -Recurse -Force 'C:\\temp\\example' }",
    "Start-ThreadJob -ScriptBlock ([scriptblock]'Remove-Item -Recurse -Force C:\\temp\\example')",
    "[System.Diagnostics.Process]::Start('powershell.exe', '-Command Remove-Item -Recurse -Force C:\\temp\\example')",
    "$p = New-Object System.Diagnostics.Process; $p.StartInfo.FileName = 'powershell.exe'; $p.Start()",
    "$method = 'Start'; $p = New-Object System.Diagnostics.Process; $p.$method()",
    "$p = New-Object System.Diagnostics.Process; ($p).'Start'()",
    "${t}::'ShellExecute'('powershell.exe', '-Command Remove-Item -Recurse -Force C:\\temp\\example')",
    "$ExecutionContext.InvokeCommand.InvokeScript('Remove-Item -Recurse -Force C:\\temp\\example')",
    "Remove-Item -Recurse -Force -WhatIf:$(1 -eq 1) 'C:\\temp\\example'",
    "Write-Output ok }",
    "try { Write-Output ok",
    "<# Remove-Item -Recurse -Force 'C:\\temp\\example'",
  ];
  const safeCommands = [
    "Write-Output \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"",
    "Write-Output 'sudo chmod 777'",
    "Write-Output ok; # Remove-Item -Recurse -Force 'C:\\temp\\example'",
    "<# Remove-Item -Recurse -Force 'C:\\temp\\example' #>\nWrite-Output ok",
    "Remove-Item -Recurse -Force -WhatIf 'C:\\temp\\example'",
    "Remove-Item -Recurse -Force -WhatIf:$true 'C:\\temp\\example'",
    "Remove-Item -Recurse -Force -WhatIf:1 'C:\\temp\\example'",
    "Write-Output @'\ndon't execute: Remove-Item -Recurse -Force C:\\temp\\example\n'@",
    "$parameters = @{ Name = 'example'; Enabled = $true }",
    "Set-Location 'C:\\temp'",
    "Push-Location '..'; Pop-Location",
  ];

  for (const command of riskyCommands) {
    assert.equal(analyzePowerShellLexically(command).risky, true, command);
  }
  for (const command of safeCommands) {
    assert.equal(analyzePowerShellLexically(command).risky, false, command);
  }
});

test('PowerShell AST analysis fails closed and classifies parsed command metadata', () => {
  const element = (text, overrides = {}) => ({
    type: 'StringConstantExpressionAst',
    text,
    parameter: null,
    argument: null,
    splatted: false,
    ...overrides,
  });
  const command = (name, elements) => ({
    name,
    invocationOperator: 'Unknown',
    elements,
  });

  const destructive = analyzePowerShellAstPayload({
    parseErrors: [],
    dynamicInvocationCount: 0,
    commands: [
      command('Microsoft.PowerShell.Management\\Remove-Item', [
        element('Microsoft.PowerShell.Management\\Remove-Item'),
        element('-Recurse', { type: 'CommandParameterAst', parameter: 'Recurse' }),
        element('-Force', { type: 'CommandParameterAst', parameter: 'Force' }),
      ]),
    ],
  });
  const whatIf = analyzePowerShellAstPayload({
    parseErrors: [],
    dynamicInvocationCount: 0,
    commands: [
      command('Remove-Item', [
        element('Remove-Item'),
        element('-Recurse', { type: 'CommandParameterAst', parameter: 'Recurse' }),
        element('-Force', { type: 'CommandParameterAst', parameter: 'Force' }),
        element('-WhatIf', { type: 'CommandParameterAst', parameter: 'WhatIf' }),
      ]),
    ],
  });
  const quotedDisplay = analyzePowerShellAstPayload({
    parseErrors: [],
    dynamicInvocationCount: 0,
    commands: [command('Write-Output', [element('Write-Output'), element("'sudo chmod 777'")])],
  });
  const aliasMutation = analyzePowerShellAstPayload({
    parseErrors: [],
    dynamicInvocationCount: 0,
    commands: [command('Set-Alias', [element('Set-Alias'), element('zap'), element('Remove-Item')])],
  });
  const dynamicMemberInvocation = analyzePowerShellAstPayload({
    parseErrors: [],
    dynamicInvocationCount: 1,
    commands: [],
  });

  assert.equal(destructive.risky, true);
  assert.equal(whatIf.risky, false);
  assert.equal(quotedDisplay.risky, false);
  assert.equal(aliasMutation.risky, true);
  assert.equal(dynamicMemberInvocation.risky, true);
  assert.equal(analyzePowerShellAstPayload({ parseErrors: ['Unexpected token'], commands: [], dynamicInvocationCount: 0 }).risky, true);
  assert.equal(analyzePowerShellAstPayload({ parseErrors: [], commands: [command(null, [])], dynamicInvocationCount: 0 }).risky, true);
  assert.equal(analyzePowerShellAstPayload({ analyzerError: 'parser unavailable' }).risky, true);
  assert.equal(analyzePowerShellAstPayload({ analyzerError: true, parseErrors: [], commands: [], dynamicInvocationCount: 0 }).risky, true);
  assert.equal(analyzePowerShellAstPayload({ parseErrors: [], commands: [{ name: 'Get-Date' }], dynamicInvocationCount: 0 }).risky, true);
  assert.equal(analyzePowerShellAstPayload({ parseErrors: [], commands: [command('Get-Date', [])], dynamicInvocationCount: 0 }).risky, true);
  assert.equal(analyzePowerShellAstPayload({ parseErrors: [], commands: [], dynamicInvocationCount: -1 }).risky, true);
});

test('PowerShell AST output parsing uses the final marked payload and rejects malformed output', () => {
  const safePayload = JSON.stringify({
    parseErrors: [],
    dynamicInvocationCount: 0,
    commands: [{
      name: 'Write-Output',
      invocationOperator: 'Unknown',
      elements: [{
        type: 'StringConstantExpressionAst',
        text: 'Write-Output',
        parameter: null,
        argument: null,
        splatted: false,
      }],
    }],
  });

  assert.equal(parsePowerShellAstOutput(`startup noise\n${POWERSHELL_AST_MARKER}${safePayload}\n`).risky, false);
  assert.equal(parsePowerShellAstOutput('startup noise only').risky, true);
  assert.equal(parsePowerShellAstOutput(`${POWERSHELL_AST_MARKER}{not-json}`).risky, true);
});

test('native Windows PowerShell parsers classify AST-only and fallback-sensitive forms', {
  skip: process.platform !== 'win32',
}, async () => {
  const powerShellArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];
  const exactBoundaryPrefix = "Write-Output '";
  const exactBoundarySuffix = "'";
  const exactBoundaryCommand = `${exactBoundaryPrefix}${'a'.repeat(
    MAX_POWERSHELL_ANALYSIS_SOURCE_BYTES - Buffer.byteLength(exactBoundaryPrefix + exactBoundarySuffix, 'utf8'),
  )}${exactBoundarySuffix}`;
  assert.equal(Buffer.byteLength(exactBoundaryCommand, 'utf8'), MAX_POWERSHELL_ANALYSIS_SOURCE_BYTES);

  const cases = [
    ["Write-Output 'hello'", false],
    ["Write-Output \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"", false],
    ["Remove-Item -Recurse -Force -WhatIf 'C:\\temp\\example'", false],
    ["Microsoft.PowerShell.Management\\Remove-Item -Recurse -Force 'C:\\temp\\example'", true],
    ["$parameters = @{}; Remove-Item @global:parameters", true],
    ["Set-Alias zap Remove-Item; zap -Recurse -Force 'C:\\temp\\example'", true],
    ["New-Item ('Ali' + 'as:zap') -Value Remove-Item", true],
    ["Set-Content 'Function:\\zap' \"Write-Output ok\"", true],
    ["Remove-Item 'Alias:zap'", true],
    ["Push-Location Alias:; New-Item zap -Value Remove-Item; Pop-Location", true],
    ["Set-Location Function:; Set-Content zap 'Write-Output ok'", true],
    ["Remove-Module commands", true],
    ["start powershell.exe -ArgumentList '-Command Write-Output ok'", true],
    ["Start-ThreadJob -ScriptBlock ([scriptblock]'Write-Output ok')", true],
    ["[System.Diagnostics.Process]::Start('powershell.exe', '-Command Write-Output ok')", true],
    ["$p = New-Object System.Diagnostics.Process; $p.Start()", true],
    ["$method = 'Start'; $p = New-Object System.Diagnostics.Process; $p.$method()", true],
    ["$p = New-Object System.Diagnostics.Process; $p.('Start')()", true],
    ["$p = New-Object System.Diagnostics.Process; ($p).'Start'()", true],
    ["${t}::'ShellExecute'('powershell.exe', '-Command Write-Output ok')", true],
    ["Write-Output @'\ndon't execute: Remove-Item -Recurse -Force C:\\temp\\example\n'@", false],
    [exactBoundaryCommand, false],
    ["Write-Output ok }", true],
  ];
  const testedShells = [];

  for (const shell of ['pwsh.exe', 'powershell.exe']) {
    try {
      await execFileAsync('where.exe', [shell], { windowsHide: true });
    } catch {
      continue;
    }

    const first = await executePowerShellAnalyzer(
      shell,
      [...powerShellArgs, buildPowerShellAstCommand(cases[0][0])],
      { timeout: 10_000 },
    );
    assert.equal(first.code, 0, `${shell}: ${first.stderr}`);
    assert.equal(parsePowerShellAstOutput(first.stdout).risky, cases[0][1], shell);
    testedShells.push(shell);

    for (const [command, expectedRisk] of cases.slice(1)) {
      const result = await executePowerShellAnalyzer(
        shell,
        [...powerShellArgs, buildPowerShellAstCommand(command)],
        { timeout: 10_000 },
      );
      assert.equal(result.code, 0, `${shell}: ${command}\n${result.stderr}`);
      assert.equal(parsePowerShellAstOutput(result.stdout).risky, expectedRisk, `${shell}: ${command}`);
    }
  }

  assert.ok(testedShells.length > 0, 'expected at least one native PowerShell parser');
  assert.ok(testedShells.includes('powershell.exe'), 'expected to exercise the Windows PowerShell 5.1 fallback');
  if (process.env.PI_REQUIRE_POWERSHELL_7 === '1') {
    assert.ok(testedShells.includes('pwsh.exe'), 'expected to exercise PowerShell 7');
  }
});

test('permission-gate blocks recursive forced PowerShell removals and wrappers without UI', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  const { pi, handlers } = createPowerShellPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');

  for (const command of [
    "Remove-Item -Recurse -Force 'C:\\temp\\example'",
    "remove-item -force -recurse 'C:\\temp\\example'",
    "ri -r -fo 'C:\\temp\\example'",
    "Get-ChildItem 'C:\\temp' | Remove-Item -Rec -For",
    "try { Remove-Item -Recurse -Force 'C:\\temp\\example' }",
    "& 'Remove-Item' -Recurse -Force 'C:\\temp\\example'",
    "$removed = Remove-Item -Recurse -Force 'C:\\temp\\example'",
    "iex \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"",
    "Invoke-Expression -Command \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"",
    "pwsh -Command \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"",
    'pwsh -EncodedCommand UgBlAG0AbwB2AGUALQBJAHQAZQBtACAALQBSAGUAYwB1AHIAcwBlACAALQBGAG8AcgBjAGUA',
    "Write-Output $(Remove-Item -Recurse -Force 'C:\\temp\\example')",
    "Write-Output \"result: $(Remove-Item -Recurse -Force 'C:\\temp\\example')\"",
    "Write-Output @\"\nresult: $(Remove-Item -Recurse -Force 'C:\\temp\\example')\n\"@",
    "Remove-Item (Join-Path $env:TEMP example) -Recurse -Force",
    "Remove-Item -Recurse `\n-Force 'C:\\temp\\example'",
    "Remove-Item -Re`curse -Fo`rce 'C:\\temp\\example'",
    "& \"Remove`-Item\" -Recurse -Force 'C:\\temp\\example'",
    "Microsoft.PowerShell.Management\\Remove-Item -Recurse -Force 'C:\\temp\\example'",
    "$parameters = @{ Recurse = $true; Force = $true; Path = 'C:\\temp\\example' }; Remove-Item @parameters",
    "$parameters = @{ Recurse = $true; Force = $true; Path = 'C:\\temp\\example' }; Remove-Item @global:parameters",
    "$command = 'Remove-Item'; & $command -Recurse -Force 'C:\\temp\\example'",
    "Set-Alias zap Remove-Item; zap -Recurse -Force 'C:\\temp\\example'",
    "Set-Item 'Alias:zap' Remove-Item; zap -Recurse -Force 'C:\\temp\\example'",
    "New-Item ('Ali' + 'as:zap') -Value Remove-Item; zap -Recurse -Force 'C:\\temp\\example'",
    "Set-Content 'Function:\\zap' \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"; zap",
    "Remove-Item 'Alias:zap'; zap -Recurse -Force 'C:\\temp\\example'",
    "Push-Location Alias:; New-Item zap -Value Remove-Item; Pop-Location; zap -Recurse -Force 'C:\\temp\\example'",
    "Set-Location Function:; Set-Content zap \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"; zap",
    "Remove-Module commands; zap -Recurse -Force 'C:\\temp\\example'",
    "Import-Module '.\\commands.psm1'; zap -Recurse -Force 'C:\\temp\\example'",
    "& '.\\cleanup.ps1'",
    "start powershell.exe -ArgumentList '-Command Remove-Item -Recurse -Force C:\\temp\\example'",
    "Start-Job -ScriptBlock { Remove-Item -Recurse -Force 'C:\\temp\\example' }",
    "Start-ThreadJob -ScriptBlock ([scriptblock]'Remove-Item -Recurse -Force C:\\temp\\example')",
    "[System.Diagnostics.Process]::Start('powershell.exe', '-Command Remove-Item -Recurse -Force C:\\temp\\example')",
    "$p = New-Object System.Diagnostics.Process; $p.StartInfo.FileName = 'powershell.exe'; $p.Start()",
    "$method = 'Start'; $p = New-Object System.Diagnostics.Process; $p.$method()",
    "$p = New-Object System.Diagnostics.Process; ($p).'Start'()",
    "${t}::'ShellExecute'('powershell.exe', '-Command Remove-Item -Recurse -Force C:\\temp\\example')",
    "$ExecutionContext.InvokeCommand.InvokeScript('Remove-Item -Recurse -Force C:\\temp\\example')",
    "Remove-Item -Recurse -Force -WhatIf:$(1 -eq 1) 'C:\\temp\\example'",
    "Write-Output ok }",
    "try { Write-Output ok",
    "<# Remove-Item -Recurse -Force 'C:\\temp\\example'",
    `${'$('.repeat(34)}Remove-Item -Recurse -Force 'C:\\temp\\example'${')'.repeat(34)}`,
    'x'.repeat(MAX_POWERSHELL_ANALYSIS_SOURCE_BYTES + 1),
  ]) {
    const result = await toolCallHandler(
      { toolName: 'powershell', input: { command } },
      { hasUI: false },
    );

    assert.deepEqual(result, {
      block: true,
      reason: 'Dangerous command blocked (no UI for confirmation)',
    }, command);
  }
});

test('permission-gate allows non-dangerous PowerShell commands without prompting', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  let prompted = false;
  const { pi, handlers, execCalls } = createPowerShellPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');
  const signal = new AbortController().signal;

  for (const command of [
    "Write-Output 'hello'",
    "Remove-Item 'C:\\temp\\single-file.txt'",
    "Remove-Item -Recurse 'C:\\temp\\example'",
    "Remove-Item -Force 'C:\\temp\\single-file.txt'",
    "Remove-Item -Recurse:$false -Force 'C:\\temp\\single-file.txt'",
    "Write-Output \"Remove-Item -Recurse -Force 'C:\\temp\\example'\"",
    "Write-Output 'sudo chmod 777'",
    "Write-Output ok; # Remove-Item -Recurse -Force 'C:\\temp\\example'",
    "<# Remove-Item -Recurse -Force 'C:\\temp\\example' #>\nWrite-Output ok",
    "Remove-Item -Recurse -Force -WhatIf 'C:\\temp\\example'",
    "Remove-Item -Recurse -Force -WhatIf:$true 'C:\\temp\\example'",
    "Remove-Item -Recurse -Force -WhatIf:1 'C:\\temp\\example'",
    "Write-Output @'\ndon't execute: Remove-Item -Recurse -Force C:\\temp\\example\n'@",
    "$parameters = @{ Name = 'example'; Enabled = $true }",
    "Set-Location 'C:\\temp'",
    "Push-Location '..'; Pop-Location",
    'Get-Command Remove-Item -Syntax',
  ]) {
    const result = await toolCallHandler(
      { toolName: 'powershell', input: { command } },
      {
        hasUI: true,
        signal,
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

  assert.equal(prompted, false);
  if (process.platform === 'win32') {
    assert.ok(execCalls.length > 0);
    assert.ok(execCalls.every(([, , options]) => options.signal === signal));
  }
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
    'time rm -rf /tmp/example',
    '/usr/bin/time /bin/rm -rf /tmp/example',
    'nohup rm -rf /tmp/example',
    'nice rm -rf /tmp/example',
    'nice -n 5 rm -rf /tmp/example',
    'timeout 5 rm -rf /tmp/example',
    'stdbuf -oL rm -rf /tmp/example',
    'busybox rm -rf /tmp/example',
    'busybox sh -c "rm -rf /tmp/example"',
    'time nohup /bin/rm -rf /tmp/example',
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
    'xargs --replace rm -rf',
    'xargs -apaths.txt rm -rf',
    'xargs -a paths.txt rm -rf',
    'xargs --arg-file=paths.txt rm -rf',
    'xargs -E EOF rm -rf < paths.txt',
    'xargs -EEOF rm -rf < paths.txt',
    'xargs --eof=EOF rm -rf < paths.txt',
    'xargs --eof EOF rm -rf',
    'xargs --eof rm -rf',
    'xargs --max-lines rm -rf',
    'find . -name tmp -exec rm -rf {} +',
    'find . -execdir rm -rf {} +',
    'find . -exec time rm -rf {} +',
    'find . -exec /usr/bin/env rm -rf {} +',
    'printf ok $(rm -rf /tmp/example)',
    'echo "$(rm -rf /tmp/example)"',
    'echo "before `rm -rf /tmp/example` after"',
    'sh -c "rm -rf /tmp/example"',
    'sh -c "time rm -rf /tmp/example"',
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
    'eval time rm -rf /tmp/example',
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
    { command: 'command -v rm rm -rf', blocked: false },
    { command: 'env --help', blocked: false },
    { command: 'env --help ignored rm -rf', blocked: false },
    { command: 'env --version', blocked: false },
    { command: 'xargs --help', blocked: false },
    { command: 'xargs --help ignored rm -rf', blocked: false },
    { command: 'xargs --version', blocked: false },
    { command: 'rm -- -rf', blocked: false },
    { command: 'rm -r -- -f', blocked: false },
    { command: 'rm -f -- -R', blocked: false },
    { command: 'time rm -- -rf', blocked: false },
    { command: 'nohup rm -r /tmp/example', blocked: false },
    { command: 'busybox rm -f /tmp/example', blocked: false },
    { command: 'env -u PATH printf ok', blocked: false },
    { command: 'xargs -n1 printf ok < paths.txt', blocked: false },
    { command: 'xargs -E EOF printf ok < paths.txt', blocked: false },
    { command: 'xargs --eof=EOF printf ok < paths.txt', blocked: false },
    { command: 'xargs --eof EOF printf ok', blocked: false },
    { command: 'xargs -E rm -rf', blocked: false },
    { command: 'xargs --eof=rm -rf', blocked: false },
    { command: 'xargs -I rm -rf', blocked: false },
    { command: 'xargs --replace=rm -rf', blocked: false },
    { command: 'xargs -L rm -rf', blocked: false },
    { command: 'xargs --max-lines=rm -rf', blocked: false },
    { command: 'xargs -s 64 printf ok < paths.txt', blocked: false },
    { command: 'xargs --max-chars=64 printf ok < paths.txt', blocked: false },
    { command: 'xargs --max-chars 64 printf ok', blocked: false },
    { command: 'xargs -d : printf ok < paths.txt', blocked: false },
    { command: 'xargs --delimiter=: printf ok < paths.txt', blocked: false },
    { command: 'xargs --delimiter : printf ok', blocked: false },
    { command: 'xargs -L 2 printf ok < paths.txt', blocked: false },
    { command: 'xargs --max-lines=2 printf ok < paths.txt', blocked: false },
    { command: 'xargs --max-lines 2 printf ok', blocked: false },
    { command: 'command -p rm -rf /tmp/example', blocked: true },
    { command: 'time rm -rf /tmp/example', blocked: true },
    { command: 'nohup rm -rf /tmp/example', blocked: true },
    { command: 'busybox rm -rf /tmp/example', blocked: true },
    { command: 'env --unset=PATH rm -rf /tmp/example', blocked: true },
    { command: 'xargs --replace={} rm -rf {}', blocked: true },
    { command: 'xargs --replace rm -rf', blocked: true },
    { command: 'xargs -E EOF rm -rf < paths.txt', blocked: true },
    { command: 'xargs --eof EOF rm -rf', blocked: true },
    { command: 'xargs --eof rm -rf', blocked: true },
    { command: 'xargs -s 64 rm -rf < paths.txt', blocked: true },
    { command: 'xargs --max-chars 64 rm -rf', blocked: true },
    { command: 'xargs -d : rm -rf < paths.txt', blocked: true },
    { command: 'xargs --delimiter : rm -rf', blocked: true },
    { command: 'xargs -L 2 rm -rf < paths.txt', blocked: true },
    { command: 'xargs --max-lines 2 rm -rf', blocked: true },
    { command: 'xargs --max-lines rm -rf', blocked: true },
    { command: 'env /bin/bash -lc "rm -rf /tmp/example"', blocked: true },
    { command: 'eval rm -rf /tmp/example', blocked: true },
    { command: ['printf ok', ...Array.from({ length: 100 }, (_, index) => `arg${index}`)].join(' '), blocked: false },
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

test('permission-gate blocks malformed shell inputs without prompting', async () => {
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
  const missingPowerShellCommand = await toolCallHandler(
    { toolName: 'powershell', input: {} },
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
  const invalidBashTimeout = await toolCallHandler(
    { toolName: 'bash', input: { command: 'printf ok', timeout: '5' } },
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
  const invalidPowerShellTimeout = await toolCallHandler(
    { toolName: 'powershell', input: { command: 'Write-Output ok', timeout: Number.POSITIVE_INFINITY } },
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
  assert.deepEqual(missingPowerShellCommand, {
    block: true,
    reason: 'Malformed powershell command blocked',
  });
  assert.deepEqual(invalidBashTimeout, {
    block: true,
    reason: 'Malformed bash command blocked',
  });
  assert.deepEqual(invalidPowerShellTimeout, {
    block: true,
    reason: 'Malformed powershell command blocked',
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

test('permission-gate respects interactive allow/deny decisions for dangerous PowerShell commands', async () => {
  const permissionGate = await loadExtension('extensions/permission-gate/index.ts');
  const prompts = [];
  const { pi, handlers } = createPi();
  permissionGate(pi);

  const toolCallHandler = handlers.get('tool_call');
  assert.equal(typeof toolCallHandler, 'function');
  const event = {
    toolName: 'powershell',
    input: { command: "Remove-Item -Recurse -Force 'C:\\temp\\example'" },
  };

  const blocked = await toolCallHandler(event, {
    hasUI: true,
    ui: {
      async select(prompt, options) {
        prompts.push({ prompt, options });
        return 'No';
      },
    },
  });

  assert.deepEqual(blocked, { block: true, reason: 'Blocked by user' });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].prompt, /Remove-Item -Recurse -Force/);
  assert.deepEqual(prompts[0].options, ['Yes', 'No']);

  const allowed = await toolCallHandler(event, {
    hasUI: true,
    ui: {
      async select() {
        return 'Yes';
      },
    },
  });

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
