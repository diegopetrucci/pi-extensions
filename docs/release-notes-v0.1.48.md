# Release notes — v0.1.48

## Highlights

This release brings `minimal-footer` back in line with Pi's experimental-features footer signal while keeping the compact two-line layout. When Pi is launched with `PI_EXPERIMENTAL=1`, `minimal-footer` can now show an `xp` marker in the bottom-left status area.

## minimal-footer

- Adds a default-on `experimentalMarker` config block.
- Shows `xp` when `PI_EXPERIMENTAL=1`.
- Keeps prompt cache-hit display out of `minimal-footer` by design.
- Documents the new marker and config in the README and example config.
- Fixes [#4](https://github.com/diegopetrucci/pi-extensions/issues/4).

## Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.48`
- standalone minimal-footer package: `@diegopetrucci/pi-minimal-footer@0.1.10`

## Validation

- refreshed dependencies with `npm ci`
- verified installed package state against `package-lock.json`
- ran full repository TypeScript checking
- verified package JSON metadata, lockfile versions, and release docs
- smoke-tested affected extension loading with Pi `0.79.5`
- verified root and standalone package dry-runs
- verified root and standalone publish dry-runs
