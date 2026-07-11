# Release notes — v0.1.56

## Highlights

This release refreshes the tlh extension fleet for the Pi 0.80.6 validated baseline, patch-bumps every standalone workspace so each published package carries the updated fleet marker, preserves new `max` thinking-level support where available, prefers GPT-5.6 Sol at high for Code Reviewer, Oracle, and Contrarian on relevant OpenAI and OpenAI Codex auto-selection paths when that model is available, switches `notify` and `brrr` to settled-run notifications, and expands `context-inspector` with current-context projection alongside full-branch inspection.

## Pi 0.80.6 baseline and fleet markers

- refreshes the active Pi 0.80.6 validated baseline and fleet markers for the collection and every standalone workspace package
- bumps the root collection to `0.1.56` and patch-bumps every standalone workspace exactly once so published package metadata matches the refreshed fleet marker
- refreshes `package-lock.json` local package versions to keep release metadata aligned across the workspace

## Model-selection updates

- extends reasoning model selection paths to recognize the `max` thinking level in `oracle`, `contrarian`, `librarian`, and `code-reviewer`
- auto-selection now prefers GPT-5.6 Sol first on the relevant OpenAI and OpenAI Codex fallback paths for `code-reviewer`, `oracle`, and `contrarian` when that model is available
- keeps cross-provider and lower-priority fallback behavior intact instead of forcing GPT-5.6 Sol when another path is selected or when GPT-5.6 Sol is unavailable
- preserves `max` when the matched model supports it and clamps to the highest supported level when it does not
- keeps Code Reviewer and Contrarian on their existing high default thinking, while Oracle defaults GPT-5.6 Sol to high and retains xhigh defaults for its other reasoning-model preferences

## Settled notifications

- updates `notify` and `brrr` to trigger on `agent_settled` so alerts fire after the run fully settles instead of only at the earlier run-end event
- preserves the final assistant-message payload in Brrr alerts by resolving it from settled session state, with event messages retained as a fallback
- keeps Notify terminal, desktop, bell, and sound delivery behavior intact while waiting for all async notification work to settle

## Context Inspector projection

- expands `context-inspector` so the report compares the current model context projection against the full active branch history
- keeps drilldown and report generation focused on local inspection, including redacted and kept-report flows

## Packaging

- `@diegopetrucci/pi-extensions@0.1.56`
- `@diegopetrucci/pi-agent-workflow-audit@0.1.5`
- `@diegopetrucci/pi-annotate-git-diff@0.1.3`
- `@diegopetrucci/pi-annotate-last-message@0.1.3`
- `@diegopetrucci/pi-brrr@0.1.6`
- `@diegopetrucci/pi-claude-fast@0.1.6`
- `@diegopetrucci/pi-code-reviewer@0.1.1`
- `@diegopetrucci/pi-confirm-destructive@0.1.6`
- `@diegopetrucci/pi-context-cap@0.1.5`
- `@diegopetrucci/pi-context-inspector@0.1.5`
- `@diegopetrucci/pi-contrarian@0.1.3`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.5`
- `pi-dynamic-context-pruning@0.1.1`
- `@diegopetrucci/pi-git-footer@0.1.4`
- `@diegopetrucci/pi-gnosis@0.1.5`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.3`
- `@diegopetrucci/pi-inline-bash@0.1.5`
- `@diegopetrucci/pi-librarian@0.1.10`
- `@diegopetrucci/pi-minimal-footer@0.1.13`
- `@diegopetrucci/pi-notify@0.1.9`
- `@diegopetrucci/pi-openai-fast@0.1.8`
- `@diegopetrucci/pi-oracle@0.1.18`
- `@diegopetrucci/pi-permission-gate@0.1.6`
- `@diegopetrucci/pi-quiet-tools@0.1.6`
- `@diegopetrucci/pi-review@0.1.6`
- `@diegopetrucci/pi-todo@0.1.5`
- `@diegopetrucci/pi-triage-comments@0.1.6`

## Validation

- verified the root manifest, every standalone workspace manifest, and `package-lock.json` local package entries agree on the v0.1.56 release versions
- checked `git diff --cached --name-only` to confirm no staged files were introduced during release prep
- refreshed focused review-agent tests plus release validation evidence for this doc update, including install-state, full CI, whitespace checks, unpublished checks for the root collection and changed standalone packages, and pack/publish dry-runs for the root collection plus `code-reviewer`, `oracle`, and `contrarian`

## Suggested release blurb

`v0.1.56 refreshes the tlh extension fleet for Pi 0.80.6, carries the new fleet markers across every standalone package, prefers GPT-5.6 Sol at high for Code Reviewer, Oracle, and Contrarian on relevant OpenAI/OpenAI Codex paths when available, preserves max-thinking support, moves Notify and Brrr alerts to settled runs, and expands Context Inspector current-context projection.`
