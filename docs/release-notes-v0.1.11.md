# Release notes — v0.1.11

## Highlights

This release teaches `minimal-footer` to show OpenAI Codex subscription usage directly in the footer.

## Changed

- `minimal-footer` now fetches OpenAI Codex usage from ChatGPT's backend usage endpoint when the active provider is `openai-codex`
- the footer appends `5h` and `7d` usage percentages to the bottom-left context line when usage is available
- usage refreshes on session start, model changes, and turn end
- usage is cached briefly in memory to avoid unnecessary network requests
- non-OpenAI providers keep the existing footer behavior unchanged
- `extensions/minimal-footer/README.md` now documents the new OpenAI Codex usage display
- `extensions/minimal-footer/package.json` now includes the new helper module in the published package files

## Why

When using pi with an OpenAI Codex subscription, the 5-hour and 7-day usage windows are some of the most useful status signals to keep visible. Adding them to the footer keeps that information in view without needing a separate extension or command.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.11`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.4`

## Suggested release blurb

`v0.1.11 adds OpenAI Codex 5-hour and 7-day usage to minimal-footer, shown inline with context usage when the active provider is openai-codex.`
