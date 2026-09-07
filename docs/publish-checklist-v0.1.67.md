# Publish checklist — v0.1.67

## Target package versions

- [ ] `@diegopetrucci/pi-code-reviewer@0.1.10`
- [ ] `@diegopetrucci/pi-contrarian@0.1.12`
- [ ] `@diegopetrucci/pi-oracle@0.1.27`
- [ ] `@diegopetrucci/pi-extensions@0.1.67`

## Validation evidence

- [x] deterministic release preparation selected exactly the four listed unpublished targets; lockfile synchronized
- [x] clean `npm ci` and install-state preflight passed after version bookkeeping
- [x] typecheck and full suite passed: 611 tests, 610 passed, one native-Windows-only skip
- [x] isolated tarball install/load smoke passed as part of the suite; four selected package dry-runs passed
- [x] production audit reported zero vulnerabilities; root unpacked size 2,215,171 bytes stays within budget
- [x] fleet markers unchanged at 0.84.4; release notes explicitly do not claim 0.85.1 certification or Astra fast mode

## Agent-safe follow-up actions

- [ ] commit and push release branch, then open a PR targeting main
- [ ] require final CI/CodeQL success and merge the release PR
- [ ] tag v0.1.67 on merged main and push the tag
- [ ] create GitHub release titled “GPT-6 Astra selection and refreshed provider fallbacks” using the exact public body file

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] inspect the verified package plan and approve the `npm-release` environment deployment

## Post-publish validation

- [ ] after human confirmation, wait five minutes before registry/install validation
- [ ] verify the four published versions and install/load the released artifacts

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.10"],["@diegopetrucci/pi-contrarian","0.1.12"],["@diegopetrucci/pi-oracle","0.1.27"],["@diegopetrucci/pi-extensions","0.1.67"]] -->
