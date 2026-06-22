Refreshes Oracle's model preference lists for current Pi model catalogs, including Kimi K2.7 Code, MiniMax M3, GLM 5.2, and newly documented provider rows.

## Highlights

- Oracle now prefers `k2p7` / Kimi K2.7 Code on supported Kimi, Moonshot, Fireworks, Workers AI, OpenRouter, Together, Vercel AI Gateway, and opencode-go providers.
- MiniMax providers now prefer `MiniMax-M3` before M2.7 fallbacks.
- ZAI providers now prefer `glm-5.2` before GLM 5.1 / GLM 5 fallbacks.
- Adds hardcoded preference coverage and matrix docs for `ant-ling`, `nvidia`, and `zai-coding-cn`.
- Keeps older Kimi K2.6, MiniMax M2.7, and GLM 5.1 IDs as fallbacks for providers that still expose them.
- Fixes [#2](https://github.com/diegopetrucci/pi-extensions/issues/2).

## Packages

- `@diegopetrucci/pi-extensions@0.1.50`
- `@diegopetrucci/pi-oracle@0.1.14`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone oracle:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
