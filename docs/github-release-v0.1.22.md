This release updates `openai-fast` so running `/fast` without arguments opens an action picker.

## Highlights

- bare `/fast` now offers a picker for `status`, `on`, `off`, `auto`, and `toggle`
- explicit commands such as `/fast on` and `/fast status` continue to work unchanged
- non-UI mode still falls back to status behavior
- publishes standalone `@diegopetrucci/pi-openai-fast`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone openai-fast package: `@diegopetrucci/pi-openai-fast`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone openai-fast:

```bash
pi install npm:@diegopetrucci/pi-openai-fast
```

Then reload pi:

```text
/reload
```
