# Publish checklist — v0.1.75

## Scope

- `fast` adds session-only OpenAI Ultrafast mode (`/ultrafast`, `/fast ultrafast`) for `gpt-6-astra` on the direct OpenAI Responses API with API-key auth; no live or paid provider calls were made.
- New `project-mcp-json` extension loads `<cwd>/.mcp.json` via Pi's built-in MCP support, gated by Pi project-trust semantics; requires Pi 1.0 or later.
- Existing fleet markers are unchanged at `0.84.4`; the new package's marker is `1.0.0`. No new fleet compatibility certification is claimed.
- No external contributors in `v0.1.74..main` (#106, #107, #108 are by the repository owner with The Last Harness co-author trailers); the `## Contributors` section is omitted.

## Target package versions

- [x] `@diegopetrucci/pi-fast@0.1.7`
- [x] `@diegopetrucci/pi-project-mcp-json@0.1.0` (new package)
- [x] `@diegopetrucci/pi-extensions@0.1.75`

## Validation evidence

- [x] `npm ci` completed before validation; no dependency remediation was applied
- [x] `npm run preflight:install-state` passed with 240 installed packages and 29 local package entries checked
- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.75-input.json` passed in dry-run mode and selected exactly the three target packages in dependency order
- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.75-input.json --write` updated `package.json`, `extensions/fast/package.json`, and `package-lock.json`, and created the four v0.1.75 documents without changing fleet markers
- [x] `npm run ci` passed: 936 tests, 935 passed, 0 failed, 1 skipped
- [x] `npm pack --dry-run --json --ignore-scripts` passed for all 29 packages; `@diegopetrucci/pi-project-mcp-json@0.1.0` packs 5 files (`.pi-fleet-tested-version`, `README.md`, `config.ts`, `index.ts`, `package.json`)
- [x] `git diff --check` passed
- [x] no staged files (`git diff --cached --name-only` produced no output)
- [x] Raw `npm audit` reports one high-severity vulnerability at nested `brace-expansion` (`GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`) under `@earendil-works/pi-coding-agent`; this is not a clean audit and no remediation is claimed
- [x] Human approval was recorded to carry forward the existing upstream `brace-expansion` audit exception for v0.1.75; the raw audit remains failed and non-clean, with no remediation or consumer-protection claim

## Public GitHub release

- [ ] Create the GitHub release from `docs/github-release-v0.1.75.md` with the exact public title **OpenAI Ultrafast mode and project .mcp.json support**
- [ ] Keep `docs/github-release-v0.1.75.md` as the exact public release body

## Agent-safe follow-up actions

- [x] seek explicit approval before creating the release commit
- [ ] commit the release preparation changes on `release/v0.1.75`
- [ ] push the release branch
- [ ] open a pull request from `release/v0.1.75` targeting `main`
- [ ] wait for CI and CodeQL to pass
- [ ] merge the pull request into `main`
- [ ] tag the merged `main` commit as `v0.1.75`
- [ ] push tag `v0.1.75`
- [ ] create a non-draft GitHub release with the exact title **OpenAI Ultrafast mode and project .mcp.json support**, using `docs/github-release-v0.1.75.md` as the exact body
- [ ] run `scripts/publish-release.mjs v0.1.75 --dry-run`

## Human-only release actions

- [ ] Bootstrap the new package: trusted publishing cannot be configured until `@diegopetrucci/pi-project-mcp-json` exists on npm. From a clean checkout of tag `v0.1.75`, publish `extensions/project-mcp-json` interactively (`npm publish --access public --ignore-scripts`), then run `npm trust github @diegopetrucci/pi-project-mcp-json --file publish.yml --repository diegopetrucci/pi-extensions --environment npm-release --allow-publish --yes` and verify with `npm trust list @diegopetrucci/pi-project-mcp-json`
- [ ] Dispatch the trusted `publish.yml` workflow from `main` with `v0.1.75` in both confirmation fields; the bootstrapped `@diegopetrucci/pi-project-mcp-json@0.1.0` should be planned as `skip` when its published payload matches the tag tarball
- [ ] Inspect the verified package plan and approve the protected `npm-release` environment deployment
- [ ] Do not run `npm publish` for the other packages directly

## Undo

To undo these release-only changes, use normal VCS restoration for `package.json`, `extensions/fast/package.json`, `package-lock.json`, and the four new v0.1.75 documents. No fleet marker changes are part of this release.

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.7"],["@diegopetrucci/pi-project-mcp-json","0.1.0"],["@diegopetrucci/pi-extensions","0.1.75"]] -->
