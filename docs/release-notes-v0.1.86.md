# Release notes — v0.1.86

## Public title

**More Fast-mode models, plus context-pruning and annotation fixes**

## Highlights

- `fast` covers every Fast and Ultrafast model currently documented by OpenAI and Anthropic. The added models are:
  - Codex Fast (`priority`): `gpt-6.1-terra`.
  - Direct OpenAI API Fast: `gpt-6.1-terra` and `gpt-5.6-sol`.
  - Anthropic Fast: Claude Fable 5.2 and `claude-mythos-5-2`. The Mythos native ID is inferred from naming.
  - Ultrafast: `gpt-6-astra` and `gpt-6.1-sol`, with the existing API-key, `openai-responses`, canonical-endpoint, and no-fallback gates.

  The allowlists stay hardcoded by deliberate decision ([#217](https://github.com/diegopetrucci/pi-extensions/pull/217), [#221](https://github.com/diegopetrucci/pi-extensions/pull/221)).
- `fast` removes Claude Opus 4.8 from Anthropic Fast ahead of Anthropic's deprecation ([#218](https://github.com/diegopetrucci/pi-extensions/pull/218)).
- `dynamic-context-pruning` changes:
  - It derives read coverage from delivered truncation metadata.
  - It ignores errored reads when superseding earlier reads.
  - It accepts only finite numeric config values; anything else falls back to defaults ([#211](https://github.com/diegopetrucci/pi-extensions/pull/211), [#212](https://github.com/diegopetrucci/pi-extensions/pull/212)).
- Bug fixes ([#209](https://github.com/diegopetrucci/pi-extensions/pull/209)):
  - `oracle` and `contrarian` preserve split UTF-8 subprocess output.
  - `annotate-git-diff` parses Git output safely for any filename, loads unborn-repository content, and compares merge commits with their first parent.
  - `inline-bash` uses quote-aware delimiter matching.
- `git-footer` and `minimal-footer` ship generated copies of a canonical shared Git status backend, with no intended runtime change ([#207](https://github.com/diegopetrucci/pi-extensions/pull/207)).

## Scope

Prepared on 2026-11-10 from `150d44b` (`origin/main`) on `release/v0.1.86`, in `/Users/diegopetrucci/Developer/pi-extensions-release-v0.1.86`. The user explicitly requested the release checklist after #221 merged.

Artifact comparison selected exactly the nine packages below. The other 25 package artifacts match their published versions. #208, #210, #219, and #220 change only docs, CI, or gnosis, and do not affect packed artifacts on their own.

The Pi development baseline stays at 1.5.0, and no fleet markers change. There is no new Pi compatibility, live-provider, interactive, or fleet certification claim.

## Packaging

- `@diegopetrucci/pi-annotate-git-diff@0.1.17`
- `@diegopetrucci/pi-contrarian@0.1.22`
- `@diegopetrucci/pi-fast@0.1.12`
- `@diegopetrucci/pi-git-footer@0.1.14`
- `@diegopetrucci/pi-inline-bash@0.1.16`
- `@diegopetrucci/pi-minimal-footer@0.1.27`
- `@diegopetrucci/pi-oracle@0.1.37`
- `pi-dynamic-context-pruning@0.1.17`
- `@diegopetrucci/pi-extensions@0.1.86`

## Validation

Pre-commit candidate verification on 2026-11-10, using Node `26.13.0` and npm `11.20.0`:

- `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed after version and lock synchronization (161 packages added).
- `npm run preflight:install-state` passed: 128 installed packages and 34 local package entries checked; 18 optional packages not installed.
- `npm run ci` results:
  - First run: 1,422 tests, 1,419 passed, **1 failed**, 2 expected skips. The failure was `brrr warns and uses the default for a wrong-typed idleSeconds`, the idle-time-sensitive test already noted in v0.1.85. `brrr` is unchanged since v0.1.85.
  - Two immediate full reruns each passed: 1,420 passed, 0 failed, 2 expected skips. These runs include the shared-source drift check, formatting (187 files), TypeScript, and the standalone tarball runtime smoke tests.
  - Logs: `/tmp/pi-extensions-v0.1.86-ci{,-rerun1,-rerun2}.log`.
- Root and all 33 workspace `npm pack --dry-run --ignore-scripts --json` checks passed.
- Actual tarballs for exactly the nine selected packages were packed, and their names, versions, SHA1, and SHA512 integrity were verified. Artifact evidence is in `docs/publish-checklist-v0.1.86.md`.
- `git diff --check` passed. The explicit nine-package input is at `/tmp/pi-extensions-v0.1.86-input.json`.

This is candidate-only evidence, not the required fresh merged-main gate.

## Contributor audit

The range `v0.1.85..150d44b` contains #207–#212 and #217–#221.
- #217 was authored by external contributor [@chenxin-yan](https://github.com/chenxin-yan) and is credited in the public body.
- All other PRs and commits were authored by the repository owner `diegopetrucci`.
- Coauthors are `diegopetrucci` (on #217) and The Last Harness.
- No bots are credited.

Reaudit through the final tag before publication.

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-git-diff","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.22"],["@diegopetrucci/pi-fast","0.1.12"],["@diegopetrucci/pi-git-footer","0.1.14"],["@diegopetrucci/pi-inline-bash","0.1.16"],["@diegopetrucci/pi-minimal-footer","0.1.27"],["@diegopetrucci/pi-oracle","0.1.37"],["pi-dynamic-context-pruning","0.1.17"],["@diegopetrucci/pi-extensions","0.1.86"]] -->
