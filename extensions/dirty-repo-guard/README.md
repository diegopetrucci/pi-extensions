# dirty-repo-guard

A small pi extension that prompts before session changes when the current git repo has uncommitted changes.

This is copied from the original `dirty-repo-guard.ts` example in [`earendil-works/pi-mono`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/examples/extensions/dirty-repo-guard.ts) and kept basically the same.

## What it checks

Before creating a new session, switching sessions, or forking, the extension runs:

```bash
git status --porcelain
```

If the command reports changed files, pi asks whether to proceed anyway. If pi is running without an interactive UI, matching actions are cancelled by default.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-dirty-repo-guard
```

### Collection package

```bash
pi install npm:@diegopetrucci/pi-extensions
```

### GitHub package

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Notes

- Hooks `session_before_switch` and `session_before_fork`.
- Allows session changes outside git repos.
- Cancels the action when the user declines.
