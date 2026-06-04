Updates `librarian` so its internal research subagent avoids inheriting expensive caller model/thinking settings by default, and makes the local checkout cache opt-in by default.

## Highlights

- Bumps `@diegopetrucci/pi-librarian` to `0.1.5`.
- Changes Librarian's local checkout cache default from on to off.
- Adds `/librarian-config` to persist internal subagent model and thinking defaults.
- Defaults the internal subagent to lightweight auto-selection with `medium` thinking.
- Adds optional `model` and `thinkingLevel` tool-call overrides for explicit non-default runs.

## Packages

- `@diegopetrucci/pi-extensions@0.1.42`
- `@diegopetrucci/pi-librarian@0.1.5`

## Install

Standalone:

```bash
pi install npm:@diegopetrucci/pi-librarian
```

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```
