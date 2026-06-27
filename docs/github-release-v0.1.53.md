Fixes automatic model selection in `oracle`, `contrarian`, and `librarian` so they fall back to a servable model instead of hard-failing when the catalog advertises a model the active provider/subscription cannot serve.

## Highlights

- Auto-selection now builds an ordered list of candidate models and runs them in order, ending with the known-good current session model as a final fallback.
- Falls back to the next candidate only on a model-availability error (`404`/`403`/`not_found`/`model_not_found`/`is not available`/`forbidden`/`access denied`/`not entitled`); success, genuine model errors, transient errors, and aborts stop the loop as before.
- Recognizes OpenAI-style `model_not_found`/`model_not_found_error` in addition to Anthropic's `not_found_error`, so `contrarian`'s opposite-provider selection also degrades gracefully.
- `librarian` also catches availability errors thrown by its in-memory subagent session and advances to the next candidate.
- Selection reasoning records when a model was skipped, keeping the chosen model transparent.

## Packages

- `@diegopetrucci/pi-extensions@0.1.53`
- `@diegopetrucci/pi-oracle@0.1.16`
- `@diegopetrucci/pi-contrarian@0.1.1`
- `@diegopetrucci/pi-librarian@0.1.8`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone packages can be installed individually, for example:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
