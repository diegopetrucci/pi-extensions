# context-inspector

A pi extension that adds `/context`, a local HTML dashboard for understanding where your current session context is going.

Pi's footer can tell you that the session is at 30% of the context window. `context-inspector` answers the next question: what is inside that 30%?

## What it shows

- A first-glance donut and stacked bar by context component.
- System prompt and active tool schema overhead.
- User messages, assistant responses, assistant thinking, tool calls, tool results, user bash output, custom context, images, and compaction/branch summaries.
- Top tools, paths/globs, turns, and individual largest context segments.
- Drilldown search by content, tool name, path, command, entry id, and category.
- Current model context vs full active branch history.

The report is self-contained HTML written locally with private file permissions. It makes no network calls and does not add anything to the model context.

## Commands

```text
/context
/context --no-open
/context --keep
/context --redact
/context --full
```

Options:

- `--no-open`: write the HTML report but do not open a browser.
- `--keep`: save under `.pi/context-reports/` instead of the OS temp directory.
- `--redact`: keep token attribution but hide message/tool contents plus paths, commands, session identifiers, and timestamps in the report.
- `--full`: open the report on the full active branch tab by default.

## Notes

- Per-component token counts are estimates. Providers expose aggregate usage, not exact token attribution per message or block.
- The current-context chart reconciles to pi's footer-compatible context total when pi knows it.
- Immediately after compaction, pi may not know exact current context usage until the next model response.
- The full branch tab includes old pre-compaction history for inspection; that history is not necessarily sent verbatim to the model.
- `--keep` writes reports under `.pi/context-reports/`; avoid committing those reports because they can contain sensitive session data unless redacted.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-context-inspector
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
