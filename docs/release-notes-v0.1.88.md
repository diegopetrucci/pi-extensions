# Release notes — v0.1.88

## Public title

**Pi 1.6.0 compatibility and GPT-6.2 Fast mode**

## Highlights

- **Pi 1.6.0 development compatibility:** the development baseline moves from Pi 1.5.2 to 1.6.0, with automated checks only (`docs/pi-1.6.0-validation.md`). `quiet-tools` renderers now return read-only line arrays as Pi 1.6.0 requires. This release makes no fleet certification claim, and the `.pi-fleet-tested-version` markers are unchanged ([#243](https://github.com/diegopetrucci/pi-extensions/pull/243)).
- **GPT-6.2 in `fast`:** GPT-6.2 Sol and GPT-6.2 Astra are supported for Codex priority and direct OpenAI API fast mode, and for `/ultrafast` on direct OpenAI API keys ([#243](https://github.com/diegopetrucci/pi-extensions/pull/243)).
- **Refreshed model ladders (`oracle`, `contrarian`, `code-reviewer`):** GPT-6.2 Astra and Sol rank above GPT-6 Astra and GPT-6.1 Sol, stale catalog entries are removed, and `glm-5.3` and `deepseek-v4.1-flash` are added on Qwen Token Plan ([#243](https://github.com/diegopetrucci/pi-extensions/pull/243)).
- **`review` git timeout reporting:** the preset selector warns and defaults to uncommitted review when `git status` times out or fails, and the branch and commit pickers show an error instead of an empty list when `git branch` or `git log` times out or fails ([#242](https://github.com/diegopetrucci/pi-extensions/pull/242)).

## Scope

Prepared 2026-11-22 on `release/v0.1.88-prep` from the changes since `v0.1.87` (#240–#243). Seven packages are selected below: `code-reviewer`, `contrarian`, `fast`, `oracle`, `quiet-tools`, `review`, and the umbrella `@diegopetrucci/pi-extensions`. Package `CHANGELOG.md` newest entries are the source of truth for user-facing wording. #240 and #241 are CI/release tooling only and not package-facing.

The Pi development baseline moves from 1.5.2 to 1.6.0 (see `docs/pi-1.6.0-validation.md`). That record is automated development compatibility only; no fleet markers change and there is no fleet certification claim.

## Packaging

- `@diegopetrucci/pi-code-reviewer@0.1.21`
- `@diegopetrucci/pi-contrarian@0.1.24`
- `@diegopetrucci/pi-fast@0.1.14`
- `@diegopetrucci/pi-oracle@0.1.39`
- `@diegopetrucci/pi-quiet-tools@0.1.18`
- `@diegopetrucci/pi-review@0.1.19`
- `@diegopetrucci/pi-extensions@0.1.88`

## Validation

No release validation has been recorded yet. Record evidence here only after commands have completed (final validation is tracked separately).

## Contributor audit

The range `v0.1.87..HEAD` contains only repository-owner commits plus The Last Harness co-author trailer. No external human contributors or bots are credited, so the public body omits `## Contributors`. Reaudit through the final tag before publication.

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.21"],["@diegopetrucci/pi-contrarian","0.1.24"],["@diegopetrucci/pi-fast","0.1.14"],["@diegopetrucci/pi-oracle","0.1.39"],["@diegopetrucci/pi-quiet-tools","0.1.18"],["@diegopetrucci/pi-review","0.1.19"],["@diegopetrucci/pi-extensions","0.1.88"]] -->
