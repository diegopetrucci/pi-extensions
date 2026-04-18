# Publish checklist — v0.1.7

## Preflight

- [ ] confirm working tree contains only intended changes
- [ ] verify versions are correct
  - [ ] `package.json` -> `0.1.7`
  - [ ] `extensions/confirm-destructive/package.json` -> `0.1.0`
- [ ] verify docs exist
  - [ ] `docs/release-notes-v0.1.7.md`
  - [ ] `docs/github-release-v0.1.7.md`
  - [ ] `docs/announcement-v0.1.7.md`
  - [ ] `docs/publish-checklist-v0.1.7.md`
- [ ] verify extension files exist
  - [ ] `extensions/confirm-destructive/index.ts`
  - [ ] `extensions/confirm-destructive/README.md`
  - [ ] `extensions/confirm-destructive/package.json`

## Local smoke tests

- [ ] load the extension directly and confirm pi starts

```bash
pi -e ./extensions/confirm-destructive/index.ts
```

- [ ] confirm `/new` prompts before clearing the current session
- [ ] confirm session switching prompts when current session has user messages
- [ ] confirm `/fork` prompts before creating a fork
- [ ] optional: confirm non-interactive mode does not prompt and does nothing

## Package sanity

- [ ] confirm collection package exposes all four extensions in root `package.json`
- [ ] confirm standalone confirm-destructive package has correct metadata in `extensions/confirm-destructive/package.json`
- [ ] confirm root README includes install instructions for `confirm-destructive`
- [ ] confirm `extensions/confirm-destructive/README.md` links to the original `badlogic/pi-mono` example

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.7`

Example:

```bash
git add README.md package.json extensions/confirm-destructive docs
git commit -m "Add confirm destructive extension"
git tag v0.1.7
```

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone confirm-destructive package

- [ ] publish standalone confirm-destructive package

```bash
cd extensions/confirm-destructive
npm publish
cd ../..
```

## GitHub release

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.7
```

- [ ] create GitHub release for `v0.1.7`
- [ ] paste contents of `docs/github-release-v0.1.7.md`

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.7`
  - [ ] `@diegopetrucci/pi-confirm-destructive@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-confirm-destructive
pi install npm:@diegopetrucci/pi-extensions
```

- [ ] reload pi and confirm `confirm-destructive` is available
- [ ] publish announcement copy from `docs/announcement-v0.1.7.md`
