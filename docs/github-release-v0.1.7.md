This release adds a small `confirm-destructive` extension to the collection.

## Highlights

- adds a `confirm-destructive` extension for pi
- asks for confirmation before destructive session actions
- checks for:
  - clearing the current session
  - switching sessions when the current session has user messages
  - forking from an entry
- cancels the action when the user declines
- keeps the extension very close to the original example from `earendil-works/pi-mono`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone confirm-destructive package: `@diegopetrucci/pi-confirm-destructive`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone confirm-destructive:

```bash
pi install npm:@diegopetrucci/pi-confirm-destructive
```

Then reload pi:

```text
/reload
```
