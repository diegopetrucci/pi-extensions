# Release notes — v0.1.83

## Public title

**Pi 1.5.0 compatibility, refreshed model rankings, and tighter subagent guards**

## Highlights

- **Pi 1.5.0 compatibility:** The development baseline moves to Pi `1.5.0` ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201); see `docs/pi-1.5.0-validation.md`). `oracle`, `contrarian`, `gnosis`, and `todo` use a package-local `Type.Unsafe`-based enum helper so TypeBox `Static` inference works again with pi-ai 1.5 `StringEnum`; emitted tool schemas are byte-identical. `quiet-tools`, `oracle`, `contrarian`, `librarian`, and `triage-comments` use the host-injected `keyHint` (respecting user keybindings) with a fallback on older hosts. `review` selector dialogs report blocked status (OSC 7501) and support PageUp/PageDown. This is an automated development-compatibility result; it was not verified in live-provider, interactive, or fleet sessions, and the `.pi-fleet-tested-version` markers are unchanged.
- **Refreshed model rankings:** Dead Radius (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`) and Mistral (`mistral-large-2411`) ladder entries are removed, GPT-6.1 Terra ranks after all Sol tiers and before GPT-5.6 Terra, and Kimi K3.1 Pro (then HighSpeed) ranks above K3 ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201)). The only selection change is that `oracle` and `contrarian` pick K3.1 Pro on `kimi-coding`/`moonshotai(-cn)`; `librarian`'s cost-led `kimi-coding` choice changes from `k3-256k` to `kimi-for-coding`. Terra is not added to fast mode.
- **inline-bash failures:** Nonzero exits, killed commands, and Pi 1.5 output-cap truncation are now reported as failures, and truncated output is marked in the prompt ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201)).
- **Provider-billed cost provenance:** `Usage.cost.totalFromProvider` is preserved across all ten subagent usage aggregators and is true only if every record was provider-billed ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201)).
- **Tighter `gh --web` guards:** Grouped short flags such as `-cw`, `-wb`, and `-cw=true` are now blocked in the read-only bash guards of `code-reviewer` and `triage-comments` ([#193](https://github.com/diegopetrucci/pi-extensions/pull/193)). The guard fails closed, so an attached value containing `w` (for example `-Sworkflow`) is also blocked; use the long form (`--search workflow`). The same clause was added to the `diff_summarizer` and `repo_scout` subagents in the umbrella package ([#198](https://github.com/diegopetrucci/pi-extensions/pull/198)).
- **librarian bash guard:** The denylist scan now joins line continuations, drops quotes, and treats leading `NAME=value`, `command`, and `builtin` prefixes as transparent, so quoted or prefixed forms of `find -delete`/`-exec`, `rm`, and `eval` no longer bypass it; `source` and `.` as command words are blocked. The bash timeout is clamped to 1–300 s ([#199](https://github.com/diegopetrucci/pi-extensions/pull/199)).
- **notify config and timeouts:** `notify` validates `notify.json` field by field (invalid fields warn and keep defaults) and notification/sound commands time out after 10 s and count as failed instead of hanging the settled-run handler ([#200](https://github.com/diegopetrucci/pi-extensions/pull/200)).
- **context-inspector flags:** `/context` now rejects unknown `-`/`--` flags (for example `--redct`) with an error and usage text instead of writing and opening an unredacted report ([#196](https://github.com/diegopetrucci/pi-extensions/pull/196)).
- **dynamic-context-pruning defaults:** The `developer`, `diff_summarizer`, `repo_scout`, `test_runner`, and `web_scout` tool results are now protected by default, like the other subagent tools. A user-set `protections.toolNames` replaces the default list ([#195](https://github.com/diegopetrucci/pi-extensions/pull/195)).
- **Umbrella-only subagent cleanups:** The five helper subagents bundled in `@diegopetrucci/pi-extensions` also received fixes ([#198](https://github.com/diegopetrucci/pi-extensions/pull/198)): `test_runner`'s tool description no longer promises it does not change the repository (its no-edit rules are prompt guidance), the `diff_summarizer`/`repo_scout` prompts allow network only through read-only `gh`, unused code was removed, and READMEs state the default `bash` timeouts. These five have no standalone packages.

## Internal notes

- [#194](https://github.com/diegopetrucci/pi-extensions/pull/194) extended `test/sdk-subagent-mcp.test.mjs` to cover the five helper subagents; test-only, not a public highlight.
- [#197](https://github.com/diegopetrucci/pi-extensions/pull/197) updated the Pi 0.84.4 smoke checklist for the PowerShell block (#188) and replaced a stale illustration anti-copy list in `illustrations-to-explain-things` reference docs; docs-only, not a public highlight.
- [#193](https://github.com/diegopetrucci/pi-extensions/pull/193) and [#200](https://github.com/diegopetrucci/pi-extensions/pull/200) are covered in the highlights; [#201](https://github.com/diegopetrucci/pi-extensions/pull/201) also updated `docs/oracle-provider-matrix.md`.
- None of the claims above were verified in live-provider, interactive, visual, or fleet sessions; they follow the PR descriptions, diffs, and automated tests.

## Scope and omissions

Source frozen at `8979c03efbcfa92509d31baf532af76483819f05` (`origin/main`). The exact input `/tmp/pi-extensions-v0.1.83-input.json` selected 20 package/version pairs in dry-run (`/tmp/v0183-dry.json`): 14 existing workspaces, the umbrella, and the five unpublished `0.1.0` packages below.

**Deliberate exclusion of five standalone packages (same decision as v0.1.82).** `@diegopetrucci/pi-developer@0.1.0`, `@diegopetrucci/pi-diff-summarizer@0.1.0`, `@diegopetrucci/pi-repo-scout@0.1.0`, `@diegopetrucci/pi-test-runner@0.1.0`, and `@diegopetrucci/pi-web-scout@0.1.0` are NOT part of this release's standalone publication: they are not on npm and npm trusted publishing is not yet set up for them. `prepare-release` has no exclude option, so they were removed by manual edit from the package lists and from the managed `prepare-release:packages` marker in all four v0.1.83 documents; the marker now lists exactly 15 entries (14 workspaces plus the umbrella, in original order) and is byte-identical across the four documents. Their manifests remain at `0.1.0` and were not changed. **Re-running write mode for v0.1.83 would abort because of this marker mismatch.** `@diegopetrucci/pi-extensions@0.1.83` still bundles these five extensions. Follow-up for a future release: bootstrap each package at `0.1.0` interactively and run `npm trust github` (see `docs/publish-release-helper.md`).

These 14 unchanged workspace packages were omitted and remain at their existing versions: `@diegopetrucci/pi-agent-workflow-audit@0.1.16`, `@diegopetrucci/pi-annotate-git-diff@0.1.15`, `@diegopetrucci/pi-annotate-last-message@0.1.14`, `@diegopetrucci/pi-brrr@0.1.16`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-confirm-destructive@0.1.14`, `@diegopetrucci/pi-context-cap@0.1.16`, `@diegopetrucci/pi-dirty-repo-guard@0.1.13`, `@diegopetrucci/pi-fast@0.1.11`, `@diegopetrucci/pi-git-footer@0.1.13`, `@diegopetrucci/pi-minimal-footer@0.1.26`, `@diegopetrucci/pi-openai-fast@0.1.18`, `@diegopetrucci/pi-permission-gate@0.1.19`, and `@diegopetrucci/pi-project-mcp-json@0.1.4`.

No `.pi-fleet-tested-version` markers were changed by release preparation; no Pi 1.5.0 fleet certification, and no live-provider, visual, interactive, host, or broader runtime certification is claimed.

## Packaging

- `@diegopetrucci/pi-code-reviewer@0.1.18`
- `@diegopetrucci/pi-context-inspector@0.1.18`
- `@diegopetrucci/pi-contrarian@0.1.20`
- `@diegopetrucci/pi-gnosis@0.1.13`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.10`
- `@diegopetrucci/pi-inline-bash@0.1.15`
- `@diegopetrucci/pi-librarian@0.1.23`
- `@diegopetrucci/pi-notify@0.1.21`
- `@diegopetrucci/pi-oracle@0.1.35`
- `@diegopetrucci/pi-quiet-tools@0.1.16`
- `@diegopetrucci/pi-review@0.1.17`
- `@diegopetrucci/pi-todo@0.1.13`
- `@diegopetrucci/pi-triage-comments@0.1.19`
- `pi-dynamic-context-pruning@0.1.16`
- `@diegopetrucci/pi-extensions@0.1.83`

## PRE-COMMIT CANDIDATE validation

The following evidence is for the pre-commit release-preparation candidate in this worktree only (source `8979c03efbcfa92509d31baf532af76483819f05` plus the uncommitted release-prep edits). It is not the future verified merged-main gate. Raw log: `/tmp/v0183-val.log`.

- [x] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed and added 161 packages. The only npm warning was the known `node-domexception@1.0.0` deprecation.
- [x] `npm run preflight:install-state` passed with 128 installed packages and 34 local package entries matching `package-lock.json`; 18 optional packages were not installed.
- [x] `npm run ci` passed: formatting matched 180 files, typechecking passed, and the test summary was 1,378 total, 1,376 passed, 0 failed, 0 cancelled, and 2 skipped (the developer MCP exposure checks "write absent" and "edit absent", skipped because `developer` intentionally exposes write/edit).
- [x] `npm pack --dry-run --ignore-scripts --json` passed; `@diegopetrucci/pi-extensions@0.1.83` reported 186 entries.
- [x] `npm pack --dry-run --ignore-scripts --json --workspaces` passed for all 33 workspace dry-runs (this includes the five excluded packages; dry-run only).
- [x] `git diff --check` passed.

This candidate evidence makes no merged-main, live-provider, visual, interactive, fleet, host, or publication claim. No commit, stage, tag, push, GitHub release, workflow dispatch, protected-environment approval, npm publication, or direct `npm publish` was performed.

## Contributor audit

- [x] Range `v0.1.82..8979c03` contains nine commits (#193, #194, #195, #196, #197, #198, #199, #200, #201), all authored by `diegopetrucci` with The Last Harness as the only co-author trailer. There are no external human contributors, so the public body has no `## Contributors` section.

The verified merged-main gate and all later release and publication steps remain future work; the publish checklist records them unchecked.

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.18"],["@diegopetrucci/pi-context-inspector","0.1.18"],["@diegopetrucci/pi-contrarian","0.1.20"],["@diegopetrucci/pi-gnosis","0.1.13"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.10"],["@diegopetrucci/pi-inline-bash","0.1.15"],["@diegopetrucci/pi-librarian","0.1.23"],["@diegopetrucci/pi-notify","0.1.21"],["@diegopetrucci/pi-oracle","0.1.35"],["@diegopetrucci/pi-quiet-tools","0.1.16"],["@diegopetrucci/pi-review","0.1.17"],["@diegopetrucci/pi-todo","0.1.13"],["@diegopetrucci/pi-triage-comments","0.1.19"],["pi-dynamic-context-pruning","0.1.16"],["@diegopetrucci/pi-extensions","0.1.83"]] -->
