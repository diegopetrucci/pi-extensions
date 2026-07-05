# code-reviewer

Adds a read-only `code_reviewer` subagent tool that adapts The Last Harness [`code-reviewer`](https://github.com/diegopetrucci/the-last-harness/blob/main/agents/subagents/code-reviewer.md) prompt into a standalone pi extension.

Use it when you want an isolated second-pass review of a proposed change against the local checkout. The tool stays read-only, checks ticket fit and scope first, then looks for diff mismatches, correctness bugs, security/safety issues, unnecessary complexity, and missing validation.

This package is adapted from the TLH code-reviewer workflow for use as a standalone pi extension.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-code-reviewer
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

## `code_reviewer` tool behavior

The tool accepts:

- `task` — required review target and success criteria
- `diff` — optional diff, patch, or change summary
- `context` — optional extra constraints or known risks

When called, it launches an isolated in-memory child agent with:

- no inherited extensions, skills, prompt templates, themes, context files, or agents files;
- the active session model and thinking level;
- read-only tools only: `read`, `grep`, `find`, `ls`, and guarded `bash`;
- a local-checkout path guard for file inspection;
- a bash guard that allows only direct read-only `git`, `gh`, or `pwd` invocations.

The review prompt prioritizes:

1. ticket fit and scope
2. diff accuracy
3. correctness and regressions
4. security and safety
5. simplicity and maintainability
6. tests and validation gaps

The final output is concise and includes a verdict, findings, validation notes, a scope check, and run details.

## Read-only guarantees

- The subagent is explicitly instructed not to implement changes.
- Runtime guards block write/edit tools, shell control operators, pipelines, redirection, path traversal outside the checkout, mutating `git`/`gh` commands, `npm`/publish commands, and other filesystem mutation.
- Built-in file-inspection tools are preferred over shell commands for local files.

## Example

```text
Use code_reviewer on this task before merging:

{
  "task": "Review ticket pe-7lpt implementation for scope fit and correctness.",
  "context": "Focus on whether the new extension stays runtime-only and keeps tools read-only."
}
```

## Limitations

- The subagent has an 8-turn and 8-minute budget.
- The review quality depends on the local checkout matching the change being reviewed.
- `gh`-based inspection is available only when GitHub CLI is installed and authenticated, but the tool can still review local changes without it.
