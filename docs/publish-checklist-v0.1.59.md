# Publish checklist — v0.1.59

## Target package versions

- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.6`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.6`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.4`
- [x] `@diegopetrucci/pi-brrr@0.1.9`
- [x] `@diegopetrucci/pi-claude-fast@0.1.9`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.4`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.7`
- [x] `@diegopetrucci/pi-context-cap@0.1.6`
- [x] `@diegopetrucci/pi-context-inspector@0.1.8`
- [x] `@diegopetrucci/pi-contrarian@0.1.6`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.6`
- [x] `@diegopetrucci/pi-git-footer@0.1.5`
- [x] `@diegopetrucci/pi-gnosis@0.1.6`
- [x] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.4`
- [x] `@diegopetrucci/pi-inline-bash@0.1.6`
- [x] `@diegopetrucci/pi-librarian@0.1.11`
- [x] `@diegopetrucci/pi-notify@0.1.12`
- [x] `@diegopetrucci/pi-openai-fast@0.1.11`
- [x] `@diegopetrucci/pi-oracle@0.1.21`
- [x] `@diegopetrucci/pi-permission-gate@0.1.9`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.7`
- [x] `@diegopetrucci/pi-review@0.1.9`
- [x] `@diegopetrucci/pi-todo@0.1.6`
- [x] `@diegopetrucci/pi-triage-comments@0.1.7`
- [x] `pi-dynamic-context-pruning@0.1.2`
- [x] `@diegopetrucci/pi-extensions@0.1.59`

## Validation evidence

- [x] plain `npm ci` completed before all other validation, reinstalling the lockfile state and surfacing the expected pending allow-scripts warnings plus the same single moderate nested `protobufjs` audit finding
- [x] `npm run preflight:install-state` passed: `Package state matches package-lock.json (247 installed packages and 27 local package entries checked).`
- [x] deterministic `prepare-release` dry-run was rerun from an explicit JSON input created outside the repo and selected exactly 26 packages after the marker pre-apply (root + 25 tarball-different standalones; `minimal-footer` excluded)
- [x] selected-target consistency check confirmed all 26 selected manifests and matching local `package-lock.json` entries already match the v0.1.59 targets
- [x] `npm run ci` passed with 505/505 tests
- [x] `node --test test/librarian-command-config-cache.test.mjs test/librarian-model-selection.test.mjs` passed with 15/15 tests
- [x] `node --test test/provider-model-preferences-catalog.test.mjs` passed with 4/4 tests
- [x] `node --test test/tarball-runtime-smoke.test.mjs` passed with 1/1 tests, confirming publishable tarballs install offline and Pi loads their declared runtime entries
- [x] `npm audit --omit=dev` was run and reported the expected sole moderate upstream finding: nested `protobufjs@7.6.4` under published `@earendil-works/pi-coding-agent`
- [x] `npm audit --omit=dev --audit-level=high` exited 0; the remaining finding is moderate-only
- [x] all 27 `.pi-fleet-tested-version` files read `0.81.1`
- [x] current extension README links use canonical `earendil-works/pi` URLs: `grep -R "earendil-works/pi-mono" extensions/*/README.md` returned no matches, and current copied-example READMEs point at `github.com/earendil-works/pi/blob/main/...`
- [x] exact `npm view <name>@<target> version` checks confirmed all 26 selected target versions remain unpublished
- [x] `git diff --check` passed
- [x] `git diff --cached --name-only` produced no output
- [x] `npm pack --dry-run --json` and `npm publish --dry-run --ignore-scripts --access public` passed for the root package plus all 25 selected standalone targets; aggregate dry-run totals were `packages=26`, `totalFiles=299`, `totalTarballBytes=2423934`, `totalUnpackedBytes=4056920`, `suspiciousTotal=0`, and `publishDryRunFailures=0`
- [x] `find . -name '*.tgz' -o -name '*.npmrc' | sort` produced no output

## Dry-run package contents review

