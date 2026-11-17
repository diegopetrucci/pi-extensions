# Publish checklist — v0.1.87

## Status and scope

**Unpublished.** Preparation started 2026-11-17 from `d4925e0` (`origin/main`) on `release/v0.1.87-prep`. 31 packages are selected; 3 are unchanged (`illustrations-to-explain-things`, `claude-fast`, `openai-fast`). Nothing below is ticked until it has actually happened.

Proposed public title: **Pi 1.5.2 compatibility, per-package update notes, and timeout hardening**.

The Pi development baseline is 1.5.2 (`docs/pi-1.5.2-validation.md`); no fleet markers change and no fleet certification is claimed. Contributor audit of `v0.1.86..origin/main`: only repository-owner commits plus The Last Harness co-author trailer, so no `## Contributors` section.

## Target package versions

- [ ] `@diegopetrucci/pi-agent-workflow-audit@0.1.17`
- [ ] `@diegopetrucci/pi-annotate-git-diff@0.1.18`
- [ ] `@diegopetrucci/pi-annotate-last-message@0.1.16`
- [ ] `@diegopetrucci/pi-brrr@0.1.17`
- [ ] `@diegopetrucci/pi-code-reviewer@0.1.20`
- [ ] `@diegopetrucci/pi-confirm-destructive@0.1.15`
- [ ] `@diegopetrucci/pi-context-cap@0.1.17`
- [ ] `@diegopetrucci/pi-context-inspector@0.1.19`
- [ ] `@diegopetrucci/pi-contrarian@0.1.23`
- [ ] `@diegopetrucci/pi-developer@0.1.1`
- [ ] `@diegopetrucci/pi-diff-summarizer@0.1.1`
- [ ] `@diegopetrucci/pi-dirty-repo-guard@0.1.14`
- [ ] `@diegopetrucci/pi-fast@0.1.13`
- [ ] `@diegopetrucci/pi-git-footer@0.1.15`
- [ ] `@diegopetrucci/pi-gnosis@0.1.14`
- [ ] `@diegopetrucci/pi-inline-bash@0.1.17`
- [ ] `@diegopetrucci/pi-librarian@0.1.24`
- [ ] `@diegopetrucci/pi-minimal-footer@0.1.28`
- [ ] `@diegopetrucci/pi-notify@0.1.22`
- [ ] `@diegopetrucci/pi-oracle@0.1.38`
- [ ] `@diegopetrucci/pi-permission-gate@0.1.20`
- [ ] `@diegopetrucci/pi-project-mcp-json@0.1.5`
- [ ] `@diegopetrucci/pi-quiet-tools@0.1.17`
- [ ] `@diegopetrucci/pi-repo-scout@0.1.1`
- [ ] `@diegopetrucci/pi-review@0.1.18`
- [ ] `@diegopetrucci/pi-test-runner@0.1.1`
- [ ] `@diegopetrucci/pi-todo@0.1.14`
- [ ] `@diegopetrucci/pi-triage-comments@0.1.20`
- [ ] `@diegopetrucci/pi-web-scout@0.1.1`
- [ ] `pi-dynamic-context-pruning@0.1.18`
- [ ] `@diegopetrucci/pi-extensions@0.1.87`

## Validation evidence

- [ ] record completed checks here (none recorded yet; final validation is tracked separately)
- [ ] replace changelog placeholders in each package CHANGELOG.md
- [ ] confirm no staged files

## Agent-safe follow-up actions

- [ ] obtain explicit user approval before any commit-creating command, then commit release prep changes outside this tool
- [ ] tag the release outside this tool
- [ ] push the branch and tag outside this tool
- [ ] create the GitHub release outside this tool

## Authorized trusted OIDC release actions

- [ ] with an explicit user release request, run `scripts/publish-release.mjs v0.1.87 --dry-run` and review the exact tag, body, package, and tarball evidence
- [ ] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [ ] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [ ] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers, `main` branch restrictions, and no-self-review protections remain enforced
- [ ] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection
- [ ] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [ ] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.17"],["@diegopetrucci/pi-annotate-git-diff","0.1.18"],["@diegopetrucci/pi-annotate-last-message","0.1.16"],["@diegopetrucci/pi-brrr","0.1.17"],["@diegopetrucci/pi-code-reviewer","0.1.20"],["@diegopetrucci/pi-confirm-destructive","0.1.15"],["@diegopetrucci/pi-context-cap","0.1.17"],["@diegopetrucci/pi-context-inspector","0.1.19"],["@diegopetrucci/pi-contrarian","0.1.23"],["@diegopetrucci/pi-developer","0.1.1"],["@diegopetrucci/pi-diff-summarizer","0.1.1"],["@diegopetrucci/pi-dirty-repo-guard","0.1.14"],["@diegopetrucci/pi-fast","0.1.13"],["@diegopetrucci/pi-git-footer","0.1.15"],["@diegopetrucci/pi-gnosis","0.1.14"],["@diegopetrucci/pi-inline-bash","0.1.17"],["@diegopetrucci/pi-librarian","0.1.24"],["@diegopetrucci/pi-minimal-footer","0.1.28"],["@diegopetrucci/pi-notify","0.1.22"],["@diegopetrucci/pi-oracle","0.1.38"],["@diegopetrucci/pi-permission-gate","0.1.20"],["@diegopetrucci/pi-project-mcp-json","0.1.5"],["@diegopetrucci/pi-quiet-tools","0.1.17"],["@diegopetrucci/pi-repo-scout","0.1.1"],["@diegopetrucci/pi-review","0.1.18"],["@diegopetrucci/pi-test-runner","0.1.1"],["@diegopetrucci/pi-todo","0.1.14"],["@diegopetrucci/pi-triage-comments","0.1.20"],["@diegopetrucci/pi-web-scout","0.1.1"],["pi-dynamic-context-pruning","0.1.18"],["@diegopetrucci/pi-extensions","0.1.87"]] -->
