This release tightens `quiet-tools` collapsed rendering: built-in tool rows now show only a one-line invocation plus a separate `Ctrl+O` expand hint, with tool output hidden until expanded.

## Highlights

- updates collapsed `read`, `bash`, `grep`, `find`, `ls`, `edit`, and `write` rows
- renders one truncated invocation line per collapsed tool row
- renders `(Ctrl+O to expand)` as the second collapsed line
- removes collapsed output previews, including long `read` and `bash` previews
- keeps expanded rows delegated to pi's normal built-in renderers
- preserves expanded `bash` timing state
- documents the remaining pi-controlled image rendering behavior for image reads
- publishes `quiet-tools` as `@diegopetrucci/pi-quiet-tools`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone quiet tools package: `@diegopetrucci/pi-quiet-tools`

## Install

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
