# Oracle provider matrix

Expected top-ranked oracle targets from the current hardcoded provider preferences in `extensions/oracle/index.ts`.

> These are the **intended first matches** when those models are available on the authenticated provider. If a preferred model is unavailable, the oracle falls back to the next preferred match, then to the heuristic ranker.

| Provider | Intended top pick | Notes |
|---|---|---|
| `amazon-bedrock` | `claude-opus-4-7` | Falls back through newer Claude Opus/Sonnet Bedrock IDs, then other reasoning models. |
| `anthropic` | `claude-opus-4-7` | Prefers Opus over Sonnet. |
| `azure-openai-responses` | `gpt-5.5-pro` | Then other GPT-5 / o-series reasoning models. |
| `cerebras` | `gpt-oss-120b` | Then ZAI/Cerebras fallbacks. |
| `cloudflare-ai-gateway` | `claude-opus-4-7` | Then newer Claude, GPT-5.x, and Workers AI reasoning models. |
| `cloudflare-workers-ai` | `@cf/moonshotai/kimi-k2.6` | Then Nemotron, Kimi, GPT OSS, and GLM fallbacks. |
| `deepseek` | `deepseek-v4-pro` | Then DeepSeek V4 Flash. |
| `fireworks` | `accounts/fireworks/models/deepseek-v4-pro` | Then Kimi, GLM, MiniMax, Qwen, and GPT OSS. |
| `github-copilot` | `claude-opus-4.7` | Then Opus 4.6/4.5, GPT-5.x, Gemini, Sonnet. |
| `google` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3.1/3 Pro / Gemini 2.5 Pro variants. |
| `google-antigravity` | `claude-opus-4-6-thinking` | Prefers the strongest explicit thinking model. |
| `google-gemini-cli` | `gemini-3-pro-preview` | Then Gemini 2.5 Pro. |
| `google-vertex` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3 Pro / 2.5 Pro. |
| `groq` | `openai/gpt-oss-120b` | Then Groq compound/qwen/kimi/llama options. |
| `huggingface` | `zai-org/GLM-5.1` | Then DeepSeek/Kimi/MiniMax/Qwen reasoning models. |
| `kimi-coding` | `k2p6` | Then Kimi K2 Thinking / For Coding. |
| `minimax` | `MiniMax-M2.7-highspeed` | Then regular MiniMax M2.7. |
| `minimax-cn` | `MiniMax-M2.7-highspeed` | Then regular MiniMax M2.7. |
| `mistral` | `mistral-medium-2604` | Then Mistral Medium 3.5/latest and Magistral. |
| `moonshotai` | `kimi-k2.6` | Then Kimi K2 Thinking Turbo/Thinking and K2.5. |
| `moonshotai-cn` | `kimi-k2.6` | Then Kimi K2 Thinking Turbo/Thinking and K2.5. |
| `openai` | `gpt-5.5-pro` | Then GPT-5 / o-series reasoning models. |
| `openai-codex` | `gpt-5.5` | Then GPT-5.4/5.3/5.2/5.1 Codex variants. |
| `opencode` | `gpt-5.5-pro` | Then GPT-5.5/5.4, Claude Opus, GPT Codex, Gemini, GLM, Kimi, Qwen, MiniMax. |
| `opencode-go` | `deepseek-v4-pro` | Then GLM, Qwen, MiMo, MiniMax, and Kimi. |
| `openrouter` | `anthropic/claude-opus-4.7` | Then Claude Opus, OpenAI GPT-5.x, Gemini Pro, Kimi, DeepSeek, MiniMax. |
| `vercel-ai-gateway` | `anthropic/claude-opus-4.7` | Then Claude, OpenAI GPT-5.x, Kimi, DeepSeek, Qwen, Gemini, xAI, ZAI. |
| `xai` | `grok-4.3` | Then Grok 4.20 reasoning / Grok 4 fast variants. |
| `zai` | `glm-5.1` | Then GLM-5 Turbo / GLM-5V Turbo / GLM-4.7 / older variants. |

## Validation checklist

For manual validation on a provider:

1. authenticate that provider in pi
2. run `/oracle-model`
3. confirm the selected model matches the expected top pick above when available
4. if not, check whether the expected model is actually exposed by that subscription/auth setup
5. if the model is unavailable, verify the selected fallback is the next preferred match or a sensible heuristic result
