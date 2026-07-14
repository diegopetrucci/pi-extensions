# Release notes — v0.1.57

## Highlights

This release packages the audited support-gap batch as v0.1.57. It patch-bumps only the standalone packages touched by the batch, adds GPT-5.6 Fast coverage for OpenAI Codex fast mode and refreshed reasoning-model rankings, switches affected extensions to Pi runtime `CONFIG_DIR_NAME` compatibility instead of hardcoded `.pi` paths, adds protected path write/edit guards in `permission-gate`, and carries the dependency/audit cleanup needed for the audited workspace state.

## Fast-mode and config-path compatibility

- extends `openai-fast` to support GPT-5.6 Codex variants `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`
- keeps `claude-fast`, `openai-fast`, `brrr`, `notify`, `review`, `context-inspector`, and `minimal-footer` aligned with Pi runtime `CONFIG_DIR_NAME` instead of assuming `.pi`
- updates related READMEs and command text so config and keep-report paths describe the runtime config directory correctly

## Refreshed model rankings and drift coverage

- refreshes `oracle`, `contrarian`, and `code-reviewer` provider/model preference catalogs for current GPT-5.6, Gemini, Grok, Claude, GLM, Kimi, MiniMax, and related fallback IDs
- keeps GPT-5.6 Sol/Terra/Luna ordered ahead of older OpenAI and OpenAI Codex fallbacks on the relevant reasoning paths
- updates focused model-selection and catalog tests so the audited rankings and fallback ordering are covered against future drift

## Safety and dependency cleanup

- expands `permission-gate` to inspect `write` and `edit` calls in addition to dangerous bash commands
- protects exact `.git` and `node_modules` path segments plus secret-bearing `.env` files, while still allowing safe example/template env files
- normalizes candidate paths before matching so traversal-style path tricks do not bypass the guard
- refreshes dependency metadata for the audited batch, including the `@tailwindcss/browser` update and protobuf override/lockfile cleanup

## Packaging

- `@diegopetrucci/pi-extensions@0.1.57`
- `@diegopetrucci/pi-annotate-git-diff@0.1.4`
- `@diegopetrucci/pi-brrr@0.1.7`
- `@diegopetrucci/pi-claude-fast@0.1.7`
- `@diegopetrucci/pi-code-reviewer@0.1.2`
- `@diegopetrucci/pi-context-inspector@0.1.6`
- `@diegopetrucci/pi-contrarian@0.1.4`
- `@diegopetrucci/pi-minimal-footer@0.1.14`
- `@diegopetrucci/pi-notify@0.1.10`
- `@diegopetrucci/pi-openai-fast@0.1.9`
- `@diegopetrucci/pi-oracle@0.1.19`
- `@diegopetrucci/pi-permission-gate@0.1.7`
- `@diegopetrucci/pi-review@0.1.7`

## Validation

- verified the root manifest, only the changed standalone manifests, and `package-lock.json` local package entries agree on the v0.1.57 release versions
- checked `git diff --cached --name-only` to confirm no staged files were introduced during this release-prep update
- ran focused version/docs consistency checks only for this prep ticket; broader clean-install and package dry-run validation remains deferred to `pe-g24v`

## Suggested release blurb

`v0.1.57 packages the audited support-gap batch with GPT-5.6 Fast support, CONFIG_DIR_NAME-compatible config paths, refreshed reasoning-model rankings and drift coverage, protected path guards for write/edit flows, and dependency/audit cleanup across the changed standalone packages.`
