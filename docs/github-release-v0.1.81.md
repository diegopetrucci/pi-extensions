This release fixes Anthropic Fast mode on Claude Opus 5/5.5 and bounds the shell commands run by dirty-repo-guard and inline-bash.

## Highlights

- **Anthropic Fast on Claude Opus 5/5.5:** Fast mode no longer fails with `400 output_config: Extra inputs are not permitted`; the `fast-mode-2026-02-01` beta is now appended to Pi's computed betas list instead of replacing the `anthropic-beta` header ([#186](https://github.com/diegopetrucci/pi-extensions/pull/186)).
- **Bounded dirty-repo checks:** `dirty-repo-guard` now bounds `git status` with a 15-second timeout and the session abort signal, and a killed check is not treated as a clean tree ([#183](https://github.com/diegopetrucci/pi-extensions/pull/183)).
- **Cancellable inline bash:** `inline-bash` forwards the abort signal, so cancelling kills the expansion instead of waiting for the 30-second timeout ([#183](https://github.com/diegopetrucci/pi-extensions/pull/183)).

## Contributors

- [@denusklo](https://github.com/denusklo) contributed the Anthropic Fast beta fix and regression tests in [#186](https://github.com/diegopetrucci/pi-extensions/pull/186).

## Packages

- `@diegopetrucci/pi-dirty-repo-guard@0.1.13`
- `@diegopetrucci/pi-fast@0.1.11`
- `@diegopetrucci/pi-inline-bash@0.1.14`
- `@diegopetrucci/pi-extensions@0.1.81`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-dirty-repo-guard","0.1.13"],["@diegopetrucci/pi-fast","0.1.11"],["@diegopetrucci/pi-inline-bash","0.1.14"],["@diegopetrucci/pi-extensions","0.1.81"]] -->
