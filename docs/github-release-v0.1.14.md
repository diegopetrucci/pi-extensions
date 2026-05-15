This release updates `pi-extensions` for Pi's package/repository scope migration.

## Highlights

- migrated extension imports from `@mariozechner/*` to `@earendil-works/*`
- migrated oracle from `@sinclair/typebox` to `typebox`
- updated root and standalone package peer dependencies for the current Pi package names
- updated Pi repository links to `earendil-works/pi-mono`
- removed stale oracle preferences for removed Google Gemini CLI / Antigravity providers
- added oracle preferences for the current Xiaomi MiMo providers

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer`
- standalone oracle package: `@diegopetrucci/pi-oracle`
- standalone notify package: `@diegopetrucci/pi-notify`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone oracle:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
