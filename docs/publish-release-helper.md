# Trusted npm release publishing

npm releases are published by the manually dispatched [Publish npm release](../.github/workflows/publish.yml) workflow. The workflow uses npm trusted publishing with GitHub Actions OIDC, so it does not store or consume a long-lived npm token.

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

Before dispatching, the release tag and non-draft GitHub release must exist and `docs/github-release-<tag>.md` must match the public release body.

1. Open **Actions → Publish npm release → Run workflow** on `main`.
2. Enter the exact release tag in both fields, for example `v0.1.62`.
3. Inspect the verification job summary. It lists every package, version, action, and tarball hash without OIDC permission.
4. Approve the `npm-release` environment deployment.
5. Let the publish job reverify and publish the exact tarballs.

Only one publish run can execute at a time. A rerun safely skips an exact version only when its registry `shasum` and `integrity` match the verified tag tarball. The root umbrella package remains last.

For local, non-publishing verification:

```bash
scripts/publish-release.mjs v0.1.62 --dry-run
```

Local live publishing is intentionally rejected. The helper isolates npm's user/global configuration in every mode. In GitHub Actions mode it also rejects legacy npm token/OTP variables and repository `.npmrc` files, checks the workflow identity and `main` checkout, verifies the remote tag and published GitHub release, and confirms registry hashes plus the `latest` dist-tag after each publish.

## npm CLI policy

The workflow pins Node and npm versions and runs no project dependency installation in the OIDC-enabled job. Upgrade the pinned npm version deliberately, with focused helper tests and a complete dry-run, rather than following `latest` implicitly.
