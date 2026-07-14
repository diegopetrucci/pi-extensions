# Announcement drafts — v0.1.57

## Short

Released `@diegopetrucci/pi-extensions@0.1.57` plus patch bumps for the changed standalone packages in the audited support-gap batch: adds GPT-5.6 Fast coverage for `openai-fast`, switches affected extensions to Pi runtime `CONFIG_DIR_NAME` compatibility, refreshes `oracle`/`contrarian`/`code-reviewer` model rankings and drift coverage, expands `permission-gate` to protect dangerous `write`/`edit` targets, and carries the dependency/audit cleanup for the batch.

## Packages

- `@diegopetrucci/pi-extensions@0.1.57`
- `@diegopetrucci/pi-annotate-git-diff@0.1.4`
- `@diegopetrucci/pi-brrr@0.1.7`
- `@diegopetrucci/pi-claude-fast@0.1.7`
- `@diegopetrucci/pi-code-reviewer@0.1.2`
- `@diegopetrucci/pi-context-inspector@0.1.6`
- `@diegopetrucci/pi-contrarian@0.1.4`
- `@diegopetrucci/pi-minimal-footer@0.1.14`
- `@diegopetrucci/pi-notify@0.1.10`
- `@diegopetrucci/pi-openai-fast@0.1.9`
- `@diegopetrucci/pi-oracle@0.1.19`
- `@diegopetrucci/pi-permission-gate@0.1.7`
- `@diegopetrucci/pi-review@0.1.7`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
# or individually
pi install npm:@diegopetrucci/pi-openai-fast
pi install npm:@diegopetrucci/pi-oracle
pi install npm:@diegopetrucci/pi-permission-gate
pi install npm:@diegopetrucci/pi-review
```

Then reload pi with `/reload`.

## X / Twitter version

Released `pi-extensions@0.1.57` plus patch bumps for the changed standalone packages in the audited support-gap batch.

GPT-5.6 Fast support, CONFIG_DIR_NAME config compatibility, refreshed model rankings with drift coverage, protected path write/edit guards, and dependency/audit cleanup are all included.
