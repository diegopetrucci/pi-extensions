# Oracle provider matrix

Expected top-ranked oracle targets from the current hardcoded provider preferences in `extensions/oracle/index.ts`.

> These are the **intended first matches** when those models are available on the authenticated provider. If a preferred model is unavailable, the oracle falls back to the next preferred match, then to the heuristic ranker.

| Provider | Intended top pick | Notes |
|---|---|---|
| `amazon-bedrock` | `claude-opus-5` | Falls back through Claude Fable and older Opus IDs, then Claude Sonnet 5 before Claude Sonnet 4 Bedrock IDs, then other reasoning models. |
| `ant-ling` | `Ling-2.6-1T` | Then Ling 2.6 Flash. |
| `anthropic` | `claude-opus-5` | Falls back through Claude Fable and older Opus IDs, then Claude Sonnet 5 before Claude Sonnet 4. |
| `azure-openai-responses` | `gpt-5.6-sol` | Then GPT-5.6 Terra/Luna, current GPT-5 aliases, newer GPT-5.x releases, and o-series reasoning models. |
| `baseten` | `moonshotai/Kimi-K3` | Then Kimi K2.7 Code, DeepSeek V4 Pro variants, GLM 5.2/5.1/5, Kimi K2.6/K2.5, Nemotron Ultra/Super, GPT OSS 120B, DeepSeek V4 Flash 0731, Inkling, and GLM 4.7 fallbacks. |
| `cerebras` | `gpt-oss-120b` | Then ZAI/Cerebras fallbacks. |
| `cloudflare-ai-gateway` | `claude-fable-5` | Then newer Claude Opus, GPT-5.x, and Workers AI reasoning models. |
| `cloudflare-workers-ai` | `@cf/moonshotai/kimi-k2.7-code` | Then GLM 5.2, Kimi K2.6, Nemotron, GPT OSS, and GLM fallbacks. |
| `deepseek` | `deepseek-v4-pro` | Then DeepSeek V4 Flash. |
| `fireworks` | `accounts/fireworks/models/deepseek-v4-pro` | Then Kimi K2.7 Code, GLM 5.2 model and router aliases, MiniMax M3, Qwen, and GPT OSS. |
| `github-copilot` | `claude-opus-5` | Then Claude Fable, older Opus models, GPT-5.x, Gemini 3.1 Pro Preview and Gemini 3.5 Flash, then Claude Sonnet 5 before Claude Sonnet 4, and Kimi K2.7 Code. |
| `google` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3.1 Pro, Gemini 3.5 Flash, Gemini 2.5 Pro/Flash, and Gemini 3.1/2.5 Flash Lite variants. |
| `google-vertex` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3.5 Flash, Gemini 3 Flash, and Gemini 2.5 Flash variants. |
| `groq` | `openai/gpt-oss-120b` | Then Llama 3.3 70B, then GPT OSS 20B. |
| `huggingface` | `zai-org/GLM-5.1` | Then DeepSeek/Kimi/MiniMax/Qwen reasoning models. |
| `kimi-coding` | `k3` | Then Kimi For Coding / HighSpeed. |
| `minimax` | `MiniMax-M3` | Then MiniMax M2.7 HighSpeed / regular M2.7. |
| `minimax-cn` | `MiniMax-M3` | Then MiniMax M2.7 HighSpeed / regular M2.7. |
| `mistral` | `mistral-medium-2604` | Then Mistral Medium 3.5/latest and Magistral. |
| `moonshotai` | `kimi-k2.7-code` | Then Kimi K2.7 Code HighSpeed, K2.6, Thinking Turbo/Thinking, and K2.5. |
| `moonshotai-cn` | `kimi-k2.7-code` | Then Kimi K2.7 Code HighSpeed, K2.6, Thinking Turbo/Thinking, and K2.5. |
| `nvidia` | `nvidia/nemotron-3-ultra-550b-a55b` | Then Nemotron 3 Super, Kimi, GLM, MiniMax, Mistral, and GPT OSS fallbacks. |
| `openai` | `gpt-5.6-sol` | Then GPT-5.6 Terra/Luna, current GPT-5 aliases, newer GPT-5.x releases, and o-series reasoning models. |
| `openai-codex` | `gpt-5.6-sol` | Then GPT-5.6 Terra/Luna, GPT-5.5/5.4, and current Codex Spark fallback IDs. |
| `opencode` | `claude-opus-5` | Then Claude Fable, GPT-5.5/5.4, older Claude Opus models, Grok 4.5, Gemini 3.5, GLM 5.2/5.1, Kimi K2.7, Qwen, and MiniMax. |
| `opencode-go` | `deepseek-v4-pro` | Then GLM 5.2/5.1, Qwen 3.7/3.6, MiMo 2.5, MiniMax M3/M2.7, and Kimi K2.7/K2.6. |
| `openrouter` | `anthropic/claude-opus-5` | Then Claude Fable/latest, older Claude Opus models, OpenAI GPT-5.6 Sol/Terra/Luna plus current OpenRouter aliases, Gemini Pro/Gemini 3.5, Kimi latest/K2.7, Grok latest/4.5, DeepSeek, MiniMax M3, and GLM 5.2. `claude-opus-5` also matches fast-only catalog variants when no base ID is present. |
| `qwen-token-plan` | `qwen3.8-max` | Then Qwen 3.7/3.6, DeepSeek V4 Pro, GLM 5.2, Kimi K2.7, and MiniMax fallbacks. |
| `qwen-token-plan-cn` | `qwen3.8-max` | Then Qwen 3.7/3.6, DeepSeek V4 Pro, GLM 5.2, Kimi K2.7, and MiniMax fallbacks. |
| `qwen-token-plan-individual` | `qwen3.8-max` | Then Qwen 3.7 Max/Plus, Qwen 3.6 Flash, DeepSeek V4 Pro, GLM 5.2, and DeepSeek V4 Flash 0731 fallbacks. |
| `together` | `deepseek-ai/DeepSeek-V4-Pro` | Then GLM 5.2, Kimi K2.7/K2.6, Qwen 3.7/3.6, MiniMax M3/M2.7, GPT OSS, Nemotron Ultra, and Gemma 4 fallbacks. |
| `vercel-ai-gateway` | `anthropic/claude-opus-5` | Then Claude Fable, older Claude Opus models, Claude Sonnet 5 before Claude Sonnet 4, OpenAI GPT-5.6 Sol/Terra/Luna and Codex IDs, Kimi K2.7, DeepSeek, Qwen 3.7/3.6, Gemini 3.5, xAI Grok 4.5/4.20, MiniMax M3, and GLM 5.2. `claude-opus-5` also matches fast-only catalog variants when no base ID is present. |
| `xai` | `grok-4.6` | Then Grok 4.5, Grok 4.3, and current Grok build fallbacks. |
| `xiaomi` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `xiaomi-token-plan-ams` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `xiaomi-token-plan-cn` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `xiaomi-token-plan-sgp` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `zai` | `glm-5.3` | Then GLM-5.2 / GLM-5 Turbo / GLM-4.7. |
| `zai-coding-cn` | `glm-5.3` | Then GLM-5.2 / GLM-5 Turbo / GLM-5 / GLM-4.7. |

## Validation checklist

For manual validation on a provider:

1. authenticate that provider in pi
2. run `/oracle-model`
3. confirm the selected model matches the expected top pick above when available
4. if not, check whether the expected model is actually exposed by that subscription/auth setup
5. if the model is unavailable, verify the selected fallback is the next preferred match or a sensible heuristic result
