Adds Claude Opus 5.5 Fast mode support to the unified `fast` extension. Existing Claude Fast behavior and fleet compatibility remain unchanged.

## Highlights

- **Claude Opus 5.5 Fast mode.** `claude-opus-5-5` is now eligible for Anthropic `anthropic-messages` Fast requests and receives `speed: "fast"` plus `fast-mode-2026-02-01` when Fast mode is active.
- **Existing access paths preserved.** Claude Opus 4.8 and Claude Opus 5 remain supported, with both API-key and Claude Code OAuth access when the account has access to the research preview.
- **Compatibility unchanged.** All 28 fleet markers remain **Pi 0.84.4**.

## Packages

- `@diegopetrucci/pi-fast@0.1.4`
- `@diegopetrucci/pi-extensions@0.1.72`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.4"],["@diegopetrucci/pi-extensions","0.1.72"]] -->
