# Release notes — v0.1.65

## Highlights

- All 28 packages are certified against Pi 0.84.2; every `.pi-fleet-tested-version` marker has been advanced from 0.83.0 to 0.84.2.
- `oracle` and `contrarian` gain model preference ladders for two providers Pi added in 0.84.x: `baseten` (17 models, top pick `moonshotai/Kimi-K3`) and `qwen-token-plan-individual` (7 models, top pick `qwen3.8-max`). Retired model IDs were dropped, including `claude-opus-4-1` from the Anthropic ladder.
- **Top-pick upgrades:** `xai` now picks `grok-4.6` (up from `grok-4.5`) and `zai`/`zai-coding-cn` now pick `glm-5.3` (up from `glm-5.2`); Pi 0.84.x added these models and both ladders were not yet updated.
- **Fix:** Pi renamed `qwen3.8-max-preview` to `qwen3.8-max`; because preference matching is substring-based, the stale pattern matched nothing and silently demoted `qwen-token-plan` and `qwen-token-plan-cn` users to `qwen3.7-max`. Both providers are now correctly back on `qwen3.8-max`.
- **Behaviour removal — fast mode:** The Anthropic allowlist moved from `{claude-opus-4-6, claude-opus-4-7, claude-opus-4-8}` to `{claude-opus-4-8, claude-opus-5}`, and the OpenAI allowlist from `{gpt-5.4, gpt-5.5, gpt-5.6-sol/terra/luna}` to `{gpt-5.5, gpt-5.6-sol/terra/luna}`. `/fast` now activates on `claude-opus-5` and is inert on `claude-opus-4-6`, `claude-opus-4-7`, and `gpt-5.4`. Affects `fast`, `claude-fast`, and `openai-fast`.

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.10`
- `@diegopetrucci/pi-annotate-git-diff@0.1.10`
- `@diegopetrucci/pi-annotate-last-message@0.1.8`
- `@diegopetrucci/pi-brrr@0.1.13`
- `@diegopetrucci/pi-claude-fast@0.1.14`
- `@diegopetrucci/pi-code-reviewer@0.1.8`
- `@diegopetrucci/pi-confirm-destructive@0.1.11`
- `@diegopetrucci/pi-context-cap@0.1.10`
- `@diegopetrucci/pi-context-inspector@0.1.12`
- `@diegopetrucci/pi-contrarian@0.1.10`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.10`
- `@diegopetrucci/pi-fast@0.1.1`
- `@diegopetrucci/pi-git-footer@0.1.9`
- `@diegopetrucci/pi-gnosis@0.1.10`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.8`
- `@diegopetrucci/pi-inline-bash@0.1.10`
- `@diegopetrucci/pi-librarian@0.1.15`
- `@diegopetrucci/pi-minimal-footer@0.1.19`
- `@diegopetrucci/pi-notify@0.1.17`
- `@diegopetrucci/pi-openai-fast@0.1.16`
- `@diegopetrucci/pi-oracle@0.1.25`
- `@diegopetrucci/pi-permission-gate@0.1.13`
- `@diegopetrucci/pi-quiet-tools@0.1.11`
- `@diegopetrucci/pi-review@0.1.13`
- `@diegopetrucci/pi-todo@0.1.10`
- `@diegopetrucci/pi-triage-comments@0.1.11`
- `pi-dynamic-context-pruning@0.1.7`
- `@diegopetrucci/pi-extensions@0.1.65`

## Validation

<!-- Record evidence only after commands have completed. -->

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.10"],["@diegopetrucci/pi-annotate-git-diff","0.1.10"],["@diegopetrucci/pi-annotate-last-message","0.1.8"],["@diegopetrucci/pi-brrr","0.1.13"],["@diegopetrucci/pi-claude-fast","0.1.14"],["@diegopetrucci/pi-code-reviewer","0.1.8"],["@diegopetrucci/pi-confirm-destructive","0.1.11"],["@diegopetrucci/pi-context-cap","0.1.10"],["@diegopetrucci/pi-context-inspector","0.1.12"],["@diegopetrucci/pi-contrarian","0.1.10"],["@diegopetrucci/pi-dirty-repo-guard","0.1.10"],["@diegopetrucci/pi-fast","0.1.1"],["@diegopetrucci/pi-git-footer","0.1.9"],["@diegopetrucci/pi-gnosis","0.1.10"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.8"],["@diegopetrucci/pi-inline-bash","0.1.10"],["@diegopetrucci/pi-librarian","0.1.15"],["@diegopetrucci/pi-minimal-footer","0.1.19"],["@diegopetrucci/pi-notify","0.1.17"],["@diegopetrucci/pi-openai-fast","0.1.16"],["@diegopetrucci/pi-oracle","0.1.25"],["@diegopetrucci/pi-permission-gate","0.1.13"],["@diegopetrucci/pi-quiet-tools","0.1.11"],["@diegopetrucci/pi-review","0.1.13"],["@diegopetrucci/pi-todo","0.1.10"],["@diegopetrucci/pi-triage-comments","0.1.11"],["pi-dynamic-context-pruning","0.1.7"],["@diegopetrucci/pi-extensions","0.1.65"]] -->
