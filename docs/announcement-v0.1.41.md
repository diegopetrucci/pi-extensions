# Announcement copy — v0.1.41

## Short

Released `v0.1.41`: fixes `claude-fast` so disabled Fast mode preserves Claude Code OAuth Anthropic beta headers.

## Medium

`v0.1.41` updates `@diegopetrucci/pi-claude-fast` to avoid mutating unrelated Anthropic beta headers when Fast mode is off. The extension now removes only its own Fast-mode beta and preserves Claude Code OAuth headers.

## Highlights

- Collection package: `@diegopetrucci/pi-extensions@0.1.41`
- Standalone package: `@diegopetrucci/pi-claude-fast@0.1.2`
- Disabled Fast mode removes only `fast-mode-2026-02-01`
- Existing OAuth betas like `claude-code-20250219` and `oauth-2025-04-20` are preserved

## Install

```bash
pi install npm:@diegopetrucci/pi-claude-fast
# or the collection:
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi with `/reload`.
