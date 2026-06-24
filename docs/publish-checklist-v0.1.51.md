# Publish checklist — v0.1.51

> Retrospectively reconstructed on 2026-06-24 because the original checklist file was missing. Live tag, GitHub release, and npm registry state were rechecked while reconstructing this evidence.

## Release scope

- [x] release tag: `v0.1.51`
- [x] release commits shipped by the tag:
  - [x] `3000966` — refresh package fleet for Pi `0.79.10`
  - [x] `32a699b` — add trusted-project git status to `minimal-footer`
- [x] public GitHub release body documents both the Pi `0.79.10` fleet refresh and the shipped `minimal-footer` git status feature

## Preflight and release docs

- [x] create release docs
  - [x] `docs/release-notes-v0.1.51.md`
  - [x] `docs/github-release-v0.1.51.md`
  - [x] `docs/announcement-v0.1.51.md`
  - [x] `docs/publish-checklist-v0.1.51.md`
- [x] bump package versions for the root collection and all standalone packages
- [x] refresh `.pi-fleet-tested-version` markers from `0.78.0` to `0.79.10`
- [x] refresh dependencies and package-lock local package versions
- [x] run install-state preflight and TypeScript typecheck

Validation recorded in `docs/release-notes-v0.1.51.md`:

- verified the installed Pi CLI reports `0.79.10`
- verified npm latest for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` is `0.79.10`
- ran install-state preflight and full TypeScript typecheck
- verified root and all standalone package dry-runs include `.pi-fleet-tested-version`

## Package versions

- [x] `@diegopetrucci/pi-extensions@0.1.51`
- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.3`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.1`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.1`
- [x] `@diegopetrucci/pi-brrr@0.1.4`
- [x] `@diegopetrucci/pi-claude-fast@0.1.4`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.4`
- [x] `@diegopetrucci/pi-context-cap@0.1.3`
- [x] `@diegopetrucci/pi-context-inspector@0.1.3`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.3`
- [x] `@diegopetrucci/pi-git-footer@0.1.2`
- [x] `@diegopetrucci/pi-gnosis@0.1.3`
- [x] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.1`
- [x] `@diegopetrucci/pi-inline-bash@0.1.3`
- [x] `@diegopetrucci/pi-librarian@0.1.7`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.11`
- [x] `@diegopetrucci/pi-notify@0.1.7`
- [x] `@diegopetrucci/pi-openai-fast@0.1.6`
- [x] `@diegopetrucci/pi-oracle@0.1.15`
- [x] `@diegopetrucci/pi-permission-gate@0.1.4`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.4`
- [x] `@diegopetrucci/pi-review@0.1.4`
- [x] `@diegopetrucci/pi-todo@0.1.3`
- [x] `@diegopetrucci/pi-triage-comments@0.1.4`

## Commit, tag, and GitHub release

- [x] merge release PR for the Pi `0.79.10` fleet refresh
- [x] merge follow-up PR adding `minimal-footer` git status before tagging `v0.1.51`
- [x] create tag `v0.1.51` at `32a699b27d677c104b5afdc21dd02926f7e39150`
- [x] push tag `v0.1.51`
- [x] create GitHub release for `v0.1.51`
- [x] paste/update contents of `docs/github-release-v0.1.51.md`
- [x] verify the rendered GitHub release uses a descriptive title, starts with the summary, and includes the shipped `minimal-footer` feature

Retrospective evidence refreshed on 2026-06-24:

```bash
git ls-remote --tags origin refs/tags/v0.1.51
git rev-parse v0.1.51^{commit}
gh release view v0.1.51 --json tagName,targetCommitish,name,url,isDraft,isPrerelease
```

## Stop before npm publish

> Human-only: npm publishing depends on the authenticated npm session. The package artifacts are already visible on npm, so this checklist records the completed human publishing step.

- [x] publish root collection package manually
- [x] publish all refreshed standalone packages manually

## Post-publish validation

- [x] waited for npm propagation before checking registry/install validation
- [x] verified npm registry state for root and standalone packages
- [x] verified install/package pages after npm propagation

Retrospective evidence refreshed on 2026-06-24: a local `npm view <package>@<version> version` loop confirmed every package version listed above is visible on npm.

Post-publish validation command:

```bash
npm view @diegopetrucci/pi-extensions@0.1.51 name version dist.tarball --json
npm view @diegopetrucci/pi-minimal-footer@0.1.11 name version dist.tarball --json
npm view @diegopetrucci/pi-oracle@0.1.15 name version dist.tarball --json
```
