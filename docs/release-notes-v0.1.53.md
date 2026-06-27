# Release notes — v0.1.53

## Highlights

This release fixes a model-selection bug in `oracle`, `contrarian`, and `librarian`. Their automatic model selection could pick a model that the catalog advertises but the active provider/subscription cannot actually serve (legacy snapshots such as `claude-3-haiku-20240307`, or access-gated tiers), causing the run to hard-fail with a not-found/`404` error. The extensions now fall back to a servable model instead of failing.

## oracle, contrarian, librarian

- builds an ordered list of candidate models (the ranked auto-selection picks first, then the known-good current session model as a final fallback) and runs them in order
- falls back to the next candidate only on a model-availability error (`404`/`403`/`not_found`/`model_not_found`/`is not available`/`forbidden`/`access denied`/`not entitled`), and stops on success, genuine model errors, transient errors, and aborts
- recognizes `model_not_found` and `model_not_found_error` (OpenAI-style codes), in addition to Anthropic's `not_found_error`, so contrarian's opposite-provider selection also degrades gracefully
- `librarian` additionally catches availability errors thrown by its in-memory subagent session and advances to the next candidate
- selection reasoning records when a model was skipped, so the chosen model is transparent in the tool details

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.53`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.16`
- standalone contrarian package: `@diegopetrucci/pi-contrarian@0.1.1`
- standalone librarian package: `@diegopetrucci/pi-librarian@0.1.8`

## Validation

- verified `@diegopetrucci/pi-extensions@0.1.53`, `@diegopetrucci/pi-oracle@0.1.16`, `@diegopetrucci/pi-contrarian@0.1.1`, and `@diegopetrucci/pi-librarian@0.1.8` are not already published
- refreshed dependencies with `npm ci`
- ran install-state preflight and full TypeScript typecheck
- ran per-file `tsc` and `bun --check` for oracle, contrarian, and librarian
- smoke-tested `/oracle status`, `/contrarian status`, and `/librarian-config` with only the relevant extension enabled
- verified root and all three standalone package dry-runs include the expected files
