This release broadens `code-reviewer` provider coverage and refreshes automatic model selection in `oracle`, `contrarian`, and `code-reviewer`.

## Highlights

- **Broader review-model coverage:** `code-reviewer` now has explicit preference ladders for all 41 built-in chat-model providers, rather than 13. It uses the same ID-anchored preference matcher as `oracle` and `contrarian`, avoiding accidental display-name matches ([#205](https://github.com/diegopetrucci/pi-extensions/pull/205)).
- **Updated model preferences:** Gemini 4 Argon leads the Google, Vertex, and OpenCode Go ladders; Mistral Large 4 ranks above Medium 3.5. Fable 5.1 and Sonnet 5.5 rank above their older siblings. OpenCode Go gains Qwen3.8 Max and MiMo V2.6 Pro, and Cloudflare AI Gateway gains more GPT-6.x fallbacks. Existing role-specific ordering is preserved; common Opus 5.5 / GPT-6 Astra selections remain unchanged ([#205](https://github.com/diegopetrucci/pi-extensions/pull/205)).
- **Self-contained annotation packages:** Both annotation extensions now ship generated package-local Glimpse helpers from one shared source. This is a maintenance change with no intended runtime behavior change ([#203](https://github.com/diegopetrucci/pi-extensions/pull/203)).

The Pi development baseline remains 1.5.0. Automated tests passed; no fresh live-provider, interactive, or fleet certification is claimed.

## Packages

- `@diegopetrucci/pi-annotate-git-diff@0.1.16`
- `@diegopetrucci/pi-annotate-last-message@0.1.15`
- `@diegopetrucci/pi-code-reviewer@0.1.19`
- `@diegopetrucci/pi-contrarian@0.1.21`
- `@diegopetrucci/pi-oracle@0.1.36`
- `@diegopetrucci/pi-extensions@0.1.85`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-git-diff","0.1.16"],["@diegopetrucci/pi-annotate-last-message","0.1.15"],["@diegopetrucci/pi-code-reviewer","0.1.19"],["@diegopetrucci/pi-contrarian","0.1.21"],["@diegopetrucci/pi-oracle","0.1.36"],["@diegopetrucci/pi-extensions","0.1.85"]] -->
