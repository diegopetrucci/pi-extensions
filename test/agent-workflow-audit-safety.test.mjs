import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

async function loadAuditTestUtils() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/agent-workflow-audit/index.ts')).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.__test__;
}

function createGuardHandlers(factory) {
  const handlers = new Map();
  factory({
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
  });
  return handlers;
}

test('agent-workflow-audit parses flags, aliases, and focus text', async () => {
  const { parseArgs } = await loadAuditTestUtils();

  assert.deepEqual(parseArgs(' --yes --plan-only investigate flaky tests '), {
    help: false,
    yes: true,
    planOnly: true,
    focus: 'investigate flaky tests',
  });
  assert.deepEqual(parseArgs('--dry-run docs only'), {
    help: false,
    yes: false,
    planOnly: true,
    focus: 'docs only',
  });
  assert.deepEqual(parseArgs('help'), {
    help: true,
    yes: false,
    planOnly: false,
  });
  assert.match(parseArgs('--bogus').error, /Unknown \/agent-workflow-audit option: --bogus/);
});

test('agent-workflow-audit path sandbox rejects symlink escapes outside the checkout', async (t) => {
  const { assertToolPathInsideCwd } = await loadAuditTestUtils();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-guard-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-guard-outside-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  await fs.writeFile(path.join(root, 'README.md'), 'ok\n');
  await fs.symlink(outside, path.join(root, 'escape'));

  assert.equal(await assertToolPathInsideCwd(root, 'README.md', 'read'), undefined);
  assert.match(
    await assertToolPathInsideCwd(root, 'escape', 'read'),
    /read is limited to the audited checkout:/,
  );
});

test('agent-workflow-audit bash guard keeps execution to documented read-only or safe local commands', async () => {
  const { getBlockedBashReason } = await loadAuditTestUtils();

  for (const command of ['git status --short --branch', 'gh pr view 12', 'npm test', 'cargo check']) {
    assert.equal(getBlockedBashReason(command, { planOnly: false }), undefined, command);
  }

  const blockedCases = [
    ['git checkout main', /blocks git checkout/],
    ['gh pr review 12', /blocks gh pr review/],
    ['npm publish', /blocks package registry\/account\/config mutation commands/],
    ['python -c "print(1)"', /blocks (inline Python execution|path-changing flags)/],
    ['cd src', /blocks shell cd/],
    ['cat package.json', /blocks direct cat commands/],
    ['git diff | cat', /blocks shell substitution, redirection, pipes, semicolons, and multi-line commands/],
  ];

  for (const [command, pattern] of blockedCases) {
    assert.match(getBlockedBashReason(command, { planOnly: false }), pattern, command);
  }

  assert.match(
    getBlockedBashReason('git status', { planOnly: true }),
    /Plan-only Agent Workflow Audit mode blocks bash\/project command execution/,
  );
});

test('agent-workflow-audit runtime guard blocks unsafe calls, normalizes bash timeout, and appends turn budget', async (t) => {
  const { createAuditRuntimeGuardExtension } = await loadAuditTestUtils();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-runtime-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const handlers = createGuardHandlers(createAuditRuntimeGuardExtension({ cwd: root, maxTurns: 2, planOnly: false }));
  const turnStart = handlers.get('turn_start');
  const toolCall = handlers.get('tool_call');
  const toolResult = handlers.get('tool_result');

  assert.equal(typeof turnStart, 'function');
  assert.equal(typeof toolCall, 'function');
  assert.equal(typeof toolResult, 'function');

  assert.deepEqual(
    await toolCall({ toolName: 'write', input: { path: 'x' } }),
    {
      block: true,
      reason: 'agent-workflow-audit exposes only read, grep, find, ls, and guarded bash; write is not allowed.',
    },
  );

  await turnStart({ turnIndex: 0 });
  const bashInput = { command: 'git status --short', timeout: 999.7 };
  assert.equal(await toolCall({ toolName: 'bash', input: bashInput }), undefined);
  assert.equal(bashInput.timeout, 300);

  assert.deepEqual(
    await toolResult({ content: [{ type: 'text', text: 'ok' }] }),
    {
      content: [
        { type: 'text', text: 'ok' },
        { type: 'text', text: '\n\n[agent-workflow-audit turn budget] turn 1/2' },
      ],
    },
  );

  await turnStart({ turnIndex: 1 });
  assert.deepEqual(
    await toolCall({ toolName: 'read', input: { path: 'README.md' } }),
    {
      block: true,
      reason: 'Tool use is disabled on final agent-workflow-audit turn 2/2. Answer now with the evidence already gathered.',
    },
  );
});
