# Publish checklist — v0.1.6

## Preflight

- [ ] confirm working tree contains only intended changes
- [ ] verify versions are correct
  - [ ] `package.json` -> `0.1.6`
  - [ ] `extensions/permission-gate/package.json` -> `0.1.0`
- [ ] verify docs exist
  - [ ] `docs/release-notes-v0.1.6.md`
  - [ ] `docs/github-release-v0.1.6.md`
  - [ ] `docs/announcement-v0.1.6.md`
  - [ ] `docs/publish-checklist-v0.1.6.md`
- [ ] verify extension files exist
  - [ ] `extensions/permission-gate/index.ts`
  - [ ] `extensions/permission-gate/README.md`
  - [ ] `extensions/permission-gate/package.json`

## Local smoke tests

- [ ] load the extension directly and confirm pi starts

```bash
pi -e ./extensions/permission-gate/index.ts
```

- [ ] confirm a safe bash command is not blocked
- [ ] confirm a dangerous bash command triggers the selector in interactive mode
- [ ] optional: confirm non-interactive mode blocks matching commands by default

## Package sanity

- [ ] confirm collection package exposes all three extensions in root `package.json`
- [ ] confirm standalone permission gate package has correct metadata in `extensions/permission-gate/package.json`
- [ ] confirm root README includes install instructions for `permission-gate`
- [ ] confirm `extensions/permission-gate/README.md` links to the original `badlogic/pi-mono` example

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.6`

Example:

```bash
git add README.md package.json extensions/permission-gate docs
git commit -m "Add permission gate extension"
git tag v0.1.6
```

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone permission gate package

- [ ] publish standalone permission gate package

```bash
cd extensions/permission-gate
npm publish
cd ../..
```

## GitHub release

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.6
```

- [ ] create GitHub release for `v0.1.6`
- [ ] paste contents of `docs/github-release-v0.1.6.md`

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.6`
  - [ ] `@diegopetrucci/pi-permission-gate@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-permission-gate
pi install npm:@diegopetrucci/pi-extensions
```

- [ ] reload pi and confirm `permission-gate` is available
- [ ] publish announcement copy from `docs/announcement-v0.1.6.md`
