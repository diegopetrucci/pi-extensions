# Publish checklist — v0.1.11

## Preflight

- [ ] confirm working tree contains only intended changes
- [ ] verify versions are correct
  - [ ] `package.json` -> `0.1.11`
  - [ ] `extensions/minimal-footer/package.json` -> `0.1.4`
- [ ] verify docs exist
  - [ ] `docs/release-notes-v0.1.11.md`
  - [ ] `docs/github-release-v0.1.11.md`
  - [ ] `docs/announcement-v0.1.11.md`
  - [ ] `docs/publish-checklist-v0.1.11.md`
- [ ] verify extension files exist
  - [ ] `extensions/minimal-footer/index.ts`
  - [ ] `extensions/minimal-footer/openai-usage.ts`
  - [ ] `extensions/minimal-footer/README.md`
  - [ ] `extensions/minimal-footer/package.json`

## Local smoke tests

- [ ] load the extension directly and confirm pi starts

```bash
pi -e ./extensions/minimal-footer/index.ts
```

- [ ] verify footer still renders on a non-OpenAI provider
- [ ] verify footer shows `5h` and `7d` usage on `openai-codex`
- [ ] verify switching away from `openai-codex` removes usage from the footer
- [ ] verify narrow terminals still fall back cleanly

## Package sanity

- [ ] confirm collection package exposes all five extensions in root `package.json`
- [ ] confirm standalone minimal footer package has correct metadata in `extensions/minimal-footer/package.json`
- [ ] confirm standalone minimal footer package includes `openai-usage.ts`
- [ ] confirm root README includes updated install instructions for the latest tag
- [ ] confirm root README mentions the new `minimal-footer` OpenAI Codex usage feature
- [ ] confirm `extensions/minimal-footer/README.md` documents the `5h` / `7d` footer display

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.11`

Example:

```bash
git add README.md package.json assets/minimal-footer-preview.png extensions/minimal-footer docs
git commit -m "Prepare v0.1.11 release"
git tag v0.1.11
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.11
```

- [ ] create GitHub release for `v0.1.11`
- [ ] paste contents of `docs/github-release-v0.1.11.md`

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
  - [ ] `@diegopetrucci/pi-extensions@0.1.11`
  - [ ] `@diegopetrucci/pi-minimal-footer@0.1.4`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
pi install npm:@diegopetrucci/pi-extensions
```

- [ ] reload pi and confirm `minimal-footer` is available
- [ ] verify OpenAI Codex usage appears in the footer on an authenticated `openai-codex` session
- [ ] publish announcement copy from `docs/announcement-v0.1.11.md`
