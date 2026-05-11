# Announcement copy — v0.1.20

## Short post

Released `@diegopetrucci/pi-extensions@0.1.20`.

This release updates `quiet-tools`: collapsed built-in pi tool rows now show only a one-line invocation and `(Ctrl+O to expand)`. Tool output stays hidden until expanded, so long `read` and `bash` results no longer spill into the collapsed view.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or just quiet tools:

```bash
pi install npm:@diegopetrucci/pi-quiet-tools
```

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.20`.

`quiet-tools` now collapses built-in tool rows to just the invocation + `(Ctrl+O to expand)`, hiding read/bash output until expanded.

`pi install npm:@diegopetrucci/pi-extensions`

## Very short version

Released `pi-extensions` v0.1.20.

`quiet-tools` now shows collapsed tool invocations only, with output hidden until `Ctrl+O`.

## Discord / forum version

`pi-extensions@0.1.20` is out.

This release tightens `quiet-tools`, the visual-only extension for quieter collapsed built-in tool rows. Collapsed `read`, `bash`, `grep`, `find`, `ls`, `edit`, and `write` rows now show a single invocation line plus `(Ctrl+O to expand)`, and output is hidden until expanded.

That means long file reads and bash commands no longer show output previews in collapsed mode, while expanded mode still uses pi's normal built-in renderers.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone quiet tools:

```bash
pi install npm:@diegopetrucci/pi-quiet-tools
```
