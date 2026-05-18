# agent-workflow-audit

Runs an isolated repo workflow audit from `/agent-workflow-audit`.

The extension ports the [`agent-workflow-audit`](https://github.com/diegopetrucci/agent-workflow-audit) skill into a pi slash command. The audit subagent reads the current repository's agent-facing instructions, manifests, and obvious workflow files, tries or plans the documented setup/build/lint/test/run flow, and reports where instructions or scripts waste agent time.

## Why an extension instead of only a skill?

A normal skill teaches the main agent how to run the audit, so all discovery, command output, failures, and retries enter the main session context. This extension runs that noisy work in an isolated in-memory child session and sends only the final distilled report back to the main session.

The final custom message is visible to the main agent and user. Raw child tool transcripts are not added to the main session context.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-agent-workflow-audit
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

## Usage

```text
/agent-workflow-audit
```

The command asks for confirmation before execution mode because documented project commands may create dependencies, build artifacts, caches, or other local side effects.

Options:

```text
/agent-workflow-audit --plan-only
/agent-workflow-audit --yes
/agent-workflow-audit focus on release/check/publish docs
```

- `--plan-only` reads docs and manifests, then reports the workflow it would try without running project commands.
- `--yes` skips the interactive confirmation.
- extra words become focus notes for the audit subagent.

## Behavior

- Runs a child `createAgentSession` with an in-memory session manager.
- Disables inherited extensions, skills, prompt templates, themes, and context files in the child.
- Gives the child `read`, `grep`, `find`, `ls`, and guarded `bash` tools.
- Returns a single final `agent-workflow-audit` custom message to the parent session.
- Includes a short run-boundary footer noting that intermediate command output, errors, retries, and search path stayed in the child session.

## Safety notes

The audit intentionally exercises documented project commands. The runtime guard is conservative: it blocks obvious destructive, publishing, deploy, mutating Git/GitHub, credential-dumping, network shell-installer, path-changing, and source-fixing commands. It may over-block valid workflow commands and report them as manual/friction instead. Project scripts can still create local artifacts, so run it from a checkout where local build/test side effects are acceptable.
