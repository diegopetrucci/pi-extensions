# Release notes — v0.1.29

## Highlights

This release adds `agent-workflow-audit`, a slash-command extension that runs repo workflow audits in an isolated child session. It keeps noisy discovery, command output, failures, retries, and raw tool transcript out of the main session while returning the final distilled report to the user and main agent.

## agent-workflow-audit

- adds `/agent-workflow-audit` as a deterministic command-first entry point for auditing repository setup/build/lint/test/run workflows
- runs the audit in an in-memory child `createAgentSession` with inherited extensions, skills, prompt templates, themes, and context files disabled
- gives the child only local inspection tools plus a conservative guarded `bash` tool, so obvious destructive, publishing, deploy, mutating Git/GitHub, credential-dumping, path-changing, source-fixing, and arbitrary execution commands are blocked before execution
- returns a single final `agent-workflow-audit` custom message to the parent session, with raw child tool calls and Git status metadata scrubbed from the stored parent message details
- includes `--plan-only` for docs/manifests-only workflow planning, `--yes` for non-interactive confirmation, free-form focus notes, live run status, and a renderer for the final report
- documents the standalone package and the isolation/safety model in `extensions/agent-workflow-audit/README.md`

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.29`
- standalone agent-workflow-audit package: `@diegopetrucci/pi-agent-workflow-audit@0.1.0`

## Suggested release blurb

`v0.1.29 adds agent-workflow-audit, an isolated /agent-workflow-audit command that audits repo workflow friction in a child session and returns only the final distilled report to the main session.`
