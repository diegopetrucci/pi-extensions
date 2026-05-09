# GitHub release body — v0.1.16

## v0.1.16

This release adds `compact-bash`, a new pi extension for quieter collapsed assistant `bash` tool output.

### Highlights

- adds the new `compact-bash` extension to the collection
- renders collapsed assistant `bash` tool output as a one-line preview
- keeps full rendered output available with `Ctrl+O`
- leaves the actual tool result/model context unchanged
- adds `/compact-bash status`, `/compact-bash off`, `/compact-bash on`, and `/compact-bash toggle`
- publishes `compact-bash` as a standalone package: `@diegopetrucci/pi-compact-bash@0.1.0`

### Included docs

- [`docs/release-notes-v0.1.16.md`](./release-notes-v0.1.16.md)
- [`docs/publish-checklist-v0.1.16.md`](./publish-checklist-v0.1.16.md)
- [`docs/announcement-v0.1.16.md`](./announcement-v0.1.16.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.16`
- new standalone compact bash package: `@diegopetrucci/pi-compact-bash@0.1.0`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone compact-bash:

```bash
pi install npm:@diegopetrucci/pi-compact-bash
```

Then reload pi:

```text
/reload
```
