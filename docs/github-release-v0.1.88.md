This release adds Pi 1.6.0 development compatibility and GPT-6.2 Sol/Astra support in `fast`, refreshes the `oracle`, `contrarian`, and `code-reviewer` model ladders, and makes `review` report git timeouts in its preset default and branch/commit pickers.

## Highlights

- **Pi 1.6.0 development compatibility:** the development baseline moves from Pi 1.5.2 to 1.6.0, with automated checks only (`docs/pi-1.6.0-validation.md`). `quiet-tools` renderers now return read-only line arrays as Pi 1.6.0 requires. This release makes no fleet certification claim, and the `.pi-fleet-tested-version` markers are unchanged ([#243](https://github.com/diegopetrucci/pi-extensions/pull/243)).
- **GPT-6.2 in `fast`:** GPT-6.2 Sol and GPT-6.2 Astra are supported for Codex priority and direct OpenAI API fast mode, and for `/ultrafast` on direct OpenAI API keys ([#243](https://github.com/diegopetrucci/pi-extensions/pull/243)).
- **Refreshed model ladders (`oracle`, `contrarian`, `code-reviewer`):** GPT-6.2 Astra and Sol rank above GPT-6 Astra and GPT-6.1 Sol, stale catalog entries are removed, and `glm-5.3` and `deepseek-v4.1-flash` are added on Qwen Token Plan ([#243](https://github.com/diegopetrucci/pi-extensions/pull/243)).
- **`review` git timeout reporting:** the preset selector warns and defaults to uncommitted review when `git status` times out or fails, and the branch and commit pickers show an error instead of an empty list when `git branch` or `git log` times out or fails ([#242](https://github.com/diegopetrucci/pi-extensions/pull/242)).

## Packages

- `@diegopetrucci/pi-code-reviewer@0.1.21`
- `@diegopetrucci/pi-contrarian@0.1.24`
- `@diegopetrucci/pi-fast@0.1.14`
- `@diegopetrucci/pi-oracle@0.1.39`
- `@diegopetrucci/pi-quiet-tools@0.1.18`
- `@diegopetrucci/pi-review@0.1.19`
- `@diegopetrucci/pi-extensions@0.1.88`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.21"],["@diegopetrucci/pi-contrarian","0.1.24"],["@diegopetrucci/pi-fast","0.1.14"],["@diegopetrucci/pi-oracle","0.1.39"],["@diegopetrucci/pi-quiet-tools","0.1.18"],["@diegopetrucci/pi-review","0.1.19"],["@diegopetrucci/pi-extensions","0.1.88"]] -->
