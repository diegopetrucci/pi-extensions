# Publish checklist — v0.1.5

## Preflight

- [ ] confirm working tree contains only intended changes
- [ ] verify versions are `0.1.5`
  - [ ] `package.json`
  - [ ] `extensions/oracle/package.json`
- [ ] verify docs exist
  - [ ] `docs/oracle-provider-matrix.md`
  - [ ] `docs/release-notes-v0.1.5.md`
  - [ ] `docs/github-release-v0.1.5.md`
  - [ ] `docs/announcement-v0.1.5.md`
- [ ] verify preview asset exists: `assets/oracle-preview.svg`

## Local smoke tests

- [ ] `pi -e ./extensions/oracle/index.ts -p --no-session "/oracle-model"`
- [ ] `pi -e ./extensions/oracle/index.ts -p --no-session "Use the oracle tool once. Ask it to reply with exactly 'OK'. Then return exactly what the oracle said and nothing else."`
- [ ] optional: test explicit thinking override
  - [ ] `pi -e ./extensions/oracle/index.ts --mode json -p --no-session "Use the oracle tool once with thinkingLevel low. Ask it to reply with exactly 'OK'. Then return exactly what the oracle said."`

## Package sanity

- [ ] confirm collection package exposes both extensions in root `package.json`
- [ ] confirm oracle package has standalone metadata in `extensions/oracle/package.json`
- [ ] confirm package image points to `assets/oracle-preview.svg` where intended

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.5`

Example:

```bash
git add README.md package.json extensions/oracle assets/oracle-preview.svg docs
git commit -m "Add oracle extension"
git tag v0.1.5
```

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

## GitHub release

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.5
```

- [ ] create GitHub release for `v0.1.5`
- [ ] paste contents of `docs/github-release-v0.1.5.md`

## Post-publish validation

- [ ] verify npm package pages show `0.1.5`
  - [ ] `@diegopetrucci/pi-extensions`
  - [ ] `@diegopetrucci/pi-oracle`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-oracle
pi install npm:@diegopetrucci/pi-extensions
```

- [ ] reload pi and confirm `oracle` is available
- [ ] publish announcement copy from `docs/announcement-v0.1.5.md`
