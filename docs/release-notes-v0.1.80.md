# Release notes — v0.1.80

## Public title

**Pi 1.4.0 compatibility and tool-rendering fixes**

## Highlights

- **Pi 1.4.0 development compatibility and catalog updates:** Oracle, Contrarian, and Code Reviewer preference catalogs were refreshed against the Pi 1.4.0 catalog, and the automated SDK-isolation fixtures now express the Pi 1.4.0 transcript-tool restoration contract.
- **Tool-rendering read ranges:** `quiet-tools` now follows Pi 1.3/1.4 read-range semantics for finite numeric and numeric-string offsets and limits, including open-ended ranges and safe handling of omitted, null, or malformed values.
- **BOM-safe project MCP configuration:** `project-mcp-json` accepts exactly one leading UTF-8 BOM before parsing `.mcp.json`; malformed input remains fail-closed with secret-safe warnings.
- **Pruning alias hardening:** `pi-dynamic-context-pruning` rejects inherited property names as strategy aliases while retaining case-insensitive documented aliases and explicit per-state threshold behavior.

## Scope and omissions

The pinned public-registry artifact comparison selected exactly the ten package/version pairs listed below. These 19 workspace artifacts were intentionally omitted and remain at their existing versions: `@diegopetrucci/pi-agent-workflow-audit@0.1.15`, `@diegopetrucci/pi-annotate-git-diff@0.1.15`, `@diegopetrucci/pi-brrr@0.1.15`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-confirm-destructive@0.1.14`, `@diegopetrucci/pi-context-cap@0.1.16`, `@diegopetrucci/pi-context-inspector@0.1.17`, `@diegopetrucci/pi-dirty-repo-guard@0.1.12`, `@diegopetrucci/pi-fast@0.1.10`, `@diegopetrucci/pi-git-footer@0.1.13`, `@diegopetrucci/pi-gnosis@0.1.12`, `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`, `@diegopetrucci/pi-inline-bash@0.1.13`, `@diegopetrucci/pi-minimal-footer@0.1.25`, `@diegopetrucci/pi-notify@0.1.19`, `@diegopetrucci/pi-openai-fast@0.1.18`, `@diegopetrucci/pi-permission-gate@0.1.18`, `@diegopetrucci/pi-review@0.1.16`, and `@diegopetrucci/pi-todo@0.1.12`.

The compatibility and catalog checks are automated development evidence only. No live-provider, visual, interactive, fleet, host, or broader runtime certification is claimed.

## Packaging

- `@diegopetrucci/pi-annotate-last-message@0.1.14`
- `@diegopetrucci/pi-code-reviewer@0.1.16`
- `@diegopetrucci/pi-contrarian@0.1.18`
- `@diegopetrucci/pi-librarian@0.1.21`
- `@diegopetrucci/pi-oracle@0.1.33`
- `@diegopetrucci/pi-project-mcp-json@0.1.3`
- `@diegopetrucci/pi-quiet-tools@0.1.15`
- `@diegopetrucci/pi-triage-comments@0.1.17`
- `pi-dynamic-context-pruning@0.1.15`
- `@diegopetrucci/pi-extensions@0.1.80`

## Preparation evidence

- [x] The source was frozen at `0d4a903a034a5b55c3bf4bf19f14e05e7256839a`, with `HEAD` and `origin/main` matching before preparation writes.
- [x] The exact input `/tmp/pi-extensions-v0.1.80-input.json` passed the credential-free dry-run against `https://registry.npmjs.org`, selecting exactly the ten artifacts above and confirming each exact target was unpublished.
- [x] Write mode created exactly the four v0.1.80 release documents and synchronized only the selected manifests and lockfile version leaves; existing fleet markers remained unchanged.

## PRE-COMMIT CANDIDATE validation — completed

The isolated final validation applies to the pre-commit release-preparation candidate, not to a future merged `main` tree. The successful raw log is `/var/folders/nq/fkrbfck57y91r169_934fxb80000gn/T/pi-bash-be408c897e8cc757.log`; it records the scrubbed `env -i` run in sandbox `/tmp/pi-0180-validation.MPADnU`. Later edits to these release documents are documentation-only and do not change the candidate's source or package evidence.

- [x] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed and added 154 packages. The only npm warning was the known `node-domexception@1.0.0` deprecation; the npm upgrade notice was informational.
- [x] `npm run preflight:install-state` passed with 126 installed packages and 29 local package entries matching `package-lock.json`; 18 optional packages were not installed.
- [x] `npm run ci` passed: formatting matched 165 files, typechecking passed, and the test summary was 1,161 total, 1,160 passed, 0 failed, 0 cancelled, and 1 skipped. The one skipped test was the Windows-native check.
- [x] `npm pack --dry-run --ignore-scripts --json` passed; the root package reported 167 entries.
- [x] `npm pack --dry-run --ignore-scripts --json --workspaces` passed for all 28 workspace dry-runs.
- [x] `git diff --check` passed.

This candidate evidence makes no merged-main, live-provider, visual, interactive, fleet, host, or publication claim. No tag, GitHub release, workflow dispatch, protected-environment approval, npm publication, or direct `npm publish` was performed.

## Public body and credit audit

- [x] The descriptive release title is **Pi 1.4.0 compatibility and tool-rendering fixes**.
- [x] `docs/github-release-v0.1.80.md` is the exact public body: it starts with a concise summary and uses `## Highlights`, `## Packages`, and `## Install`; it has no internal title, redundant version heading, `Included docs` section, or `## Contributors` section.
- [x] The audited `v0.1.79`-to-frozen-source range contains only repository-owner commits, GitHub automation committers, and tool identities. After excluding the owner, bots, and tools, no external human contributor qualifies for public credit, so the public body correctly has no contributor section.
- [x] The release notes, public body, announcement, and checklist retain one identical managed package evidence marker containing all ten selected package/version pairs, with no unfilled scaffolding placeholders.

The verified merged-main gate and all later release and publication steps remain future work; the publish checklist records their exact order and leaves them unchecked.

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-last-message","0.1.14"],["@diegopetrucci/pi-code-reviewer","0.1.16"],["@diegopetrucci/pi-contrarian","0.1.18"],["@diegopetrucci/pi-librarian","0.1.21"],["@diegopetrucci/pi-oracle","0.1.33"],["@diegopetrucci/pi-project-mcp-json","0.1.3"],["@diegopetrucci/pi-quiet-tools","0.1.15"],["@diegopetrucci/pi-triage-comments","0.1.17"],["pi-dynamic-context-pruning","0.1.15"],["@diegopetrucci/pi-extensions","0.1.80"]] -->
