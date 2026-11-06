# Release notes — v0.1.84

## Scope

Prepared on 2026-11-06 from `9a26327d32de6016a03b52f9cc26803a74edb39a` (`origin/main`) in the isolated `release/unpublished-agent-packages` worktree. The validation below describes the pre-commit preparation candidate, not a publication or merged-main validation claim.

Proposed release title: **Standalone developer, diff, repository, test, and web helpers**.

The five helpers introduced by [#189](https://github.com/diegopetrucci/pi-extensions/pull/189) have been available through the umbrella but were explicitly excluded from standalone publication in v0.1.82 and v0.1.83. This candidate prepares their existing `0.1.0` artifacts without changing source, manifests, lock metadata, or fleet markers. The root stays at `0.1.83`; `v0.1.84` is the proposed standalone-only release/tag identity, not an umbrella version bump.

## Packages

- `@diegopetrucci/pi-developer@0.1.0`
- `@diegopetrucci/pi-diff-summarizer@0.1.0`
- `@diegopetrucci/pi-repo-scout@0.1.0`
- `@diegopetrucci/pi-test-runner@0.1.0`
- `@diegopetrucci/pi-web-scout@0.1.0`

The managed marker intentionally excludes the root and every other workspace. Artifact-based `prepare-release` is not a package allowlist: the five-only input dry-run aborted because it also detected a changed umbrella artifact. Write mode was not run; the documents were prepared manually to avoid unrelated bumps.

## Validation and blockers

- Dependency refresh, install-state preflight, shared-copy drift check, formatting, and typechecking passed.
- Full CI: 1,380 tests, 1,377 passed, 1 failed, 2 skipped. The failure is the existing `brrr warns and uses the default for a wrong-typed idleSeconds` assertion (`test/brrr-extension.test.mjs:571`). A focused rerun reproduced it. That test uses the host's real macOS HID idle time, while expecting a notification with the 20-second default; an `ioreg` observation during investigation reported about 0.3 seconds idle. No fix is included. On 2026-11-06 the user explicitly requested deferring this fix and publishing first; the failed test is retained as a scoped accepted exception, not a clean-CI claim.
- Focused helper, SDK/MCP, metadata, package-size, tarball runtime, and release-tool tests: 261 tests, 259 passed, 0 failed, 2 skipped because developer intentionally exposes write/edit.
- Five workspace dry-runs and actual `npm pack --ignore-scripts` operations passed. Each tarball has exactly the fleet marker, README, TypeScript entry point, and manifest. Their names/versions and SHA1 hashes were checked against npm's pack metadata. Tarballs and `pack.json` are at `/tmp/pi-standalone-agents-v0.1.84.GLyxEG/` (temporary local evidence, not committed artifacts).
- No live-provider, live Exa, interactive Pi, npm-install-after-publication, fresh fleet certification, or clean dependency-security audit is claimed.

The user has accepted deferring the unrelated full-CI failure for this release and explicitly approved committing the standalone-only `v0.1.84` preparation and opening its PR on 2026-11-06. Release remains blocked on human-reviewed PR/merge, first-publication/trusted-publisher setup for the five npm names, and enforcement of the required no-self-review publishing protection (the live environment currently reports `prevent_self_review: false`). Current publishing policy is in `AGENTS.md` and `docs/publish-release-helper.md`; their workflow-only and interactive-bootstrap guidance needs an explicit human decision for new package names. No bootstrap method is selected. Bootstrapping the exact stable artifacts would make the later workflow a verification-only no-op and would not add OIDC provenance retroactively. This preparation does not authorize agent-side local publishing, placeholder versions, or a protection bypass.

## Contributor audit

`git log v0.1.83..9a26327` contains only [#203](https://github.com/diegopetrucci/pi-extensions/pull/203), authored by the repository owner, with The Last Harness co-author metadata. The original helper PR [#189](https://github.com/diegopetrucci/pi-extensions/pull/189) is also owner-authored, with the same co-author. No external human contributor credits were identified for this candidate; the public body omits an empty Contributors section. Reaudit any commits added before the eventual tag.

<!-- prepare-release:packages [["@diegopetrucci/pi-developer","0.1.0"],["@diegopetrucci/pi-diff-summarizer","0.1.0"],["@diegopetrucci/pi-repo-scout","0.1.0"],["@diegopetrucci/pi-test-runner","0.1.0"],["@diegopetrucci/pi-web-scout","0.1.0"]] -->
