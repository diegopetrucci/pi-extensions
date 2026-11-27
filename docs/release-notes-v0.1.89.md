# Release notes — v0.1.89

## Public title

**Pi 1.7.0 compatibility and permission-aware approval dialogs**

## Highlights

- **Pi 1.7.0 development compatibility:** the development baseline moves from Pi 1.6.0 to 1.7.0, with automated checks only (`docs/pi-1.7.0-validation.md`). This release makes no fleet certification claim, and the `.pi-fleet-tested-version` markers are unchanged ([#248](https://github.com/diegopetrucci/pi-extensions/pull/248)).
- **Permission-aware approval prompts (`permission-gate`, `dirty-repo-guard`, `confirm-destructive`):** approval prompts report as permission requests (`blockedKind: "permission"`, Pi 1.6.1+) in terminals with program status; older Pi ignores it. In `confirm-destructive`, only the fork prompt changed ([#248](https://github.com/diegopetrucci/pi-extensions/pull/248)).
- **Refreshed model ladders (`oracle`, `contrarian`, `code-reviewer`):** entries removed from the Pi 1.7.0 catalog are dropped; `ant-ling` is restored (Ling 3.1 Flash > 3.2 Flash > 3.0 Flash; previously no match on Pi 1.7.0); `glm-5.4` ranks above `glm-5.3` on `zai` and `zai-coding-cn`; Qwen4 Max ranks above the previous top Qwen Max on Qwen Token Plan, `opencode-go`, and `together` (plus `vercel-ai-gateway` for `oracle` and `contrarian`); and `together` ranks GLM-5.3 above GLM-5.3-Flash. `oracle` and `contrarian` also rank `opencode` Kimi K3.1 Pro above K3 ([#248](https://github.com/diegopetrucci/pi-extensions/pull/248)).
- **`context-inspector` bash truncation:** the truncation note matches Pi 1.7.0 (saved path, save error, or plain `Output truncated`), and bash tool results show why full output could not be saved (`fullOutputError`) ([#248](https://github.com/diegopetrucci/pi-extensions/pull/248)).
- **`illustrations-to-explain-things` image fallback:** the skill's Pi codemode image-generation fallback (used when there is no `image_gen` tool) generates at 16:9, requires an image block in the result, and preserves the actual image format.

## Scope

Prepared 2026-11-27 on `release/v0.1.89-prep` from `origin/main` at `ba40953`, from the changes since `v0.1.88`. Nine packages are selected below: `code-reviewer`, `confirm-destructive`, `context-inspector`, `contrarian`, `dirty-repo-guard`, `illustrations-to-explain-things`, `oracle`, `permission-gate`, and the umbrella `@diegopetrucci/pi-extensions`. Package `CHANGELOG.md` newest entries are the source of truth for user-facing wording; `illustrations-to-explain-things` has no changelog file, so it is described here only.

The Pi development baseline moves from 1.6.0 to 1.7.0 (see `docs/pi-1.7.0-validation.md`). That record is automated development compatibility only; no fleet markers change and there is no fleet certification claim.

## Packaging

- `@diegopetrucci/pi-code-reviewer@0.1.22`
- `@diegopetrucci/pi-confirm-destructive@0.1.16`
- `@diegopetrucci/pi-context-inspector@0.1.20`
- `@diegopetrucci/pi-contrarian@0.1.25`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.15`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.11`
- `@diegopetrucci/pi-oracle@0.1.40`
- `@diegopetrucci/pi-permission-gate@0.1.21`
- `@diegopetrucci/pi-extensions@0.1.89`

## Validation

No release validation has been recorded yet beyond preparation facts: `npm ci` and `npm run preflight:install-state` passed, and the `prepare-release` dry-run selected 9 packages. Record further evidence here only after commands have completed (final validation is tracked separately).

## Contributor audit

The range `v0.1.88..ba40953` contains only repository-owner commits plus The Last Harness co-author trailer. No external human contributors or bots are credited, so the public body omits `## Contributors`. Reaudit through the final tag before publication.

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.22"],["@diegopetrucci/pi-confirm-destructive","0.1.16"],["@diegopetrucci/pi-context-inspector","0.1.20"],["@diegopetrucci/pi-contrarian","0.1.25"],["@diegopetrucci/pi-dirty-repo-guard","0.1.15"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.11"],["@diegopetrucci/pi-oracle","0.1.40"],["@diegopetrucci/pi-permission-gate","0.1.21"],["@diegopetrucci/pi-extensions","0.1.89"]] -->
