# GitHub release body — v0.1.19

## v0.1.19

This release adds `context-inspector`, a `/context` command that opens a local HTML dashboard explaining where the current pi session context is going.

### Highlights

- adds the new `context-inspector` extension to the collection
- registers `/context`
- generates a self-contained local HTML context report with no network calls
- breaks down context by system prompt, tool schemas, user/assistant text, thinking, tool calls/results, bash output, summaries, custom context, images, and provider delta
- includes top tools, paths/globs, turns, and largest individual context segments
- supports drilldown search and category filtering
- supports current model context vs full active branch history views
- writes reports with private file permissions
- supports `--redact` for shareable/sensitive reviews
- publishes `context-inspector` as a standalone package: `@diegopetrucci/pi-context-inspector@0.1.0`

### Included docs

- [`docs/release-notes-v0.1.19.md`](./release-notes-v0.1.19.md)
- [`docs/publish-checklist-v0.1.19.md`](./publish-checklist-v0.1.19.md)
- [`docs/announcement-v0.1.19.md`](./announcement-v0.1.19.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.19`
- new standalone context inspector package: `@diegopetrucci/pi-context-inspector@0.1.0`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone context inspector:

```bash
pi install npm:@diegopetrucci/pi-context-inspector
```

Then reload pi:

```text
/reload
```
