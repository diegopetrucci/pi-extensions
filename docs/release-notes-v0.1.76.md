# Release notes — v0.1.76

## Highlights

- **Collection catch-up for v0.1.75.** `@diegopetrucci/pi-extensions@0.1.75` was tagged and given a GitHub release but never published: the trusted publish workflow requires `main` to match the tag, and 17 PRs (#110–#132) merged first. This release publishes the collection with the v0.1.75 features (Ultrafast mode in `fast`, the new `project-mcp-json` extension). `pi-fast@0.1.7` and `pi-project-mcp-json@0.1.0` were published from v0.1.75.
- **`git-footer`** ([#110](https://github.com/diegopetrucci/pi-extensions/pull/110)): untrusted projects, and contexts without `isProjectTrusted`, start no poll timer and run no `git` or `gh pr view`; `git status` runs with `-c core.fsmonitor=false`. The unused `@earendil-works/pi-tui` peer is dropped.
- **`inline-bash`** ([#130](https://github.com/diegopetrucci/pi-extensions/pull/130)): command output is inserted as raw text, so `$&`, `$$`, `` $` ``, `$'` and later `!{...}` tokens in output are no longer interpreted.
- **`oracle` and `contrarian`** ([#115](https://github.com/diegopetrucci/pi-extensions/pull/115)): stronger model-preference patterns are anchored so weaker siblings (`gpt-5.4-mini`, `gemini-2.5-flash-lite`, and others) can be selected when available.
- **`gnosis`** ([#120](https://github.com/diegopetrucci/pi-extensions/pull/120)): the brew/go install hint is shown only for definite missing-binary failures (spawn `ENOENT`, `command not found`, exit 127).
- **`claude-fast` and `openai-fast`** ([#112](https://github.com/diegopetrucci/pi-extensions/pull/112)): retired to session-start deprecation notices that do not read config, register commands, or inject Fast fields; on startup they clear leftover footer status and the `fast-mode-2026-02-01` header. The collection still loads only the unified `fast` extension.
- **`review`** ([#117](https://github.com/diegopetrucci/pi-extensions/pull/117), [#128](https://github.com/diegopetrucci/pi-extensions/pull/128)): docs describe this fork; one pull-request checkout helper with a single pending-changes check; shared searchable select.
- **`annotate-git-diff`, `annotate-last-message`, `triage-comments`, `code-reviewer`** ([#113](https://github.com/diegopetrucci/pi-extensions/pull/113)): user-facing errors and prompts use the package or command name; requirement docs corrected.
- **Cleanup** ([#111](https://github.com/diegopetrucci/pi-extensions/pull/111), [#116](https://github.com/diegopetrucci/pi-extensions/pull/116), [#118](https://github.com/diegopetrucci/pi-extensions/pull/118), [#119](https://github.com/diegopetrucci/pi-extensions/pull/119), [#121](https://github.com/diegopetrucci/pi-extensions/pull/121), [#123](https://github.com/diegopetrucci/pi-extensions/pull/123), [#124](https://github.com/diegopetrucci/pi-extensions/pull/124), [#131](https://github.com/diegopetrucci/pi-extensions/pull/131), [#132](https://github.com/diegopetrucci/pi-extensions/pull/132)): unused helpers, exports, and dead code removed across packages, with no intended behavior change.
- **Formatting** ([#125](https://github.com/diegopetrucci/pi-extensions/pull/125)): source and tests adopt Oxfmt (`npm run format:check` is part of `npm run ci`); this reformats every package, so packages with no other change (`dirty-repo-guard`, `minimal-footer`, `quiet-tools`, `todo`) also get patch releases.

Fleet markers are unchanged (27 at Pi `0.84.4`, `project-mcp-json` at `1.0.0`); no new compatibility certification is claimed.

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.13`
- `@diegopetrucci/pi-annotate-git-diff@0.1.13`
- `@diegopetrucci/pi-annotate-last-message@0.1.11`
- `@diegopetrucci/pi-brrr@0.1.15`
- `@diegopetrucci/pi-claude-fast@0.1.16`
- `@diegopetrucci/pi-code-reviewer@0.1.13`
- `@diegopetrucci/pi-confirm-destructive@0.1.13`
- `@diegopetrucci/pi-context-cap@0.1.13`
- `@diegopetrucci/pi-context-inspector@0.1.16`
- `@diegopetrucci/pi-contrarian@0.1.15`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.12`
- `@diegopetrucci/pi-fast@0.1.8`
- `@diegopetrucci/pi-git-footer@0.1.12`
- `@diegopetrucci/pi-gnosis@0.1.12`
- `@diegopetrucci/pi-inline-bash@0.1.12`
- `@diegopetrucci/pi-librarian@0.1.18`
- `@diegopetrucci/pi-minimal-footer@0.1.23`
- `@diegopetrucci/pi-notify@0.1.19`
- `@diegopetrucci/pi-openai-fast@0.1.18`
- `@diegopetrucci/pi-oracle@0.1.30`
- `@diegopetrucci/pi-permission-gate@0.1.16`
- `@diegopetrucci/pi-project-mcp-json@0.1.1`
- `@diegopetrucci/pi-quiet-tools@0.1.14`
- `@diegopetrucci/pi-review@0.1.15`
- `@diegopetrucci/pi-todo@0.1.12`
- `@diegopetrucci/pi-triage-comments@0.1.14`
- `pi-dynamic-context-pruning@0.1.12`
- `@diegopetrucci/pi-extensions@0.1.76`

## Validation

- `npm ci` and `npm run preflight:install-state` passed (242 installed packages, 29 local package entries).
- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.76-input.json` selected exactly 28 packages (27 workspaces plus the collection), matching `git diff v0.1.75..main` per package; `--write` updated manifests and lock metadata and created the four v0.1.76 documents.
- `npm run ci` passed: 934 tests, 933 passed, 0 failed, 1 skipped.
- `npm pack --dry-run` passed for all 29 packages; the collection tarball contains no `docs/`, `.tickets`, `.npmrc`, or `*.tgz`.
- `git diff --check` passed.
- `npm audit` still reports one high-severity upstream `brace-expansion` finding nested under `@earendil-works/pi-coding-agent`; no remediation is claimed.

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.13"],["@diegopetrucci/pi-annotate-git-diff","0.1.13"],["@diegopetrucci/pi-annotate-last-message","0.1.11"],["@diegopetrucci/pi-brrr","0.1.15"],["@diegopetrucci/pi-claude-fast","0.1.16"],["@diegopetrucci/pi-code-reviewer","0.1.13"],["@diegopetrucci/pi-confirm-destructive","0.1.13"],["@diegopetrucci/pi-context-cap","0.1.13"],["@diegopetrucci/pi-context-inspector","0.1.16"],["@diegopetrucci/pi-contrarian","0.1.15"],["@diegopetrucci/pi-dirty-repo-guard","0.1.12"],["@diegopetrucci/pi-fast","0.1.8"],["@diegopetrucci/pi-git-footer","0.1.12"],["@diegopetrucci/pi-gnosis","0.1.12"],["@diegopetrucci/pi-inline-bash","0.1.12"],["@diegopetrucci/pi-librarian","0.1.18"],["@diegopetrucci/pi-minimal-footer","0.1.23"],["@diegopetrucci/pi-notify","0.1.19"],["@diegopetrucci/pi-openai-fast","0.1.18"],["@diegopetrucci/pi-oracle","0.1.30"],["@diegopetrucci/pi-permission-gate","0.1.16"],["@diegopetrucci/pi-project-mcp-json","0.1.1"],["@diegopetrucci/pi-quiet-tools","0.1.14"],["@diegopetrucci/pi-review","0.1.15"],["@diegopetrucci/pi-todo","0.1.12"],["@diegopetrucci/pi-triage-comments","0.1.14"],["pi-dynamic-context-pruning","0.1.12"],["@diegopetrucci/pi-extensions","0.1.76"]] -->
