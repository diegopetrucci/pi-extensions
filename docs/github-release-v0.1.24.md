# GitHub release body — v0.1.24

## v0.1.24

This release adds `dirty-repo-guard`, a session-safety extension copied from the upstream pi example.

### Highlights

- checks `git status --porcelain` before new sessions, session switches, and forks
- prompts before proceeding when the current git repo has uncommitted changes
- allows actions outside git repositories
- cancels matching actions by default when running without an interactive UI
- publishes standalone `@diegopetrucci/pi-dirty-repo-guard@0.1.0`

### Included docs

- [`docs/release-notes-v0.1.24.md`](./release-notes-v0.1.24.md)
- [`docs/publish-checklist-v0.1.24.md`](./publish-checklist-v0.1.24.md)
- [`docs/announcement-v0.1.24.md`](./announcement-v0.1.24.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.24`
- standalone dirty-repo-guard package: `@diegopetrucci/pi-dirty-repo-guard@0.1.0`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone dirty-repo-guard:

```bash
pi install npm:@diegopetrucci/pi-dirty-repo-guard
```

Then reload pi:

```text
/reload
```
