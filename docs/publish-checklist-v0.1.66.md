# Publish checklist — v0.1.66

## Target package versions

- [ ] `@diegopetrucci/pi-agent-workflow-audit@0.1.11`
- [ ] `@diegopetrucci/pi-annotate-git-diff@0.1.11`
- [ ] `@diegopetrucci/pi-annotate-last-message@0.1.9`
- [ ] `@diegopetrucci/pi-brrr@0.1.14`
- [ ] `@diegopetrucci/pi-claude-fast@0.1.15`
- [ ] `@diegopetrucci/pi-code-reviewer@0.1.9`
- [ ] `@diegopetrucci/pi-confirm-destructive@0.1.12`
- [ ] `@diegopetrucci/pi-context-cap@0.1.11`
- [ ] `@diegopetrucci/pi-context-inspector@0.1.13`
- [ ] `@diegopetrucci/pi-contrarian@0.1.11`
- [ ] `@diegopetrucci/pi-dirty-repo-guard@0.1.11`
- [ ] `@diegopetrucci/pi-fast@0.1.2`
- [ ] `@diegopetrucci/pi-git-footer@0.1.10`
- [ ] `@diegopetrucci/pi-gnosis@0.1.11`
- [ ] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`
- [ ] `@diegopetrucci/pi-inline-bash@0.1.11`
- [ ] `@diegopetrucci/pi-librarian@0.1.16`
- [ ] `@diegopetrucci/pi-minimal-footer@0.1.20`
- [ ] `@diegopetrucci/pi-notify@0.1.18`
- [ ] `@diegopetrucci/pi-openai-fast@0.1.17`
- [ ] `@diegopetrucci/pi-oracle@0.1.26`
- [ ] `@diegopetrucci/pi-permission-gate@0.1.14`
- [ ] `@diegopetrucci/pi-quiet-tools@0.1.12`
- [ ] `@diegopetrucci/pi-review@0.1.14`
- [ ] `@diegopetrucci/pi-todo@0.1.11`
- [ ] `@diegopetrucci/pi-triage-comments@0.1.12`
- [ ] `pi-dynamic-context-pruning@0.1.8`
- [ ] `@diegopetrucci/pi-extensions@0.1.66`

## Validation evidence

- [x] audited Pi `0.84.3` and `0.84.4` API, catalog, bundled-runtime, TUI, skill-discovery, terminal-capability, RPC, nested-session, and PowerShell changes; no blanket API migration was required
- [x] advanced all 28 `.pi-fleet-tested-version` files from `0.84.2` to `0.84.4`
- [x] clean `npm ci` completed with 265 packages added, 293 audited, and 0 vulnerabilities; uncovered install-script notices were informational
- [x] `npm run preflight:install-state` matched 238 installed packages and all 28 local package entries
- [x] `npm run typecheck` passed, and the complete suite passed with 602 tests total: 601 passed, 1 native-Windows fixture skipped on macOS, 0 failed
- [x] GitHub compatibility CI run `33343705385` passed Node 22.19.0, 24, 26, and the Windows PowerShell job; Windows passed all 29 shell-safety tests under PowerShell 7 and Windows PowerShell 5.1
- [x] CodeQL run `33343705349` passed; an independent final blocker review found no unresolved major/minor annotation findings after the replacement-token regression fix
- [x] checksum-verified official Pi `0.84.3` and `0.84.4` SEA artifacts loaded the isolated collection entries; normal Node Pi `0.84.4` also loaded the installed root and standalone annotation entries
- [x] root/grouped Markdown skill fixtures passed (`ROOT_MARKDOWN_SKILL_DISCOVERY_0843_0844_OK`) and SDK/SEA terminal override matrices passed (`TERMINAL_CAPABILITY_OVERRIDE_SDK_OK`, `TERMINAL_CAPABILITY_OVERRIDE_SEA_OK`)
- [x] completed the Pi `0.84.4` fullscreen smoke for both footers, context-cap, context-inspector, quiet-tools, permission-gate, Oracle streaming, shell allow/deny behavior, native annotation launch, and clean shutdown
- [x] exact `@diegopetrucci/pi-extensions@0.1.66` and `@diegopetrucci/pi-annotate-git-diff@0.1.11` tarballs installed offline with independent Tailwind `4.3.2`, Monaco `0.52.2`, and Glimpse `0.8.1` dependencies; both installed manifests and both copies of `review-server.ts` were verified
- [x] exact-release six-run packaged native matrix passed Node Pi `0.84.4`, official SEA `0.84.4`, and official SEA `0.84.3` across root and standalone layouts; every run observed `assetInitFailed:false`, 11,787 bytes of generated Tailwind CSS, naturally enabled controls, a real submit/cancel message, native exit 0, and a closed loopback port; all submit runs verified Pi editor insertion and both cancel runs verified an empty editor buffer
- [x] exact release package sizes are 1,288,387 packed / 2,214,459 unpacked bytes for the 163-file root and 47,634 / 201,598 bytes for the 15-file standalone annotation package; both contain `review-server.ts`, and the root stays within its 2,225,000-byte budget
- [x] deterministic `prepare-release` dry-run and write mode selected exactly 28 next-patch targets, confirmed every target was unpublished, synchronized all manifest/lock versions, and created the v0.1.66 document set
- [x] after final release bookkeeping, a second clean `npm ci` and `npm run preflight:install-state` passed; `npm run ci` passed typecheck, install-state, package budgets, and all 602 tests (601 passed, 1 native-Windows-only skip); the four release-focused suites separately passed 34/34
- [x] final deterministic `prepare-release` rerun selected the same ordered 28-package set, preserved all four documents, and matched all four managed package-evidence markers byte-for-byte; aggregate package totals are 319 files, 2,483,235 packed bytes, and 4,281,205 unpacked bytes
- [x] `npm pack --dry-run --json --ignore-scripts` and `npm publish --dry-run --ignore-scripts --access public` passed for all 28 exact targets; actual generated tarballs contained zero forbidden repository-only entries
- [x] exact release tarballs passed isolated offline install plus Node/SEA native runtime smoke; root SHA-256 was `5ec7a13ff2b7ec30e67225904ef3a851c4282eb1c0fe6df94608073831e866ff` and standalone SHA-256 was `cc227ff83e5ea34e2f9bb23c9a3260b6de78773f1dbd68684393d79e6f843acd`
- [x] `npm audit`, `npm audit --omit=dev`, and high-severity production audit each reported 0 vulnerabilities; `git diff --check` passed and no files were staged

## Agent-safe follow-up actions

- [ ] commit the certification, annotation repair, markers, versions, and release documents on `certify/pi-0.84.4`
- [ ] push the branch, update PR #77, and move it out of draft
- [ ] require fresh CI and CodeQL success for the final branch revision
- [ ] merge PR #77 into `main` and verify the merge commit contains the managed release evidence
- [ ] tag `v0.1.66` on the merged `main` commit and push the tag
- [ ] create a non-draft GitHub release titled **“Pi 0.84.4 certification, PowerShell safety, and packaged annotation repair”** using the exact contents of `docs/github-release-v0.1.66.md`

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] inspect the verified package plan and approve the `npm-release` environment deployment

## Post-publish validation

- [ ] after the human confirms npm publishing is complete, wait 5 minutes before registry/package-page or install checks
- [ ] verify all 28 exact versions, registry hashes, integrity metadata, provenance, and expected `latest` tags
- [ ] install the published root and representative standalone packages in fresh directories and repeat runtime loading

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.11"],["@diegopetrucci/pi-annotate-git-diff","0.1.11"],["@diegopetrucci/pi-annotate-last-message","0.1.9"],["@diegopetrucci/pi-brrr","0.1.14"],["@diegopetrucci/pi-claude-fast","0.1.15"],["@diegopetrucci/pi-code-reviewer","0.1.9"],["@diegopetrucci/pi-confirm-destructive","0.1.12"],["@diegopetrucci/pi-context-cap","0.1.11"],["@diegopetrucci/pi-context-inspector","0.1.13"],["@diegopetrucci/pi-contrarian","0.1.11"],["@diegopetrucci/pi-dirty-repo-guard","0.1.11"],["@diegopetrucci/pi-fast","0.1.2"],["@diegopetrucci/pi-git-footer","0.1.10"],["@diegopetrucci/pi-gnosis","0.1.11"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.9"],["@diegopetrucci/pi-inline-bash","0.1.11"],["@diegopetrucci/pi-librarian","0.1.16"],["@diegopetrucci/pi-minimal-footer","0.1.20"],["@diegopetrucci/pi-notify","0.1.18"],["@diegopetrucci/pi-openai-fast","0.1.17"],["@diegopetrucci/pi-oracle","0.1.26"],["@diegopetrucci/pi-permission-gate","0.1.14"],["@diegopetrucci/pi-quiet-tools","0.1.12"],["@diegopetrucci/pi-review","0.1.14"],["@diegopetrucci/pi-todo","0.1.11"],["@diegopetrucci/pi-triage-comments","0.1.12"],["pi-dynamic-context-pruning","0.1.8"],["@diegopetrucci/pi-extensions","0.1.66"]] -->
