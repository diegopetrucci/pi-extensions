# Announcement copy — v0.1.6

## Short post

Released `@diegopetrucci/pi-extensions@0.1.6`.

This adds a small `permission-gate` extension for pi that prompts before dangerous bash commands like `rm -rf`, `sudo`, and `chmod 777`, and blocks them by default in non-interactive mode.

It is adapted from the original example in `badlogic/pi-mono` and kept basically the same.

Install:

```bash
pi install npm:@diegopetrucci/pi-permission-gate
```

or:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

## X / Twitter version

Just released `@diegopetrucci/pi-extensions@0.1.6`.

New: `permission-gate` for pi
- prompts before dangerous bash commands
- checks `rm -rf`, `sudo`, and `chmod/chown 777`
- blocks by default in non-interactive mode
- adapted from the original `badlogic/pi-mono` example

Standalone install:
`pi install npm:@diegopetrucci/pi-permission-gate`

## Very short version

Released a small `permission-gate` extension for pi.

It prompts before dangerous bash commands and blocks them by default when pi has no interactive UI.

`pi install npm:@diegopetrucci/pi-permission-gate`

## Discord / forum version

I just shipped `v0.1.6` of my pi extensions package.

This release adds a small `permission-gate` extension that prompts before potentially dangerous bash commands like `rm -rf`, `sudo`, and `chmod 777`. In non-interactive mode, it blocks matching commands by default.

It is adapted from the original example in `badlogic/pi-mono`, with the implementation kept basically the same.

Install the standalone package with:

```bash
pi install npm:@diegopetrucci/pi-permission-gate
```

Or install the full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```
