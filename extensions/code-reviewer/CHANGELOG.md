# Changelog

Notable user-facing changes to this package are listed here, newest first.

## [0.1.22] - 2026-11-27

- Model preference ladder is refreshed for the Pi 1.7.0 catalog: entries removed from the catalog are dropped, `ant-ling` is restored (Ling 3.1 Flash > 3.2 Flash > 3.0 Flash; previously no match on Pi 1.7.0), `glm-5.4` ranks above `glm-5.3` on `zai` and `zai-coding-cn`, Qwen4 Max ranks above the previous top Qwen Max on Qwen Token Plan, `opencode-go`, and `together`, and `together` ranks GLM-5.3 above GLM-5.3-Flash.

## [0.1.21] - 2026-11-22

- Model preference ladder ranks GPT-6.2 Astra and Sol above GPT-6 Astra and GPT-6.1 Sol, drops stale catalog entries, and adds `glm-5.3` and `deepseek-v4.1-flash` (below `deepseek-v4-pro`) on Qwen Token Plan.

## [0.1.20] - 2026-11-17

- Refreshed the model preference catalog for Pi 1.5.2: Fable 5.2 ranks above Fable 5.1 where available, Kimi K3.1 Pro ranks above K3 on more providers, GPT-6.1 Terra and Gemini 4 Argon join the Radius ladder, qwen-token-plan-individual-cn is supported, and models Pi dropped are removed.
- First release to ship a package changelog, so Pi 1.5.0+ shows release notes after an update.
