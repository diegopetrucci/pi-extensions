# Announcement copy — v0.1.38

## Short

Released `v0.1.38`: validates pi-extensions against Pi `0.78.0`, updates Oracle for Claude Opus 4.8 metadata, and enables `claude-fast` for Claude Opus 4.8.

## Medium

`v0.1.38` refreshes the collection and standalone extension packages for Pi `0.78.0`. Oracle now prefers Claude Opus 4.8 where Pi exposes it, and `claude-fast` supports first-party Anthropic `claude-opus-4-8` requests.

## Highlights

- Collection package: `@diegopetrucci/pi-extensions@0.1.38`
- All standalone extension packages refreshed with Pi `0.78.0` fleet markers
- Oracle provider preferences updated for Claude Opus 4.8 metadata
- `claude-fast` supports `claude-opus-4-8`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
# or standalone packages such as:
pi install npm:@diegopetrucci/pi-oracle
pi install npm:@diegopetrucci/pi-claude-fast
```

Then reload pi with `/reload`.
