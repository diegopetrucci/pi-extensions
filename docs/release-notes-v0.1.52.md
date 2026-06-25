# Release notes — v0.1.52

## Highlights

This release adds `contrarian`, a read-only adversarial-analysis subagent for stress-testing plans, designs, assumptions, bug hypotheses, review conclusions, and product directions.

## contrarian

- adds the `contrarian` tool, which runs an isolated pi subprocess and returns a concise adversarial markdown report
- adapts the TLH contrarian subagent prompt for pi: identify the core claim, steelman the strongest opposing case, review evidence, and separate confirmed objections, speculative concerns, and unresolved unknowns
- defaults to read-only tools (`read,grep,find,ls`) with optional non-mutating bash inspection via `includeBash`
- prefers a strong reasoning model from the opposite model family/provider when available, then falls back to the best available model
- defaults to `high` thinking for reasoning models and clamps to the model-supported effective level
- adds `/contrarian` for persisted model/thinking defaults and `/contrarian-model` to inspect current auto-selection
- documents standalone installation as `@diegopetrucci/pi-contrarian`

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.52`
- new standalone contrarian package: `@diegopetrucci/pi-contrarian@0.1.0`

## Validation

- verified `@diegopetrucci/pi-extensions@0.1.52` and `@diegopetrucci/pi-contrarian@0.1.0` are not already published
- refreshed dependencies with `npm ci`
- ran install-state preflight and full TypeScript typecheck
- ran Contrarian syntax/type checks
- smoke-tested `/contrarian status` with only the contrarian extension enabled
- verified root and standalone contrarian package dry-runs include the expected files
