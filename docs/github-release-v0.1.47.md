Project-local extension config now honors Pi project trust. Global config still loads normally, but project-controlled `.pi/*.json` files and review guidelines are ignored unless Pi reports that the project is trusted.

## Highlights

- `brrr`, `notify`, `minimal-footer`, `openai-fast`, and `claude-fast` now read project-local config only for trusted projects.
- `review` now reads `REVIEW_GUIDELINES.md` next to a project `.pi` directory only for trusted projects.
- The trust helper fails closed when `ctx.isProjectTrusted()` is unavailable, so older runtimes do not accidentally honor repo-controlled project config.
- Affected READMEs now document the trusted-project requirement.
- Fixes [#3](https://github.com/diegopetrucci/pi-extensions/issues/3).

## Packages

- `@diegopetrucci/pi-extensions@0.1.47`
- `@diegopetrucci/pi-brrr@0.1.3`
- `@diegopetrucci/pi-notify@0.1.6`
- `@diegopetrucci/pi-minimal-footer@0.1.9`
- `@diegopetrucci/pi-openai-fast@0.1.5`
- `@diegopetrucci/pi-claude-fast@0.1.3`
- `@diegopetrucci/pi-review@0.1.3`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone packages:

```bash
pi install npm:@diegopetrucci/pi-brrr
pi install npm:@diegopetrucci/pi-notify
pi install npm:@diegopetrucci/pi-minimal-footer
pi install npm:@diegopetrucci/pi-openai-fast
pi install npm:@diegopetrucci/pi-claude-fast
pi install npm:@diegopetrucci/pi-review
```

Then reload pi:

```text
/reload
```
