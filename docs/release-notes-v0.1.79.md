# Release notes — v0.1.79

## Highlights

- **350k context defaults:** `context-cap` now defaults to a 350,000-token effective context cap, and `minimal-footer` now defaults its `DUMB ZONE` threshold to 350,000 tokens. Explicit overrides remain supported ([#169](https://github.com/diegopetrucci/pi-extensions/pull/169)).
- **OpenAI OAuth Fast mode:** direct OpenAI requests authenticated with Pi ChatGPT OAuth now use `service_tier=priority`; API-key requests retain `fast`, and Codex behavior is unchanged ([#160](https://github.com/diegopetrucci/pi-extensions/pull/160)).
- **Pi-aligned path handling:** the guarded subagents and permission gate remove legacy checks for paths Pi does not open while retaining real checkout-escape and symlink protections. Librarian cache-mode changes now persist the current in-memory preferences ([#154](https://github.com/diegopetrucci/pi-extensions/pull/154), [#156](https://github.com/diegopetrucci/pi-extensions/pull/156), [#161](https://github.com/diegopetrucci/pi-extensions/pull/161), [#167](https://github.com/diegopetrucci/pi-extensions/pull/167)).
- **Lean state and maintenance:** unused audit, report, footer, usage, UI-type, and markdown-style state was removed, with focused tests and documentation kept aligned ([#151](https://github.com/diegopetrucci/pi-extensions/pull/151), [#152](https://github.com/diegopetrucci/pi-extensions/pull/152), [#153](https://github.com/diegopetrucci/pi-extensions/pull/153), [#162](https://github.com/diegopetrucci/pi-extensions/pull/162), [#163](https://github.com/diegopetrucci/pi-extensions/pull/163), [#164](https://github.com/diegopetrucci/pi-extensions/pull/164), [#165](https://github.com/diegopetrucci/pi-extensions/pull/165), [#166](https://github.com/diegopetrucci/pi-extensions/pull/166)).

## Scope and omissions

The pinned-registry artifact comparison selected exactly the 17 package/version pairs listed below. The unchanged workspace artifacts intentionally omitted from this candidate are `@diegopetrucci/pi-brrr@0.1.15`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-confirm-destructive@0.1.14`, `@diegopetrucci/pi-dirty-repo-guard@0.1.12`, `@diegopetrucci/pi-gnosis@0.1.12`, `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`, `@diegopetrucci/pi-inline-bash@0.1.13`, `@diegopetrucci/pi-notify@0.1.19`, `@diegopetrucci/pi-openai-fast@0.1.18`, `@diegopetrucci/pi-project-mcp-json@0.1.2`, `@diegopetrucci/pi-quiet-tools@0.1.14`, and `@diegopetrucci/pi-todo@0.1.12`.

## Contributors

- [@davidlondono](https://github.com/davidlondono) contributed the direct OpenAI OAuth service-tier behavior, documentation, and tests in [#160](https://github.com/diegopetrucci/pi-extensions/pull/160).

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.15`
- `@diegopetrucci/pi-annotate-git-diff@0.1.15`
- `@diegopetrucci/pi-annotate-last-message@0.1.13`
- `@diegopetrucci/pi-code-reviewer@0.1.15`
- `@diegopetrucci/pi-context-cap@0.1.16`
- `@diegopetrucci/pi-context-inspector@0.1.17`
- `@diegopetrucci/pi-contrarian@0.1.17`
- `@diegopetrucci/pi-fast@0.1.10`
- `@diegopetrucci/pi-git-footer@0.1.13`
- `@diegopetrucci/pi-librarian@0.1.20`
- `@diegopetrucci/pi-minimal-footer@0.1.25`
- `@diegopetrucci/pi-oracle@0.1.32`
- `@diegopetrucci/pi-permission-gate@0.1.18`
- `@diegopetrucci/pi-review@0.1.16`
- `@diegopetrucci/pi-triage-comments@0.1.16`
- `pi-dynamic-context-pruning@0.1.14`
- `@diegopetrucci/pi-extensions@0.1.79`

## Validation

- The source was frozen at `ec1e382656e7259a31e4a21dc78646ec53eacf64` with `origin/main` matching before preparation writes.
- The exact input `/tmp/pi-extensions-v0.1.79-input.json` passed `prepare-release` dry-run and write mode. The registry checks confirmed all 17 exact target versions were unpublished; write mode synchronized the manifests and lockfile and created the four v0.1.79 documents.

### Latest pre-commit candidate validation

- The following six commands passed in order against the pre-commit candidate at source `ec1e382656e7259a31e4a21dc78646ec53eacf64`; later changes are documentation-only:
  1. `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` — 156 packages added; npm emitted the known `node-domexception@1.0.0` deprecation warning.
  2. `npm run preflight:install-state` — 128 installed packages and 29 local package entries matched `package-lock.json`.
  3. `npm run ci` — 1,153 total: 1,152 passed, 0 failed, and 1 skipped.
  4. `npm pack --dry-run --ignore-scripts --json` — the root package reported 167 files.
  5. `npm pack --dry-run --ignore-scripts --json --workspaces` — all 28 workspace dry-runs passed.
  6. `git diff --check` — passed.
- The raw CI output is preserved at `/var/folders/nq/fkrbfck57y91r169_934fxb80000gn/T/pi-bash-79223b690f70a32d.log`; the complete workspace JSON result covers all 28 workspace dry-runs.
- These are pre-commit candidate results only. No merged-main, compatibility, fleet, or host certification is claimed.

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.15"],["@diegopetrucci/pi-annotate-git-diff","0.1.15"],["@diegopetrucci/pi-annotate-last-message","0.1.13"],["@diegopetrucci/pi-code-reviewer","0.1.15"],["@diegopetrucci/pi-context-cap","0.1.16"],["@diegopetrucci/pi-context-inspector","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.17"],["@diegopetrucci/pi-fast","0.1.10"],["@diegopetrucci/pi-git-footer","0.1.13"],["@diegopetrucci/pi-librarian","0.1.20"],["@diegopetrucci/pi-minimal-footer","0.1.25"],["@diegopetrucci/pi-oracle","0.1.32"],["@diegopetrucci/pi-permission-gate","0.1.18"],["@diegopetrucci/pi-review","0.1.16"],["@diegopetrucci/pi-triage-comments","0.1.16"],["pi-dynamic-context-pruning","0.1.14"],["@diegopetrucci/pi-extensions","0.1.79"]] -->
