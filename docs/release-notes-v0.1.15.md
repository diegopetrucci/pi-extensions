# Release notes — v0.1.15

## Highlights

This release adds `context-cap`, a new pi extension that caps large model context windows at 200k tokens by default so pi auto-compacts earlier on million-token models.

## New extension: context-cap

- adds `extensions/context-cap`
- caps each model's in-memory `contextWindow` to `min(originalContextWindow, 200000)` while enabled
- starts enabled by default
- restores original model windows on session shutdown
- includes a temporary session/runtime toggle command:
  - `/context-cap status`
  - `/context-cap off`
  - `/context-cap on`
  - `/context-cap toggle`

With pi's default `reserveTokens` of 16,384, models larger than 200k now proactively compact around 183,616 tokens when this extension is enabled.

## Notes

- The cap is in-memory only; it does not edit `models.json`.
- The cap affects pi logic that reads `model.contextWindow`, including auto-compaction thresholding and context-window display.
- If you need the full model window temporarily, run `/context-cap off`.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.15`
- new standalone context cap package: `@diegopetrucci/pi-context-cap@0.1.0`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.7`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.3`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.1`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.1`

## Suggested release blurb

`v0.1.15 adds context-cap, a new pi extension that treats large-context models as 200k-token models by default so auto-compaction starts earlier, with /context-cap commands to toggle it temporarily.`
