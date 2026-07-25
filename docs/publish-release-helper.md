# Publish release helper

Human-only usage:

```bash
scripts/publish-release.mjs v0.1.60 --dry-run
scripts/publish-release.mjs v0.1.60
```

The helper reads `docs/github-release-v0.1.60.md`, derives the managed package order from its evidence marker, verifies the `v0.1.60` tag exists, checks each selected package's current publishable tarball content against that tag, confirms public npm auth with `npm whoami --registry=https://registry.npmjs.org`, and publishes only after the human types the exact `v0.1.60` release version at the interactive confirmation. Exact versions already on npm are skipped so reruns can resume safely. It never reads, writes, or exposes credentials.

`--dry-run` performs every safety check and prints the publish plan without running `npm publish`.

A successful npm publication is persistent registry state and is not undone by deleting this helper. To correct a published release, follow npm's [deprecation guidance](https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions/) or, only when eligible, its [unpublish policy](https://docs.npmjs.com/policies/unpublish/).

To remove the helper from the repository, delete `scripts/publish-release.mjs`, `test/publish-release.test.mjs`, and this document (or revert the commit that added them). The helper itself does not modify the checkout.
