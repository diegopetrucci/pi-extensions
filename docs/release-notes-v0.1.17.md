# Release notes — v0.1.17

## Highlights

This release replaces `compact-bash` with `quiet-tools`, a broader visual-only pi extension that makes collapsed built-in tool rows much quieter in the TUI.

## New extension: quiet-tools

- adds `extensions/quiet-tools`
- replaces `extensions/compact-bash` in the collection package
- covers built-in tool rows for `bash`, `read`, `grep`, `find`, `ls`, `edit`, and `write`
- keeps actual tool results unchanged for the model
- collapsed tool output shows one output line plus an inline hidden-line count
- collapsed `edit` and `write` call previews hide large diffs/content until expanded
- expanded output still shows pi's normal full renderer via `Ctrl+O`
- starts enabled by default
- includes temporary session/runtime commands:
  - `/quiet-tools status`
  - `/quiet-tools off`
  - `/quiet-tools on`
  - `/quiet-tools toggle`

## Notes

- This is a display-only change for assistant-invoked built-in tool rows.
- It does not truncate, summarize, or rewrite tool results sent to the model.
- User `!`/`!!` bash commands are rendered by pi's separate user-bash component and keep pi's default preview behavior.
- If another extension also overrides built-in tool execution, pi's extension load order determines which override wins.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.17`
- new standalone quiet tools package: `@diegopetrucci/pi-quiet-tools@0.1.0`
- standalone context cap package: `@diegopetrucci/pi-context-cap@0.1.0`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.7`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.3`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.1`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.1`

## Suggested release blurb

`v0.1.17 replaces compact-bash with quiet-tools, a visual-only pi extension that compacts collapsed bash/read/search/list/edit/write tool rows while keeping model-visible tool results unchanged.`
