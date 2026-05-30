# Announcement copy — v0.1.37

## Short

Released `v0.1.37`: adds `claude-fast`, a `/claude-fast` extension for Anthropic Claude Fast mode on supported Claude Opus models.

## Medium

`v0.1.37` adds `claude-fast`: a `/claude-fast` extension that enables Anthropic Claude Fast mode by injecting `speed: "fast"` and the required Fast mode beta header for eligible Claude Opus requests. It defaults off so installing the collection does not accidentally spend Fast-mode credits.

## Highlights

- New standalone package: `@diegopetrucci/pi-claude-fast@0.1.0`
- Collection package: `@diegopetrucci/pi-extensions@0.1.37`
- Supports the first-party `anthropic` provider on `claude-opus-4-6` and `claude-opus-4-7`
- Adds `/claude-fast` session toggle and compact `fast` status indicator

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
# or
pi install npm:@diegopetrucci/pi-claude-fast
```

Then reload pi with `/reload`.
