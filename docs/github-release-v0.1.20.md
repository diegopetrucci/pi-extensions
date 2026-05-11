# GitHub release body — v0.1.20

## v0.1.20

This release tightens `quiet-tools` collapsed rendering: built-in tool rows now show only a one-line invocation plus a separate `Ctrl+O` expand hint, with tool output hidden until expanded.

### Highlights

- updates collapsed `read`, `bash`, `grep`, `find`, `ls`, `edit`, and `write` rows
- renders one truncated invocation line per collapsed tool row
- renders `(Ctrl+O to expand)` as the second collapsed line
- removes collapsed output previews, including long `read` and `bash` previews
- keeps expanded rows delegated to pi's normal built-in renderers
- preserves expanded `bash` timing state
- documents the remaining pi-controlled image rendering behavior for image reads
- publishes `quiet-tools` as `@diegopetrucci/pi-quiet-tools@0.1.1`

### Included docs

- [`docs/release-notes-v0.1.20.md`](./release-notes-v0.1.20.md)
- [`docs/publish-checklist-v0.1.20.md`](./publish-checklist-v0.1.20.md)
- [`docs/announcement-v0.1.20.md`](./announcement-v0.1.20.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.20`
- standalone quiet tools package: `@diegopetrucci/pi-quiet-tools@0.1.1`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone quiet tools:

```bash
pi install npm:@diegopetrucci/pi-quiet-tools
```

Then reload pi:

```text
/reload
```
