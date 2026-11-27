# Changelog

Notable user-facing changes to this package are listed here, newest first.

## [0.1.40] - 2026-11-27

- Model preference ladder is refreshed for the Pi 1.7.0 catalog:
  - Entries removed from the catalog are dropped.
  - `ant-ling` is restored (Ling 3.1 Flash > 3.2 Flash > 3.0 Flash; previously no match on Pi 1.7.0).
  - `glm-5.4` ranks above `glm-5.3` on `zai` and `zai-coding-cn`.
  - Qwen4 Max ranks above the previous top Qwen Max on Qwen Token Plan, `opencode-go`, `together`, and `vercel-ai-gateway`.
  - `together` ranks GLM-5.3 above GLM-5.3-Flash.
  - `opencode` ranks Kimi K3.1 Pro above K3.

## [0.1.39] - 2026-11-22

- Model preference ladder ranks GPT-6.2 Astra and Sol above GPT-6 Astra and GPT-6.1 Sol, drops stale catalog entries, and adds `glm-5.3` and `deepseek-v4.1-flash` (below `deepseek-v4-pro`) on Qwen Token Plan.

## [0.1.38] - 2026-11-17

- OpenRouter and Vercel Sol Pro/Fast variants request xhigh thinking again, instead of falling back to the high default used by base Sol models.
- Batch aliases of base Sol models request high thinking again.
- Refreshed the model preference catalog for Pi 1.5.2: Fable 5.2 ranks above Fable 5.1 (Opus 5.5 still first), Kimi K3.1 Pro ranks above K3 on more providers, new Radius models are included, qwen-token-plan-individual-cn is supported, and models Pi dropped are removed.
- First release to ship a package changelog, so Pi 1.5.0+ shows release notes after an update.
