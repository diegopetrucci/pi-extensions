# GitHub release body — v0.1.14

## v0.1.14

This release updates `pi-extensions` for Pi's package/repository scope migration.

### Highlights

- migrated extension imports from `@mariozechner/*` to `@earendil-works/*`
- migrated oracle from `@sinclair/typebox` to `typebox`
- updated root and standalone package peer dependencies for the current Pi package names
- updated Pi repository links to `earendil-works/pi-mono`
- removed stale oracle preferences for removed Google Gemini CLI / Antigravity providers
- added oracle preferences for the current Xiaomi MiMo providers

### Included docs

- [`docs/release-notes-v0.1.14.md`](./release-notes-v0.1.14.md)
- [`docs/publish-checklist-v0.1.14.md`](./publish-checklist-v0.1.14.md)
- [`docs/announcement-v0.1.14.md`](./announcement-v0.1.14.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.14`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.7`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.3`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.1`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.1`

### Install

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
