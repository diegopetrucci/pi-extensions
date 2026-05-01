# Publish checklist — v0.1.12

## Preflight

- [ ] confirm working tree contains only intended changes
- [ ] verify versions are correct
  - [ ] `package.json` -> `0.1.12`
  - [ ] `extensions/oracle/package.json` -> `0.1.6`
- [ ] verify docs exist
  - [ ] `docs/release-notes-v0.1.12.md`
  - [ ] `docs/github-release-v0.1.12.md`
  - [ ] `docs/announcement-v0.1.12.md`
  - [ ] `docs/publish-checklist-v0.1.12.md`
  - [ ] `docs/oracle-provider-matrix.md`
- [ ] verify extension files exist
  - [ ] `extensions/oracle/index.ts`
  - [ ] `extensions/oracle/README.md`
  - [ ] `extensions/oracle/package.json`

## Local smoke tests

- [ ] load the extension directly and confirm pi starts

```bash
pi --no-extensions --extension ./extensions/oracle/index.ts --version
```

- [ ] run a TypeScript/bundling sanity check for the oracle extension

```bash
bun build extensions/oracle/index.ts --external @mariozechner/pi-ai --external @mariozechner/pi-coding-agent --external @mariozechner/pi-tui --external @sinclair/typebox --outfile /tmp/oracle.js
```

- [ ] verify every provider in pi's installed model catalog has an oracle preference entry
- [ ] verify representative first picks from the installed catalog match `docs/oracle-provider-matrix.md`
- [ ] optionally run `/oracle-model` in pi on an authenticated provider and confirm the selected model is expected

## Package sanity

- [ ] confirm collection package exposes all five extensions in root `package.json`
- [ ] confirm standalone oracle package has correct metadata in `extensions/oracle/package.json`
- [ ] confirm root README includes updated install instructions for the latest tag
- [ ] confirm `extensions/oracle/README.md` links to the latest release notes
- [ ] run package dry-runs

```bash
npm pack --dry-run
cd extensions/oracle
npm pack --dry-run
cd ../..
```

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.12`

Example:

```bash
git add -f AGENTS.md
git add README.md package.json extensions/oracle docs
git commit -m "Prepare v0.1.12 release"
git tag v0.1.12
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.12
```

- [ ] create GitHub release for `v0.1.12`
- [ ] paste contents of `docs/github-release-v0.1.12.md`

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone oracle package

- [ ] publish standalone oracle package

```bash
cd extensions/oracle
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.12`
  - [ ] `@diegopetrucci/pi-oracle@0.1.6`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-oracle
pi install npm:@diegopetrucci/pi-extensions
```

- [ ] reload pi and confirm `oracle` is available
- [ ] run `/oracle-model` and confirm it selects the expected model for the active provider
- [ ] publish announcement copy from `docs/announcement-v0.1.12.md`
