# Release notes — v0.1.24

## Highlights

This release adds `dirty-repo-guard`, a session-safety extension copied from the upstream pi example. It checks the current git repository for uncommitted changes before creating a new session, switching sessions, or forking.

## dirty-repo-guard

- adds standalone package `@diegopetrucci/pi-dirty-repo-guard@0.1.0`
- runs `git status --porcelain` before session switches and forks
- allows actions outside git repositories
- prompts in the TUI when uncommitted changes are present
- cancels matching actions by default in non-interactive mode

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.24`
- standalone dirty-repo-guard package: `@diegopetrucci/pi-dirty-repo-guard@0.1.0`

## Suggested release blurb

`v0.1.24 adds dirty-repo-guard, a session-safety extension that warns before new sessions, switches, or forks when the current git repo has uncommitted changes.`
