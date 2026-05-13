# Announcement copy — v0.1.24

## Short post

Released `@diegopetrucci/pi-extensions@0.1.24`.

This release adds `dirty-repo-guard`, a session-safety extension that checks the current git repo for uncommitted changes before creating a new session, switching sessions, or forking.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or just dirty-repo-guard:

```bash
pi install npm:@diegopetrucci/pi-dirty-repo-guard
```

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.24`.

Adds `dirty-repo-guard`: pi now prompts before new sessions, switches, or forks when the current git repo has uncommitted changes.

`pi install npm:@diegopetrucci/pi-extensions`

## Very short version

Released `pi-extensions` v0.1.24.

Adds `dirty-repo-guard` for session changes in dirty git repos.

## Discord / forum version

`pi-extensions@0.1.24` is out.

This release adds `dirty-repo-guard`, a session-safety extension that checks `git status --porcelain` before creating a new session, switching sessions, or forking. If the current git repo has uncommitted changes, pi asks whether to proceed.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone dirty-repo-guard:

```bash
pi install npm:@diegopetrucci/pi-dirty-repo-guard
```
