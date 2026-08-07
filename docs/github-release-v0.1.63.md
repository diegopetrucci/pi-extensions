One Fast-mode toggle now follows the selected OpenAI Codex or Anthropic Claude model, while preserving the provider-specific packages as standalone alternatives.

## Highlights

- Adds `@diegopetrucci/pi-fast` with a single `/fast` command and trusted global/project configuration.
- The collection loads only the unified Fast controller, avoiding duplicate commands and competing session state.
- Preserves Anthropic OAuth, model, interleaved-thinking, and fine-grained-tool-streaming beta headers.
- Includes Dynamic Context Pruning's active minimum-savings filter, runtime idle/mid-loop classification, and compression-simulation benchmark mode.

## Packages

- `@diegopetrucci/pi-claude-fast@0.1.13`
- `@diegopetrucci/pi-fast@0.1.0`
- `@diegopetrucci/pi-openai-fast@0.1.15`
- `pi-dynamic-context-pruning@0.1.6`
- `@diegopetrucci/pi-extensions@0.1.63`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-claude-fast","0.1.13"],["@diegopetrucci/pi-fast","0.1.0"],["@diegopetrucci/pi-openai-fast","0.1.15"],["pi-dynamic-context-pruning","0.1.6"],["@diegopetrucci/pi-extensions","0.1.63"]] -->
