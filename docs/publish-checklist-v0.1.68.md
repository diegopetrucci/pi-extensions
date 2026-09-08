# Publish checklist — v0.1.68

## Target package versions

- [ ] `pi-dynamic-context-pruning@0.1.9`
- [ ] `@diegopetrucci/pi-extensions@0.1.68`

## Validation evidence

- [x] deterministic preparation selected exactly the two listed unpublished target versions and synchronized the lockfile
- [x] clean `npm ci` and install-state preflight passed (270 installed packages, 28 local entries); typecheck and 613 tests passed (612 pass, one native-Windows-only skip)
- [x] isolated tarball install/load smoke and both selected package dry-runs passed
- [x] production audit reported zero vulnerabilities; root unpacked size 2,216,861 bytes is within the 2,225,000-byte budget
- [x] fleet compatibility markers unchanged at Pi 0.84.4

## Agent-safe follow-up actions

- [ ] commit and push release branch, then open a PR targeting main
- [ ] require final CI/CodeQL success and merge the release PR
- [ ] tag v0.1.68 on merged main and push the tag
- [ ] create GitHub release titled “Conservative mid-loop context pruning” using the exact public body file
- [ ] run the non-publishing release helper dry-run against the release tag

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] inspect the verified package plan and approve the `npm-release` environment deployment

## Post-publish validation

- [ ] after human confirmation, wait five minutes before registry/install validation
- [ ] verify both published versions and install/load the released artifacts

<!-- prepare-release:packages [["pi-dynamic-context-pruning","0.1.9"],["@diegopetrucci/pi-extensions","0.1.68"]] -->
