Simplifies `openai-fast` so `/fast` toggles Fast mode directly with no options.

## Highlights

- Makes `/fast` toggle Fast mode directly with no arguments.
- Removes user-facing `on`, `off`, `status`, `auto`, and `toggle` command choices.
- Updates `/fast` usage text and README command docs to match the no-option toggle flow.
- Keeps config defaults and existing session overrides intact.

## Packages

- `@diegopetrucci/pi-extensions@0.1.36`
- `@diegopetrucci/pi-openai-fast@0.1.3`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone:

```bash
pi install npm:@diegopetrucci/pi-openai-fast
```

Then reload pi:

```text
/reload
```
