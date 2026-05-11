# Release notes — v0.1.22

## Highlights

This release updates `openai-fast` so running `/fast` without arguments opens an action picker instead of showing status immediately.

## openai-fast

- adds a bare `/fast` picker for `status`, `on`, `off`, `auto`, and `toggle`
- keeps explicit commands unchanged: `/fast status`, `/fast on`, `/fast off`, `/fast auto`, and `/fast toggle`
- keeps non-UI mode behavior safe by falling back to `/fast status`

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.22`
- standalone openai-fast package: `@diegopetrucci/pi-openai-fast@0.1.1`

## Suggested release blurb

`v0.1.22 updates openai-fast so bare /fast opens an action picker while explicit /fast commands continue to work as before.`
