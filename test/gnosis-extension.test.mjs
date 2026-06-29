import assert from 'node:assert/strict';
import test from 'node:test';
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

test('gnosis includes output and install guidance when the CLI exits non-zero', async () => {
  const gnosisExtension = await loadExtension('extensions/gnosis/index.ts');
  const { pi, tools } = createExtensionHarness({
    async execImpl() {
      return {
        stdout: 'partial result\n',
        stderr: 'database is locked\n',
        code: 2,
      };
    },
  });

  gnosisExtension(pi);
  const tool = tools.get('gnosis');
  assert.ok(tool);

  await assert.rejects(
    () => tool.execute('call-3', { action: 'search', query: 'todo' }, undefined, undefined, { cwd: '/repo' }),
    (error) => {
      assert.match(error.message, /gnosis search failed with exit code 2\./);
      assert.match(error.message, /partial result\n\ndatabase is locked/);
      assert.match(error.message, new RegExp(INSTALL_HINT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );
});
