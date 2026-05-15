This release replaces `compact-bash` with `quiet-tools`, a broader visual-only extension for quieter collapsed built-in tool rows.

## Highlights

- replaces `compact-bash` with the new `quiet-tools` extension in the collection
- renders collapsed `bash`, `read`, `grep`, `find`, `ls`, `edit`, and `write` tool rows as compact one-line previews
- keeps full rendered output available with `Ctrl+O`
- leaves actual tool results/model context unchanged
- also shortens collapsed `edit` and `write` call previews so large diffs/content do not fill the TUI
- adds `/quiet-tools status`, `/quiet-tools off`, `/quiet-tools on`, and `/quiet-tools toggle`
- publishes `quiet-tools` as a standalone package: `@diegopetrucci/pi-quiet-tools`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- new standalone quiet tools package: `@diegopetrucci/pi-quiet-tools`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone quiet-tools:

```bash
pi install npm:@diegopetrucci/pi-quiet-tools
```

Then reload pi:

```text
/reload
```
