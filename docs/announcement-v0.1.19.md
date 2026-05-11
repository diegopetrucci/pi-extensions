# Announcement copy — v0.1.19

## Short post

Released `@diegopetrucci/pi-extensions@0.1.19`.

This release adds `context-inspector`, a `/context` command that opens a local HTML dashboard showing where your current pi session context is going: system prompt, tool schemas, messages, thinking, tool calls/results, bash output, summaries, images, and provider delta.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or just context inspector:

```bash
pi install npm:@diegopetrucci/pi-context-inspector
```

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.19`.

Adds `context-inspector`: `/context` opens a local HTML dashboard that explains where your pi session context is going, with overview charts, top offenders, drilldown search, and redaction support.

`pi install npm:@diegopetrucci/pi-extensions`

## Very short version

Released `pi-extensions` v0.1.19.

Adds `/context`, a local dashboard for understanding where your pi session context went.

## Discord / forum version

`pi-extensions@0.1.19` is out.

This release adds `context-inspector`, a `/context` command that opens a self-contained local HTML report explaining where your current session context is going.

It breaks context down by system prompt, active tool schemas, user and assistant text, reasoning/thinking blocks, tool calls and results, bash output, compaction/branch summaries, custom context, images, and provider/serialization delta. The report includes first-glance charts plus top tools, paths, turns, largest segments, and drilldown search.

Reports are local-only and written with private file permissions. Use `--redact` to hide contents, paths, commands, session identifiers, and timestamps while keeping token attribution.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone context inspector:

```bash
pi install npm:@diegopetrucci/pi-context-inspector
```
