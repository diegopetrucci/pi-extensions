# Announcement drafts — v0.1.87

## Short

Draft for publication only after successful release verification:

pi-extensions v0.1.87 adds Pi 1.5.2 development compatibility and ships a changelog with every extension package except illustrations-to-explain-things, claude-fast and openai-fast, so Pi shows per-package update notes:
- `oracle`, `contrarian`, and `code-reviewer` get refreshed model catalogs, and `oracle` gets thinking fixes
- `review` and `annotate-git-diff` time out git/gh commands and fail closed instead of hanging
- `project-mcp-json` warns about and skips servers with an invalid timeout or description

`pi install npm:@diegopetrucci/pi-extensions`

Suggested public title: **Pi 1.5.2 compatibility, per-package update notes, and timeout hardening**.

This is an unpublished candidate. Do not post this announcement until the protected OIDC workflow succeeds and post-publication verification is complete.

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.17`
- `@diegopetrucci/pi-annotate-git-diff@0.1.18`
- `@diegopetrucci/pi-annotate-last-message@0.1.16`
- `@diegopetrucci/pi-brrr@0.1.17`
- `@diegopetrucci/pi-code-reviewer@0.1.20`
- `@diegopetrucci/pi-confirm-destructive@0.1.15`
- `@diegopetrucci/pi-context-cap@0.1.17`
- `@diegopetrucci/pi-context-inspector@0.1.19`
- `@diegopetrucci/pi-contrarian@0.1.23`
- `@diegopetrucci/pi-developer@0.1.1`
- `@diegopetrucci/pi-diff-summarizer@0.1.1`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.14`
- `@diegopetrucci/pi-fast@0.1.13`
- `@diegopetrucci/pi-git-footer@0.1.15`
- `@diegopetrucci/pi-gnosis@0.1.14`
- `@diegopetrucci/pi-inline-bash@0.1.17`
- `@diegopetrucci/pi-librarian@0.1.24`
- `@diegopetrucci/pi-minimal-footer@0.1.28`
- `@diegopetrucci/pi-notify@0.1.22`
- `@diegopetrucci/pi-oracle@0.1.38`
- `@diegopetrucci/pi-permission-gate@0.1.20`
- `@diegopetrucci/pi-project-mcp-json@0.1.5`
- `@diegopetrucci/pi-quiet-tools@0.1.17`
- `@diegopetrucci/pi-repo-scout@0.1.1`
- `@diegopetrucci/pi-review@0.1.18`
- `@diegopetrucci/pi-test-runner@0.1.1`
- `@diegopetrucci/pi-todo@0.1.14`
- `@diegopetrucci/pi-triage-comments@0.1.20`
- `@diegopetrucci/pi-web-scout@0.1.1`
- `pi-dynamic-context-pruning@0.1.18`
- `@diegopetrucci/pi-extensions@0.1.87`

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.17"],["@diegopetrucci/pi-annotate-git-diff","0.1.18"],["@diegopetrucci/pi-annotate-last-message","0.1.16"],["@diegopetrucci/pi-brrr","0.1.17"],["@diegopetrucci/pi-code-reviewer","0.1.20"],["@diegopetrucci/pi-confirm-destructive","0.1.15"],["@diegopetrucci/pi-context-cap","0.1.17"],["@diegopetrucci/pi-context-inspector","0.1.19"],["@diegopetrucci/pi-contrarian","0.1.23"],["@diegopetrucci/pi-developer","0.1.1"],["@diegopetrucci/pi-diff-summarizer","0.1.1"],["@diegopetrucci/pi-dirty-repo-guard","0.1.14"],["@diegopetrucci/pi-fast","0.1.13"],["@diegopetrucci/pi-git-footer","0.1.15"],["@diegopetrucci/pi-gnosis","0.1.14"],["@diegopetrucci/pi-inline-bash","0.1.17"],["@diegopetrucci/pi-librarian","0.1.24"],["@diegopetrucci/pi-minimal-footer","0.1.28"],["@diegopetrucci/pi-notify","0.1.22"],["@diegopetrucci/pi-oracle","0.1.38"],["@diegopetrucci/pi-permission-gate","0.1.20"],["@diegopetrucci/pi-project-mcp-json","0.1.5"],["@diegopetrucci/pi-quiet-tools","0.1.17"],["@diegopetrucci/pi-repo-scout","0.1.1"],["@diegopetrucci/pi-review","0.1.18"],["@diegopetrucci/pi-test-runner","0.1.1"],["@diegopetrucci/pi-todo","0.1.14"],["@diegopetrucci/pi-triage-comments","0.1.20"],["@diegopetrucci/pi-web-scout","0.1.1"],["pi-dynamic-context-pruning","0.1.18"],["@diegopetrucci/pi-extensions","0.1.87"]] -->