| Package | Result |
| --- | --- |
| `@diegopetrucci/pi-extensions@0.1.59` | `156` files, `1264563` byte tarball, `2123152` byte unpacked; expected root runtime bundle only (`LICENSE`, `README.md`, preview assets, `.pi-fleet-tested-version`, and publishable extension runtime files) |
| `@diegopetrucci/pi-agent-workflow-audit@0.1.6` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-annotate-git-diff@0.1.6` | `14` files; runtime TS sources, README, metadata, and web assets only |
| `@diegopetrucci/pi-annotate-last-message@0.1.4` | `12` files; runtime TS/UI sources, README, metadata, and web assets only |
| `@diegopetrucci/pi-brrr@0.1.9` | `5` files; `.pi-fleet-tested-version`, `README.md`, `brrr.example.json`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-claude-fast@0.1.9` | `5` files; `.pi-fleet-tested-version`, `README.md`, `claude-fast.example.json`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-code-reviewer@0.1.4` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-confirm-destructive@0.1.7` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-context-cap@0.1.6` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-context-inspector@0.1.8` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-contrarian@0.1.6` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-dirty-repo-guard@0.1.6` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-git-footer@0.1.5` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-gnosis@0.1.6` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-illustrations-to-explain-things@0.1.4` | `24` files; runtime TS sources, README, metadata, and compressed calibration assets only |
| `@diegopetrucci/pi-inline-bash@0.1.6` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-librarian@0.1.11` | `4` files, `20612` byte tarball, `72912` byte unpacked; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-notify@0.1.12` | `5` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `notify.example.json`, `package.json` |
| `@diegopetrucci/pi-openai-fast@0.1.11` | `5` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `openai-fast.example.json`, `package.json` |
| `@diegopetrucci/pi-oracle@0.1.21` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-permission-gate@0.1.9` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-quiet-tools@0.1.7` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-review@0.1.9` | `5` files; `.pi-fleet-tested-version`, `LICENSE`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-todo@0.1.6` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-triage-comments@0.1.7` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `pi-dynamic-context-pruning@0.1.2` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |

No dry-run package file list included `.tickets/`, release-doc files under `docs/`, any `*.tgz` artifact path, or any `.npmrc` file.

## Agent-safe follow-up actions

- [ ] commit release prep changes outside this tool
- [ ] push the release-prep branch
- [ ] open PR targeting `main`
- [ ] after merge, tag `v0.1.59` on `main`
- [ ] push tag `v0.1.59`
- [ ] create the GitHub release using `docs/github-release-v0.1.59.md`

## Human-only release actions

- [ ] publish selected packages manually (this tool cannot publish)

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.6"],["@diegopetrucci/pi-annotate-git-diff","0.1.6"],["@diegopetrucci/pi-annotate-last-message","0.1.4"],["@diegopetrucci/pi-brrr","0.1.9"],["@diegopetrucci/pi-claude-fast","0.1.9"],["@diegopetrucci/pi-code-reviewer","0.1.4"],["@diegopetrucci/pi-confirm-destructive","0.1.7"],["@diegopetrucci/pi-context-cap","0.1.6"],["@diegopetrucci/pi-context-inspector","0.1.8"],["@diegopetrucci/pi-contrarian","0.1.6"],["@diegopetrucci/pi-dirty-repo-guard","0.1.6"],["@diegopetrucci/pi-git-footer","0.1.5"],["@diegopetrucci/pi-gnosis","0.1.6"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.4"],["@diegopetrucci/pi-inline-bash","0.1.6"],["@diegopetrucci/pi-librarian","0.1.11"],["@diegopetrucci/pi-notify","0.1.12"],["@diegopetrucci/pi-openai-fast","0.1.11"],["@diegopetrucci/pi-oracle","0.1.21"],["@diegopetrucci/pi-permission-gate","0.1.9"],["@diegopetrucci/pi-quiet-tools","0.1.7"],["@diegopetrucci/pi-review","0.1.9"],["@diegopetrucci/pi-todo","0.1.6"],["@diegopetrucci/pi-triage-comments","0.1.7"],["pi-dynamic-context-pruning","0.1.2"],["@diegopetrucci/pi-extensions","0.1.59"]] -->
