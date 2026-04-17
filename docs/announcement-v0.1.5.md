# Announcement copy — v0.1.5

## Short post

Released `@diegopetrucci/pi-extensions@0.1.5`.

This adds an Amp-style `oracle` extension for pi: a read-only subprocess that auto-picks the strongest reasoning model on your current provider/subscription, sets reasoning to `xhigh` by default for reasoning models, and shows live status while it runs.

It now includes provider-specific rankings across pi’s built-in providers.

Install:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

or:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

## X / Twitter version

Just released `@diegopetrucci/pi-extensions@0.1.5`.

New: an Amp-style Oracle extension for pi 🔮
- read-only subprocess
- strongest reasoning model on your current provider/sub
- `xhigh` thinking by default for reasoning models
- live status UI while it runs
- hardcoded rankings across pi’s built-in providers

Standalone install:
`pi install npm:@diegopetrucci/pi-oracle`

## Very short version

Released a new Oracle extension for pi 🔮

It works like Amp’s oracle: separate read-only subprocess, strong reasoning model auto-selection on your current provider, explicit thinking level control, and live status UI.

`pi install npm:@diegopetrucci/pi-oracle`

## Discord / forum version

I just shipped `v0.1.5` of my pi extensions package, including a new `oracle` extension.

The idea is similar to Amp’s oracle: the main agent can consult a separate read-only pi subprocess for deeper analysis, review, debugging, and planning. The extension tries to pick the strongest reasoning model on the same provider/subscription the user is already on, and it now has provider-specific rankings across pi’s built-in providers.

It also explicitly sets the oracle thinking level:
- `xhigh` by default for reasoning models
- `off` for non-reasoning models
- optional override with `thinkingLevel`

Install the standalone package with:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Or install the full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```
