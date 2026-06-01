Validates the collection and every standalone extension package against Pi `0.78.0`, updates Oracle for Claude Opus 4.8 metadata, and enables `claude-fast` for Claude Opus 4.8.

## Highlights

- Updates the local Pi development baseline to `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` `0.78.0`.
- Refreshes `.pi-fleet-tested-version` markers in the collection and every standalone extension package to `0.78.0`.
- Prefers Claude Opus 4.8 before Opus 4.7 in Oracle for providers where Pi `0.78.0` exposes Opus 4.8 metadata.
- Enables `claude-fast` for first-party Anthropic `claude-opus-4-8` requests.
- Typechecks all extension entrypoints against Pi `0.78.0`.

## Packages

- `@diegopetrucci/pi-extensions@0.1.38`
- all standalone extension packages refreshed with Pi `0.78.0` fleet markers

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone examples:

```bash
pi install npm:@diegopetrucci/pi-oracle
pi install npm:@diegopetrucci/pi-claude-fast
```

Then reload pi:

```text
/reload
```
