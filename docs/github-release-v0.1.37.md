Adds `claude-fast`, a new pi extension that enables Anthropic Claude Fast mode for supported Claude Opus models.

## Highlights

- Adds `/claude-fast` to toggle Claude Fast mode for the current session/runtime.
- Injects `speed: "fast"` into eligible Anthropic Messages request payloads.
- Adds the required `fast-mode-2026-02-01` Anthropic beta header while active.
- Gates Fast mode to the first-party `anthropic` provider on `claude-opus-4-6` and `claude-opus-4-7`.
- Defaults off so installing the collection does not accidentally spend Fast-mode credits.

## Packages

- `@diegopetrucci/pi-extensions@0.1.37`
- `@diegopetrucci/pi-claude-fast@0.1.0`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone:

```bash
pi install npm:@diegopetrucci/pi-claude-fast
```

Then reload pi:

```text
/reload
```
