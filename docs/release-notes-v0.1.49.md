# Release notes — v0.1.49

## Highlights

This release speeds up `librarian` defaults for GitHub code research. The internal scout now defaults to `low` thinking, prefers explicitly fast/lightweight models, and is prompted to run independent GitHub probes in parallel when useful.

## librarian

- Bumps `@diegopetrucci/pi-librarian` to `0.1.6`.
- Changes the default internal thinking level from `medium` to `low`.
- Prefers fast/light model families during auto-selection before falling back to the cheapest available model.
- Removes the `model=current` opt-in so Librarian no longer intentionally inherits the caller's active model.
- Updates internal instructions to encourage batching independent `bash`/`read` probes in the same turn.
- Updates `/librarian-config` help text and README docs.
- Fixes [#1](https://github.com/diegopetrucci/pi-extensions/issues/1).

## Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.49`
- standalone librarian package: `@diegopetrucci/pi-librarian@0.1.6`

## Validation

- refreshed dependencies with `npm ci`
- verified installed package state against `package-lock.json`
- ran full repository TypeScript checking
- verified package JSON metadata, lockfile versions, and release docs
- smoke-tested affected extension config/help loading with Pi offline mode
- verified root and standalone package dry-runs
- verified root and standalone publish dry-runs
