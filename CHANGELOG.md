# Changelog

Notable user-facing changes to this package are listed here, newest first.

## [0.1.89] - 2026-11-27

- Bundles the extension updates in this release: Pi 1.7.0 support, permission-aware approval prompts (`permission-gate`, `dirty-repo-guard`, `confirm-destructive`), refreshed model preference ladders (`oracle`, `contrarian`, `code-reviewer`), `context-inspector` bash truncation reporting, and the `illustrations-to-explain-things` codemode image fallback.
- Development baseline moves to Pi 1.7.0 (automated checks only; no fleet certification claim).

## [0.1.88] - 2026-11-22

- Bundles the extension updates in this release: Pi 1.6.0 support, GPT-6.2 in `fast` and the model preference ladders (`oracle`, `contrarian`, `code-reviewer`), and `review` git timeout reporting.
- Development baseline moves to Pi 1.6.0 (automated checks only; no fleet certification claim).

## [0.1.87] - 2026-11-17

- Every extension package (except illustrations-to-explain-things, claude-fast and openai-fast) now ships a CHANGELOG.md, so Pi 1.5.0+ shows notes after an update.
- annotate-git-diff and review: git/gh commands time out (clipboard commands too, in annotate-git-diff); timeouts fail the review instead of hanging. review also no longer stops loop fixing after the first pass on Pi 1.5.x.
- project-mcp-json: servers with an invalid timeout or description are now skipped, with a warning in interactive sessions.
- oracle, contrarian, code-reviewer: model preference catalogs refreshed for Pi 1.5.2; oracle also keeps Sol pro/fast on xhigh and batch Sol aliases on high thinking.
- dynamic-context-pruning: code comment correction only.
