# Announcement copy — v0.1.29

## Short post

Released `@diegopetrucci/pi-extensions@0.1.29` and `@diegopetrucci/pi-agent-workflow-audit@0.1.0`.

This release adds `agent-workflow-audit`: `/agent-workflow-audit` runs noisy repo workflow audits in an isolated child session and returns only the final distilled report to the main session.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or standalone:

```bash
pi install npm:@diegopetrucci/pi-agent-workflow-audit
```

Standalone package: `@diegopetrucci/pi-agent-workflow-audit@0.1.0`.

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.29` / `@diegopetrucci/pi-agent-workflow-audit@0.1.0`.

Adds `/agent-workflow-audit`: isolated repo workflow audits with noisy command output/retries kept in a child session and only the final distilled report returned.

## Very short version

Released `pi-agent-workflow-audit@0.1.0` / `pi-extensions` v0.1.29.

Adds isolated `/agent-workflow-audit` repo workflow audits.

## Discord / forum version

`pi-agent-workflow-audit@0.1.0` / `pi-extensions@0.1.29` is out.

This release adds `/agent-workflow-audit`, a command-first repo workflow audit extension. It runs noisy discovery, documented command attempts, failures, retries, and raw tool transcript in an isolated in-memory child session, then returns only the final distilled report to the main session.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone package:

```bash
pi install npm:@diegopetrucci/pi-agent-workflow-audit
```

The standalone package version is `@diegopetrucci/pi-agent-workflow-audit@0.1.0`.
