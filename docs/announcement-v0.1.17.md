# Announcement copy — v0.1.17

## Short post

Released `@diegopetrucci/pi-extensions@0.1.17`.

This release replaces `compact-bash` with `quiet-tools`, a broader visual-only pi extension that makes collapsed built-in tool rows much quieter. It covers `bash`, `read`, `grep`, `find`, `ls`, `edit`, and `write` while keeping the actual tool results sent to the model unchanged.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or just quiet-tools:

```bash
pi install npm:@diegopetrucci/pi-quiet-tools
```

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.17`.

Replaces `compact-bash` with `quiet-tools`: collapsed bash/read/search/list/edit/write tool rows now render as quiet one-line previews, with full output still available via Ctrl+O. Model-visible tool results are unchanged.

`pi install npm:@diegopetrucci/pi-extensions`

## Very short version

Released `pi-extensions` v0.1.17.

Adds `quiet-tools`, a visual-only compact renderer for collapsed built-in pi tool rows.

## Discord / forum version

`pi-extensions@0.1.17` is out.

This release replaces `compact-bash` with `quiet-tools`, a broader visual-only extension for quieter collapsed built-in tool rows. It covers `bash`, `read`, `grep`, `find`, `ls`, `edit`, and `write`, keeps full rendered output available with `Ctrl+O`, and does not change the actual tool results sent to the model.

Commands:

```text
/quiet-tools status
/quiet-tools off
/quiet-tools on
/quiet-tools toggle
```

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone quiet-tools:

```bash
pi install npm:@diegopetrucci/pi-quiet-tools
```
