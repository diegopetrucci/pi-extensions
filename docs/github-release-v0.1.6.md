This release adds a small `permission-gate` extension to the collection.

## Highlights

- adds a `permission-gate` extension for pi
- prompts before potentially dangerous bash commands
- checks for:
  - `rm -rf`
  - `sudo`
  - `chmod` / `chown` with `777`
- blocks matching commands by default when no interactive UI is available
- keeps the extension very close to the original example from `earendil-works/pi-mono`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone permission gate:

```bash
pi install npm:@diegopetrucci/pi-permission-gate
```

Then reload pi:

```text
/reload
```
