# Publish checklist — v0.1.8

## Preflight

- [ ] confirm working tree contains only intended changes
- [ ] verify versions are correct
  - [ ] `package.json` -> `0.1.8`
  - [ ] `extensions/notify/package.json` -> `0.1.0`
- [ ] verify docs exist
  - [ ] `docs/release-notes-v0.1.8.md`
  - [ ] `docs/github-release-v0.1.8.md`
  - [ ] `docs/announcement-v0.1.8.md`
  - [ ] `docs/publish-checklist-v0.1.8.md`
- [ ] verify extension files exist
  - [ ] `extensions/notify/index.ts`
  - [ ] `extensions/notify/README.md`
  - [ ] `extensions/notify/package.json`

## Local smoke tests

- [ ] load the extension directly and confirm pi starts

```bash
pi -e ./extensions/notify/index.ts
```

- [ ] confirm a notification is sent when the agent finishes a prompt
- [ ] optional: verify behavior in your preferred terminal backend
  - [ ] OSC 777 terminal
  - [ ] Kitty
  - [ ] Windows Terminal / WSL

## Package sanity

- [ ] confirm collection package exposes all five extensions in root `package.json`
- [ ] confirm standalone notify package has correct metadata in `extensions/notify/package.json`
- [ ] confirm root README includes install instructions for `notify`
- [ ] confirm `extensions/notify/README.md` links to the original `badlogic/pi-mono` example

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.8`

Example:

```bash
git add README.md package.json extensions/notify docs
git commit -m "Add notify extension"
git tag v0.1.8
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
git push origin v0.1.8
```

- [ ] create GitHub release for `v0.1.8`
- [ ] paste contents of `docs/github-release-v0.1.8.md`

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.8`
  - [ ] `@diegopetrucci/pi-notify@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-notify
pi install npm:@diegopetrucci/pi-extensions
```

- [ ] reload pi and confirm `notify` is available
- [ ] publish announcement copy from `docs/announcement-v0.1.8.md`
