# Publish checklist — v0.1.52

## Release scope

- [x] add `extensions/contrarian`
- [x] add root collection package registration for `./extensions/contrarian/index.ts`
- [x] document contrarian in the root README extension list
- [x] add standalone `@diegopetrucci/pi-contrarian@0.1.0` metadata
- [x] bump root collection package to `@diegopetrucci/pi-extensions@0.1.52`

## Preflight and release docs

- [x] verify npm versions are unpublished for root `0.1.52` and contrarian `0.1.0`
- [x] create release docs
  - [x] `docs/release-notes-v0.1.52.md`
  - [x] `docs/github-release-v0.1.52.md`
  - [x] `docs/announcement-v0.1.52.md`
  - [x] `docs/publish-checklist-v0.1.52.md`
- [x] refresh dependencies with `npm ci`
- [x] run install-state preflight after `npm ci`
- [x] run local validation and smoke tests

## Validation

```bash
npm view @diegopetrucci/pi-extensions@0.1.52 version --json
npm view @diegopetrucci/pi-contrarian@0.1.0 version --json
npm ci
npm run preflight:install-state
npm run typecheck
bun --check extensions/contrarian/index.ts
npm exec -- tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck extensions/contrarian/index.ts
PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/contrarian/index.ts -p "/contrarian status"
PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/contrarian/index.ts --list-models smoke
npm pack --dry-run --json --workspace @diegopetrucci/pi-contrarian
```

## Package dry-runs

- [x] root collection package dry-run
- [x] standalone contrarian package dry-run

```bash
npm pack --dry-run --json
npm pack --dry-run --json --workspace @diegopetrucci/pi-contrarian
```

## Commit, tag, and GitHub release

- [x] commit release changes on non-main branch (`750a82a`)
- [x] push branch `add-contrarian-extension`
- [x] open PR targeting `main`: https://github.com/diegopetrucci/pi-extensions/pull/28
- [ ] after PR merge, tag `v0.1.52` on `main`
- [ ] push tag `v0.1.52`
- [ ] create GitHub release using `docs/github-release-v0.1.52.md`

## Stop before npm publish

> Human-only: npm publishing depends on the authenticated npm session.

- [ ] human publishes root collection package

```bash
npm publish --access public
```

- [ ] human publishes standalone contrarian package

```bash
npm publish --workspace @diegopetrucci/pi-contrarian --access public
```

## Post-publish validation

- [ ] wait 5 minutes after npm publishing completes
- [ ] verify npm registry/package pages show expected versions
- [ ] install validation after npm propagation

```bash
npm view @diegopetrucci/pi-extensions@0.1.52 name version dist.tarball --json
npm view @diegopetrucci/pi-contrarian@0.1.0 name version dist.tarball --json
```
