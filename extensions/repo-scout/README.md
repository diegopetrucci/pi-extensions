# repo-scout

Adds a `repo_scout` subagent tool that adapts The Last Harness [`repo-scout`](https://github.com/diegopetrucci/the-last-harness/blob/main/agents/subagents/repo-scout.md) prompt into a standalone pi extension.

Use it to quickly orient in an unfamiliar repository before planning or implementing. The subagent uses read-only built-in tools plus any configured MCP tools, detects the stack from evidence, and reports conventions, validation commands, hotspots, and open questions with evidence paths. Blockers are reported in the final result; the subagent cannot ask follow-up questions.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-repo-scout
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

## `repo_scout` tool behavior

The tool accepts:

- `task` — optional focus for the scan (for example the area the caller is about to work on); when omitted, a general orientation report is produced
- `cwd` — optional working directory (repository) to scan; defaults to the current session directory

The subagent runs in-process in an isolated child session with:

- the current session model (no automatic model selection and no persisted `/config` commands);
- `medium` thinking, clamped to the model's supported levels;
- read-only built-in tools: `read`, `grep`, `find`, `ls`, and guarded `bash`;
- configured MCP tools (run without confirmation in the subagent; may have side effects; use for evidence gathering only; requires host Pi >=1.0.4; older hosts degrade to no MCP, no error); the global `mcp.json` always applies; a project `.pi/mcp.json` is loaded only when the host session has already trusted the project;
- a local-checkout path guard for file inspection;
- a bash guard that allows only direct read-only `git`, `gh`, or `pwd` invocations.

The output is a single markdown report: detected stack, conventions, commands, project hotspots, do/don't patterns, and open questions. The tool appends a run-details suffix with the model, effective thinking level, turn count, tool calls, duration, working directory, and tools used.

## Read-only guarantees

- The subagent is explicitly instructed not to modify anything.
- Runtime guards block write/edit tools, shell control operators, pipelines, redirection, path traversal outside the checkout, mutating `git`/`gh` commands, `npm`/publish commands, and other filesystem mutation.
- Runtime guards apply to built-in tools only; configured MCP tools pass the guard, run without confirmation, and are limited only by prompt guidance.
- Built-in file-inspection tools are preferred over shell commands for local files.

## Example

```text
Use repo_scout to orient me in this repository before I add a new command:
```

```json
{
  "task": "Where do CLI commands live and how are they tested?"
}
```

## Limitations

- The subagent has an 8-turn and 8-minute budget; tool use is disabled on the final turn so it can answer.
- The report samples representative files only; it is an orientation aid, not an exhaustive review.
- `gh`-based inspection is available only when GitHub CLI is installed and authenticated; the tool works on local repositories without it.
