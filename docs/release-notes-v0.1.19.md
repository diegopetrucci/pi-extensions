# Release notes — v0.1.19

## Highlights

This release adds `context-inspector`, a `/context` command for pi that opens a local, self-contained HTML dashboard explaining where the current session context is going.

## New extension: context-inspector

- adds `extensions/context-inspector`
- registers `/context`
- generates a local HTML context report without network calls or LLM calls
- breaks down current model context by:
  - system prompt
  - active tool schemas
  - user messages
  - assistant responses
  - assistant thinking
  - tool calls
  - tool results
  - user bash output
  - custom context
  - images
  - compaction and branch summaries
  - provider / serialization delta
- includes donut and stacked-bar overview charts
- includes top tools, paths/globs, turns, and largest individual context segments
- supports drilldown search and category filtering
- supports current model context vs full active branch history views
- writes temp reports to private temporary directories and report files with private file permissions
- supports `--redact` to hide contents, paths, commands, session identifiers, and timestamps while preserving token attribution

## Commands

```text
/context
/context --no-open
/context --keep
/context --redact
/context --full
```

## Notes

- Per-component token counts are local estimates. Providers expose aggregate usage, not exact per-message attribution.
- The current-context view reconciles to pi's footer-compatible context total when pi knows it.
- Immediately after compaction, pi may not know exact current context usage until the next model response.
- `--keep` writes reports under `.pi/context-reports/`; avoid committing those reports because they can contain sensitive session data unless redacted.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.19`
- new standalone context inspector package: `@diegopetrucci/pi-context-inspector@0.1.0`
- standalone librarian package: `@diegopetrucci/pi-librarian@0.1.0`
- standalone quiet tools package: `@diegopetrucci/pi-quiet-tools@0.1.0`
- standalone context cap package: `@diegopetrucci/pi-context-cap@0.1.0`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.7`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.3`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.1`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.1`

## Suggested release blurb

`v0.1.19 adds context-inspector, a local /context dashboard for seeing where your pi session context is going, from system/tool overhead to tool results and compaction summaries.`
