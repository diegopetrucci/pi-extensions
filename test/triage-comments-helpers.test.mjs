import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

async function loadTriageTestUtils() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'extensions/triage-comments/index.ts')).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.__test__;
}

test('triage-comments builds helper prompts and appends the implementation note once', async () => {
  const {
    buildCommandPayload,
    buildSystemPrompt,
    buildUserPrompt,
    ensureImplementationNote,
    normalizeInput,
  } = await loadTriageTestUtils();

  const systemPrompt = buildSystemPrompt({ cwd: '/repo', maxTurns: 5, maxRunSeconds: 75 });
  assert.match(systemPrompt, /You are Triage Comments/);
  assert.match(systemPrompt, /Verdicts must be one of: valid, invalid, partially valid, subjective, needs clarification/);
  assert.match(systemPrompt, /Do not implement changes from this triage automatically/);

  const input = normalizeInput({
    comments: [
      {
        id: 'comment-1',
        body: '  <div>Need a stronger guard & docs</div>  ',
        path: 'src/index.ts',
        line: 8,
        startLine: 7,
        side: 'RIGHT',
        url: 'https://example.test/pr/1#discussion_r1',
        metadata: { html: '<b>tag</b>' },
        extraContext: 'HTML-ish caller context <aside>note</aside>',
      },
    ],
    pr: { number: 1, repository: 'acme/widgets' },
    base: { branch: 'main' },
    diff: '@@ -1 +1 @@',
    context: 'Caller context',
  });

  const userPrompt = buildUserPrompt(input, '/repo');
  assert.match(userPrompt, /Local checkout: \/repo/);
  assert.match(userPrompt, /body:\n<div>Need a stronger guard & docs<\/div>/);
  assert.match(userPrompt, /metadata:\n\{\n  "html": "<b>tag<\/b>"\n\}/);
  assert.match(userPrompt, /extraContext:\nHTML-ish caller context <aside>note<\/aside>/);
  assert.match(userPrompt, /Optional diff context:\n@@ -1 \+1 @@/);
  assert.match(userPrompt, /Do not implement anything/);

  const payload = buildCommandPayload(
    [
      {
        id: 'comment-1',
        body: '<p>Body</p>',
        metadata: { source: 'pasted_feedback' },
        sourceLabel: 'pasted feedback',
        displayNumber: 1,
        sortIndex: 1,
      },
    ],
    { totalDisplayed: 1, source: 'paste' },
  );
  assert.equal(payload.context, 'Pasted feedback captured by /triage-comments. Do not implement changes until the user chooses a handling option.');

  assert.equal(
    ensureImplementationNote('## Summary\nDone.'),
    '## Summary\nDone.\n\n---\nDo not implement changes from this triage automatically; ask the parent/user which option to take before implementation.',
  );
  assert.equal(
    ensureImplementationNote('Already noted.\n\ndo not implement changes from this triage automatically; ask the parent/user which option to take before implementation.'),
    'Already noted.\n\ndo not implement changes from this triage automatically; ask the parent/user which option to take before implementation.',
  );
});

test('triage-comments helper formatting covers selection parsing, filter context, tool-call rendering, and HTML-like previews', async () => {
  const {
    formatFetchedCommentsForSelection,
    formatInlineFilterContext,
    formatToolCall,
    parseSelectionList,
  } = await loadTriageTestUtils();

  assert.deepEqual(parseSelectionList('all', 3), { ok: true, indices: [0, 1, 2] });
  assert.deepEqual(parseSelectionList('1,3-4,3', 5), { ok: true, indices: [0, 2, 3] });
  assert.deepEqual(parseSelectionList('4-2', 5), { ok: false, error: 'Range 4-2 goes backwards; use 2-4 instead.' });
  assert.deepEqual(parseSelectionList('6', 5), { ok: false, error: 'Comment number 6 is outside the available range 1-5.' });

  const filterSummary = {
    filter: { hideResolved: true, hideOutdated: false, label: 'hiding resolved inline review comments' },
    originalCount: 3,
    displayedCount: 2,
    hiddenInlineCount: 1,
    hiddenResolvedInlineCount: 1,
    hiddenOutdatedInlineCount: 0,
    keptInlineWithoutThreadMetadataCount: 1,
  };
  assert.equal(
    formatInlineFilterContext(filterSummary),
    'Filter: hiding resolved inline review comments. Hidden 1 inline review comment(s) (1 resolved); displaying 2 of 3 fetched comment(s). Only inline review comments can be filtered; PR issue comments, review bodies, and inline comments without thread metadata remain visible. Inline comments kept without thread metadata: 1.',
  );

  const selectionPrompt = formatFetchedCommentsForSelection(
    { number: 42, repository: 'acme/widgets', title: 'Harden review display' },
    [
      {
        id: 'rc-1',
        body: '<script>alert(1)</script>\nSecond line',
        author: 'octocat',
        path: 'src/index.ts',
        line: 9,
        metadata: { source: 'pull_request_review_comment' },
        reviewThread: { metadataAvailable: true, isResolved: false, isOutdated: true },
        sourceLabel: 'inline review comment',
        displayNumber: 1,
        sortIndex: 1,
      },
      {
        id: 'issue-2',
        body: 'General feedback',
        sourceLabel: 'PR issue comment',
        displayNumber: 2,
        sortIndex: 2,
        metadata: {},
      },
    ],
    filterSummary,
  );
  assert.match(selectionPrompt, /Fetched 3 comment\(s\) from acme\/widgets#42 — Harden review display; displaying 2 numbered comment\(s\) after filtering\./);
  assert.match(selectionPrompt, /thread: unresolved, outdated/);
  assert.match(selectionPrompt, /<script>alert\(1\)<\/script>/);
  assert.match(selectionPrompt, /Second line/);
  assert.match(selectionPrompt, /Choose whether to investigate all displayed comments or select a subset\./);

  assert.equal(formatToolCall({ name: 'read', args: { path: 'README.md', offset: 10, limit: 3 } }), 'read README.md:10-12');
  assert.equal(formatToolCall({ name: 'grep', args: { pattern: 'needle', path: 'src' } }), 'grep needle src');
  assert.equal(formatToolCall({ name: 'find', args: { pattern: '*.ts', path: 'extensions' } }), 'find *.ts extensions');
  assert.equal(formatToolCall({ name: 'ls', args: { path: 'docs' } }), 'ls docs');
  assert.match(formatToolCall({ name: 'bash', args: { command: `git status --short ${'x'.repeat(160)}` } }), /^bash git status --short x+…$/);
});
