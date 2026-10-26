# Announcement drafts — v0.1.81

## Short

v0.1.81 fixes Anthropic Fast mode on Claude Opus 5/5.5 and bounds the shell commands run by dirty-repo-guard and inline-bash. Thanks to @denusklo for the Fast fix. It is a release-preparation candidate, not a publication or compatibility certification.

Suggested public title: **Anthropic Fast fix for Claude Opus 5/5.5 and bounded shell checks**.

## Highlights

- Anthropic Fast on Claude Opus 5/5.5 no longer fails with `400 output_config: Extra inputs are not permitted`; the Fast beta is appended to Pi's computed betas instead of replacing the `anthropic-beta` header (#186).
- `dirty-repo-guard` bounds `git status` with a 15-second timeout and the session abort signal, and never treats a killed check as a clean tree (#183).
- `inline-bash` forwards the abort signal so cancelling kills the expansion promptly (#183).

## Packages

- `@diegopetrucci/pi-dirty-repo-guard@0.1.13`
- `@diegopetrucci/pi-fast@0.1.11`
- `@diegopetrucci/pi-inline-bash@0.1.14`
- `@diegopetrucci/pi-extensions@0.1.81`

<!-- prepare-release:packages [["@diegopetrucci/pi-dirty-repo-guard","0.1.13"],["@diegopetrucci/pi-fast","0.1.11"],["@diegopetrucci/pi-inline-bash","0.1.14"],["@diegopetrucci/pi-extensions","0.1.81"]] -->
