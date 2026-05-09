# Announcement copy — v0.1.15

## Short post

Released `@diegopetrucci/pi-extensions@0.1.15`.

This release adds `context-cap`, a new pi extension that treats large-context models as 200k-token models by default so pi auto-compacts earlier. Toggle it temporarily with `/context-cap off`, `/context-cap on`, `/context-cap toggle`, or inspect it with `/context-cap status`.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or just context-cap:

```bash
pi install npm:@diegopetrucci/pi-context-cap
```

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.15`.

Adds `context-cap`: cap effective model context windows at 200k tokens by default so pi auto-compacts earlier on huge-context models. Toggle temporarily with `/context-cap off/on/toggle/status`.

`pi install npm:@diegopetrucci/pi-extensions`

## Very short version

Released `pi-extensions` v0.1.15.

Adds `context-cap`, a 200k effective context-window cap for earlier pi auto-compaction.

## Discord / forum version

`pi-extensions@0.1.15` is out.

This release adds `context-cap`, a new pi extension that caps effective model context windows at 200k tokens by default. With pi's default reserve tokens, this makes large-context models proactively compact around 183k tokens instead of waiting until close to their full context window.

Commands:

```text
/context-cap status
/context-cap off
/context-cap on
/context-cap toggle
```

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone context-cap:

```bash
pi install npm:@diegopetrucci/pi-context-cap
```
