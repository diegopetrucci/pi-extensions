# Publish checklist — v0.1.13

## Preflight

- [ ] confirm working tree contains only intended changes
- [ ] verify versions are correct
  - [ ] `package.json` -> `0.1.13`
  - [ ] `extensions/minimal-footer/package.json` -> `0.1.5`
- [ ] verify docs exist
  - [ ] `docs/release-notes-v0.1.13.md`
  - [ ] `docs/github-release-v0.1.13.md`
  - [ ] `docs/announcement-v0.1.13.md`
  - [ ] `docs/publish-checklist-v0.1.13.md`
- [ ] verify extension files exist
  - [ ] `extensions/minimal-footer/index.ts`
  - [ ] `extensions/minimal-footer/openai-usage.ts`
  - [ ] `extensions/minimal-footer/minimal-footer.example.json`
  - [ ] `extensions/minimal-footer/README.md`
  - [ ] `extensions/minimal-footer/package.json`

## Local smoke tests

- [ ] run TypeScript syntax checks

```bash
bun --check extensions/minimal-footer/index.ts
bun --check extensions/minimal-footer/openai-usage.ts
```

- [ ] validate sample config JSON

```bash
jq empty extensions/minimal-footer/minimal-footer.example.json
```

- [ ] load the extension directly and confirm pi starts

```bash
pi --no-extensions --extension ./extensions/minimal-footer/index.ts --version
```

- [ ] verify footer still renders with default config
- [ ] verify `DUMB ZONE` appears above the configured token threshold and disappears below it
- [ ] verify `context.dumbZone.enabled: false` hides `DUMB ZONE`
- [ ] verify `codexUsage.enabled: false` hides Codex usage and skips usage fetches
- [ ] verify disabling one Codex usage window hides only that window
- [ ] verify narrow terminals still fall back cleanly

## Package sanity

- [ ] confirm collection package exposes all five extensions in root `package.json`
- [ ] confirm standalone minimal footer package has correct metadata in `extensions/minimal-footer/package.json`
- [ ] confirm standalone minimal footer package includes `openai-usage.ts` and `minimal-footer.example.json`
- [ ] confirm root README includes updated install instructions for the latest tag
- [ ] confirm root README mentions configurable `minimal-footer`
- [ ] confirm `extensions/minimal-footer/README.md` documents config files and disable snippets
- [ ] run package dry-runs

```bash
npm pack --dry-run
cd extensions/minimal-footer
npm pack --dry-run
cd ../..
```

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.13`

Example:

```bash
git add README.md package.json extensions/minimal-footer docs
```

```bash
git commit -m "Prepare v0.1.13 release"
git tag v0.1.13
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.13
```

- [ ] create GitHub release for `v0.1.13`
- [ ] paste contents of `docs/github-release-v0.1.13.md`

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone minimal footer package

- [ ] publish standalone minimal footer package

```bash
cd extensions/minimal-footer
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.13`
  - [ ] `@diegopetrucci/pi-minimal-footer@0.1.5`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
pi install npm:@diegopetrucci/pi-extensions
```

- [ ] reload pi and confirm `minimal-footer` is available
- [ ] verify default footer renders
- [ ] verify config disable snippets work
- [ ] publish announcement copy from `docs/announcement-v0.1.13.md`
