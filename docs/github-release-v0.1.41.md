Fixes `claude-fast` so disabled Fast mode no longer strips Claude Code OAuth Anthropic beta headers during status synchronization.

## Highlights

- Bumps `@diegopetrucci/pi-claude-fast` to `0.1.2`.
- Disabled Fast mode now removes only `fast-mode-2026-02-01`.
- Preserves existing Claude Code OAuth beta headers such as `claude-code-20250219` and `oauth-2025-04-20`.
- Keeps Fast mode behavior unchanged when explicitly enabled for supported Anthropic Claude Opus models.

## Packages

- `@diegopetrucci/pi-extensions@0.1.41`
- `@diegopetrucci/pi-claude-fast@0.1.2`

## Install

Standalone:

```bash
pi install npm:@diegopetrucci/pi-claude-fast
```

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```
