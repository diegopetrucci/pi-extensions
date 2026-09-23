# Pi 0.87.1 development-baseline validation

> **Development baseline only:** This record documents Pi `0.87.1` development compatibility. It does not certify the fleet; all `.pi-fleet-tested-version` markers remain `0.84.4`.

This record supersedes [`pi-0.85.1-validation.md`](./pi-0.85.1-validation.md) as the current development-baseline record. The 0.85.1 record remains the historical record of that work.

## Audited release range

The compatibility review covers every Pi release from `0.85.0` through `v0.87.1`: `0.85.0`, `0.85.1`, `0.86.0`, `0.86.1`, `0.87.0`, and `v0.87.1`. It includes the Pi 0.86.x catalog/API surface and the Pi 0.87.x baseline covered by the completed compatibility tickets. The maintained development dependency transition is from `^0.85.1` through `^0.87.0` to `^0.87.1`; `0.85.1` is the maintained pre-upgrade dependency baseline because Pi `0.85.0` had a published SDK import regression fixed in `0.85.1`.

## Implemented compatibility changes

- Set the root Pi development dependency ranges for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` to `^0.87.1`; the lockfile resolves each direct package to `0.87.1`.
- Updated `context-inspector` current-context analysis to use Pi 0.87's canonical session projection for omissions and replacements, while keeping raw full history and a safe older-runtime fallback.
- Updated dynamic context pruning's manual `/prune` inventory and refresh path to use canonical projected messages, with projection-aware correlation and the prior raw reconstruction fallback. Automatic context-event pruning, status snapshots, and persisted decision/stat behavior remain unchanged.
- Refreshed Oracle, Contrarian, and Code Reviewer provider/cross-provider ladders for the Pi 0.87.1 frontier catalog, including Meta and Radius, removed stale catalog patterns, aligned the provider matrix documentation, and preserved each role's existing provider coverage and fallback order.
- Added regression coverage confirming RPC-origin `steer`/`followUp` inline-bash input remains expandable while extension-origin and whole-line bash input remain bypassed; no production change was needed for that path.

## Pi v0.87.1 upstream-only changes

Pi `v0.87.1` adds Claude Opus 5.5, GPT-6 Sol, GPT-6 Luna, and Grok 4.7 to the supported model catalogs, and makes Grok 4.7 the new xAI default. Its runtime fixes remain upstream-only; the local model-policy refresh for these catalog additions is documented below:

- Split-turn compaction summaries are formatted so Claude Fable 5.1 does not refuse them.
- Missing or invalid `--mode` values now report an error and exit nonzero instead of being silently ignored.
- Image-only user messages for OpenAI-compatible providers no longer include an empty text part.
- Anthropic OAuth requests report the current Claude Code version.

## Completed 0.87.1 model-policy refresh

- Opus 5.5 now leads the affected Claude ladders, with exact hyphen/dot spellings before ambiguous Opus 5 patterns and regional Bedrock aliases retained.
- GPT-6 Astra remains above GPT-6 Sol/Luna; newer Sol/Luna tiers precede their GPT-5.6 counterparts on Amazon Bedrock, Azure, Cloudflare, Copilot, OpenAI, Codex, OpenCode, OpenRouter, Radius, and Vercel ladders.
- Grok 4.7 now precedes Grok 4.6 wherever the 0.87.1 catalog exposes both, including Copilot, OpenCode Go, OpenRouter, Vercel, and xAI.
- Oracle defaults GPT-6 Sol to `high`, while GPT-6 Astra and Claude Opus 5.5 retain `xhigh`; none of the new frontier models were added to fast-mode allowlists.
- Catalog-backed model-selection tests resolve actual model IDs under normal and reversed catalog order and assert version/tier invariants without requiring one Bedrock region.
- Raised the root collection unpacked-size budget from `2,225,000` to `2,235,000` bytes as rounded headroom for the approved exact-ID catalog strings; the package-size test remains green.

## Preliminary targeted validation

These checks were run for the reopened model-policy ticket before the final clean validation run:

- [x] `node --test test/provider-model-preferences-catalog.test.mjs test/provider-policy-contract.test.mjs test/oracle-model-selection.test.mjs test/contrarian-model-selection.test.mjs test/code-reviewer-model-selection.test.mjs` — passed; 130 tests passed.
- [x] `npm run typecheck` — passed.
- [x] `node --test test/package-size-budgets.test.mjs` — passed; 3 tests passed.
- [x] Read-only Pi 0.87.1 catalog probe for Code Reviewer on GitHub Copilot and Radius — passed; both normal and reversed catalog order resolved `gpt-6-astra`.

These targeted checks are preliminary evidence and do not replace the final ordered run.

## Final automated validation (completed baseline run)

The recorded final baseline run was completed from the repository root in exactly this order:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run preflight:install-state
npm run typecheck
npm test
```

Known results, in that same order:

- [x] `npm ci --ignore-scripts --no-audit --no-fund` — passed; 264 packages added, with deprecation warnings only.
- [x] `npm run preflight:install-state` — passed; 237 installed packages and 28 local package entries matched `package-lock.json`.
- [x] `npm run typecheck` — passed.
- [x] `npm test` — passed; full suite completed with zero failures and one intentional skip.

No command from the preliminary targeted validation belongs between these four commands. `pe-cmk0` validates this exact sequence, installed direct Pi `0.87.1` packages, and unchanged `0.84.4` fleet markers.

## Fleet certification status

- The automated result establishes a Pi 0.87.1 development baseline, not fleet certification.
- All 28 `.pi-fleet-tested-version` markers remain at `0.84.4`; no marker advancement is claimed.
- The completed automated validation did not run the manual certification matrix below.

## Open manual certification gates

These gates remain open and unclaimed:

- [ ] Fullscreen UI smoke, including footer/context behavior, the working indicator, and jump-to-latest behavior.
- [ ] Packaged native annotation submit/cancel and shutdown checks.
- [ ] Live-provider and subagent streaming, final-answer assembly, model selection, and thinking checks.
- [ ] Permission-gate behavior checks.
- [ ] Quiet-tool behavior checks.
- [ ] Clean shutdown checks.

Use [`smoke-checklist-pi-0.84.4.md`](./smoke-checklist-pi-0.84.4.md) as the existing manual procedure, targeting Pi `0.87.1` for these outstanding checks. Do not advance fleet markers until the manual gates pass; this record makes no manual certification claim.
