# Oracle provider matrix

Expected top-ranked oracle targets from the current hardcoded provider preferences in `extensions/oracle/index.ts`.

> These are the **intended first matches** when those models are available on the authenticated provider. If a preferred model is unavailable, the oracle falls back to the next preferred match, then to the heuristic ranker.
> Preference ladders are curated frontier choices, not exhaustive copies of each provider's catalog.

| Provider | Intended top pick | Notes |
|---|---|---|
| `amazon-bedrock` | `global.anthropic.claude-opus-5-5` | Prefers the stable global Bedrock alias, then the pinned canonical/regional Opus 5.5 IDs before generic availability fallback; older Opus/Fable, GPT-5.6 tiers, Claude Sonnet, and Grok 4.6 remain below it. |
| `ant-ling` | `Ling-2.6-1T` | Then Ling 2.6 Flash. |
| `anthropic` | `claude-opus-5-5` | Then Claude Opus 5, Fable, older Opus IDs, and Claude Sonnet 5 before Claude Sonnet 4. |
| `azure-openai-responses` | `gpt-6-astra` | Then GPT-6 Sol, GPT-5.6 Sol/Terra, GPT-6 Luna, GPT-5.6 Luna, current GPT-5 aliases, newer GPT-5.x releases, and o-series reasoning models. |
| `baseten` | `moonshotai/Kimi-K3` | Then Kimi K2.7 Code, GLM 5.3, DeepSeek V4 Pro variants, GLM 5.2/5.1/5, Kimi K2.6/K2.5, Nemotron Ultra/Super, GPT OSS 120B, DeepSeek V4 Flash 0731, Inkling, and GLM 4.7 fallbacks. |
| `cerebras` | `gpt-oss-120b` | Then Qwen3.8 27B. |
| `cloudflare-ai-gateway` | `claude-fable-5` | Then current Claude Opus, GPT-6 Astra, GPT-5.x, and Workers AI Kimi K2.7, DeepSeek V4 Pro, GLM 5.3/5.2, Nemotron, and GPT OSS reasoning models. |
| `cloudflare-workers-ai` | `@cf/moonshotai/kimi-k2.7-code` | Then DeepSeek V4 Pro, GLM 5.3/5.2, Kimi K2.6, Nemotron, GPT OSS, Qwen 3.8, and GLM fallbacks. |
| `deepseek` | `deepseek-v4-pro` | Then DeepSeek V4.1 Flash. |
| `fireworks` | `accounts/fireworks/models/kimi-k3` | Then Kimi K3 Fast, DeepSeek V4 Pro, Kimi K2.7 Code, GLM 5.2 model and router, MiniMax M3, Kimi K2.6, Qwen, and GPT OSS 120B. |
| `github-copilot` | `claude-opus-5.5` | Then Claude Opus 5/Fable, older Opus models, GPT-6 Astra/Sol/Luna with GPT-5.6 fallbacks, GPT-5.5/5.4, Gemini 3.5 Flash, Claude Sonnet, Grok 4.7/4.6/4.5, and Kimi K3/K2.7 Code. |
| `google` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3.1 Pro, Gemini 3.5 Flash, Gemini 2.5 Pro/Flash, and Gemini 3.1/2.5 Flash Lite variants. |
| `google-vertex` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3.5 Flash, Gemini 3 Flash, and Gemini 2.5 Flash variants. |
| `groq` | `openai/gpt-oss-120b` | Then Llama 3.3 70B, then GPT OSS 20B. |
| `huggingface` | `moonshotai/Kimi-K3` | Then GLM 5.1/5.3 Flash and DeepSeek/Kimi/MiniMax/Qwen reasoning models. |
| `kimi-coding` | `k3` | Then Kimi For Coding / HighSpeed. |
| `meta` | `muse-spark-1.3` | Then the 1.3 Contributor tier, Muse Spark 1.2/Contributor, and Muse Spark 1.1. |
| `minimax` | `MiniMax-M3` | Then MiniMax M2.7 HighSpeed / regular M2.7. |
| `minimax-cn` | `MiniMax-M3` | Then MiniMax M2.7 HighSpeed / regular M2.7. |
| `mistral` | `mistral-medium-2604` | Then Mistral Medium 3.5/latest, Magistral, and ZAI GLM 5.2. |
| `moonshotai` | `kimi-k3` | Then Kimi K2.7 Code/HighSpeed and K2.6. |
| `moonshotai-cn` | `kimi-k3` | Then Kimi K2.7 Code/HighSpeed and K2.6. |
| `nvidia` | `nvidia/nemotron-3-ultra-550b-a55b` | Then Nemotron 3 Super, Kimi K3/K2.6, and Nemotron Nano Omni reasoning. |
| `openai` | `gpt-6-astra` | Then GPT-6 Sol, GPT-5.6 Sol/Terra, GPT-6 Luna, GPT-5.6 Luna, current GPT-5 aliases, and o-series reasoning models. |
| `openai-codex` | `gpt-6-astra` | Then GPT-6 Sol, GPT-5.6 Sol/Terra, GPT-6 Luna, GPT-5.6 Luna, GPT-5.5, and the current Codex Spark fallback ID. |
| `opencode` | `claude-opus-5-5` | Then Claude Opus 5/Fable, GPT-6 Astra/Sol/Luna with GPT-5.6 fallbacks, GPT-5.5/5.4, older Claude Opus models, Grok 4.6/4.5, Gemini 3.5, GLM, Kimi, Qwen, and MiniMax. |
| `opencode-go` | `deepseek-v4-pro` | Then GLM 5.3/5.2/5.1, Qwen 3.7/3.6, MiMo 2.5, MiniMax M3/M2.7, Kimi K3/K2.7/K2.6, and Grok 4.7 before 4.6. |
| `openrouter` | `anthropic/claude-opus-5.5` | Prefers the exact base ID before `:batch`/pro aliases; aliases remain generic fallbacks. Then Claude Opus 5/Fable/latest, older Claude Opus models, GPT-6 Astra/Sol/Luna with GPT-5.6 fallbacks, Gemini Pro/Gemini 3.5, Kimi, Grok 4.7/4.6/4.5, DeepSeek, MiniMax, and GLM. |
| `qwen-token-plan` | `qwen3.8-max` | Then Qwen 3.7/3.6, DeepSeek V4 Pro, GLM 5.2, Kimi K2.7, and MiniMax fallbacks. |
| `qwen-token-plan-cn` | `qwen3.8-max` | Then Qwen 3.7/3.6, DeepSeek V4 Pro, GLM 5.2, Kimi K2.7, and MiniMax fallbacks. |
| `qwen-token-plan-individual` | `qwen3.8-max` | Then Qwen 3.7 Max/Plus, Qwen 3.6 Flash, DeepSeek V4 Pro, GLM 5.2, and DeepSeek V4 Flash 0731 fallbacks. |
| `radius` | `gpt-6-astra` | Then Claude Opus 5.5/5, GPT-6 Sol with GPT-5.6 Sol/Terra, GPT-6 Luna with GPT-5.6 Luna, Claude Fable, current GPT/Claude fallbacks, Kimi, DeepSeek, GLM, and lower-cost reasoning tiers. |
| `together` | `deepseek-ai/DeepSeek-V4-Pro` | Then Kimi K3, GLM 5.3 Flash/5.2, Kimi K2.7/K2.6, Qwen 3.7/3.6, MiniMax M3/M2.7, GPT OSS, Nemotron Ultra, and Gemma 4 fallbacks. |
| `vercel-ai-gateway` | `anthropic/claude-opus-5.5` | Prefers the exact base ID before `-fast` aliases; aliases remain generic fallbacks. Then Claude Opus 5/Fable and older Opus models, Claude Sonnet, GPT-6 Astra/Sol/Luna with GPT-5.6 and Codex fallbacks, Kimi, DeepSeek, Qwen, Gemini, Grok 4.7/4.6/4.5, MiniMax, and GLM. |
| `xai` | `grok-4.7` | Then Grok 4.6, 4.5, and 4.3. |
| `xiaomi` | `mimo-v2.5-pro-ultraspeed` | Then MiMo 2.5 Pro and MiMo 2.5. |
| `xiaomi-token-plan-ams` | `mimo-v2.5-pro` | Then MiMo 2.5. |
| `xiaomi-token-plan-cn` | `mimo-v2.5-pro` | Then MiMo 2.5. |
| `xiaomi-token-plan-sgp` | `mimo-v2.5-pro` | Then MiMo 2.5. |
| `zai` | `glm-5.3` | Then GLM-5.2 / GLM-5 Turbo / GLM-4.7. |
| `zai-coding-cn` | `glm-5.3` | Then GLM-5.3 HighSpeed/Flash and GLM-4.6V. |

## Validation checklist

For manual validation on a provider:

1. authenticate that provider in pi
2. run `/oracle-model`
3. confirm the selected model matches the expected top pick above when available
4. if not, check whether the expected model is actually exposed by that subscription/auth setup
5. if the model is unavailable, verify the selected fallback is the next preferred match or a sensible heuristic result
