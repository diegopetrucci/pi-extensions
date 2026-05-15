This release adds `compact-bash`, a new pi extension for quieter collapsed assistant `bash` tool output.

## Highlights

- adds the new `compact-bash` extension to the collection
- renders collapsed assistant `bash` tool output as a one-line preview
- keeps full rendered output available with `Ctrl+O`
- leaves the actual tool result/model context unchanged
- adds `/compact-bash status`, `/compact-bash off`, `/compact-bash on`, and `/compact-bash toggle`
- publishes `compact-bash` as a standalone package: `@diegopetrucci/pi-compact-bash`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- new standalone compact bash package: `@diegopetrucci/pi-compact-bash`

## Install

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
