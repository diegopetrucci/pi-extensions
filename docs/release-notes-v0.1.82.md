# Release notes — v0.1.82

## Public title

**New TLH helper subagents, kitty notification fix, and tighter read-only guards**

## Highlights

- **New TLH helper subagents:** The umbrella collection now bundles five new subagent extensions — `developer`, `diff_summarizer`, `repo_scout`, `test_runner`, and `web_scout` — each running as an isolated in-process child agent with MCP and trust handling ([#189](https://github.com/diegopetrucci/pi-extensions/pull/189)). They ship in `@diegopetrucci/pi-extensions` only for this release; standalone packages are not published yet. `developer` and `test_runner` run unrestricted bash by design (documented in their READMEs), and `web_scout` sends queries and URLs to the Exa hosted MCP endpoint.
- **kitty notifications:** `notify` now uses a unique OSC 99 identifier per notification instead of a fixed `i=1`, which kitty could treat as an update to an earlier notification and so suppress new popups ([#191](https://github.com/diegopetrucci/pi-extensions/pull/191), fixes [#190](https://github.com/diegopetrucci/pi-extensions/issues/190)). This is based on kitty's identifier semantics and was not verified in a live kitty session.
- **Tighter read-only guards:** `librarian` now blocks shell command substitution and `find -delete`/`-exec`-style actions ([#181](https://github.com/diegopetrucci/pi-extensions/pull/181)); `triage-comments` now blocks `git remote show`, `gh --web`/`-w`, and `gh api --cache` ([#178](https://github.com/diegopetrucci/pi-extensions/pull/178)); and `agent-workflow-audit`'s `git branch` check now allows more read-only listing options while still blocking creation, deletion, and rename ([#189](https://github.com/diegopetrucci/pi-extensions/pull/189)).
- **Correct models for oracle, contrarian, and code-reviewer:** Model preference patterns are anchored so they no longer select weaker sibling models such as `-flash-lite`, `-codex-spark`, or `-mini` variants ([#180](https://github.com/diegopetrucci/pi-extensions/pull/180)).
- **brrr hardening:** `brrr` validates `brrr.json` field by field (wrong types warn and keep defaults), refuses webhook redirects so a redirect cannot forward the message body off the brrr host, and reads settled-run messages from session entries only ([#182](https://github.com/diegopetrucci/pi-extensions/pull/182)).
- **minimal-footer config:** `minimal-footer` no longer crashes on a `null` config file and warns and uses defaults for other non-object config roots ([#184](https://github.com/diegopetrucci/pi-extensions/pull/184)).
- **permission-gate and PowerShell:** `permission-gate` now rejects named `powershell` tool calls as unsupported on every platform and drops its PowerShell analyzer. PowerShell launched through Bash or other tools is not covered by this policy ([#188](https://github.com/diegopetrucci/pi-extensions/pull/188)).

## Internal notes

- [#179](https://github.com/diegopetrucci/pi-extensions/pull/179) deduplicated theme colors and restored-session cases in the code-reviewer SDK isolation test; test-only, not a public highlight.
- [#185](https://github.com/diegopetrucci/pi-extensions/pull/185) updated smoke checklists to 350k and corrected the `project-mcp-json` trust wording in its README; docs-only, and the reason `project-mcp-json` is bumped. Not a public highlight.
- [#184](https://github.com/diegopetrucci/pi-extensions/pull/184) also makes the `dynamic-context-pruning` benchmark script warn on unreadable directories. That script is not in the package `files` list, so `pi-dynamic-context-pruning@0.1.15` was not selected.
- [#189](https://github.com/diegopetrucci/pi-extensions/pull/189) also changed the `agent-workflow-audit` `git branch` check, which is why that package is bumped.

## Scope and omissions

Source frozen at `247ae59cdb85f6965b9b1913b2c51bb84be72a92` (`origin/main`). The exact input `/tmp/pi-extensions-v0.1.82-input.json` selected 17 package/version pairs in dry-run (`/tmp/v0182-dry.json`): 11 existing workspaces, the umbrella, and the five new `0.1.0` packages below. Dry-run selection of `agent-workflow-audit` (changed by #189) and non-selection of `pi-dynamic-context-pruning` (benchmark-only change in #184, not packaged) matches the recorded diff.

**Deliberate exclusion of five new standalone packages.** By user decision, `@diegopetrucci/pi-developer@0.1.0`, `@diegopetrucci/pi-diff-summarizer@0.1.0`, `@diegopetrucci/pi-repo-scout@0.1.0`, `@diegopetrucci/pi-test-runner@0.1.0`, and `@diegopetrucci/pi-web-scout@0.1.0` are NOT part of this release's standalone publication: they are not on npm and npm trusted publishing is not yet set up for them. `prepare-release` has no exclude option, so they were removed by manual edit from the package lists and from the managed `prepare-release:packages` marker in all four v0.1.82 documents; the marker now lists exactly 12 entries (11 workspaces plus the umbrella, in original order) and is byte-identical across the four documents. Their manifests remain at `0.1.0` and were not changed. **Re-running write mode for v0.1.82 would abort because of this marker mismatch.** `@diegopetrucci/pi-extensions@0.1.82` still bundles these five extensions. Follow-up for a future release: bootstrap each package at `0.1.0` interactively and run `npm trust github` (see `docs/publish-release-helper.md`).

These 17 unchanged workspace packages were omitted and remain at their existing versions: `@diegopetrucci/pi-annotate-git-diff@0.1.15`, `@diegopetrucci/pi-annotate-last-message@0.1.14`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-confirm-destructive@0.1.14`, `@diegopetrucci/pi-context-cap@0.1.16`, `@diegopetrucci/pi-context-inspector@0.1.17`, `@diegopetrucci/pi-dirty-repo-guard@0.1.13`, `pi-dynamic-context-pruning@0.1.15`, `@diegopetrucci/pi-fast@0.1.11`, `@diegopetrucci/pi-git-footer@0.1.13`, `@diegopetrucci/pi-gnosis@0.1.12`, `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`, `@diegopetrucci/pi-inline-bash@0.1.14`, `@diegopetrucci/pi-openai-fast@0.1.18`, `@diegopetrucci/pi-quiet-tools@0.1.15`, `@diegopetrucci/pi-review@0.1.16`, and `@diegopetrucci/pi-todo@0.1.12`.

No `.pi-fleet-tested-version` markers were changed by release preparation; no live-provider, visual, interactive, fleet, host, or broader runtime certification is claimed.

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.16`
- `@diegopetrucci/pi-brrr@0.1.16`
- `@diegopetrucci/pi-code-reviewer@0.1.17`
- `@diegopetrucci/pi-contrarian@0.1.19`
- `@diegopetrucci/pi-librarian@0.1.22`
- `@diegopetrucci/pi-minimal-footer@0.1.26`
- `@diegopetrucci/pi-notify@0.1.20`
- `@diegopetrucci/pi-oracle@0.1.34`
- `@diegopetrucci/pi-permission-gate@0.1.19`
- `@diegopetrucci/pi-project-mcp-json@0.1.4`
- `@diegopetrucci/pi-triage-comments@0.1.18`
- `@diegopetrucci/pi-extensions@0.1.82`

## PRE-COMMIT CANDIDATE validation — completed

The following evidence is for the pre-commit release-preparation candidate in this worktree only (source `247ae59cdb85f6965b9b1913b2c51bb84be72a92` plus the uncommitted release-prep edits), run in the order shown. It is not the future verified merged-main gate. Raw log: `/tmp/v0182-val.log`.

- [x] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed and added 159 packages. The only npm warning was the known `node-domexception@1.0.0` deprecation.
- [x] `npm run preflight:install-state` passed with 126 installed packages and 34 local package entries matching `package-lock.json`; 18 optional packages were not installed.
- [x] `npm run ci` passed: formatting matched 179 files, typechecking passed, and the test summary was 1,210 total, 1,210 passed, 0 failed, 0 cancelled, and 0 skipped.
- [x] `npm pack --dry-run --ignore-scripts --json` passed; the root package reported 186 entries.
- [x] `npm pack --dry-run --ignore-scripts --json --workspaces` passed for all 33 workspace dry-runs (this includes the five excluded packages; dry-run only).
- [x] `git diff --check` passed.

This candidate evidence makes no merged-main, live-provider, visual, interactive, fleet, host, or publication claim. No commit, stage, tag, push, GitHub release, workflow dispatch, protected-environment approval, npm publication, or direct `npm publish` was performed.

## Contributor audit

- [x] Range `v0.1.81..247ae59` contains ten commits (#178, #179, #180, #181, #182, #184, #185, #188, #189, #191), all authored by Diego Petrucci with The Last Harness as the only co-author trailer. Verified with `git log` and `gh pr view` (all authored by `diegopetrucci`). There are no external human contributors, so the public body has no `## Contributors` section.

The verified merged-main gate and all later release and publication steps remain future work; the publish checklist records them unchecked.

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.16"],["@diegopetrucci/pi-brrr","0.1.16"],["@diegopetrucci/pi-code-reviewer","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.19"],["@diegopetrucci/pi-librarian","0.1.22"],["@diegopetrucci/pi-minimal-footer","0.1.26"],["@diegopetrucci/pi-notify","0.1.20"],["@diegopetrucci/pi-oracle","0.1.34"],["@diegopetrucci/pi-permission-gate","0.1.19"],["@diegopetrucci/pi-project-mcp-json","0.1.4"],["@diegopetrucci/pi-triage-comments","0.1.18"],["@diegopetrucci/pi-extensions","0.1.82"]] -->
