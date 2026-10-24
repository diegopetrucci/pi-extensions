# Trusted npm release publishing

npm releases are published only by the trusted [Publish npm release](../.github/workflows/publish.yml) workflow. In a future release context with an explicit user release request, an agent may dispatch the workflow when its authenticated GitHub identity is permitted and approve the protected `npm-release` deployment only when that identity is an eligible reviewer; otherwise it must escalate to an eligible human. The workflow uses npm trusted publishing with GitHub Actions OIDC, so it does not store or consume a long-lived npm token.

## One-time configuration

Create a protected GitHub environment named `npm-release` with:

- deployment branches restricted to `main`
- required reviewer approval
- administrator bypass disabled when operationally practical

Configure every existing npm package with the same trusted publisher. This requires npm CLI 11.15 or newer and interactive 2FA:

```bash
npm trust github PACKAGE \
  --file publish.yml \
  --repository diegopetrucci/pi-extensions \
  --environment npm-release \
  --allow-publish \
  --yes
```

Run `npm trust list PACKAGE` afterward and verify the repository, workflow, environment, and `npm publish` permission. npm supports one trusted publisher per package. A new package must already exist on npm before trusted publishing can be configured, so bootstrap a brand-new package interactively before adding it to this workflow.

After one complete OIDC release succeeds and its registry hashes and provenance are verified, set each package's publishing access to **Require two-factor authentication and disallow tokens**, then revoke obsolete publishing tokens.

## Release operation

Before dispatching, obtain explicit user release authorization for this exact release. Release-preparation commits remain separately gated: obtain explicit user approval before any commit-creating command and follow the non-`main` branch and human-reviewed pull-request/merge workflow. The release tag and non-draft GitHub release must exist, `docs/github-release-<tag>.md` must match the public release body, and the contributor audit must be complete. Run the local `--dry-run` first and review the exact tag, body, package, and tarball evidence. Save a copy of the public body as a rollback backup before making any release-body correction.

1. Verify the intended checkout is the verified `main` source.
2. Dispatch **Actions → Publish npm release → Run workflow** only when the authenticated GitHub identity is permitted, from `main`, entering the exact release tag in both `release_tag` and `confirmation` fields, for example `v0.1.62`.
3. Inspect the verification job summary. It lists every package, version, action, and tarball hash without OIDC permission; do not proceed unless it matches the reviewed release evidence.
4. Approve the protected `npm-release` environment deployment only when the authenticated GitHub identity is an eligible reviewer. Required reviewers, deployment-branch restrictions, and no-self-review protections must remain enforced. If GitHub rejects the identity's dispatch or approval, stop and escalate to an eligible human; never bypass or disable protection.
5. Let the publish job reverify and publish the exact tarballs through npm OIDC.

Only one publish run can execute at a time. A rerun safely skips an exact version only when its registry `shasum` and `integrity` match the verified tag tarball. The root umbrella package remains last.

For local, non-publishing verification:

```bash
scripts/publish-release.mjs v0.1.62 --dry-run
```

Local live publishing is intentionally rejected: never run local `npm publish`. The helper isolates npm's user/global configuration in every mode. In GitHub Actions mode it also rejects legacy npm token/OTP variables and repository `.npmrc` files, checks the workflow identity and `main` checkout, verifies the remote tag and published GitHub release, and confirms registry hashes plus the `latest` dist-tag after each publish. Do not substitute a legacy npm token or OTP for trusted OIDC.

## Post-publication verification and rollback

After the trusted workflow reports verified publication success, wait five minutes for npm propagation before inspecting the public GitHub release or checking registry/package pages and npm-install results. Then verify that the published contributor credits match the audited `Contributors` section and that exact body parity holds with `docs/github-release-<tag>.md`. If rollback is needed, restore the saved public-body backup and reverse this docs-only diff in version control; do not change package versions, source, tags, or registry state.

## Historical release documents

Existing versioned `docs/publish-checklist-v<version>.md` files are historical snapshots, not current operational policy. Use this guide and `AGENTS.md` for current release operations; do not rewrite historical checklists, tags, or public release bodies when updating policy.

## npm CLI policy

The workflow pins Node and npm versions and runs no project dependency installation in the OIDC-enabled job. Upgrade the pinned npm version deliberately, with focused helper tests and a complete dry-run, rather than following `latest` implicitly.
