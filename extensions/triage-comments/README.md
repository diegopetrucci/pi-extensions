# triage-comments

Adds `/triage-comments` plus a read-only `triage_comments` subagent tool for evidence-based review-comment triage.

Use it when you want The Last Harness to inspect selected PR feedback, classify whether each comment is valid, cite local evidence, draft review-thread responses, and propose handling options. It does **not** implement changes; after triage, the main agent should ask which handling option to take before editing anything.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-triage-comments
```

### Collection package

```bash
pi install npm:@diegopetrucci/pi-extensions
```

### GitHub package

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Slash command flow

The extension registers `/triage-comments` as an interactive intake flow.

```text
/triage-comments
/triage-comments paste
/triage-comments pr
/triage-comments pr 123
/triage-comments pr https://github.com/owner/repo/pull/123
/triage-comments 123
```

- With no arguments, The Last Harness asks whether to paste feedback or fetch PR comments.
- `paste` opens an editor for multiline reviewer feedback, then sends one selected feedback item to the main agent.
- `pr` with no explicit target first tries to detect an existing PR for the current named non-`main` git branch using read-only `git` and `gh pr view` calls. If the branch is `main`, detached, outside a git repository, `gh` is unavailable or unauthenticated, or no PR is found, it falls back to the PR URL/number prompt.
- `pr <PR URL or number>` and a bare PR URL/number fetch that explicit PR directly, display PR review comments, PR issue comments, and review bodies with `gh` as numbered items with stable IDs, and ask whether to investigate all displayed comments or an explicit subset such as `1,3-5`.
- Before displaying fetched PR comments, PR mode asks whether to show all comments or hide resolved inline review comments, outdated inline review comments, or both. This filter applies only to inline review comments because GitHub exposes resolved/outdated state at the review-thread level; PR issue comments and review bodies always remain visible, and inline comments without thread metadata remain visible.
- If more than 50 comments are displayed after filtering, you must choose a subset of at most 50 comments.
- The command sends a normal user message instructing the main agent to call `triage_comments` with the selected payload. It does not directly edit files or post GitHub replies.

The slash command requires interactive UI mode for the editor, PR comment display, and all/subset confirmation. In non-UI modes it prints usage instead of running the intake flow.

## GitHub CLI requirements

PR mode requires:

- running inside a git checkout;
- GitHub CLI `gh` installed and on `PATH`;
- `gh auth login` completed for the target host/repository, including private repositories;
- a PR number that `gh pr view` can resolve from the current checkout, a full GitHub PR URL, or a current non-`main` branch with an existing PR that `gh pr view` can resolve.

The command uses read-only `git`/`gh` calls to detect the current branch PR when no target is supplied, then read-only `gh` calls to fetch PR metadata, review comments, PR issue comments, review bodies, and best-effort review-thread resolved/outdated metadata. It does not post comments, submit reviews, checkout branches, or mutate GitHub.

## `triage_comments` tool behavior

The tool accepts selected comments and optional PR, base, diff, and caller context. Comment entries can be plain strings or objects with fields such as `body`, `path`, `line`, `startLine`, `side`, `diffHunk`, `author`, `url`, `createdAt`, and `metadata`.

When called, it launches an isolated in-memory subagent with:

- no inherited extensions, skills, prompt templates, themes, context files, or agents files;
- read-only tools only: `read`, `grep`, `find`, `ls`, and guarded `bash`;
- a local-checkout path guard for file inspection;
- a bash guard that allows only direct read-only `git`, `gh`, or `pwd` invocations and blocks write/edit tools, shell pipelines, redirection, destructive git commands, and mutating `gh`/GitHub API calls;
- a fixed triage output format with verdicts, evidence, reasoning, suggested responses, handling options, and a list of read-only checks performed.

Verdicts are one of `valid`, `invalid`, `partially valid`, `subjective`, or `needs clarification`.

## Read-only and approval guarantees

- The slash command only collects/selects comments and asks the main agent to run triage.
- The subagent is explicitly instructed not to implement changes.
- Runtime guards block write tools, filesystem mutation through shell syntax, mutating git commands, and mutating GitHub CLI/API calls.
- The generated prompt tells the main agent to summarize findings and ask which handling option to take before implementation.
- Suggested responses are drafts for the user/agent to adapt; the extension does not post them to GitHub.

## Examples

Paste a reviewer note:

```text
/triage-comments paste
```

Fetch a PR, inspect comments 1 and 3 through 5, then triage only that subset:

```text
/triage-comments pr https://github.com/owner/repo/pull/123
# selection prompt: 1,3-5
```

Ask the agent to use the tool directly:

```text
Use triage_comments on this review comment and do not implement anything yet:

{
  "comments": [
    {
      "body": "This helper appears to ignore the configured timeout.",
      "path": "src/client.ts",
      "line": 42,
      "url": "https://github.com/owner/repo/pull/123#discussion_r123"
    }
  ],
  "pr": {
    "number": 123,
    "repository": "owner/repo"
  },
  "context": "Classify the comment and suggest response options only."
}
```

Typical output includes a summary, per-comment verdicts with citations, a suggested reply, handling options, and the reminder:

```text
Do not implement changes from this triage automatically; ask the parent/user which option to take before implementation.
```

## Limitations

- At most 50 comments can be triaged in one tool call.
- The subagent has an 8-turn and 8-minute budget.
- PR mode depends on the GitHub API data available to `gh`; authentication, permissions, host configuration, and API availability can affect what is fetched.
- Resolved/outdated filtering is best effort and only applies to inline review comments. If GitHub does not return review-thread metadata for an inline comment, `/triage-comments` keeps it visible and labels the thread state as unavailable.
- The tool validates against the current local checkout. If the checkout does not match the PR head/base or supplied diff context, the result may be `needs clarification` or call out stale/missing evidence.
- Paste mode treats the editor contents as one feedback item; use PR mode or direct tool calls for multiple separately numbered comments.
