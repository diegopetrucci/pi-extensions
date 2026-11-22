# Changelog

Notable user-facing changes to this package are listed here, newest first.

## [0.1.19] - 2026-11-22

- Reports git timeouts and failures instead of hiding them: the preset selector warns and defaults to uncommitted review when `git status` times out or fails, and the branch and commit pickers show an error when `git branch` or `git log` times out or fails.

## [0.1.18] - 2026-11-17

- git and gh commands now time out instead of hanging (30s for reads, 120s for `gh pr checkout`).
- A failed or timed-out `git status` now stops before `gh pr checkout`, and timed-out `git rev-parse`, `gh pr view` and `gh pr checkout` now say they timed out.
- Loop fixing no longer stops after the first fix pass with "Wait for the current response to finish" on Pi 1.5.x; the loop now waits for the real fix turn before starting the next review pass.
- First release to ship a package changelog, so Pi 1.5.0+ shows release notes after an update.
