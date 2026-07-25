# Publish release helper

Human-only usage:

```bash
scripts/publish-release.mjs v0.1.60 --dry-run
scripts/publish-release.mjs v0.1.60
```

The helper verifies the `v0.1.60` tag exists, reads the managed package evidence from that tagged `docs/github-release-v0.1.60.md`, and requires the checkout document to match the tagged copy byte-for-byte before continuing. It then checks each selected package's current publishable tarball content against the tagged snapshot, confirms public npm auth with `npm whoami --registry=https://registry.npmjs.org`, and publishes only after the human types the exact `v0.1.60` release version at the interactive confirmation. If an exact version is already on public npm, the helper skips it only when npm reports `dist.shasum` and `dist.integrity` that match the verified tagged pack; missing, malformed, or mismatched registry metadata aborts safely. It never reads, writes, or exposes credentials.

For non-interactive npm authentication, prefer a granular npm access token that can bypass 2FA for publish operations when your npm account policy allows it. Export credentials through npm's standard environment or config mechanisms. The helper buffers npm subprocesses and cannot itself service an npm OTP prompt. If write authentication requires an OTP, securely set or export `NPM_CONFIG_OTP` before invoking the helper. Do not pass the OTP as a CLI argument.

`--dry-run` performs every safety check and prints the publish plan without running `npm publish`.

A successful npm publication is persistent registry state and is not undone by deleting this helper. To correct a published release, follow npm's [deprecation guidance](https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions/) or, only when eligible, its [unpublish policy](https://docs.npmjs.com/policies/unpublish/).

To remove the helper from the repository, delete `scripts/publish-release.mjs`, `test/publish-release.test.mjs`, and this document (or revert the commit that added them). The helper itself does not modify the checkout.
