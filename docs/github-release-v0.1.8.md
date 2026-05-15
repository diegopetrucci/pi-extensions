This release adds a small `notify` extension to the collection.

## Highlights

- adds a `notify` extension for pi
- sends a notification when the agent finishes and is waiting for input
- supports multiple backends:
  - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
  - OSC 99: Kitty
  - Windows toast: Windows Terminal / WSL
- chooses the backend from the current terminal environment
- keeps the extension very close to the original example from `earendil-works/pi-mono`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone notify package: `@diegopetrucci/pi-notify`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone notify:

```bash
pi install npm:@diegopetrucci/pi-notify
```

Then reload pi:

```text
/reload
```
