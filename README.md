# pi-extensions

A collection of [pi](https://github.com/badlogic/pi-mono) agent extensions I made.

## Included extensions

| Extension | Description |
|---|---|
| [`minimal-footer`](./extensions/minimal-footer) | Replaces pi's built-in footer with a minimal two-line layout: branch/repo on the first line, context/model on the second. |
| [`oracle`](./extensions/oracle) | Adds an Amp-style read-only oracle tool that auto-selects the strongest reasoning model on the current provider/subscription, covers pi’s built-in providers with hardcoded rankings, sets reasoning to xhigh by default, and shows live status while running. |
| [`permission-gate`](./extensions/permission-gate) | Prompts for confirmation before dangerous bash commands like `rm -rf`, `sudo`, and `chmod 777`. |

## Install

### GitHub

Install the repo as a pi package:

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Or pin to a tagged version:

```bash
pi install git:github.com/diegopetrucci/pi-extensions@v0.1.6
```

### npm

Install the full collection from npm:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Install only one extension

If you only want one extension, you have two options.

### Option 1: install the standalone npm package

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
```

```bash
pi install npm:@diegopetrucci/pi-oracle
```

```bash
pi install npm:@diegopetrucci/pi-permission-gate
```

### Option 2: filter the repo package

If you prefer the collection package, you can filter it in your pi settings.

Minimal footer only:

```json
{
  "packages": [
    {
      "source": "npm:@diegopetrucci/pi-extensions",
      "extensions": ["extensions/minimal-footer/index.ts"]
    }
  ]
}
```

Oracle only:

```json
{
  "packages": [
    {
      "source": "npm:@diegopetrucci/pi-extensions",
      "extensions": ["extensions/oracle/index.ts"]
    }
  ]
}
```

Permission gate only:

```json
{
  "packages": [
    {
      "source": "npm:@diegopetrucci/pi-extensions",
      "extensions": ["extensions/permission-gate/index.ts"]
    }
  ]
}
```

## npm publishing

The repo is set up to support both:

- the collection package: `@diegopetrucci/pi-extensions`
- standalone extension packages like `@diegopetrucci/pi-minimal-footer`, `@diegopetrucci/pi-oracle`, and `@diegopetrucci/pi-permission-gate`