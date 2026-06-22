# Oracle provider matrix

Expected top-ranked oracle targets from the current hardcoded provider preferences in `extensions/oracle/index.ts`.

> These are the **intended first matches** when those models are available on the authenticated provider. If a preferred model is unavailable, the oracle falls back to the next preferred match, then to the heuristic ranker.

| Provider | Intended top pick | Notes |
|---|---|---|
| `amazon-bedrock` | `claude-fable-5` | Falls back through newer Claude Fable/Opus/Sonnet Bedrock IDs, then other reasoning models. |
| `ant-ling` | `Ling-2.6-1T` | Then Ling 2.6 Flash. |
| `anthropic` | `claude-fable-5` | Prefers Fable, then Opus, then Sonnet. |
| `azure-openai-responses` | `gpt-5.5-pro` | Then other GPT-5 / o-series reasoning models. |
| `cerebras` | `gpt-oss-120b` | Then ZAI/Cerebras fallbacks. |
| `cloudflare-ai-gateway` | `claude-fable-5` | Then newer Claude Opus, GPT-5.x, and Workers AI reasoning models. |
| `cloudflare-workers-ai` | `@cf/moonshotai/kimi-k2.7-code` | Then GLM 5.2, Kimi K2.6, Nemotron, GPT OSS, and GLM fallbacks. |
| `deepseek` | `deepseek-v4-pro` | Then DeepSeek V4 Flash. |
| `fireworks` | `accounts/fireworks/models/deepseek-v4-pro` | Then Kimi K2.7 Code, GLM 5.2, MiniMax M3, Qwen, and GPT OSS. |
| `github-copilot` | `claude-fable-5` | Then Opus 4.8/4.7/4.6/4.5, GPT-5.x, Gemini, Sonnet. |
| `google` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3.1/3 Pro / Gemini 2.5 Pro variants. |
| `google-vertex` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3 Pro / 2.5 Pro. |
| `groq` | `openai/gpt-oss-120b` | Then Groq compound/qwen/kimi/llama options. |
| `huggingface` | `zai-org/GLM-5.1` | Then DeepSeek/Kimi/MiniMax/Qwen reasoning models. |
| `kimi-coding` | `k2p7` | Then Kimi K2 Thinking / For Coding. |
| `minimax` | `MiniMax-M3` | Then MiniMax M2.7 HighSpeed / regular M2.7. |
| `minimax-cn` | `MiniMax-M3` | Then MiniMax M2.7 HighSpeed / regular M2.7. |
| `mistral` | `mistral-medium-2604` | Then Mistral Medium 3.5/latest and Magistral. |
| `moonshotai` | `kimi-k2.7-code` | Then Kimi K2.7 Code HighSpeed, K2.6, Thinking Turbo/Thinking, and K2.5. |
| `moonshotai-cn` | `kimi-k2.7-code` | Then Kimi K2.7 Code HighSpeed, K2.6, Thinking Turbo/Thinking, and K2.5. |
| `nvidia` | `nvidia/nemotron-3-ultra-550b-a55b` | Then Nemotron 3 Super, Kimi, GLM, Qwen, and GPT OSS fallbacks. |
| `openai` | `gpt-5.5-pro` | Then GPT-5 / o-series reasoning models. |
| `openai-codex` | `gpt-5.5` | Then GPT-5.4/5.3/5.2/5.1 Codex variants. |
| `opencode` | `claude-fable-5` | Then GPT-5.5/5.4, Claude Opus 4.8+, GPT Codex, Gemini, GLM, Kimi, Qwen, MiniMax. |
| `opencode-go` | `deepseek-v4-pro` | Then GLM 5.2/5.1, Qwen 3.7/3.6, MiMo, MiniMax M3/M2.7, and Kimi K2.7/K2.6. |
| `openrouter` | `anthropic/claude-fable-5` | Then Claude Fable latest, Claude Opus, OpenAI GPT-5.x, Gemini Pro, Kimi K2.7, DeepSeek, MiniMax M3, and GLM 5.2. |
| `together` | `deepseek-ai/DeepSeek-V4-Pro` | Then GLM, Kimi K2.7/K2.6, Qwen 3.7/3.6, MiniMax M3/M2.7, GPT OSS, and older reasoning fallbacks. |
| `vercel-ai-gateway` | `anthropic/claude-fable-5` | Then Claude Opus/Sonnet, OpenAI GPT-5.x, Kimi K2.7, DeepSeek, Qwen 3.7, Gemini, xAI, MiniMax M3, and GLM 5.2. |
| `xai` | `grok-4.3` | Then Grok 4.20 reasoning / Grok 4 fast variants. |
| `xiaomi` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `xiaomi-token-plan-ams` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `xiaomi-token-plan-cn` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `xiaomi-token-plan-sgp` | `mimo-v2.5-pro` | Then MiMo 2.5 / 2.0 fallbacks. |
| `zai` | `glm-5.2` | Then GLM-5.1 / GLM-5 Turbo / GLM-5V Turbo / GLM-4.7 / older variants. |
| `zai-coding-cn` | `glm-5.2` | Then GLM-5.1 / GLM-5 Turbo / GLM-5V Turbo / GLM-4.7 / older variants. |

## Validation checklist

For manual validation on a provider:

1. authenticate that provider in pi
2. run `/oracle-model`
3. confirm the selected model matches the expected top pick above when available
4. if not, check whether the expected model is actually exposed by that subscription/auth setup
5. if the model is unavailable, verify the selected fallback is the next preferred match or a sensible heuristic result
