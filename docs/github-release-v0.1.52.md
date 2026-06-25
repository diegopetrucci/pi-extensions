Adds `contrarian`, a read-only adversarial-analysis subagent for stress-testing plans, designs, assumptions, bug hypotheses, review conclusions, and product directions.

## Highlights

- Adds the `contrarian` tool, which runs an isolated pi subprocess and returns a concise adversarial markdown report.
- Adapts the TLH contrarian subagent prompt for pi: identify the core claim, steelman the strongest opposing case, review evidence, and separate confirmed objections, speculative concerns, and unresolved unknowns.
- Defaults to read-only tools (`read,grep,find,ls`) with optional non-mutating bash inspection.
- Prefers a strong reasoning model from the opposite model family/provider when available, then falls back to the best available model.
- Adds `/contrarian` for persisted model/thinking defaults and `/contrarian-model` to inspect current auto-selection.

## Packages

- `@diegopetrucci/pi-extensions@0.1.52`
- `@diegopetrucci/pi-contrarian@0.1.0`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone contrarian:

```bash
pi install npm:@diegopetrucci/pi-contrarian
```

Then reload pi:

```text
/reload
```
