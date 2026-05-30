# Release notes — v0.1.36

## Highlights

This release simplifies `openai-fast` so the `/fast` command only exposes the two user-facing choices Fast mode actually needs: `on` and `off`.

## OpenAI Fast

- narrows `/fast` completions and the interactive menu to only `on` and `off`
- removes user-facing `status`, `auto`, and `toggle` command choices
- updates `/fast` usage text and README command docs to match the simplified two-choice flow
- keeps config defaults and the existing on/off session override behavior intact

## Validation

- typechecked all extension entrypoints
- smoke-tested `/fast on` loading through Pi with only the `openai-fast` extension enabled
- ran npm audit with high-severity threshold
- verified root and standalone `openai-fast` package dry-runs
- verified root and standalone `openai-fast` publish dry-runs

## Packaging

- `@diegopetrucci/pi-extensions@0.1.36`
- `@diegopetrucci/pi-openai-fast@0.1.3`

## Suggested release blurb

`v0.1.36 simplifies openai-fast so /fast only offers on and off, with matching completions, menu choices, usage text, and README docs.`
