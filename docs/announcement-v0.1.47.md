# Announcement — v0.1.47

Released `@diegopetrucci/pi-extensions@0.1.47` plus refreshed standalone packages for `brrr`, `notify`, `minimal-footer`, `openai-fast`, `claude-fast`, and `review`.

This release fixes [#3](https://github.com/diegopetrucci/pi-extensions/issues/3): global extensions no longer honor project-local config or review guidelines from untrusted projects. Global config still works normally, but repo-controlled `.pi/*.json` files and `REVIEW_GUIDELINES.md` are used only after Pi reports project trust.

## Short post

Released `pi-extensions` v0.1.47 with project-trust gating for project-local extension config.

Affected global extensions now ignore repo-controlled `.pi/*.json` files and review guidelines until Pi reports the project is trusted. This protects `notify`, `brrr`, `minimal-footer`, `openai-fast`, `claude-fast`, and `review` from untrusted local-input overrides.

## Tiny post

Released `pi-extensions@0.1.47`: project-local extension config now honors Pi project trust. Fixes #3.
