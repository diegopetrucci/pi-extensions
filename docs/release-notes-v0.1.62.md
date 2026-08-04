# Release notes — v0.1.62

This release certifies the extension fleet against Pi `0.83.0` and makes the model-selecting research and review extensions honor Pi's new session model scope.

## Highlights

- Oracle, Contrarian, Code Reviewer, and Librarian now constrain automatic model candidates to a non-empty `ctx.scopedModels` session scope.
- Automatic current-session fallbacks can no longer escape that scope. Missing or empty scopes retain the previous all-authenticated-model behavior for compatibility with older Pi runtimes.
- Explicit per-tool and persisted extension model choices remain authoritative, including when they intentionally name a model outside the session's automatic-selection scope.
- Scope-specific failures now explain how to adjust the scope or authentication instead of silently selecting an out-of-scope model.
- Oracle and Contrarian remove Fireworks GLM 5.1 aliases that are no longer present in Pi `0.83.0`'s built-in catalog.
- All 27 published package markers advance to Pi `0.83.0`.

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.9`
- `@diegopetrucci/pi-annotate-git-diff@0.1.9`
- `@diegopetrucci/pi-annotate-last-message@0.1.7`
- `@diegopetrucci/pi-brrr@0.1.12`
- `@diegopetrucci/pi-claude-fast@0.1.12`
- `@diegopetrucci/pi-code-reviewer@0.1.7`
- `@diegopetrucci/pi-confirm-destructive@0.1.10`
- `@diegopetrucci/pi-context-cap@0.1.9`
- `@diegopetrucci/pi-context-inspector@0.1.11`
- `@diegopetrucci/pi-contrarian@0.1.9`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.9`
- `@diegopetrucci/pi-git-footer@0.1.8`
- `@diegopetrucci/pi-gnosis@0.1.9`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.7`
- `@diegopetrucci/pi-inline-bash@0.1.9`
- `@diegopetrucci/pi-librarian@0.1.14`
- `@diegopetrucci/pi-minimal-footer@0.1.18`
- `@diegopetrucci/pi-notify@0.1.15`
- `@diegopetrucci/pi-openai-fast@0.1.14`
- `@diegopetrucci/pi-oracle@0.1.24`
- `@diegopetrucci/pi-permission-gate@0.1.12`
- `@diegopetrucci/pi-quiet-tools@0.1.10`
- `@diegopetrucci/pi-review@0.1.12`
- `@diegopetrucci/pi-todo@0.1.9`
- `@diegopetrucci/pi-triage-comments@0.1.10`
- `pi-dynamic-context-pruning@0.1.5`
- `@diegopetrucci/pi-extensions@0.1.62`

## Validation

- A clean `npm ci` completed before final validation.
- `npm run preflight:install-state` passed with 246 installed packages and 27 local package entries checked.
- `npm run ci` passed with 530/530 tests, including typechecking and offline tarball installation/runtime loading.
- Provider-catalog tests passed 4/4, and the standalone tarball runtime smoke test passed 1/1.
- All 27 target npm versions were confirmed unpublished.
- Root and all 26 standalone package `npm pack --dry-run` and `npm publish --dry-run` checks passed: 305 files, 2,437,619 packed bytes, 4,111,192 unpacked bytes, and no suspicious package paths.
- `npm audit`, `npm audit --omit=dev`, and `npm audit --omit=dev --audit-level=high` report the same remaining upstream transitive findings under Pi `0.83.0`: `brace-expansion@5.0.7` and `undici@8.5.0` (3 vulnerabilities: 1 moderate, 2 high).
- All 27 `.pi-fleet-tested-version` files read `0.83.0`; `git diff --check` passed; no files were staged; and no repository `.tgz` or `.npmrc` artifacts remained.

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.9"],["@diegopetrucci/pi-annotate-git-diff","0.1.9"],["@diegopetrucci/pi-annotate-last-message","0.1.7"],["@diegopetrucci/pi-brrr","0.1.12"],["@diegopetrucci/pi-claude-fast","0.1.12"],["@diegopetrucci/pi-code-reviewer","0.1.7"],["@diegopetrucci/pi-confirm-destructive","0.1.10"],["@diegopetrucci/pi-context-cap","0.1.9"],["@diegopetrucci/pi-context-inspector","0.1.11"],["@diegopetrucci/pi-contrarian","0.1.9"],["@diegopetrucci/pi-dirty-repo-guard","0.1.9"],["@diegopetrucci/pi-git-footer","0.1.8"],["@diegopetrucci/pi-gnosis","0.1.9"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.7"],["@diegopetrucci/pi-inline-bash","0.1.9"],["@diegopetrucci/pi-librarian","0.1.14"],["@diegopetrucci/pi-minimal-footer","0.1.18"],["@diegopetrucci/pi-notify","0.1.15"],["@diegopetrucci/pi-openai-fast","0.1.14"],["@diegopetrucci/pi-oracle","0.1.24"],["@diegopetrucci/pi-permission-gate","0.1.12"],["@diegopetrucci/pi-quiet-tools","0.1.10"],["@diegopetrucci/pi-review","0.1.12"],["@diegopetrucci/pi-todo","0.1.9"],["@diegopetrucci/pi-triage-comments","0.1.10"],["pi-dynamic-context-pruning","0.1.5"],["@diegopetrucci/pi-extensions","0.1.62"]] -->
