# context-cap

A pi extension that treats large-context models as having an effective 200k-token context window, so pi's built-in auto-compaction starts earlier, and avoids the dumb zone.

By default, pi auto-compacts when:

```text
contextTokens > model.contextWindow - reserveTokens
```

This extension changes the active model's in-memory `contextWindow` to:

```text
min(originalContextWindow, 200000)
```

With pi's default `reserveTokens` of 16,384, models larger than 200k will proactively compact around 183,616 tokens.

## Commands

```text
/context-cap status
/context-cap off
/context-cap on
/context-cap toggle
```

The extension starts enabled by default. `/context-cap off` releases this extension instance's hold; a shared model remains capped while another extension instance still holds it. After `/reload`, `/new`, `/resume`, or `/fork`, a new extension instance starts enabled again.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-context-cap
```

### Collection package

```bash
pi install npm:@diegopetrucci/pi-extensions
```

### GitHub package

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Notes

- This extension mutates only the active model handle's in-memory metadata. It does not edit `models.json` and does not pre-cap every model in the registry.
- The cap applies only when the active model is a physical model with a finite, positive `contextWindow`. Virtual selections and missing/incompatible limits are left unchanged because Pi 0.99 does not expose a routed physical model before compaction.

### Process-wide scope

- The cap is process-wide for physical model objects shared through Pi's `ModelRuntime`, not session-local. Sessions without this extension—including child sessions launched by `code-reviewer`, `agent-workflow-audit`, `librarian`, and `triage-comments` with `noExtensions`—can observe the cap. Concurrent-session isolation is not claimed; this is an accepted Pi 0.99 host/API limitation.
- A process-wide `WeakMap` keeps the first holder's original window and reference-counts extension instances. Only the last holder restores it, and only when the current value is still the cap written by the extension. External writes are not overwritten during restore, duplicate release is safe, and restarting the process clears the in-memory coordination. Extension copies with incompatible older state cannot coordinate.

### Settings guard and alternative

- On Pi hosts exposing `getSettings()`, the extension resolves `reserveTokens` using Pi's precedence: `compaction.modelOverrides["provider/model-id"].reserveTokens`, then `compaction.reserveTokens`, then the default `16,384`. It skips the cap when the resolved value is at least `200,000` (which would make the threshold zero or negative), or when any explicit entry exists for that model. Hosts without `getSettings()` use the older cap behavior without this guard.
- Pi's provider request path also derives an output-token budget from the effective window (`contextWindow - contextTokens - 4096`, with any provider-specific clamp applied afterward). The cap can therefore reduce response or thinking-token budgets near the limit, in addition to causing earlier compaction; Pi's overflow handling may also treat a request above 200k as overflow and retry after compaction. Use `/context-cap off` when you need the full model window temporarily.
- As a session-scoped alternative, configure Pi's own `compaction.modelOverrides` instead of this extension. The exact key is `provider/model-id`; to match this extension's default 200k threshold for a model with original window `W`, let `R` be the configured `reserveTokens` value (default `16,384`) and use:

  ```text
  reserveTokens = W - 200000 + R
  ```

  For example, with the default `R`, a 1,000,000-token model uses `816384`, yielding the same `183616` threshold as `200000 - 16384`:

  ```json
  {
    "compaction": {
      "modelOverrides": {
        "provider/model-id": { "reserveTokens": 816384 }
      }
    }
  }
  ```

  Choose this alternative or the extension; do not combine them. The extension deliberately skips a model with an explicit `modelOverrides` entry, and older extension copies may not detect it.
- `/context-cap status` reports the process-wide original/effective window and how many other extension holders still hold the cap. No settings or session files are written by this extension.
