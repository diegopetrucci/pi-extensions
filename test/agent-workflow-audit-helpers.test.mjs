import assert from 'node:assert/strict';
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

test('agent-workflow-audit builds execution and plan-only prompts with git-status run boundaries', async () => {
  const { appendRunBoundary, buildSystemPrompt, buildUserPrompt } = await loadAuditTestUtils();

  const planOnlyPrompt = buildSystemPrompt({ cwd: '/repo', maxTurns: 4, maxRunSeconds: 90, planOnly: true });
  assert.match(planOnlyPrompt, /Plan-only mode is active/);
  assert.doesNotMatch(planOnlyPrompt, /Execution mode is active/);

  const executePrompt = buildSystemPrompt({ cwd: '/repo', maxTurns: 4, maxRunSeconds: 90, planOnly: false });
  assert.match(executePrompt, /Execution mode is active/);
  assert.match(executePrompt, /runtime guard blocks deploy\/publish\/VCS-mutating\/destructive commands/);

  const executeUserPrompt = buildUserPrompt({
    cwd: '/repo',
    focus: 'release instructions',
    initialGitStatus: '## main\n M README.md',
    planOnly: false,
  });
  assert.match(executeUserPrompt, /Local checkout: \/repo/);
  assert.match(executeUserPrompt, /Mode: execute safe documented\/inferred workflow commands/);
  assert.match(executeUserPrompt, /Focus notes: release instructions/);
  assert.match(executeUserPrompt, /## main\n M README\.md/);

  const planOnlyUserPrompt = buildUserPrompt({ cwd: '/repo', planOnly: true });
  assert.match(planOnlyUserPrompt, /Mode: plan-only \(do not execute project commands\)/);
  assert.match(planOnlyUserPrompt, /Focus notes: \(none\)/);
  assert.match(planOnlyUserPrompt, /\(not a git repo or status unavailable\)/);

  const report = appendRunBoundary('## Summary\nAudit complete.', {
    status: 'done',
    mode: 'execute',
    cwd: '/repo',
    turns: 2,
    toolCalls: [{ id: '1', name: 'read', args: { path: 'README.md' }, startedAt: 0 }],
    startedAt: 0,
    endedAt: 1200,
    initialGitStatus: '## main\n M README.md',
    finalGitStatus: '## main\n M README.md\n?? coverage/',
  });
  assert.match(report, /## Audit run boundary/);
  assert.match(report, /Child run: 2 turn\(s\), 1 tool call\(s\), 1\.2s\./);
  assert.match(report, /Git status check: changed \(1 dirty item\(s\) before, 2 dirty item\(s\) after\)\./);
});

test('agent-workflow-audit formats tool calls and collapses reports at the line limit', async () => {
  const { formatToolCall, renderCollapsedReport } = await loadAuditTestUtils();

  assert.equal(formatToolCall({ name: 'read', args: { path: 'README.md', offset: 4, limit: 2 } }), 'read README.md:4-5');
  assert.equal(formatToolCall({ name: 'ls', args: {} }), 'ls .');
  assert.match(formatToolCall({ name: 'grep', args: { pattern: 'x'.repeat(100), path: 'src' } }), /^grep x+… src$/);
  assert.match(formatToolCall({ name: 'bash', args: { command: `git diff --stat ${'x'.repeat(200)}` } }), /^bash git diff --stat x+…$/);
  assert.equal(formatToolCall({ name: 'custom-tool', args: { anything: true } }), 'custom-tool');

  assert.equal(renderCollapsedReport('line 1\nline 2', 2), 'line 1\nline 2');
  assert.equal(
    renderCollapsedReport('  line 1\nline 2\nline 3  ', 2),
    'line 1\nline 2\n… (1 more lines; expand to view)',
  );
});
