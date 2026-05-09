# context-cap

A pi extension that treats large-context models as having an effective 200k-token context window, so pi's built-in auto-compaction starts earlier.

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

The extension starts enabled by default. Disabling is temporary for the current extension runtime/session; after `/reload`, `/new`, `/resume`, or `/fork`, the extension starts enabled again.

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

- This extension mutates pi's in-memory model metadata only. It does not edit `models.json`.
- The cap affects pi logic that reads `model.contextWindow`, including auto-compaction thresholding and UI context-window display.
- Because pi also uses `model.contextWindow` for some overflow detection, a request that succeeds above 200k tokens on a larger model may be treated as overflow and retried after compaction. Use `/context-cap off` if you need the full model window temporarily.
