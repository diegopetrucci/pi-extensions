# developer

Adds a `developer` subagent tool that adapts The Last Harness [`developer`](https://github.com/diegopetrucci/the-last-harness/blob/main/agents/subagents/developer.md) prompt into a standalone pi extension.

Use it to delegate one well-scoped implementation task to an isolated child agent. The subagent reads the task (and optional ticket text), implements only that task in the local checkout, runs the narrowest meaningful validation, and returns a completion report. Blockers are reported in the final result; the subagent cannot ask follow-up questions.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-developer
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

## `developer` tool behavior

The tool accepts:

- `task` — required task to implement, with acceptance criteria and validation expectations
- `ticket` — optional ticket ID or ticket text to treat as the source of truth
- `context` — optional extra constraints, conventions, or known risks
- `cwd` — optional working directory (checkout); defaults to the current session directory

When called, it launches an isolated in-memory child agent with:

- no inherited extensions, skills, prompt templates, themes, context files, or agents files;
- the current session model (no automatic model selection and no persisted `/config` commands);
- thinking inherited from the current session, clamped to the model's supported levels;
- built-in tools `read`, `write`, `edit`, `grep`, `find`, `ls`, and **unrestricted `bash`**;
- configured MCP tools (run without confirmation; may have side effects; requires host Pi >=1.0.4; older hosts degrade to no MCP, no error); the global `mcp.json` always applies, and a project `.pi/mcp.json` is loaded only when the host session has already trusted the project;
- a path guard that limits `write` and `edit` to the checkout.

The prompt preserves the TLH developer rules: implement exactly one task, stay in scope, treat pre-existing worktree and index changes as human-owned (no `git stash`, `git restore`, `git reset`, non-dry-run `git clean`, or checkout/switch discard/force options against them), validate, and finish with a report (summary, files changed, validation, problems encountered, tradeoffs or risks). The tool appends a run-details suffix with the model, effective thinking level, turn count, tool calls, duration, working directory, and tools used.

## Guarantees and limitations

- `write` and `edit` paths must resolve inside the checkout, including through symlinks; other paths are rejected.
- **`bash` is unrestricted and not sandboxed.** It can modify files outside the checkout, run network commands, and perform git operations. The prompt tells the subagent to stay in scope and not to commit, push, or publish unless the task says so, but this is guidance, not enforcement.
- Runtime guards apply to built-in tools only; configured MCP tools run without confirmation and are limited only by prompt guidance.
- The subagent has a 40-turn and 30-minute budget; tool use is disabled on the final turn so it can report.
- The run is not transactional: if it fails or times out, files may already have been modified. Inspect the checkout.

## Example

```text
Use developer for this task:

{
  "task": "Add a --json flag to the status command and cover it with a test.",
  "context": "Run npm test -- status before reporting."
}
```
