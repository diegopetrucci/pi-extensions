# claude-fast

Deprecated standalone leftover. This package no longer enables Claude Fast mode, registers `/claude-fast`, reads `claude-fast.json`, or changes provider requests.

Fast mode lives in the unified [`fast`](../fast) extension. Install `@diegopetrucci/pi-fast`, or install the collection, which loads `extensions/fast` only.

This package is standalone-only and is not auto-loaded by the `@diegopetrucci/pi-extensions` collection package.

## Install

```bash
pi install npm:@diegopetrucci/pi-claude-fast
```

Installing this package does not enable Fast mode. For the working extension:

```bash
pi install npm:@diegopetrucci/pi-fast
```

Then reload pi:

```text
/reload
```
