# Pi 1.5.2 development compatibility record

> Observation date: 2026-11-17.
>
> This is an automated development-compatibility record for moving the root development dependencies to Pi `1.5.2` and refreshing the preference catalogs. It is not visual, interactive, live-provider, fleet, or broader runtime certification. No final code review is claimed by this record.

## Scope and preserved baseline

- The root development dependency ranges for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` moved from `^1.5.0` to `^1.5.2`. The lockfile and installed `node_modules` resolve those three packages and transitive `@earendil-works/pi-agent-core` to `1.5.2`.
- Published package versions, peer ranges, and the existing `.pi-fleet-tested-version` markers are unchanged. No Pi `1.5.2` fleet certification is claimed and no fleet marker was advanced.
- Prior Pi compatibility records (including `docs/pi-1.5.0-validation.md`) remain historical and were not rewritten. No user settings, credentials, or installed runtime were changed.

## Investigation

With only the development dependencies moved to `1.5.2` (observed 2026-11-17 in a scratch copy), typecheck, format check, and sync passed with no source changes. `npm test` ran 1,516 tests with 4 failures:

- three catalog tests: `qwen-token-plan-individual-cn` coverage for oracle/contrarian and code-reviewer, and stale entries (Fireworks `gpt-oss-120b`, OpenRouter `minimax/minimax-m2.1`) no longer present in the Pi catalog;
- one macOS-idle-dependent brrr test, which depends on host idle state rather than Pi `1.5.2` and was fixed separately in PR #235.

## Changelog impact review

The Pi `1.5.1` and `1.5.2` changelogs were reviewed against the extensions in this repository:

- No extension uses `GrepOperations`/`ReadOperations`, overlay `ui.custom`, `registerMarkdownTransformer`, `ctx.switchSession`, or `ctx.shutdown`, so those changes have no impact.
- Fast mode adds its beta through payload `betas`, which Anthropic message-thread fingerprinting includes, so toggling Fast starts a new thread instead of failing a continuation. Cache-warm replays opt out of threads via `disableContinuation`, and since Pi `1.5.1` defaults `cacheWarming` to `"idle"`, warm replays still carry Fast's `speed`, keeping the Fast cache entry warm. No code change was needed.
- The grep `glob` is now interpreted relative to `path`. The triage-comments and web-scout grep guards remain safe under this behavior.

## Catalog changes

The preference catalogs in oracle, contrarian, and code-reviewer, plus `docs/oracle-provider-matrix.md` and `test/provider-model-preferences-catalog.test.mjs`, were refreshed for the models in the Pi `1.5.2` catalog:

- Claude Fable 5.2 was added ahead of Fable 5.1 for Anthropic, Bedrock, OpenCode, OpenRouter, Vercel AI Gateway, and Radius in oracle and contrarian, and for Anthropic, Bedrock, and Vercel AI Gateway in code-reviewer (code-reviewer has no Fable entries for OpenCode, OpenRouter, or Radius). `cloudflare-ai-gateway` and `github-copilot` received no Fable 5.2 entry because their catalogs lack it.
- Kimi K3.1 Pro was added ahead of Kimi K3 for Baseten, Together, and Fireworks (`kimi-k3p1-pro`) in all three extensions, plus Radius in oracle and contrarian; Bedrock gains `global.`/`us.` Kimi K3.1 entries in oracle and contrarian.
- A new `qwen-token-plan-individual-cn` ladder was added, and both `qwen-token-plan-individual` ladders now include GLM 5.3 ahead of GLM 5.2.
- Radius gained GPT-6.1 Terra, Gemini 4 Argon, Kimi K3.1 Pro, Fable 5.2, Mistral Large 4, and MiniMax M3 entries in oracle and contrarian; code-reviewer Radius gained only GPT-6.1 Terra and Gemini 4 Argon.
- Stale entries were removed: Fireworks `gpt-oss-120b` (all three) and OpenRouter `minimax/minimax-m2.1` (oracle and contrarian).

Catalog assertions cover selection behavior; they do not claim that a selected model was contacted through a live provider.

## Final automated validation evidence

Run from the repository root in the worktree with the uncommitted changes applied; not run in a scrubbed sandbox.

| Check | Observed result |
| --- | --- |
| Installed versions of `pi-ai`, `pi-coding-agent`, `pi-tui`, and `pi-agent-core` | All four `1.5.2`. |
| `npm run ci` | Passed (exit 0). Tests: **1,523 total, 1,521 passed, 0 failed, 0 cancelled, 2 skipped**. |
| `npm run format:check` | Passed. |
| `git diff --check` | Passed. |

Not run: live provider or OAuth calls, interactive or visual TUI sessions, and fleet certification. The `.pi-fleet-tested-version` markers are unchanged.

## Undo guidance

If this compatibility slice is not accepted, a human maintainer should review the VCS diff and use the normal reviewed VCS process to revert the dependency and catalog changes and this record, rather than a blanket checkout reset. User configuration and credentials were not part of the change set.
