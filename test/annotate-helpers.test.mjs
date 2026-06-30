import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const moduleCache = new Map();

async function importTsModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const cached = moduleCache.get(absolutePath);
  if (cached) return cached;

  const sourceText = await readFile(absolutePath, 'utf8');
  const transpiled = ts.transpileModule(sourceText, {
    fileName: absolutePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  const diagnostics = transpiled.diagnostics ?? [];
  assert.equal(
    diagnostics.length,
    0,
    diagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n'),
  );

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, 'utf8').toString('base64')}`;
  const loaded = await import(moduleUrl);
  moduleCache.set(absolutePath, loaded);
  return loaded;
}

const { __testing: clipboardTesting, readSystemClipboard, writeSystemClipboard } = await importTsModule(
  'extensions/annotate-git-diff/clipboard.ts',
);
const { __testing: gitTesting, getCommitFiles } = await importTsModule('extensions/annotate-git-diff/git.ts');
const { composeReviewPrompt } = await importTsModule('extensions/annotate-git-diff/prompt.ts');
const { __testing: watchTesting } = await importTsModule('extensions/annotate-git-diff/watch.ts');
const {
  composeAnnotateLastMessagePrompt,
  hasAnnotateLastMessageFeedback,
} = await importTsModule('extensions/annotate-last-message/prompt.ts');
const { findLastAssistantMessage } = await importTsModule('extensions/annotate-last-message/session.ts');

const { clipboardReadCommands, clipboardWriteCommands } = clipboardTesting;
const { parseNameStatus, parseStatusPorcelainZ, shouldNormalizeBranchChanges } = gitTesting;
const { isIgnoredWatchPath } = watchTesting;

function createAssistantEntry({ stopReason = 'stop', content = [] } = {}) {
  return {
    type: 'message',
    message: {
      role: 'assistant',
      stopReason,
      content,
    },
  };
}

test('annotate-git-diff clipboard helpers choose commands, fall back, and surface failures', async (t) => {
  await t.test('readSystemClipboard falls back through linux clipboard commands', () => {
    const calls = [];
    const runner = (command, args, options) => {
      calls.push({ command, args, options });
      if (command === 'wl-paste') {
        return { status: 1, stderr: 'wayland unavailable' };
      }
      if (command === 'xclip') {
        return { status: 0, stdout: 'copied from xclip' };
      }
      return { status: 1, stderr: 'should not reach xsel' };
    };

    const result = readSystemClipboard({ platform: 'linux', runner });

    assert.equal(result, 'copied from xclip');
    assert.deepEqual(
      calls.map(({ command, args }) => ({ command, args })),
      [
        { command: 'wl-paste', args: ['--type', 'text/plain'] },
        { command: 'xclip', args: ['-selection', 'clipboard', '-out'] },
      ],
    );
    assert.equal(calls[0].options.encoding, 'utf8');
    assert.equal(calls[0].options.input, undefined);
  });

  await t.test('writeSystemClipboard uses the platform command and passes editor text to stdin', () => {
    const calls = [];
    const runner = (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: '' };
    };

    writeSystemClipboard('annotated text', { platform: 'darwin', runner });

    assert.deepEqual(calls, [
      {
        command: 'pbcopy',
        args: [],
        options: {
          encoding: 'utf8',
          input: 'annotated text',
          maxBuffer: 16 * 1024 * 1024,
        },
      },
    ]);
  });

  await t.test('unsupported platforms fail before invoking any clipboard command', () => {
    assert.equal(clipboardReadCommands('freebsd').length, 0);
    assert.equal(clipboardWriteCommands('freebsd').length, 0);

    assert.throws(
      () => writeSystemClipboard('text', { platform: 'freebsd', runner: () => ({ status: 0, stdout: '' }) }),
      /System clipboard is unsupported on .*\./,
    );
  });

  await t.test('clipboard failures include the attempted commands and stderr output', () => {
    const runner = (command) => ({ status: 1, stderr: `${command} missing` });

    assert.throws(
      () => readSystemClipboard({ platform: 'linux', runner }),
      (error) => {
        assert.match(error.message, /^No system clipboard command succeeded\./);
        assert.match(error.message, /wl-paste --type text\/plain: wl-paste --type text\/plain exited with 1: wl-paste missing/);
        assert.match(error.message, /xclip -selection clipboard -out: xclip -selection clipboard -out exited with 1: xclip missing/);
        assert.match(error.message, /xsel --clipboard --output: xsel --clipboard --output exited with 1: xsel missing/);
        return true;
      },
    );
  });
});

test('annotate-git-diff watch helper ignores generated and editor-temporary paths', () => {
  assert.equal(isIgnoredWatchPath('.git/index.lock'), true);
  assert.equal(isIgnoredWatchPath(Buffer.from('src/node_modules/pkg/index.js')), true);
  assert.equal(isIgnoredWatchPath('dist/app.js'), true);
  assert.equal(isIgnoredWatchPath('notes.md~'), true);
  assert.equal(isIgnoredWatchPath('.DS_Store'), true);
  assert.equal(isIgnoredWatchPath('src/components/app.ts'), false);
  assert.equal(isIgnoredWatchPath(null), false);
});

test('annotate-git-diff git helpers parse change outputs and decide when branch diffs need normalization', async (t) => {
  await t.test('parseNameStatus keeps supported changes and rename paths', () => {
    const parsed = parseNameStatus('M\tsrc/app.ts\r\nA\tsrc/new.ts\nD\tsrc/old.ts\nR100\tsrc/before.ts\tsrc/after.ts\nX\tsrc/ignored.ts\n');

    assert.deepEqual(parsed, [
      { status: 'modified', oldPath: 'src/app.ts', newPath: 'src/app.ts' },
      { status: 'added', oldPath: null, newPath: 'src/new.ts' },
      { status: 'deleted', oldPath: 'src/old.ts', newPath: null },
      { status: 'renamed', oldPath: 'src/before.ts', newPath: 'src/after.ts' },
    ]);
  });

  await t.test('parseStatusPorcelainZ tracks reviewable untracked files, deletions, and renames', () => {
    const status = parseStatusPorcelainZ('?? src/new.ts\0R  src/old.ts\0src/renamed.ts\0 D src/removed.ts\0!! .gitignore\0');

    assert.deepEqual(status, {
      hasChanges: true,
      hasReviewableChanges: true,
      hasUntracked: true,
      hasTrackedDeletions: true,
      hasRenames: true,
      untrackedPaths: ['src/new.ts'],
    });
  });

  await t.test('shouldNormalizeBranchChanges only switches to snapshot normalization when needed', () => {
    const trackedChanges = [{ status: 'deleted', oldPath: 'src/old.ts', newPath: null }];
    const baseStatus = {
      hasChanges: true,
      hasReviewableChanges: true,
      hasUntracked: false,
      hasTrackedDeletions: false,
      hasRenames: false,
      untrackedPaths: [],
    };

    assert.equal(shouldNormalizeBranchChanges(trackedChanges, baseStatus), false);
    assert.equal(shouldNormalizeBranchChanges(trackedChanges, { ...baseStatus, hasUntracked: true }), true);
    assert.equal(shouldNormalizeBranchChanges([{ status: 'modified', oldPath: 'src/app.ts', newPath: 'src/app.ts' }], { ...baseStatus, hasRenames: true }), true);
  });
});

test('annotate-git-diff prompt helper composes scoped review feedback for branch, commit, and all-files comments', () => {
  const files = [
    {
      id: 'branch-file',
      path: 'src/app.ts',
      worktreeStatus: 'modified',
      hasWorkingTreeFile: true,
      inGitDiff: true,
      gitDiff: {
        status: 'modified',
        oldPath: 'src/app.ts',
        newPath: 'src/app.ts',
        displayPath: 'src/app.ts',
        hasOriginal: true,
        hasModified: true,
      },
      kind: 'text',
      mimeType: null,
    },
    {
      id: 'rename-file',
      path: 'src/new.ts',
      worktreeStatus: 'renamed',
      hasWorkingTreeFile: true,
      inGitDiff: true,
      gitDiff: {
        status: 'renamed',
        oldPath: 'src/old.ts',
        newPath: 'src/new.ts',
        displayPath: 'src/old.ts -> src/new.ts',
        hasOriginal: true,
        hasModified: true,
      },
      kind: 'text',
      mimeType: null,
    },
  ];

  const prompt = composeReviewPrompt(files, {
    type: 'submit',
    overallComment: '  Tighten the error handling.  ',
    comments: [
      {
        id: 'comment-1',
        fileId: 'branch-file',
        scope: 'branch',
        side: 'modified',
        startLine: 7,
        endLine: 9,
        body: '  Update this branch diff block. ',
      },
      {
        id: 'comment-2',
        fileId: 'rename-file',
        scope: 'commits',
        commitSha: '__tlh_working_tree__',
        commitShort: 'WT',
        commitKind: 'working-tree',
        side: 'original',
        startLine: 3,
        endLine: 3,
        body: ' Check the renamed source. ',
      },
      {
        id: 'comment-3',
        fileId: 'missing-file',
        scope: 'all',
        side: 'file',
        startLine: null,
        endLine: null,
        body: ' Add context for the removed file. ',
      },
    ],
  });

  assert.equal(
    prompt,
    [
      'Please address the following feedback',
      '',
      'Tighten the error handling.',
      '',
      '1. [branch diff] src/app.ts:7-9 (new)',
      '   Update this branch diff block.',
      '',
      '2. [working tree changes] src/old.ts -> src/new.ts:3 (old)',
      '   Check the renamed source.',
      '',
      '3. [all files] (unknown file)',
      '   Add context for the removed file.',
    ].join('\n'),
  );
});

test('annotate-git-diff prompt helper skips blank comments while preserving numbering for meaningful feedback', () => {
  const files = [
    {
      id: 'branch-file',
      path: 'src/app.ts',
      worktreeStatus: 'modified',
      hasWorkingTreeFile: true,
      inGitDiff: true,
      gitDiff: {
        status: 'modified',
        oldPath: 'src/app.ts',
        newPath: 'src/app.ts',
        displayPath: 'src/app.ts',
        hasOriginal: true,
        hasModified: true,
      },
      kind: 'text',
      mimeType: null,
    },
  ];

  const prompt = composeReviewPrompt(files, {
    type: 'submit',
    overallComment: '  Keep the scope tight.  ',
    comments: [
      {
        id: 'comment-blank',
        fileId: 'branch-file',
        scope: 'branch',
        side: 'modified',
        startLine: 4,
        endLine: 4,
        body: '   ',
      },
      {
        id: 'comment-real',
        fileId: 'branch-file',
        scope: 'all',
        side: 'file',
        startLine: null,
        endLine: null,
        body: '  Mention the unaffected file context. ',
      },
    ],
  });

  assert.equal(
    prompt,
    [
      'Please address the following feedback',
      '',
      'Keep the scope tight.',
      '',
      '1. [all files] src/app.ts',
      '   Mention the unaffected file context.',
    ].join('\n'),
  );
});

test('annotate-git-diff commit file helper sorts files and preserves rename metadata', async () => {
  const execCalls = [];
  const pi = {
    async exec(command, args, options) {
      execCalls.push({ command, args, options });
      assert.equal(command, 'git');
      assert.deepEqual(args, [
        'diff-tree',
        '--root',
        '--find-renames',
        '-M',
        '--name-status',
        '--no-commit-id',
        '-r',
        'abc123',
      ]);
      assert.deepEqual(options, { cwd: '/repo' });
      return {
        code: 0,
        stdout: 'D\tsrc/z-last.ts\nR100\tsrc/old-name.ts\tsrc/new-name.ts\nA\tsrc/a-first.ts\nX\tsrc/ignored.ts\n',
      };
    },
  };

  const files = await getCommitFiles(pi, '/repo', 'abc123');

  assert.deepEqual(files, [
    {
      id: 'commit::abc123::src/a-first.ts',
      path: 'src/a-first.ts',
      worktreeStatus: null,
      hasWorkingTreeFile: false,
      inGitDiff: true,
      gitDiff: {
        status: 'added',
        oldPath: null,
        newPath: 'src/a-first.ts',
        displayPath: 'src/a-first.ts',
        hasOriginal: false,
        hasModified: true,
      },
      kind: 'text',
      mimeType: null,
    },
    {
      id: 'commit::abc123::src/old-name.ts -> src/new-name.ts',
      path: 'src/new-name.ts',
      worktreeStatus: null,
      hasWorkingTreeFile: false,
      inGitDiff: true,
      gitDiff: {
        status: 'renamed',
        oldPath: 'src/old-name.ts',
        newPath: 'src/new-name.ts',
        displayPath: 'src/old-name.ts -> src/new-name.ts',
        hasOriginal: true,
        hasModified: true,
      },
      kind: 'text',
      mimeType: null,
    },
    {
      id: 'commit::abc123::src/z-last.ts',
      path: 'src/z-last.ts',
      worktreeStatus: null,
      hasWorkingTreeFile: false,
      inGitDiff: true,
      gitDiff: {
        status: 'deleted',
        oldPath: 'src/z-last.ts',
        newPath: null,
        displayPath: 'src/z-last.ts',
        hasOriginal: true,
        hasModified: false,
      },
      kind: 'text',
      mimeType: null,
    },
  ]);
  assert.equal(execCalls.length, 1);
});

test('annotate-last-message session helper reports missing, incomplete, empty, and successful assistant lookups', async (t) => {
  await t.test('returns missing when no assistant message exists on the branch', () => {
    const result = findLastAssistantMessage([{ type: 'message', message: { role: 'user' } }]);

    assert.deepEqual(result, {
      ok: false,
      code: 'missing',
      message: 'No assistant messages found on the current session branch.',
    });
  });

  await t.test('surfaces incomplete latest assistant messages before older completed ones', () => {
    const result = findLastAssistantMessage([
      createAssistantEntry({ content: [{ type: 'text', text: 'Earlier complete reply' }] }),
      createAssistantEntry({ stopReason: 'max_tokens', content: [{ type: 'text', text: 'Still streaming' }] }),
    ]);

    assert.deepEqual(result, {
      ok: false,
      code: 'incomplete',
      message: 'Latest assistant message is incomplete (max_tokens). Wait for it to finish, then try again.',
    });
  });

  await t.test('returns empty when the latest assistant message has no text parts to annotate', () => {
    const result = findLastAssistantMessage([
      createAssistantEntry({ content: [{ type: 'image', source: 'ignored' }, { type: 'text', text: '   ' }] }),
    ]);

    assert.deepEqual(result, {
      ok: false,
      code: 'empty',
      message: 'Latest assistant message has no text to annotate.',
    });
  });

  await t.test('normalizes line endings and builds per-section metadata for the latest completed assistant message', () => {
    const result = findLastAssistantMessage([
      { type: 'tool_call', name: 'noop' },
      createAssistantEntry({
        content: [
          { type: 'text', text: 'First line\r\n\r\nSecond line' },
          { type: 'tool_result', text: 'ignored non-text part' },
        ],
      }),
    ]);

    assert.deepEqual(result, {
      ok: true,
      data: {
        text: 'First line\n\nSecond line',
        lines: [
          { number: 1, text: 'First line' },
          { number: 2, text: '' },
          { number: 3, text: 'Second line' },
        ],
        sections: [
          {
            id: 'section-1',
            index: 1,
            startLine: 1,
            endLine: 1,
            preview: 'First line',
            text: 'First line',
          },
          {
            id: 'section-2',
            index: 2,
            startLine: 3,
            endLine: 3,
            preview: 'Second line',
            text: 'Second line',
          },
        ],
      },
    });
  });

  await t.test('joins multiple text parts and truncates long section previews', () => {
    const longFirstLine = 'A'.repeat(120);
    const result = findLastAssistantMessage([
      createAssistantEntry({
        content: [
          { type: 'text', text: `${longFirstLine}\nContinuation` },
          { type: 'text', text: 'Trailing part' },
        ],
      }),
    ]);

    assert.deepEqual(result, {
      ok: true,
      data: {
        text: `${longFirstLine}\nContinuation\nTrailing part`,
        lines: [
          { number: 1, text: longFirstLine },
          { number: 2, text: 'Continuation' },
          { number: 3, text: 'Trailing part' },
        ],
        sections: [
          {
            id: 'section-1',
            index: 1,
            startLine: 1,
            endLine: 3,
            preview: `${'A'.repeat(95)}…`,
            text: `${longFirstLine}\nContinuation\nTrailing part`,
          },
        ],
      },
    });
  });
});

test('annotate-last-message prompt helper filters blank feedback and composes sorted section and inline notes', () => {
  const message = {
    text: 'Intro paragraph\n\nImplementation details go here',
    lines: [
      { number: 1, text: 'Intro paragraph' },
      { number: 2, text: '' },
      { number: 3, text: 'Implementation details go here' },
    ],
    sections: [
      {
        id: 'section-1',
        index: 1,
        startLine: 1,
        endLine: 1,
        preview: 'Intro paragraph',
        text: 'Intro paragraph',
      },
      {
        id: 'section-2',
        index: 2,
        startLine: 3,
        endLine: 3,
        preview: 'Implementation details go here',
        text: 'Implementation details go here',
      },
    ],
  };

  const payload = {
    type: 'submit',
    overallComment: '  Reframe the plan. ',
    inlineComments: [
      { line: 3, body: '  Be more specific. ' },
      { line: 2, body: ' Mention the omitted step. ' },
      { line: 1, body: '   ' },
    ],
    sectionComments: [
      { sectionId: 'section-2', body: ' Expand the detail. ' },
      { sectionId: 'section-1', body: ' Lead with the goal. ' },
      { sectionId: 'section-2', body: '   ' },
    ],
  };

  assert.equal(hasAnnotateLastMessageFeedback(payload), true);
  assert.equal(
    composeAnnotateLastMessagePrompt(message, payload),
    [
      'Please revisit your last assistant message using the annotation feedback below.',
      '',
      'Treat this as planning-oriented feedback:',
      '- update your explanation, plan, or proposed approach in chat;',
      '- do not assume any code or file changes have already been applied;',
      '- do not auto-apply anything outside the normal response flow.',
      '',
      '## Overall guidance',
      'Reframe the plan.',
      '',
      '## Section comments',
      '1. Section 1 (line 1) — “Intro paragraph”',
      '   Lead with the goal.',
      '',
      '2. Section 2 (line 3) — “Implementation details go here”',
      '   Expand the detail.',
      '',
      '## Inline comments',
      '1. line 2 — “(blank line)”',
      '   Mention the omitted step.',
      '',
      '2. line 3 — “Implementation details go here”',
      '   Be more specific.',
      '',
      'Please respond by revising your last message or its plan in chat, incorporating the feedback above.',
    ].join('\n'),
  );
  assert.equal(
    hasAnnotateLastMessageFeedback({
      type: 'submit',
      overallComment: '   ',
      inlineComments: [{ line: 1, body: '   ' }],
      sectionComments: [{ sectionId: 'section-1', body: '   ' }],
    }),
    false,
  );
});
