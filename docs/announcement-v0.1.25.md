# Announcement copy — v0.1.25

## Short post

Released `@diegopetrucci/pi-extensions@0.1.25`.

This release adds two new extensions: `todo`, a branch-aware agent todo list with a `/todos` viewer, and `inline-bash`, which expands trusted `!{command}` prompt snippets through local bash before the agent runs.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or standalone:

```bash
pi install npm:@diegopetrucci/pi-todo
pi install npm:@diegopetrucci/pi-inline-bash
```

Security note: `inline-bash` executes prompt snippets locally. Treat pasted prompts containing `!{...}` as shell code.

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.25`.

Adds `todo` for branch-aware agent task lists + `/todos`, and `inline-bash` for trusted `!{command}` prompt snippets.

`pi install npm:@diegopetrucci/pi-extensions`

## Very short version

Released `pi-extensions` v0.1.25.

Adds `todo` and `inline-bash` extensions.

## Discord / forum version

`pi-extensions@0.1.25` is out.

This release adds `todo`, a branch-aware agent todo list with a `/todos` viewer, and `inline-bash`, which expands trusted `!{command}` prompt snippets through local bash before the agent runs.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone packages:

```bash
pi install npm:@diegopetrucci/pi-todo
pi install npm:@diegopetrucci/pi-inline-bash
```

Note: `inline-bash` executes prompt snippets locally before the agent sees them, so treat pasted prompts containing `!{...}` as shell code.
