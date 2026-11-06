# Release notes — v0.1.85

## Public title

**Broader model coverage and refreshed subagent rankings**

## Highlights

- `code-reviewer` has explicit preference coverage for all 41 built-in chat-model providers (previously 13), retaining its existing role-specific ordering. Its preference matcher now uses the same ID-anchored matching as `oracle` and `contrarian` ([#205](https://github.com/diegopetrucci/pi-extensions/pull/205)).
- `oracle`, `contrarian`, and `code-reviewer` gain refreshed model ladders: Gemini 4 Argon leads Google, Vertex, and OpenCode Go; Mistral Large 4 precedes Medium 3.5; Fable 5.1 and Sonnet 5.5 precede older siblings; OpenCode Go gains Qwen3.8 Max and MiMo V2.6 Pro; Cloudflare AI Gateway gains GPT-6.x fallbacks. Common Opus 5.5 / GPT-6 Astra choices remain unchanged. These are curated preferences, not fresh benchmark or live-provider certification results ([#205](https://github.com/diegopetrucci/pi-extensions/pull/205)).
- Both annotation extensions ship generated package-local Glimpse helpers maintained from `shared/glimpse/`, with a deterministic synchronization command and CI drift checks. Their runtime implementation is unchanged apart from generated-file headers; the two patch bumps reflect changed packed artifacts, not a new UI feature ([#203](https://github.com/diegopetrucci/pi-extensions/pull/203)).

## Scope

Prepared from `f87d72ce15073b3dcbca6bd22a2a22b75a114992` (`origin/main`) on `release/v0.1.85` in `/Users/diegopetrucci/Developer/pi-extensions-release-v0.1.85`. The user's 2026-11-06 confirmation selects v0.1.85 with all current changes. The user subsequently explicitly approved committing this preparation, pushing the branch, and opening the release PR. Human review/merge and publishing safeguards remain mandatory.

Artifact comparison selected exactly the six packages below; the other 28 package artifacts matched their exact published manifest versions. In particular, the five standalone helpers (`developer`, `diff-summarizer`, `repo-scout`, `test-runner`, and `web-scout`) now match published `0.1.0` artifacts and are not republished. The v0.1.84 preparation documents remain historical and unchanged; this candidate uses a new tag identity rather than rewriting them.

The Pi development baseline stays at 1.5.0; no dependencies or fleet markers change. There is no new Pi compatibility, live-provider, interactive, visual, or fleet certification claim.

## Packaging

- `@diegopetrucci/pi-annotate-git-diff@0.1.16`
- `@diegopetrucci/pi-annotate-last-message@0.1.15`
- `@diegopetrucci/pi-code-reviewer@0.1.19`
- `@diegopetrucci/pi-contrarian@0.1.21`
- `@diegopetrucci/pi-oracle@0.1.36`
- `@diegopetrucci/pi-extensions@0.1.85`

## Validation

Pre-commit candidate verification on 2026-11-06, using Node `26.13.0` and npm `11.20.0`:

- `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed after version/lock synchronization (161 packages added).
- `npm run preflight:install-state` passed: 128 installed packages and 34 local package entries checked; 18 optional packages not installed.
- `npm run ci` passed: shared-source drift check, formatting (184 files), TypeScript, and 1,386 tests: **1,384 passed, 0 failed, 2 expected skips** (developer intentionally exposes write/edit). This includes standalone tarball runtime smoke tests. The previously observed `brrr` idle-time-sensitive test passed on this run; no exception is being carried into v0.1.85.
- Root and all 33 workspace `npm pack --dry-run --ignore-scripts --json` checks passed. Actual tarballs for exactly the six selected packages were packed; names, versions, SHA1, and SHA512 integrity were verified. Artifact metadata and decompressed-tar SHA256 evidence are in `docs/publish-checklist-v0.1.85.md`.
- Independent review identified one wording correction: Pi 1.5.0 has 42 providers, but only 41 expose chat models (`typesafe` is classifier-only). All three public/draft references now say 41 built-in chat-model providers. No other findings were reported.
- `git diff --check` passed. Logs/plans: `/tmp/pi-extensions-v0.1.85-{ci.log,dry-run.json,write.json,root-pack.json,workspace-packs.json}`; explicit six-package input: `/tmp/pi-extensions-v0.1.85-input.json`.

This is candidate-only evidence, not the required fresh merged-main gate. The authenticated npm trust-list inspection returned HTTP 401; no trusted-publisher configuration claim is made. Publishing is blocked pending authorized no-self-review protection correction and an eligible independent dispatch/review arrangement; see the checklist. At this pre-commit validation snapshot, no protection change, stage, commit, push, tag, GitHub release, workflow dispatch, environment approval, or npm publication had been performed. The subsequently approved preparation commit and PR are tracked in git history and the PR; they do not constitute publication.

## Contributor audit

Range `v0.1.83..f87d72c` contains #203, #204, and #205. GitHub PR authors and commit authors are all repository owner `diegopetrucci`; the only coauthor is The Last Harness. No external human contributor was identified, so the public release body has no empty Contributors section. Reaudit through the final tag before publication.

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-git-diff","0.1.16"],["@diegopetrucci/pi-annotate-last-message","0.1.15"],["@diegopetrucci/pi-code-reviewer","0.1.19"],["@diegopetrucci/pi-contrarian","0.1.21"],["@diegopetrucci/pi-oracle","0.1.36"],["@diegopetrucci/pi-extensions","0.1.85"]] -->
