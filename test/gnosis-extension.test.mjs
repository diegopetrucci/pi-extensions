import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateTail } from '@earendil-works/pi-coding-agent';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

const INSTALL_HINT = [
  'The `gn` CLI is required for the gnosis extension.',
  'Install it with one of:',
  '  brew install --cask skorokithakis/tap/gnosis',
  '  go install github.com/skorokithakis/gnosis/cmd/gn@latest',
].join('\n');

test('gnosis maps supported actions to gn invocations and returns exec output details', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools, execCalls } = createExtensionHarness({
    async execImpl(command, args, options) {
      assert.equal(command, 'gn');
      assert.equal(options.cwd, '/repo');
      assert.equal(options.timeout, 30_000);
      return {
        stdout: `ran ${args.join(' ')}`,
        stderr: '',
        code: 0,
      };
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  const cases = [
    { params: { action: 'plan' }, expectedArgs: ['help', 'plan'] },
    { params: { action: 'review' }, expectedArgs: ['help', 'review'] },
    { params: { action: 'search', query: 'auth OR token', limit: 5 }, expectedArgs: ['search', 'auth OR token', '--limit', '5'] },
    { params: { action: 'latest', limit: 2 }, expectedArgs: ['latest', '--limit', '2'] },
    { params: { action: 'show', target: 'abc123' }, expectedArgs: ['show', 'abc123'] },
    { params: { action: 'topics' }, expectedArgs: ['topics'] },
    {
      params: {
        action: 'write',
        topics: [' session-state ', 'architecture'],
        text: 'Remember the latest snapshot.',
        related: [' ent-1 ', 'ent-2'],
      },
      expectedArgs: ['write', 'session-state,architecture', 'Remember the latest snapshot.', '--related', 'ent-1,ent-2'],
    },
    { params: { action: 'reindex' }, expectedArgs: ['reindex'] },
  ];

  for (const { params, expectedArgs } of cases) {
    const result = await tool.execute('call-1', params, undefined, undefined, { cwd: '/repo' });

    assert.deepEqual(execCalls.at(-1), ['gn', expectedArgs, { cwd: '/repo', signal: undefined, timeout: 30_000 }]);
    assert.equal(result.content[0].type, 'text');
    assert.equal(result.content[0].text, `ran ${expectedArgs.join(' ')}`);
    assert.deepEqual(result.details, {
      action: params.action,
      args: expectedArgs,
      truncated: false,
    });
  }
});

test('gnosis rejects missing required params and invalid limits before exec starts', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools, execCalls } = createExtensionHarness();

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  const cases = [
    { params: { action: 'search' }, expectedMessage: 'query is required.' },
    { params: { action: 'show' }, expectedMessage: 'target is required.' },
    { params: { action: 'write', text: 'Remember this.' }, expectedMessage: 'topics is required for action=write.' },
    { params: { action: 'write', topics: ['topic-name'] }, expectedMessage: 'text is required.' },
    { params: { action: 'latest', limit: 0 }, expectedMessage: 'limit must be a positive integer.' },
    { params: { action: 'search', query: 'auth', limit: 1.5 }, expectedMessage: 'limit must be a positive integer.' },
  ];

  for (const { params, expectedMessage } of cases) {
    await assert.rejects(
      () => tool.execute('call-invalid', params, undefined, undefined, { cwd: '/repo' }),
      (error) => {
        assert.equal(error.message, expectedMessage);
        return true;
      },
    );
  }

  assert.equal(execCalls.length, 0);
});

