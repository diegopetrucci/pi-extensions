# Oracle provider matrix

Expected top-ranked oracle targets from the current hardcoded provider preferences in `extensions/oracle/index.ts`.

> These are the **intended first matches** when those models are available on the authenticated provider. If a preferred model is unavailable, the oracle falls back to the next preferred match, then to the heuristic ranker.

| Provider | Intended top pick | Notes |
|---|---|---|
| `amazon-bedrock` | `claude-fable-5` | Falls back through newer Claude Fable/Opus IDs, then Claude Sonnet 5 before Claude Sonnet 4 Bedrock IDs, then other reasoning models. |
| `ant-ling` | `Ling-2.6-1T` | Then Ling 2.6 Flash. |
| `anthropic` | `claude-fable-5` | Prefers Fable, then current catalog Opus IDs, then Claude Sonnet 5 before Claude Sonnet 4. |
| `azure-openai-responses` | `gpt-5.6-sol` | Then GPT-5.6 Terra/Luna, current GPT-5 aliases, newer GPT-5.x releases, and o-series reasoning models. |
| `cerebras` | `gpt-oss-120b` | Then ZAI/Cerebras fallbacks. |
| `cloudflare-ai-gateway` | `claude-fable-5` | Then newer Claude Opus, GPT-5.x, and Workers AI reasoning models. |
| `cloudflare-workers-ai` | `@cf/moonshotai/kimi-k2.7-code` | Then GLM 5.2, Kimi K2.6, Nemotron, GPT OSS, and GLM fallbacks. |
| `deepseek` | `deepseek-v4-pro` | Then DeepSeek V4 Flash. |
| `fireworks` | `accounts/fireworks/models/deepseek-v4-pro` | Then Kimi K2.7 Code, GLM 5.2/5.1 model and router aliases, MiniMax M3, Qwen, and GPT OSS. |
| `github-copilot` | `claude-fable-5` | Then Opus 4.8/4.7/4.6/4.5, GPT-5.x, Gemini 3.1/3.5/3 Flash, then Claude Sonnet 5 before Claude Sonnet 4. |
| `google` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3.1/3 Pro, Gemini 3.5 Flash, and Gemini 2.5/2.0 Flash variants. |
| `google-vertex` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3.5 Flash, Gemini 3 Flash, and Gemini 2.5 Flash variants. |
| `groq` | `openai/gpt-oss-120b` | Then Groq compound/qwen/kimi/llama options. |
| `huggingface` | `zai-org/GLM-5.1` | Then DeepSeek/Kimi/MiniMax/Qwen reasoning models. |
| `kimi-coding` | `k2p7` | Then Kimi K2 Thinking / For Coding. |
| `minimax` | `MiniMax-M3` | Then MiniMax M2.7 HighSpeed / regular M2.7. |
| `minimax-cn` | `MiniMax-M3` | Then MiniMax M2.7 HighSpeed / regular M2.7. |
| `mistral` | `mistral-medium-2604` | Then Mistral Medium 3.5/latest and Magistral. |
| `moonshotai` | `kimi-k2.7-code` | Then Kimi K2.7 Code HighSpeed, K2.6, Thinking Turbo/Thinking, and K2.5. |
| `moonshotai-cn` | `kimi-k2.7-code` | Then Kimi K2.7 Code HighSpeed, K2.6, Thinking Turbo/Thinking, and K2.5. |
| `nvidia` | `nvidia/nemotron-3-ultra-550b-a55b` | Then Nemotron 3 Super, Kimi, GLM, Qwen, and GPT OSS fallbacks. |
| `openai` | `gpt-5.6-sol` | Then GPT-5.6 Terra/Luna, current GPT-5 aliases, newer GPT-5.x releases, and o-series reasoning models. |
| `openai-codex` | `gpt-5.6-sol` | Then GPT-5.6 Terra/Luna, GPT-5.5/5.4, and current Codex Spark fallback IDs. |
| `opencode` | `claude-fable-5` | Then GPT-5.5/5.4, Claude Opus 4.8+, Grok 4.5, Gemini 3.5, GLM 5.2/5.1, Kimi K2.7, Qwen, and MiniMax. |
| `opencode-go` | `deepseek-v4-pro` | Then GLM 5.2/5.1, Qwen 3.7/3.6, MiMo 2.5, MiniMax M3/M2.7, and Kimi K2.7/K2.6. |
| `openrouter` | `anthropic/claude-fable-5` | Then Claude Fable latest, Claude Opus, OpenAI GPT-5.6 Sol/Terra/Luna plus current OpenRouter aliases, Gemini Pro/Gemini 3.5, Kimi latest/K2.7, Grok latest/4.5, DeepSeek, MiniMax M3, and GLM 5.2. |
| `together` | `deepseek-ai/DeepSeek-V4-Pro` | Then GLM 5.2/5.1, Kimi K2.7/K2.6, Qwen 3.7/3.6, MiniMax M3/M2.7, GPT OSS, Nemotron Ultra, and Gemma 4 fallbacks. |
| `vercel-ai-gateway` | `anthropic/claude-fable-5` | Then Claude Opus, then Claude Sonnet 5 before Claude Sonnet 4, OpenAI GPT-5.6 Sol/Terra/Luna and Codex IDs, Kimi K2.7, DeepSeek, Qwen 3.7/3.6, Gemini 3.5, xAI Grok 4.5/4.20, MiniMax M3, and GLM 5.2. |
| `xai` | `grok-4.5` | Then Grok 4.20 reasoning/non-reasoning, Grok 4.3, and current Grok build/code fallbacks. |
| `xiaomi` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `xiaomi-token-plan-ams` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `xiaomi-token-plan-cn` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `xiaomi-token-plan-sgp` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `zai` | `glm-5.2` | Then GLM-5.1 / GLM-5 Turbo / GLM-5V Turbo / GLM-4.7 / GLM-4.5 Air. |
| `zai-coding-cn` | `glm-5.2` | Then GLM-5.1 / GLM-5 Turbo / GLM-5V Turbo / GLM-4.7 / older variants. |

## Validation checklist

For manual validation on a provider:

1. authenticate that provider in pi
2. run `/oracle-model`
3. confirm the selected model matches the expected top pick above when available
4. if not, check whether the expected model is actually exposed by that subscription/auth setup
5. if the model is unavailable, verify the selected fallback is the next preferred match or a sensible heuristic result
