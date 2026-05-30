Simplifies `openai-fast` so `/fast` only offers the two Fast-mode choices users need: `on` and `off`.

## Highlights

- Narrows `/fast` completions and the interactive menu to only `on` and `off`.
- Removes user-facing `status`, `auto`, and `toggle` command choices.
- Updates `/fast` usage text and README command docs to match the simplified flow.
- Keeps config defaults and existing on/off session overrides intact.

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
