# Release notes — v0.1.81

## Public title

**Anthropic Fast fix for Claude Opus 5/5.5 and bounded shell checks**

## Highlights

- **Anthropic Fast on Claude Opus 5/5.5 ([#186](https://github.com/diegopetrucci/pi-extensions/pull/186)):** Fast mode no longer fails with `400 output_config: Extra inputs are not permitted`; the `fast-mode-2026-02-01` beta is appended to Pi's computed betas list instead of replacing the `anthropic-beta` header. Credit: [@denusklo](https://github.com/denusklo).
- **Bounded dirty-repo checks ([#183](https://github.com/diegopetrucci/pi-extensions/pull/183)):** `dirty-repo-guard` bounds `git status` with a 15-second timeout and the session abort signal; a killed check is not treated as a clean tree.
- **Cancellable inline bash ([#183](https://github.com/diegopetrucci/pi-extensions/pull/183)):** `inline-bash` forwards the abort signal so cancelling kills the expansion instead of waiting for the 30-second timeout.

## Internal notes

- [#177](https://github.com/diegopetrucci/pi-extensions/pull/177) updated internal release tooling and policy (agent-authorized trusted OIDC publishing gated on explicit user release authorization, with the protected-environment safeguards retained). It is intentionally not a public highlight and changes no published package.

## Scope and omissions

Source frozen at `b1ce3ce42e10c4a94100536c62f1f906cadf5a80` (`HEAD` == `origin/main`). The exact input `/tmp/pi-extensions-v0.1.81-input.json` selected exactly the four package/version pairs below in dry-run and write mode. These 25 workspace packages were omitted and remain at their existing versions: `@diegopetrucci/pi-agent-workflow-audit@0.1.15`, `@diegopetrucci/pi-annotate-git-diff@0.1.15`, `@diegopetrucci/pi-annotate-last-message@0.1.14`, `@diegopetrucci/pi-brrr@0.1.15`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-code-reviewer@0.1.16`, `@diegopetrucci/pi-confirm-destructive@0.1.14`, `@diegopetrucci/pi-context-cap@0.1.16`, `@diegopetrucci/pi-context-inspector@0.1.17`, `@diegopetrucci/pi-contrarian@0.1.18`, `pi-dynamic-context-pruning@0.1.15`, `@diegopetrucci/pi-git-footer@0.1.13`, `@diegopetrucci/pi-gnosis@0.1.12`, `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`, `@diegopetrucci/pi-librarian@0.1.21`, `@diegopetrucci/pi-minimal-footer@0.1.25`, `@diegopetrucci/pi-notify@0.1.19`, `@diegopetrucci/pi-openai-fast@0.1.18`, `@diegopetrucci/pi-oracle@0.1.33`, `@diegopetrucci/pi-permission-gate@0.1.18`, `@diegopetrucci/pi-project-mcp-json@0.1.3`, `@diegopetrucci/pi-quiet-tools@0.1.15`, `@diegopetrucci/pi-review@0.1.16`, `@diegopetrucci/pi-todo@0.1.12`, and `@diegopetrucci/pi-triage-comments@0.1.17`.

No fleet markers were changed; no live-provider, visual, interactive, fleet, host, or broader runtime certification is claimed.

## Packaging

- `@diegopetrucci/pi-dirty-repo-guard@0.1.13`
- `@diegopetrucci/pi-fast@0.1.11`
- `@diegopetrucci/pi-inline-bash@0.1.14`
- `@diegopetrucci/pi-extensions@0.1.81`

## PRE-COMMIT CANDIDATE validation — completed

The following evidence is for the pre-commit release-preparation candidate in this worktree only (source `b1ce3ce42e10c4a94100536c62f1f906cadf5a80` plus the uncommitted release-prep edits), run in the order shown. It is not the future verified merged-main gate. Raw log: `/tmp/v0181-val.log`.

- [x] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed and added 154 packages. The only npm warning was the known `node-domexception@1.0.0` deprecation.
- [x] `npm run preflight:install-state` passed with 126 installed packages and 29 local package entries matching `package-lock.json`; 18 optional packages were not installed.
- [x] `npm run ci` passed: formatting matched 165 files, typechecking passed, and the test summary was 1,163 total, 1,162 passed, 0 failed, 0 cancelled, and 1 skipped.
- [x] `npm pack --dry-run --ignore-scripts --json` passed; the root package reported 167 entries.
- [x] `npm pack --dry-run --ignore-scripts --json --workspaces` passed for all 28 workspace dry-runs.
- [x] `git diff --check` passed.

This candidate evidence makes no merged-main, live-provider, visual, interactive, fleet, host, or publication claim. No commit, stage, tag, push, GitHub release, workflow dispatch, protected-environment approval, npm publication, or direct `npm publish` was performed.

## Contributor audit

- [x] Range `v0.1.80..b1ce3ce` contains three commits: #177 and #183 are owner-only (Diego Petrucci, GitHub committer, The Last Harness tool trailer); #186 is authored by Den Kong ([@denusklo](https://github.com/denusklo)), with co-authors Diego Petrucci and The Last Harness. Verified with `git log` and `gh pr view 186`.
- [x] The public body therefore has a `## Contributors` section with exactly one entry: @denusklo for #186.

The verified merged-main gate and all later release and publication steps remain future work; the publish checklist records them unchecked.

<!-- prepare-release:packages [["@diegopetrucci/pi-dirty-repo-guard","0.1.13"],["@diegopetrucci/pi-fast","0.1.11"],["@diegopetrucci/pi-inline-bash","0.1.14"],["@diegopetrucci/pi-extensions","0.1.81"]] -->
