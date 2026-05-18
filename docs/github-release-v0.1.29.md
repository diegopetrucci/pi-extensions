This release adds `agent-workflow-audit`, an isolated `/agent-workflow-audit` command that audits repo workflow friction in a child session and returns only the final distilled report to the main session.

## Highlights

- adds `/agent-workflow-audit` as a command-first workflow audit entry point
- runs noisy repo discovery, command attempts, failures, retries, and raw tool transcript in an in-memory child session with inherited extensions, skills, prompts, themes, and context files disabled
- returns one final report message to the parent session while scrubbing raw child tool calls and Git status metadata from the stored parent message details
- supports `--plan-only`, `--yes`, and free-form focus notes for targeted audits
- uses a conservative guarded `bash` tool that blocks obvious destructive, publishing, deploy, mutating Git/GitHub, credential-dumping, path-changing, source-fixing, and arbitrary execution commands
- publishes a standalone `@diegopetrucci/pi-agent-workflow-audit` package alongside the collection package

## Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.29`
- standalone agent-workflow-audit package: `@diegopetrucci/pi-agent-workflow-audit@0.1.0`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone agent-workflow-audit:

```bash
pi install npm:@diegopetrucci/pi-agent-workflow-audit
```

Then reload pi:

```text
/reload
```
