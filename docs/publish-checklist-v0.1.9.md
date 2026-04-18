# Publish checklist — v0.1.9

## Preflight

- [ ] confirm working tree contains only intended changes
- [ ] verify versions are correct
  - [ ] `package.json` -> `0.1.9`
  - [ ] `extensions/notify/package.json` -> `0.1.1`
- [ ] verify docs exist
  - [ ] `docs/release-notes-v0.1.9.md`
  - [ ] `docs/github-release-v0.1.9.md`
  - [ ] `docs/announcement-v0.1.9.md`
  - [ ] `docs/publish-checklist-v0.1.9.md`
- [ ] verify extension files exist
  - [ ] `extensions/notify/index.ts`
  - [ ] `extensions/notify/README.md`
  - [ ] `extensions/notify/package.json`
  - [ ] `extensions/notify/notify.example.json`

## Local smoke tests

- [ ] load the extension directly and confirm pi starts

```bash
pi -e ./extensions/notify/index.ts
```

- [ ] confirm a notification is sent when the agent finishes a prompt
- [ ] optional: verify your preferred channel mix
  - [ ] terminal notification
  - [ ] desktop notification
  - [ ] bell
  - [ ] sound
- [ ] optional: verify backend selection in your preferred environment
  - [ ] OSC 777 terminal
  - [ ] Kitty
  - [ ] macOS desktop
  - [ ] Linux desktop
  - [ ] Windows Terminal / WSL

## Package sanity

- [ ] confirm collection package exposes all five extensions in root `package.json`
- [ ] confirm standalone notify package has correct metadata in `extensions/notify/package.json`
- [ ] confirm standalone notify package includes `notify.example.json`
- [ ] confirm root README includes updated install instructions for `notify`
- [ ] confirm `extensions/notify/README.md` documents config files and sample config

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.9`

Example:

```bash
git add README.md package.json extensions/notify docs
git commit -m "Upgrade notify extension"
git tag v0.1.9
```

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone notify package

- [ ] publish standalone notify package

```bash
cd extensions/notify
npm publish
cd ../..
```

## GitHub release

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.9
```

- [ ] create GitHub release for `v0.1.9`
- [ ] paste contents of `docs/github-release-v0.1.9.md`

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.9`
  - [ ] `@diegopetrucci/pi-notify@0.1.1`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-notify
pi install npm:@diegopetrucci/pi-extensions
```

- [ ] reload pi and confirm `notify` is available
- [ ] copy `notify.example.json` into place and confirm config works
- [ ] publish announcement copy from `docs/announcement-v0.1.9.md`
