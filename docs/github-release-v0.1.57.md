Packages the audited support-gap batch as v0.1.57 with GPT-5.6 Fast support, CONFIG_DIR_NAME-compatible config paths, refreshed reasoning-model rankings and drift coverage, protected path guards for write/edit flows, and dependency/audit cleanup across the changed standalone packages.

## Highlights

- adds GPT-5.6 Codex Fast coverage in `openai-fast` for `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`
- switches affected extensions to Pi runtime `CONFIG_DIR_NAME` compatibility instead of hardcoded `.pi` config/report paths
- refreshes `oracle`, `contrarian`, and `code-reviewer` provider/model rankings, with focused drift coverage for the updated preference catalogs and fallback ordering
- expands `permission-gate` to guard protected `write`/`edit` targets like `.git`, `node_modules`, and secret-bearing `.env` files after path normalization
- carries the audited dependency cleanup, including the `@tailwindcss/browser` refresh and protobuf lockfile/override cleanup

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

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone packages can be installed individually, for example:

```bash
pi install npm:@diegopetrucci/pi-openai-fast
pi install npm:@diegopetrucci/pi-oracle
pi install npm:@diegopetrucci/pi-permission-gate
pi install npm:@diegopetrucci/pi-review
```

Then reload pi:

```text
/reload
```