test('gnosis returns a placeholder when the CLI succeeds without stdout or stderr', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools } = createExtensionHarness({
    async execImpl() {
      return {
        stdout: '',
        stderr: '',
        code: 0,
      };
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  const result = await tool.execute('call-empty', { action: 'topics' }, undefined, undefined, { cwd: '/repo' });

  assert.equal(result.content[0].text, '(no output)');
  assert.deepEqual(result.details, {
    action: 'topics',
    args: ['topics'],
    truncated: false,
  });
});

test('gnosis formats stdout and stderr without adding extra blank lines', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools } = createExtensionHarness({
    async execImpl() {
      return {
        stdout: 'plan summary',
        stderr: 'review warnings\n',
        code: 0,
      };
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  const result = await tool.execute('call-format', { action: 'review' }, undefined, undefined, { cwd: '/repo' });

  assert.equal(result.content[0].text, 'plan summary\nreview warnings');
});

test('gnosis surfaces killed executions as timeout or cancellation failures with captured output', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools } = createExtensionHarness({
    async execImpl() {
      return {
        stdout: 'partial index rebuild',
        stderr: 'received SIGTERM\n',
        code: null,
        killed: true,
      };
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  await assert.rejects(
    () => tool.execute('call-killed', { action: 'reindex' }, undefined, undefined, { cwd: '/repo' }),
    (error) => {
      assert.equal(error.message, 'gnosis reindex timed out or was cancelled.\n\npartial index rebuild\nreceived SIGTERM');
      assert.doesNotMatch(error.message, /The `gn` CLI is required/);
      return true;
    },
  );
});

test('gnosis prepends install guidance when execution throws before a process starts', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools } = createExtensionHarness({
    async execImpl() {
      throw new Error('spawn gn ENOENT');
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  await assert.rejects(
    () => tool.execute('call-2', { action: 'topics' }, undefined, undefined, { cwd: '/repo' }),
    (error) => {
      assert.match(error.message, /Execution error: spawn gn ENOENT/);
      assert.match(error.message, new RegExp(INSTALL_HINT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );
});

test('gnosis includes output without install guidance when the CLI fails after starting', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools } = createExtensionHarness({
    async execImpl() {
      return {
        stdout: 'partial result\n',
        stderr: 'database is locked\n',
        code: 1,
      };
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  await assert.rejects(
    () => tool.execute('call-3', { action: 'search', query: 'todo' }, undefined, undefined, { cwd: '/repo' }),
    (error) => {
      assert.match(error.message, /gnosis search failed with exit code 1\./);
      assert.match(error.message, /partial result\n\ndatabase is locked/);
      assert.doesNotMatch(error.message, /The `gn` CLI is required/);
      assert.doesNotMatch(error.message, /brew install/);
      return true;
    },
  );
});

test('gnosis omits install guidance when execution throws for a reason other than a missing binary', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools } = createExtensionHarness({
    async execImpl() {
      throw new Error('database is locked');
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  await assert.rejects(
    () => tool.execute('call-exec-error', { action: 'topics' }, undefined, undefined, { cwd: '/repo' }),
    (error) => {
      assert.equal(error.message, 'Execution error: database is locked');
      assert.doesNotMatch(error.message, /The `gn` CLI is required/);
      return true;
    },
  );
});

test('gnosis omits install guidance for an empty non-zero exit', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools } = createExtensionHarness({
    async execImpl() {
      return {
        stdout: '',
        stderr: '',
        code: 1,
      };
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  await assert.rejects(
    () => tool.execute('call-empty-failure', { action: 'topics' }, undefined, undefined, { cwd: '/repo' }),
    (error) => {
      assert.equal(error.message, 'gnosis topics failed with exit code 1.\n\n(no output)');
      assert.doesNotMatch(error.message, /The `gn` CLI is required/);
      assert.doesNotMatch(error.message, /brew install/);
      return true;
    },
  );
});

test('gnosis includes install guidance when the CLI reports the binary is missing', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const installHintPattern = new RegExp(INSTALL_HINT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const cases = [
    {
      name: 'command not found',
      execImpl() {
        return {
          stdout: '',
          stderr: 'sh: gn: command not found\n',
          code: 1,
        };
      },
      assertError(error) {
        assert.match(error.message, /gnosis topics failed with exit code 1\./);
        assert.match(error.message, /sh: gn: command not found/);
        assert.match(error.message, installHintPattern);
      },
    },
    {
      name: 'shell not found',
      execImpl() {
        return {
          stdout: '',
          stderr: 'sh: 1: gn: not found\n',
          code: 1,
        };
      },
      assertError(error) {
        assert.match(error.message, /gnosis topics failed with exit code 1\./);
        assert.match(error.message, /sh: 1: gn: not found/);
        assert.match(error.message, installHintPattern);
      },
    },
    {
      name: 'windows command not recognized',
      execImpl() {
        return {
          stdout: '',
          stderr: "'gn' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n",
          code: 1,
        };
      },
      assertError(error) {
        assert.match(error.message, /gnosis topics failed with exit code 1\./);
        assert.match(error.message, /not recognized as an internal or external command/);
        assert.match(error.message, installHintPattern);
      },
    },
    {
      name: 'exit 127',
      execImpl() {
        return {
          stdout: '',
          stderr: '',
          code: 127,
        };
      },
      assertError(error) {
        assert.match(error.message, /gnosis topics failed with exit code 127\./);
        assert.match(error.message, installHintPattern);
      },
    },
    {
      name: 'ENOENT code',
      execImpl() {
        const error = new Error('spawn gn failed');
        error.code = 'ENOENT';
        throw error;
      },
      assertError(error) {
        assert.match(error.message, /Execution error: spawn gn failed/);
        assert.match(error.message, installHintPattern);
      },
    },
  ];

  for (const { name, execImpl, assertError } of cases) {
    const { pi, tools } = createExtensionHarness({ execImpl });
    gnosisExtension(pi);
    const tool = tools.get('gnosis');
    assert.ok(tool, name);

    await assert.rejects(
      () => tool.execute('call-missing', { action: 'topics' }, undefined, undefined, { cwd: '/repo' }),
      (error) => {
        assertError(error);
        return true;
      },
    );
  }
});

test('gnosis reports truncation metadata for long output', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  let longOutput = '';
  for (let index = 0; index < DEFAULT_MAX_LINES + 500; index += 1) {
    longOutput += `${index} ${'x'.repeat(30)}\n`;
  }
  const truncation = truncateTail(longOutput, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });

  const { pi, tools } = createExtensionHarness({
    async execImpl() {
      return {
        stdout: longOutput,
        stderr: '',
        code: 0,
      };
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  const result = await tool.execute('call-truncated', { action: 'topics' }, undefined, undefined, { cwd: '/repo' });

  assert.equal(
    result.content[0].text,
    `${truncation.content}\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).]`,
  );
  assert.deepEqual(result.details, {
    action: 'topics',
    args: ['topics'],
    truncated: true,
  });
});
