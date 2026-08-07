# Release notes — v0.1.63

## Highlights

- Adds `@diegopetrucci/pi-fast`, a unified `/fast` toggle that follows the currently selected model and applies the correct OpenAI Codex or Anthropic Claude Fast-mode request shape.
- The collection now loads only the unified Fast controller. `pi-openai-fast` and `pi-claude-fast` remain available as standalone provider-specific alternatives.
- Preserves Anthropic model, OAuth, interleaved-thinking, and fine-grained-tool-streaming beta headers while adding the Fast-mode beta.
- Ships the previously merged Dynamic Context Pruning improvements: active `minCharsSaved` filtering, runtime idle/mid-loop classification, and compression-simulation benchmark support.

## Packaging

- `@diegopetrucci/pi-claude-fast@0.1.13`
- `@diegopetrucci/pi-fast@0.1.0`
- `@diegopetrucci/pi-openai-fast@0.1.15`
- `pi-dynamic-context-pruning@0.1.6`
- `@diegopetrucci/pi-extensions@0.1.63`

## Validation

- `npm run ci` passes with 572 tests.
- Anthropic API-key and OAuth wire-header integration coverage verifies required beta preservation.
- Publishable tarball smoke tests and package size budgets pass.

<!-- prepare-release:packages [["@diegopetrucci/pi-claude-fast","0.1.13"],["@diegopetrucci/pi-fast","0.1.0"],["@diegopetrucci/pi-openai-fast","0.1.15"],["pi-dynamic-context-pruning","0.1.6"],["@diegopetrucci/pi-extensions","0.1.63"]] -->
