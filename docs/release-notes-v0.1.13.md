# Release notes — v0.1.13

## Highlights

This release makes `minimal-footer` configurable and adds an optional red `DUMB ZONE` indicator when context usage exceeds 200k tokens.

## Changed

- `minimal-footer` now reads config from `~/.pi/agent/extensions/minimal-footer.json` and the nearest parent `.pi/minimal-footer.json`
- added configurable `DUMB ZONE` display for high context usage
- `DUMB ZONE` can be disabled, relabeled, recolored, or moved to a different token threshold
- OpenAI Codex session-limit usage can now be disabled entirely
- OpenAI Codex primary and secondary usage windows can be disabled independently and relabeled
- Codex usage fetches are skipped when Codex usage display is disabled or both windows are disabled
- added `extensions/minimal-footer/minimal-footer.example.json` as a copyable config sample
- updated `minimal-footer` docs with config examples and field descriptions

## Why

The footer should be useful without being noisy. Some users want the OpenAI Codex `5h` and `7d` limits visible, others do not, and the high-context warning should be easy to tune or turn off. JSON config keeps the defaults unchanged while making the new status signals opt-out and customizable.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.13`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.5`

## Suggested release blurb

`v0.1.13 makes minimal-footer configurable, adds an optional red DUMB ZONE indicator above 200k context tokens, and lets users disable or relabel OpenAI Codex 5h/7d usage windows.`
