# diff-summarizer

Adds a `diff_summarizer` subagent tool that adapts The Last Harness [`diff-summarizer`](https://github.com/diegopetrucci/the-last-harness/blob/main/agents/subagents/diff-summarizer.md) prompt into a standalone pi extension.

Use it to get a terse, high-signal summary of a change set before review. The subagent uses read-only built-in tools plus any configured MCP tools, summarizes what changed, flags risky areas with evidence, and reports which requirements appear satisfied, violated, or unclear. Blockers are reported in the final result; the subagent cannot ask follow-up questions.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-diff-summarizer
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

## `diff_summarizer` tool behavior

The tool accepts:

- `diff` — optional diff or patch to summarize; when omitted, the subagent collects `git diff`, `git diff --cached`, and `git status --short --untracked-files=all` in the checkout and inspects relevant untracked files
- `requirements` — optional requirements or ticket text to check the change against; when omitted, inferred intent is labeled low confidence
- `cwd` — optional working directory (checkout); defaults to the current session directory

The subagent runs in-process in an isolated child session with:

- the current session model (no automatic model selection and no persisted `/config` commands);
- `medium` thinking, clamped to the model's supported levels;
- read-only built-in tools: `read`, `grep`, `find`, `ls`, and guarded `bash`;
- configured MCP tools (run without confirmation in the subagent; may have side effects; use for evidence gathering only; requires host Pi >=1.0.4; older hosts degrade to no MCP, no error); the global `mcp.json` always applies; a project `.pi/mcp.json` is loaded only when the host session has already trusted the project;
- a local-checkout path guard for file inspection;
- a bash guard that allows only direct read-only `git`, `gh`, or `pwd` invocations.

The output is short: diff source, files touched, what changed, risky areas touched, and requirement status. The tool appends a run-details suffix with the model, effective thinking level, turn count, tool calls, duration, working directory, and tools used.

## Read-only guarantees

- The subagent is explicitly instructed not to modify anything.
- Runtime guards block write/edit tools, shell control operators, pipelines, redirection, path traversal outside the checkout, mutating `git`/`gh` commands, `npm`/publish commands, and other filesystem mutation.
- Runtime guards apply to built-in tools only; configured MCP tools pass the guard, run without confirmation, and are limited only by prompt guidance.
- Built-in file-inspection tools are preferred over shell commands for local files.

## Example

```text
Use diff_summarizer to summarize my current changes against these requirements:
```

```json
{
  "requirements": "Add a --json flag to the status command and cover it with a test."
}
```

## Limitations

- The subagent has an 8-turn and 8-minute budget; tool use is disabled on the final turn so it can answer.
- With no `diff`, the summary depends on the checkout containing the change set.
- `gh`-based inspection is available only when GitHub CLI is installed and authenticated; the tool works on local changes without it.
