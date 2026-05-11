# Release notes — v0.1.20

## Highlights

This release tightens `quiet-tools` so collapsed built-in tool rows show only a one-line invocation and a separate expand hint. Tool output is hidden until you press `Ctrl+O`.

## quiet-tools improvements

- collapsed rows for `read`, `bash`, `grep`, `find`, `ls`, `edit`, and `write` now render as:
  - one truncated invocation line
  - `(Ctrl+O to expand)` on the next line
- collapsed result output previews are removed, so long `read` and `bash` outputs no longer spill into multiple lines
- expanded rows still delegate to pi's normal built-in renderers
- `bash` timing state is preserved for expanded output
- docs now call out that inline image display is still controlled by pi's image rendering, because image attachments are rendered outside tool result renderers

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.20`
- standalone quiet tools package: `@diegopetrucci/pi-quiet-tools@0.1.1`
- standalone context inspector package: `@diegopetrucci/pi-context-inspector@0.1.0`
- standalone librarian package: `@diegopetrucci/pi-librarian@0.1.0`
- standalone context cap package: `@diegopetrucci/pi-context-cap@0.1.0`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.7`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.3`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.1`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.1`

## Suggested release blurb

`v0.1.20 updates quiet-tools so collapsed pi tool rows show just the invocation plus a Ctrl+O expand hint, with read/bash output hidden until expanded.`
