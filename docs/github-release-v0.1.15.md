# GitHub release body — v0.1.15

## v0.1.15

This release adds `context-cap`, a new pi extension for earlier auto-compaction on large-context models.

### Highlights

- adds the new `context-cap` extension to the collection
- caps effective model context windows at 200k tokens by default
- makes pi's built-in auto-compaction trigger earlier on million-token models
- adds `/context-cap status`, `/context-cap off`, `/context-cap on`, and `/context-cap toggle`
- publishes `context-cap` as a standalone package: `@diegopetrucci/pi-context-cap@0.1.0`

### Included docs

- [`docs/release-notes-v0.1.15.md`](./release-notes-v0.1.15.md)
- [`docs/publish-checklist-v0.1.15.md`](./publish-checklist-v0.1.15.md)
- [`docs/announcement-v0.1.15.md`](./announcement-v0.1.15.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.15`
- new standalone context cap package: `@diegopetrucci/pi-context-cap@0.1.0`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone context-cap:

```bash
pi install npm:@diegopetrucci/pi-context-cap
```

Then reload pi:

```text
/reload
```
