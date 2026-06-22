`minimal-footer` now shows Pi's experimental-features footer marker when `PI_EXPERIMENTAL=1`, while continuing to keep the compact two-line layout.

## Highlights

- Adds a default-on `experimentalMarker` config block to `minimal-footer`.
- Shows `xp` in the bottom-left footer status when Pi experimental features are enabled.
- Keeps prompt cache-hit display out of `minimal-footer` by design.
- Updates `minimal-footer` README docs and example config.
- Fixes [#4](https://github.com/diegopetrucci/pi-extensions/issues/4).

## Packages

- `@diegopetrucci/pi-extensions@0.1.48`
- `@diegopetrucci/pi-minimal-footer@0.1.10`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone package:

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
```

Then reload pi:

```text
/reload
```
