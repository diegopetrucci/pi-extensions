# test-runner

Adds a `test_runner` subagent tool that adapts The Last Harness [`test-runner`](https://github.com/diegopetrucci/the-last-harness/blob/main/agents/subagents/test-runner.md) prompt into a standalone pi extension.

Use it to delegate exact validation commands (for example `npm ci`, then `npm test`) to an isolated child agent. The subagent runs the steps exactly in order, stops at the first failure, never edits, fixes, installs on its own, or commits, and reports each step as `PASS` or `FAIL` plus an overall result. Blockers are reported in the final result; the subagent cannot ask follow-up questions.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-test-runner
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

## `test_runner` tool behavior

The tool accepts:

- `steps` — required, non-empty array of exact shell commands, executed in order
- `context` — optional extra context such as validation scope or known flaky steps
- `cwd` — optional working directory for the steps; defaults to the current session directory

When called, it launches an isolated in-memory child agent with:

- no inherited extensions, skills, prompt templates, themes, context files, or agents files;
- the current session model (no automatic model selection and no persisted `/config` commands);
- `low` thinking, clamped to the model's supported levels;
- only **unrestricted `bash`** plus configured MCP tools (no `read`, `write`, `edit`, `grep`, `find`, or `ls`);
- configured MCP tools (run without confirmation; may have side effects; requires host Pi >=1.0.4; older hosts degrade to no MCP, no error); the global `mcp.json` always applies, and a project `.pi/mcp.json` is loaded only when the host session has already trusted the project.

The prompt lists the steps exactly as given, numbered in order, and tells the subagent to stop at the first failure, never edit files, fix failures, install dependencies, update snapshots, or stage/commit/push, and to report the scope, each step with `PASS`/`FAIL`, the overall result, and skipped steps. The tool appends a run-details suffix with the model, effective thinking level, turn count, tool calls, duration, working directory, and tools used.

## Budgets

Validation can be long, so the budgets are generous: 60 turns, 60 minutes total wall-clock, and a default 30-minute timeout per `bash` call (applied when the model does not set one). Tool use is disabled on the final turn so the subagent can report.

## Guarantees and limitations

- **`bash` is unrestricted and not sandboxed.** The steps you pass run with your user's permissions, and the subagent could run other commands. The "never edit/fix/install/commit" rules are prompt guidance, not enforcement; only pass commands you would run yourself. Steps such as `npm ci` legitimately modify the checkout.
- Only `bash` and MCP tools are available; other tool calls are blocked. Configured MCP tools run without confirmation and are limited only by prompt guidance.
- Fail-fast and step order are enforced by the prompt, not by a runtime scheduler.
- If the run times out or fails, steps may have been partially executed.

## Example

```text
Use test_runner with:

{
  "steps": ["npm ci", "npm run typecheck", "npm test"]
}
```
