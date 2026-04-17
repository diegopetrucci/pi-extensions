# Oracle provider matrix

Expected top-ranked oracle targets from the current hardcoded provider preferences in `extensions/oracle/index.ts`.

> These are the **intended first matches** when those models are available on the authenticated provider. If a preferred model is unavailable, the oracle falls back to the next preferred match, then to the heuristic ranker.

| Provider | Intended top pick | Notes |
|---|---|---|
| `amazon-bedrock` | `claude-opus-4-7` | Falls back through newer Claude Opus/Sonnet Bedrock IDs, then other reasoning models. |
| `anthropic` | `claude-opus-4-6` | Prefers Opus over Sonnet. |
| `azure-openai-responses` | `gpt-5.4-pro` | Then other GPT-5 / o-series reasoning models. |
| `cerebras` | `zai-glm-4.7` | Small provider-specific list for now. |
| `github-copilot` | `claude-opus-4.7` | Then Opus 4.5, GPT-5.x, Gemini, Sonnet. |
| `google` | `gemini-3.1-pro-preview` | Then Gemini 3 Pro / Gemini 2.5 Pro variants. |
| `google-antigravity` | `claude-opus-4-6-thinking` | Prefers the strongest explicit thinking model. |
| `google-gemini-cli` | `gemini-3-pro-preview` | Then Gemini 2.5 Pro. |
| `google-vertex` | `gemini-3.1-pro-preview-customtools` | Then Gemini 3 Pro / 2.5 Pro. |
| `groq` | `openai/gpt-oss-120b` | Then Groq compound/qwen/kimi/llama options. |
| `huggingface` | `zai-org/GLM-5.1` | Then Qwen/Kimi/DeepSeek/MiniMax reasoning models. |
| `kimi-coding` | `kimi-k2-thinking` | Single-model preference. |
| `minimax` | `MiniMax-M2.7-highspeed` | Single-model preference. |
| `minimax-cn` | `MiniMax-M2.7-highspeed` | Single-model preference. |
| `mistral` | `magistral-medium-latest` | Then Devstral/Mistral Large/Medium. |
| `openai` | `gpt-5.4-pro` | Then GPT-5 / o-series reasoning models. |
| `openai-codex` | `gpt-5.4` | Then GPT-5.3/5.2/5.1 Codex variants. |
| `opencode` | `gpt-5.4` | Then Claude Opus, GPT Codex, GLM, Kimi, Qwen, MiniMax. |
| `opencode-go` | `qwen3.6-plus` | Then MiniMax / MiMo / Kimi. |
| `openrouter` | `anthropic/claude-opus-4.6-fast` | Then Claude Opus, Gemini Pro, Kimi, DeepSeek, MiniMax. |
| `vercel-ai-gateway` | `anthropic/claude-opus-4.6` | Then Claude, OpenAI Codex, Kimi, DeepSeek, Qwen, Gemini. |
| `xai` | `grok-4-1-fast` | Then Grok 4 / Grok 3 mini / Grok 3 latest. |
| `zai` | `glm-5.1` | Then GLM-5 / GLM-4.7 / GLM-4.6v / GLM-4.5v / GLM-4.5-air. |

## Validation checklist

For manual validation on a provider:

1. authenticate that provider in pi
2. run `/oracle-model`
3. confirm the selected model matches the expected top pick above when available
4. if not, check whether the expected model is actually exposed by that subscription/auth setup
5. if the model is unavailable, verify the selected fallback is the next preferred match or a sensible heuristic result
