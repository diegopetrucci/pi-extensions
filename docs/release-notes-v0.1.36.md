# Release notes — v0.1.36

## Highlights

This release simplifies `openai-fast` so the `/fast` command is a no-option toggle.

## OpenAI Fast

- makes `/fast` toggle Fast mode directly with no arguments
- removes user-facing `on`, `off`, `status`, `auto`, and `toggle` command choices
- updates `/fast` usage text and README command docs to match the no-option toggle flow
- keeps config defaults and the existing session override behavior intact

## Validation

- typechecked all extension entrypoints
- smoke-tested `/fast` loading through Pi with only the `openai-fast` extension enabled
- ran npm audit with high-severity threshold
- verified root and standalone `openai-fast` package dry-runs
- verified root and standalone `openai-fast` publish dry-runs

## Packaging

- `@diegopetrucci/pi-extensions@0.1.36`
- `@diegopetrucci/pi-openai-fast@0.1.3`

## Suggested release blurb

`v0.1.36 simplifies openai-fast so /fast toggles Fast mode directly with no options, with matching completions, usage text, and README docs.`
