# Pi 0.85.1 compatibility work

Target: Pi 0.85.1. Existing fleet certification remains 0.84.4 until the manual matrix below passes.

## Changes

- Upgrade development Pi dependencies and lockfile to 0.85.1. Skip 0.85.0, whose published SDK import regression was fixed in 0.85.1.
- Prefer GPT-6 Astra on direct OpenAI and Codex for Oracle, Contrarian, and Code Reviewer; include Astra in the shared cross-provider ladder and the Oracle/Contrarian Copilot fallback ladder.
- Remove preference patterns absent from the pinned Copilot, OpenRouter, NVIDIA, and xAI catalogs.
- Preserve existing Fast and OpenAI Fast allowlists. Catalog availability is not evidence that Astra supports the priority service tier; no Astra fast-mode support is claimed.
- Add catalog, runtime selection/fallback, and all seven quiet-tool execution-cwd regressions.

## Local validation

- Clean `npm ci --ignore-scripts` and `npm run preflight:install-state`: 270 installed packages and 28 local entries match the lockfile.
- `npm run ci` covers typecheck, the full regression suite, package budgets, and tarball runtime loading. This does not substitute for the interactive checks below.
- Independent review requested broader cwd and runtime model-selection coverage; both were added.

## Release gates still required

- [ ] Run final CI and CodeQL on the PR, including native Windows shell safety.
- [ ] Check official checksum-verified Pi 0.85.1 SEA collection and standalone entry loading.
- [ ] Repeat fullscreen footer, context, quiet-tool, permission-gate, and clean-shutdown smoke from `smoke-checklist-pi-0.84.4.md` against 0.85.1. Inspect editor-border working indicator and jump-to-latest behavior.
- [ ] Exercise live subagent streaming, final answer assembly, model selection, and Claude thinking changes.
- [ ] Repeat packaged native annotation submit/cancel and shutdown checks on Node and SEA 0.85.1.
- [ ] Only after those checks, advance fleet markers and run deterministic release preparation with explicit unpublished package versions.
- [ ] Refresh dependencies, repeat install-state/typecheck/tests, and dry-run package artifacts after final bookkeeping.
- [ ] Commit/push through a PR, merge after checks, then tag and create the GitHub release using the exact public release-body file.
- [ ] Human performs npm publishing; do not run `npm publish` from the agent. After confirmation, wait five minutes before registry and installed-package validation.

No certification or publishing is implied by this document or the development dependency bump.
