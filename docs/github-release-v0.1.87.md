This release adds Pi 1.5.2 development compatibility, ships per-package changelogs so Pi shows update notes, refreshes the `oracle`, `contrarian`, and `code-reviewer` model catalogs, and hardens `review`, `annotate-git-diff`, and `project-mcp-json` against hangs and invalid input.

## Highlights

- **Pi 1.5.2 development compatibility:** the development baseline moves from Pi 1.5.0 to 1.5.2, with automated checks only. This release makes no fleet certification claim, and the `.pi-fleet-tested-version` markers are unchanged.
- **Per-package update notes:** extension packages now ship their `CHANGELOG.md`, so Pi 1.5.0+ shows release notes for each package after an update ([#226](https://github.com/diegopetrucci/pi-extensions/pull/226)).
- **Refreshed model catalogs (`oracle`, `contrarian`, `code-reviewer`):** Fable 5.2 ranks above Fable 5.1, Kimi K3.1 Pro ranks above K3 on more providers, new Radius models are included, `qwen-token-plan-individual-cn` is supported, and models Pi dropped are removed ([#237](https://github.com/diegopetrucci/pi-extensions/pull/237)).
- **`oracle` thinking fixes:** OpenRouter and Vercel Sol Pro/Fast variants request xhigh thinking again, instead of falling back to the high default used by base Sol models, and batch aliases of base Sol models request high thinking again ([#213](https://github.com/diegopetrucci/pi-extensions/pull/213), [#229](https://github.com/diegopetrucci/pi-extensions/pull/229)).
- **Timeouts and fail-closed behavior (`review`, `annotate-git-diff`):** git and gh commands time out instead of hanging (clipboard commands too in `annotate-git-diff`), and a timeout fails the review rather than looking like an empty diff. `review` also stops before `gh pr checkout` when `git status` fails or times out, and loop fixing no longer stops after the first pass on Pi 1.5.x ([#216](https://github.com/diegopetrucci/pi-extensions/pull/216), [#227](https://github.com/diegopetrucci/pi-extensions/pull/227), [#228](https://github.com/diegopetrucci/pi-extensions/pull/228), [#234](https://github.com/diegopetrucci/pi-extensions/pull/234)).
- **Invalid MCP server config (`project-mcp-json`):** servers with an invalid timeout or description are now skipped, with a warning in interactive sessions ([#214](https://github.com/diegopetrucci/pi-extensions/pull/214)).

The Pi development baseline is 1.5.2 (automated checks only); this release makes no new live-provider or fleet certification claim.

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

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.17"],["@diegopetrucci/pi-annotate-git-diff","0.1.18"],["@diegopetrucci/pi-annotate-last-message","0.1.16"],["@diegopetrucci/pi-brrr","0.1.17"],["@diegopetrucci/pi-code-reviewer","0.1.20"],["@diegopetrucci/pi-confirm-destructive","0.1.15"],["@diegopetrucci/pi-context-cap","0.1.17"],["@diegopetrucci/pi-context-inspector","0.1.19"],["@diegopetrucci/pi-contrarian","0.1.23"],["@diegopetrucci/pi-developer","0.1.1"],["@diegopetrucci/pi-diff-summarizer","0.1.1"],["@diegopetrucci/pi-dirty-repo-guard","0.1.14"],["@diegopetrucci/pi-fast","0.1.13"],["@diegopetrucci/pi-git-footer","0.1.15"],["@diegopetrucci/pi-gnosis","0.1.14"],["@diegopetrucci/pi-inline-bash","0.1.17"],["@diegopetrucci/pi-librarian","0.1.24"],["@diegopetrucci/pi-minimal-footer","0.1.28"],["@diegopetrucci/pi-notify","0.1.22"],["@diegopetrucci/pi-oracle","0.1.38"],["@diegopetrucci/pi-permission-gate","0.1.20"],["@diegopetrucci/pi-project-mcp-json","0.1.5"],["@diegopetrucci/pi-quiet-tools","0.1.17"],["@diegopetrucci/pi-repo-scout","0.1.1"],["@diegopetrucci/pi-review","0.1.18"],["@diegopetrucci/pi-test-runner","0.1.1"],["@diegopetrucci/pi-todo","0.1.14"],["@diegopetrucci/pi-triage-comments","0.1.20"],["@diegopetrucci/pi-web-scout","0.1.1"],["pi-dynamic-context-pruning","0.1.18"],["@diegopetrucci/pi-extensions","0.1.87"]] -->
