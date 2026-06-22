`librarian` now uses faster defaults for GitHub code research: low thinking, fast/light model preference, no current-model inheritance, and prompt guidance for parallel independent probes.

## Highlights

- Defaults the internal Librarian scout to `low` thinking.
- Prefers explicitly fast/lightweight model families during auto-selection.
- Removes `model=current` opt-in so default runs do not inherit the caller's active model.
- Encourages the internal scout to batch independent GitHub probes in parallel when useful.
- Updates `/librarian-config` help text and README docs.
- Fixes [#1](https://github.com/diegopetrucci/pi-extensions/issues/1).

## Packages

- `@diegopetrucci/pi-extensions@0.1.49`
- `@diegopetrucci/pi-librarian@0.1.6`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone librarian:

```bash
pi install npm:@diegopetrucci/pi-librarian
```

Then reload pi:

```text
/reload
```
