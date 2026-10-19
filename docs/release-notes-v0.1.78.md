# Release notes — v0.1.78

This is a release-preparation restart from the clean `restart-v0.1.78` source head. It carries forward the v0.1.77 feature set and adds the 300k context defaults from #157; it does not change the v0.1.77 source, history, tag, or release metadata.

## Highlights

- **MCP-aware subagents (carried forward from v0.1.77):** `agent-workflow-audit`, `code-reviewer`, `contrarian`, `librarian`, `oracle`, and `triage-comments` can use configured MCP and tool-search resources on supported hosts, with trust/cwd guards, evidence-limited prompts, and cleanup on exit ([#136](https://github.com/diegopetrucci/pi-extensions/pull/136), [#138](https://github.com/diegopetrucci/pi-extensions/pull/138)).
- **Always-on quiet tools (carried forward from v0.1.77):** `quiet-tools` keeps collapsed built-in and `mcp__*` rows compact while preserving native expanded output, timing, errors, images, and model-visible results. Rendering is always on for supported hosts; there is no opt-out setting, environment variable, or persistence mechanism. In export-style contexts, an export may omit a native `write`-call preview as an accepted tradeoff; native expanded result rendering remains available in the TUI, including native error text, timing, and image handling. `/quiet-tools` and `/quiet-tools status` are read-only, the former on/off/enable/disable/toggle controls are gone, edit self-frame and padding behavior is fixed, and collapsed failures keep a visible `[failed]` marker ([#136](https://github.com/diegopetrucci/pi-extensions/pull/136), [#141](https://github.com/diegopetrucci/pi-extensions/pull/141), [#149](https://github.com/diegopetrucci/pi-extensions/pull/149)).
- **Git command safety ([#137](https://github.com/diegopetrucci/pi-extensions/pull/137)):** `code-reviewer` permits `git branch --contains` while continuing to block `git blame --contents`, and safe Git commands suppress commit signatures.
- **Pi-parity guarded paths ([#148](https://github.com/diegopetrucci/pi-extensions/pull/148)):** `agent-workflow-audit`, `code-reviewer`, `librarian`, `permission-gate`, and `triage-comments` resolve cwd-relative, `~`, and encoded `file://` paths like Pi. The four subagent read guards (`agent-workflow-audit`, `code-reviewer`, `librarian`, and `triage-comments`) also check fallback variants and allow canonical roots. Unsafe resolution fails closed.
- **300k context defaults ([#157](https://github.com/diegopetrucci/pi-extensions/pull/157)):** `context-cap` now uses a 300,000-token effective context cap by default, and `minimal-footer` now uses a 300,000-token `DUMB ZONE` threshold by default. With the default 16,384-token reserve, the context-cap auto-compaction threshold is approximately 283,616 tokens for models larger than 300k.
- **Reliability, safety, and maintenance:** the v0.1.77 baseline also includes workflow-audit timeout/live-preview handling, librarian MCP disposal, dynamic-context-pruning bookkeeping, triage-comments Git Bash safeguards, annotation and code-reviewer cleanup, shared Azure preferences ([#140](https://github.com/diegopetrucci/pi-extensions/pull/140)), and trust/configuration documentation fixes ([#114](https://github.com/diegopetrucci/pi-extensions/pull/114), [#126](https://github.com/diegopetrucci/pi-extensions/pull/126), [#127](https://github.com/diegopetrucci/pi-extensions/pull/127), [#129](https://github.com/diegopetrucci/pi-extensions/pull/129), [#134](https://github.com/diegopetrucci/pi-extensions/pull/134), [#139](https://github.com/diegopetrucci/pi-extensions/pull/139), [#142](https://github.com/diegopetrucci/pi-extensions/pull/142), [#143](https://github.com/diegopetrucci/pi-extensions/pull/143), [#144](https://github.com/diegopetrucci/pi-extensions/pull/144), [#145](https://github.com/diegopetrucci/pi-extensions/pull/145)).

This preparation selects exactly 20 package/version pairs. The nine omitted workspace targets remain outside this scope: `@diegopetrucci/pi-brrr@0.1.15`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-context-inspector@0.1.16`, `@diegopetrucci/pi-git-footer@0.1.12`, `@diegopetrucci/pi-gnosis@0.1.12`, `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`, `@diegopetrucci/pi-notify@0.1.19`, `@diegopetrucci/pi-openai-fast@0.1.18`, and `@diegopetrucci/pi-review@0.1.15`.

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.14`
- `@diegopetrucci/pi-annotate-git-diff@0.1.14`
- `@diegopetrucci/pi-annotate-last-message@0.1.12`
- `@diegopetrucci/pi-code-reviewer@0.1.14`
- `@diegopetrucci/pi-confirm-destructive@0.1.14`
- `@diegopetrucci/pi-context-cap@0.1.15`
- `@diegopetrucci/pi-contrarian@0.1.16`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.12`
- `@diegopetrucci/pi-fast@0.1.9`
- `@diegopetrucci/pi-inline-bash@0.1.13`
- `@diegopetrucci/pi-librarian@0.1.19`
- `@diegopetrucci/pi-minimal-footer@0.1.24`
- `@diegopetrucci/pi-oracle@0.1.31`
- `@diegopetrucci/pi-permission-gate@0.1.17`
- `@diegopetrucci/pi-project-mcp-json@0.1.2`
- `@diegopetrucci/pi-quiet-tools@0.1.14`
- `@diegopetrucci/pi-todo@0.1.12`
- `@diegopetrucci/pi-triage-comments@0.1.15`
- `pi-dynamic-context-pruning@0.1.13`
- `@diegopetrucci/pi-extensions@0.1.78`

## Validation evidence

### Prior evidence (before the frozen source head; not fresh for v0.1.78)

- Historical v0.1.77 preparation and quiet-tools host/visual evidence remain dated prior evidence. They are not presented as validation of the merged #157 source or of this v0.1.78 preparation.
- The existing quiet-tools source and README hashes are retained as an explicit comparison below; no new fleet certification is implied. Quiet-tools remains at Pi `1.1.0`, project-mcp-json remains at Pi `1.0.0`, and all other fleet markers remain unchanged.

### Current preparation — 2026-10-12

- The source head was `fcbc7e1215c917c5068da7d31f910016983aae21` on `restart-v0.1.78`, and `origin/main` matched that frozen head before writes.
- The accepted `/tmp/tlhf-fe8g.9vJV57/release-input.json` was used exactly. Deterministic write mode selected 20 targets, verified their exact target versions were unpublished, synchronized `package-lock.json`, and created these four documents.
- The exact locked dependency refresh `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed once. npm reported 156 packages added and one deprecation warning for `node-domexception@1.0.0`.
- The contributor audit covers 21 commits in `v0.1.76..fcbc7e1215c917c5068da7d31f910016983aae21`. It found no eligible external human contributors after excluding the repository owner, tool coauthors, and GitHub automation; no `Contributors` section is included.
- The narrow post-write checks passed: four managed markers matched the accepted 20-pair evidence; all 20 versions and the lockfile were coherent; the nine omissions, dependency metadata, and all 29 fleet markers were unchanged; the exact eight-file scope and no-staged-files state held; and tracked/new-document whitespace checks passed. The unchanged quiet-tools SHA-256 values are `extensions/quiet-tools/index.ts` = `5ff96a197c87850c9875b11547fb7d98dc3cbab8d57949771ea0b3378f4fa9fd` and `extensions/quiet-tools/README.md` = `6b96857af46737c7340d6af900146d9026bdcb8a9e787c9c24c014ff5ccb26f3`. The candidate evidence below is pre-commit only and does not certify the merged final tree.

### Latest pre-commit candidate validation — 2026-10-12

- The six-command pre-commit candidate validation passed: `npm run ci` reported 1,148 passed, 0 failed, and 1 skipped (1,149 total); the scoped native checks against a Pi `1.1.0` host passed for `@diegopetrucci/pi-quiet-tools@0.1.14`; `npm pack --dry-run --ignore-scripts --json --workspace extensions/quiet-tools` reported 4 files; the root `npm pack --dry-run --ignore-scripts --json` reported 167 files for `@diegopetrucci/pi-extensions@0.1.78`; `npm pack --dry-run --ignore-scripts --json --workspaces` covered all 28 workspace dry-runs; and `git diff --check` passed. The original raw CI log is `/var/folders/nq/fkrbfck57y91r169_934fxb80000gn/T/pi-bash-7f01387a37c30d2e.log`.
- The separate human quiet-tools regular/fullscreen visual pass remains prior evidence only; this candidate adds no fresh visual, fleet, or publication claim.

### Future merged-main final validation — not run here

Before any tag or release creation, a separately authorized verified-`main` gate must pass these six commands, in order:

- `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`
- `npm run preflight:install-state`
- `node scripts/check-quiet-tools-runtime.mjs --pi-package-dir "/absolute/path/to/pi-1.1.0/node_modules/@earendil-works/pi-coding-agent"`
- `npm pack --dry-run --ignore-scripts --json --workspace extensions/quiet-tools`
- `npm pack --dry-run --ignore-scripts --json`
- `npm pack --dry-run --ignore-scripts --json --workspaces`

The quoted `/absolute/path/to/pi-1.1.0/node_modules/@earendil-works/pi-coding-agent` value is a portable placeholder: replace it with the absolute installed package directory for the exact `@earendil-works/pi-coding-agent` 1.1.0 host, then verify that the checker reports `host=1.1.0`. Do not point it at a Pi agent/profile configuration directory, the collection development baseline, or another Pi version. The existing checker runs its offline, isolated runtime check; this gate makes no provider, TUI, profile, live-MCP, fresh visual, or fleet-certification claim.

No fresh final-validation claim is made until all six commands actually pass on the verified merged `main` tree.

The managed release marker follows:

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.14"],["@diegopetrucci/pi-annotate-git-diff","0.1.14"],["@diegopetrucci/pi-annotate-last-message","0.1.12"],["@diegopetrucci/pi-code-reviewer","0.1.14"],["@diegopetrucci/pi-confirm-destructive","0.1.14"],["@diegopetrucci/pi-context-cap","0.1.15"],["@diegopetrucci/pi-contrarian","0.1.16"],["@diegopetrucci/pi-dirty-repo-guard","0.1.12"],["@diegopetrucci/pi-fast","0.1.9"],["@diegopetrucci/pi-inline-bash","0.1.13"],["@diegopetrucci/pi-librarian","0.1.19"],["@diegopetrucci/pi-minimal-footer","0.1.24"],["@diegopetrucci/pi-oracle","0.1.31"],["@diegopetrucci/pi-permission-gate","0.1.17"],["@diegopetrucci/pi-project-mcp-json","0.1.2"],["@diegopetrucci/pi-quiet-tools","0.1.14"],["@diegopetrucci/pi-todo","0.1.12"],["@diegopetrucci/pi-triage-comments","0.1.15"],["pi-dynamic-context-pruning","0.1.13"],["@diegopetrucci/pi-extensions","0.1.78"]] -->
