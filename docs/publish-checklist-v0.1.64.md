# Publish checklist — v0.1.64

## Target package versions

- [ ] `@diegopetrucci/pi-notify@0.1.16`
- [ ] `@diegopetrucci/pi-extensions@0.1.64`

## Validation evidence

- [x] Corrected `prepare-release` dry-run selected exactly Notify 0.1.16 then the umbrella bundle 0.1.64.
- [x] Corrected `prepare-release --write` updated both manifests and synchronized `package-lock.json`.
- [x] `node --test test/prepare-release.test.mjs` passed.
- [x] `npm ci` completed before validation; npm reported 3 vulnerabilities (1 moderate, 2 high), a deprecated `node-domexception` warning, and five install scripts not yet covered by `allowScripts`.
- [x] `npm run preflight:install-state` passed with 246 installed packages and 28 local package entries checked.
- [x] `npm run ci` passed with 579/579 tests (including typecheck and the full test suite).
- [x] Release-focused tests passed with 34/34 tests: `prepare-release`, `publish-release`, publish safety, and tarball runtime smoke coverage.
- [x] Final `prepare-release` dry-run selected only `@diegopetrucci/pi-notify@0.1.16` then `@diegopetrucci/pi-extensions@0.1.64`, and preserved all four v0.1.64 documents.
- [x] Exact npm registry checks returned E404/no-match responses for both target versions; neither target version is currently published.
- [x] `npm pack --dry-run --json --ignore-scripts` passed for exactly Notify and the umbrella: 5 files/5,621 packed bytes/16,869 unpacked bytes and 161 files/1,274,647 packed bytes/2,162,150 unpacked bytes, respectively.
- [x] `npm publish --dry-run --ignore-scripts --access public` passed for exactly Notify 0.1.16 and umbrella 0.1.64; no live publish was run.
- [x] Temporary Notify and umbrella tarball scans matched target manifests and found zero `docs/`, `.tickets/`, `.pi-subagents/`, `.npmrc`, or `*.tgz` entries; temporary artifacts were removed.
- [x] Manifest/lockfile checks passed: Notify is 0.1.16, umbrella is 0.1.64, and both lock entries agree; all four v0.1.64 documents contain exact Notify-then-umbrella managed evidence.
- [x] All 28 `.pi-fleet-tested-version` files read `0.83.0`.
- [x] Repository artifact scan found zero `*.tgz` or `.npmrc` files outside `node_modules`.
- [x] `git diff --check` passed.
- [x] `git diff --cached --name-only` produced no output; no files were staged.
- [x] `npm audit`, `npm audit --omit=dev`, and `npm audit --omit=dev --audit-level=high` each reported the same 3 transitive vulnerabilities (1 moderate, 2 high) in `brace-expansion`/`undici`; no remediation was applied.

## Agent-safe follow-up actions

- [ ] commit release prep changes on `release/notify-tmux-v0.1.64` outside this tool
- [ ] push the release branch and open a pull request targeting `main`
- [ ] after the pull request merges, tag `v0.1.64` on `main`
- [ ] push tag `v0.1.64`
- [ ] create the GitHub release using `docs/github-release-v0.1.64.md`

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] inspect the verified package plan and approve the `npm-release` environment deployment

<!-- prepare-release:packages [["@diegopetrucci/pi-notify","0.1.16"],["@diegopetrucci/pi-extensions","0.1.64"]] -->
