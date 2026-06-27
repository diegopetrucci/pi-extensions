# Publish checklist — v0.1.53

## Release scope

- [x] fix unservable auto-selected model fallback in `extensions/oracle`, `extensions/contrarian`, and `extensions/librarian` (merged via PR #29)
- [x] bump standalone `@diegopetrucci/pi-oracle@0.1.16`
- [x] bump standalone `@diegopetrucci/pi-contrarian@0.1.1`
- [x] bump standalone `@diegopetrucci/pi-librarian@0.1.8`
- [x] bump root collection package to `@diegopetrucci/pi-extensions@0.1.53`
- [x] refresh `package-lock.json` local package versions

## Preflight and release docs

- [x] verify npm versions are unpublished for root `0.1.53`, oracle `0.1.16`, contrarian `0.1.1`, librarian `0.1.8`
- [x] create release docs
  - [x] `docs/release-notes-v0.1.53.md`
  - [x] `docs/github-release-v0.1.53.md`
  - [x] `docs/announcement-v0.1.53.md`
  - [x] `docs/publish-checklist-v0.1.53.md`
- [x] refresh dependencies with `npm ci`
- [x] run install-state preflight after `npm ci`
- [x] run local validation and smoke tests

## Validation

```bash
npm view @diegopetrucci/pi-extensions@0.1.53 version --json
npm view @diegopetrucci/pi-oracle@0.1.16 version --json
npm view @diegopetrucci/pi-contrarian@0.1.1 version --json
npm view @diegopetrucci/pi-librarian@0.1.8 version --json
npm ci
npm run preflight:install-state
npm run typecheck
for f in oracle contrarian librarian; do bun --check extensions/$f/index.ts; done
for f in oracle contrarian librarian; do npm exec -- tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck extensions/$f/index.ts; done
PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/oracle/index.ts -p "/oracle status"
PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/contrarian/index.ts -p "/contrarian status"
PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/librarian/index.ts -p "/librarian-config"
```

## Package dry-runs

- [x] root collection package dry-run
- [x] standalone oracle, contrarian, and librarian package dry-runs

```bash
npm pack --dry-run --json
npm pack --dry-run --json --workspace @diegopetrucci/pi-oracle
npm pack --dry-run --json --workspace @diegopetrucci/pi-contrarian
npm pack --dry-run --json --workspace @diegopetrucci/pi-librarian
```

## Commit, tag, and GitHub release

- [ ] commit release changes on non-main branch (`release-v0.1.53`)
- [ ] push branch `release-v0.1.53`
- [ ] open PR targeting `main`
- [ ] after PR merge, tag `v0.1.53` on `main`
- [ ] push tag `v0.1.53`
- [ ] create GitHub release using `docs/github-release-v0.1.53.md`

## Stop before npm publish

> Human-only: npm publishing depends on the authenticated npm session.

- [ ] human publishes root collection package

```bash
npm publish --access public
```

- [ ] human publishes standalone packages

```bash
npm publish --workspace @diegopetrucci/pi-oracle --access public
npm publish --workspace @diegopetrucci/pi-contrarian --access public
npm publish --workspace @diegopetrucci/pi-librarian --access public
```

## Post-publish validation

- [ ] wait 5 minutes after npm publishing completes
- [ ] verify npm registry/package pages show expected versions
- [ ] install validation after npm propagation

```bash
npm view @diegopetrucci/pi-extensions@0.1.53 name version dist.tarball --json
npm view @diegopetrucci/pi-oracle@0.1.16 name version dist.tarball --json
npm view @diegopetrucci/pi-contrarian@0.1.1 name version dist.tarball --json
npm view @diegopetrucci/pi-librarian@0.1.8 name version dist.tarball --json
```
