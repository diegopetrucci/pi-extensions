# Pi 1.0.0 development compatibility record

> **Automated final validation closed as `validation-completed-with-approved-audit-exception` (2026-10-02):** this is a standalone development compatibility record for the Pi `1.0.0` dependency transition and the accepted targeted work. `pel-9nkv` executed all 13 ordered validation steps: **817 total, 816 passed, 0 failed, 1 Windows skip**; the root plus 27 workspaces packed as **28 packages with no bundled dependencies**; and `npm audit --json` remained **FAIL/exception** for exactly the approved nested `brace-expansion@5.0.9` advisories. This is not a fleet, native-UI, Windows, live-provider, paid-provider, or release certification. Independent final review `review1763e724` completed with development-handoff-only acceptance conditioned on this wording correction; no fully-passing or audit-clean claim is made.
>
> All 28 `.pi-fleet-tested-version` markers remain `0.84.4`; marker advancement is outside this ticket. The historical Pi validation records and published release documents are preserved byte-for-byte. The known dependency audit exception remains visible below.

## Scope, branch, and provenance

- Existing branch: `chore/pi-0.99-baseline`, for PR #100. No separate PR was created.
- Baseline comparison commit: [`895e599289d4ce039c45f0fbc154f096a910fb51`](https://github.com/diegopetrucci/pi-extensions/commit/895e599289d4ce039c45f0fbc154f096a910fb51), `feat: add Pi 0.99 compatibility baseline`. Its parent [`0f766a6d20f7caf7d76e9554fc9f1eeb3a60a3dd`](https://github.com/diegopetrucci/pi-extensions/commit/0f766a6d20f7caf7d76e9554fc9f1eeb3a60a3dd) is the merged annotation PR #96 change. This record is uncommitted.
- The direct development trio is `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` `1.0.0`; `package.json` declares `^1.0.0` and the lockfile resolves exactly `1.0.0`. The Pi packages retain the Node engine requirement `>=22.19.0`; this repository's TypeScript 6.0.3 toolchain was not migrated.
- npm registry metadata identifies the three `1.0.0` artifacts with upstream `gitHead` [`a13d35a742c6ef8462812a28fbe1d8c8b7431c32`](https://github.com/earendil-works/pi/tree/a13d35a742c6ef8462812a28fbe1d8c8b7431c32). The lockfile records these exact tarball integrities:
  - `pi-ai`: `sha512-3/W1vdDaVtpeMd23ElvJC12HLA5yS/BGqqcXF+0SK082dN7cbgNcCwguTBRBC258Ke8SzSvUW1B75iAf8w8IxA==`
  - `pi-coding-agent`: `sha512-/FtbxoSQU/mEv1QnichJjRjqteqaIaMWxmhB4G367+MwZfX7/DI5B9YAg5lqbN7nztFskBEtUSZ+FlmMBECtMw==`
  - `pi-tui`: `sha512-JsT7kXnpZA2YOtQu6RyriyxEO0eJIzPyfiH09bH+OLN5+s18HYkwaUD/tBkjhnSfMu6/50CQPRYJagzSP6HdPw==`
- The complete upstream references read for this record are the `1.0.0` [`CHANGELOG.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/CHANGELOG.md), [`extensions.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/extensions.md), [`packages.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/packages.md), [`models.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/models.md), [`providers.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/providers.md), [`settings.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/settings.md), [`mcp.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/mcp.md), [`virtual-models.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/virtual-models.md), [`themes.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/themes.md), [`tui.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/tui.md), and [`session-format.md`](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/docs/session-format.md).
- No version bump, tag, commit, push, GitHub release, npm publication, installed TLH change, real credential/configuration inspection, or live/paid provider request was performed. No README compatibility pointer was needed; its extension lists remain alphabetically ordered.

The root `extensions/*` workspace pattern was reconciled against every manifest. It contains 27 workspaces, listed in full below; the root package plus those 27 workspaces is the 28-package validation target.

## Evidence boundaries

The evidence classes are deliberately separate. A result from one class must not be promoted into another class or into certification.

### Historical evidence

- `docs/pi-0.85.1-validation.md`, `docs/pi-0.87.1-validation.md`, and `docs/pi-0.99.0-validation.md` remain unchanged from baseline commit `895e599...`.
- Existing published history (`docs/release-notes-*.md`, `docs/github-release-*.md`, and `docs/publish-checklist-*.md`) remains unchanged from that baseline. This new record does not rewrite or backfill those documents.
- The Pi `0.99.0` record is the historical compatibility baseline, not Pi `1.0.0` final evidence. Its recorded Pi-only run was **770 total, 769 passed, 1 native-Windows skip**; its `npm audit --json` exited 1 for the documented brace-expansion exception; and its package dry-run covered the root plus 27 workspaces. Those old totals, audit result, and package-load evidence are retained there and are not silently relabeled as 1.0.0 results.

### Isolated pre-implementation evidence

- The `pel-govd` investigation artifact `/tmp/pi-100-full-investigation.236d4k` captured an isolated upstream-Pi-`1.0.0` snapshot before implementation: **773 total, 772 passed, 1 native-Windows skip**. This is historical pre-implementation evidence only; it is not evidence from the final checkout.
- An earlier model-policy developer run reported `npm test`: **815 passed, 1 skipped** before the Bedrock correction and Fast final integration. It is retained as pre-final integration evidence, not as final checkout evidence.
- The initial `pel-4vsv` integration run reported **208 passed and 1 stale Fast-allowlist expectation failure**. The expected set was corrected within the approved catalog-test scope and the subsequent targeted run was 209/209. The stale expectation is not an accepted product exception.

### Accepted targeted evidence

The following reports are accepted owning-ticket evidence. They complement the completed `pel-9nkv` automated run. Independent final review `review1763e724` is complete with development-handoff-only acceptance conditioned on this wording correction; the remaining manual gates remain separate.

| Owner | Accepted artifact/review | Observed result and scope |
| --- | --- | --- |
| `pel-govd` | `05b124e4`, with correction `cb9ac329` | `npm run preflight:install-state` passed with 240 installed packages and 28 local entries; `npm run typecheck` passed; the focused command covering the real-host SDK regression, package manifests, workspace metadata, and annotation orchestration passed 33/33. The test covers empty/read/read+bash/research allowlists, reload, late direct/deferred tools, restored transcripts, positive controls, and zero credential/provider access. |
| `pel-govd` review | `f4e2b2ed` | Independently ran the corrected SDK isolation test 7/7 and verified the restored 14-tool transcript input, absent/empty controls, and captured extension errors. This is focused review evidence, not a full-suite or live-provider result. |
| `pel-4vsv` | `688ee492`, correction `bae679e8`, independent review `39c874b2` child 0 | Typecheck passed; the final approved model-policy command passed 209/209 after the stale Fast expectation was corrected. The independent review repeated typecheck and 209 targeted tests. GPT-6.1 Sol preference, thinking, provider scope, explicit override, fallback, and Pro/Fast exclusion behavior are covered. |
| `pel-fll8` | implementation `2edde9d4`, README correction `39c874b2` child 1, review `2dffc093` | Typecheck passed; the focused Fast/provider/footer command passed 49/49. Mocked direct API-key/OAuth eligibility and payload behavior passed, while legacy Codex GPT-6.1 Sol remained fail-closed. Review required and the corrected implementation restored the direct-OAuth manual gate caveat. |

These reports used temporary fixture models/configuration where needed. They do not establish live OAuth, remote `service_tier` acceptance, paid-provider behavior, native rendering, Windows PowerShell, packaged annotation behavior, fleet compatibility, or a clean audit.

### Final evidence: automated validation closed with approved audit exception

The approved worker report is `run70d8b58f`: `/Users/diegopetrucci/.the-last-harness-main/agent/sessions/--Users-diegopetrucci-Developer-pi-extensions-lion--/subagent-artifacts/70d8b58f-a677-4a6d-a3a4-75aa06446db7_test-runner_output.md`. Its raw output is preserved at `/var/folders/nq/fkrbfck57y91r169_934fxb80000gn/T/pi-subagents-uid-501/async-subagent-runs/70d8b58f-a677-4a6d-a3a4-75aa06446db7/output-0.log`.

The earlier setup attempt `8d1ee429` passed its steps 1–3, then stopped at step 4 before installation because npm was given the same `/dev/null` path as both `NPM_CONFIG_USERCONFIG` and `NPM_CONFIG_GLOBALCONFIG`; npm rejected the duplicate user/global config load. Steps 5–13 were not run in that attempt and are not test or audit evidence. A human-approved restart used distinct empty `mktemp` files for the two npm config paths while retaining the scrubbed environment, disposable `HOME`, disposable `PI_CODING_AGENT_DIR`, and `PI_OFFLINE=1` isolation.

The worker report counts its preliminary `tk show pel-9nkv` inspection as item 1 and therefore labels the following evidence 2–14. The numbering below is the actual `pel-9nkv` ticket numbering: its 13 validation commands, without the extra ticket inspection.

| Ticket step | Exact result |
| --- | --- |
| 1 | `node --version` exited 0: `v26.10.0`. |
| 2 | `npm --version` exited 0: `11.19.1`. |
| 3 | Checkout/status command exited 0: `HEAD` `895e599289d4ce039c45f0fbc154f096a910fb51`, branch `chore/pi-0.99-baseline`, expected pre-existing dirty worktree. |
| 4 | Isolated `npm ci --ignore-scripts --no-audit --no-fund` exited 0; 267 packages added. |
| 5 | Isolated `npm run preflight:install-state` exited 0; 240 installed packages and 28 local package entries matched. |
| 6 | Trio assertion exited 0; `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` each resolved to `1.0.0`. |
| 7 | Isolated `npm run typecheck` exited 0. |
| 8 | Isolated `npm test` exited 0: **817 tests, 816 passed, 0 failed, 1 skipped**; the skipped test is the native Windows PowerShell parser case. |
| 9 | Isolated `npm audit --json` exited 1 with only the approved nested `brace-expansion@5.0.9` finding and the three known GHSA IDs below; this is **FAIL/exception**, not an audit pass. |
| 10 | Workspace pack assertion exited 0: root plus all 27 workspaces, **28 packages**, no bundled dependencies. |
| 11 | `git diff --check` exited 0. |
| 12 | Marker/document assertion exited 0: all 28 markers remained `0.84.4`, and historical validation/release documents were unchanged from baseline. |
| 13 | Status/stat/staged-file command exited 0; the changed paths were pre-existing or this record, and `git diff --cached --name-only` was empty. |

The completed run is therefore closed as **validation-completed-with-approved-audit-exception**: steps 1–8 and 10–13 passed, step 9 failed only for the approved development-only audit exception, and no overall fully-passing claim is made. The 28-package result is packaging evidence; native, live-provider, Windows-platform, fleet, release, and manual gates remain separate and pending. Independent final review `review1763e724` is complete for development handoff only; no audit pass or stronger certification is implied.

#### Reproducible corrected command sequence

The worker first ran `tk show pel-9nkv` (report item 1, not a numbered validation step). The exact corrected 13-step sequence is retained here so it remains reproducible after session tickets are cleaned up.

**1.**
```sh
node --version
```

**2.**
```sh
npm --version
```

**3.**
```sh
git rev-parse HEAD && git branch --show-current && git status --short
```

**4.**
```sh
env -i PATH="$PATH" HOME="$(mktemp -d /tmp/pel-pi100-validation-home.XXXXXX)" PI_CODING_AGENT_DIR="$(mktemp -d /tmp/pel-pi100-validation-agent.XXXXXX)" PI_OFFLINE=1 NPM_CONFIG_USERCONFIG="$(mktemp /tmp/pel-pi100-npm-user.XXXXXX)" NPM_CONFIG_GLOBALCONFIG="$(mktemp /tmp/pel-pi100-npm-global.XXXXXX)" npm ci --ignore-scripts --no-audit --no-fund
```

**5.**
```sh
env -i PATH="$PATH" HOME="$(mktemp -d /tmp/pel-pi100-validation-home.XXXXXX)" PI_CODING_AGENT_DIR="$(mktemp -d /tmp/pel-pi100-validation-agent.XXXXXX)" PI_OFFLINE=1 NPM_CONFIG_USERCONFIG="$(mktemp /tmp/pel-pi100-npm-user.XXXXXX)" NPM_CONFIG_GLOBALCONFIG="$(mktemp /tmp/pel-pi100-npm-global.XXXXXX)" npm run preflight:install-state
```

**6.**
```sh
node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; const p=JSON.parse(fs.readFileSync("package.json")); const l=JSON.parse(fs.readFileSync("package-lock.json")); for(const n of ["pi-ai","pi-coding-agent","pi-tui"]){const k="@earendil-works/"+n; assert.equal(p.devDependencies[k],"^1.0.0"); assert.equal(l.packages["node_modules/"+k].version,"1.0.0"); assert.equal(JSON.parse(fs.readFileSync("node_modules/"+k+"/package.json")).version,"1.0.0"); console.log(k+" 1.0.0");}'
```

**7.**
```sh
env -i PATH="$PATH" HOME="$(mktemp -d /tmp/pel-pi100-validation-home.XXXXXX)" PI_CODING_AGENT_DIR="$(mktemp -d /tmp/pel-pi100-validation-agent.XXXXXX)" PI_OFFLINE=1 NPM_CONFIG_USERCONFIG="$(mktemp /tmp/pel-pi100-npm-user.XXXXXX)" NPM_CONFIG_GLOBALCONFIG="$(mktemp /tmp/pel-pi100-npm-global.XXXXXX)" npm run typecheck
```

**8.**
```sh
env -i PATH="$PATH" HOME="$(mktemp -d /tmp/pel-pi100-validation-home.XXXXXX)" PI_CODING_AGENT_DIR="$(mktemp -d /tmp/pel-pi100-validation-agent.XXXXXX)" PI_OFFLINE=1 NPM_CONFIG_USERCONFIG="$(mktemp /tmp/pel-pi100-npm-user.XXXXXX)" NPM_CONFIG_GLOBALCONFIG="$(mktemp /tmp/pel-pi100-npm-global.XXXXXX)" npm test
```

**9.**
```sh
env -i PATH="$PATH" HOME="$(mktemp -d /tmp/pel-pi100-validation-home.XXXXXX)" PI_CODING_AGENT_DIR="$(mktemp -d /tmp/pel-pi100-validation-agent.XXXXXX)" PI_OFFLINE=1 NPM_CONFIG_USERCONFIG="$(mktemp /tmp/pel-pi100-npm-user.XXXXXX)" NPM_CONFIG_GLOBALCONFIG="$(mktemp /tmp/pel-pi100-npm-global.XXXXXX)" npm audit --json
```

**10.**
```sh
env -i PATH="$PATH" HOME="$(mktemp -d /tmp/pel-pi100-validation-home.XXXXXX)" PI_CODING_AGENT_DIR="$(mktemp -d /tmp/pel-pi100-validation-agent.XXXXXX)" PI_OFFLINE=1 NPM_CONFIG_USERCONFIG="$(mktemp /tmp/pel-pi100-npm-user.XXXXXX)" NPM_CONFIG_GLOBALCONFIG="$(mktemp /tmp/pel-pi100-npm-global.XXXXXX)" node --input-type=module -e 'import {execFileSync} from "node:child_process"; import assert from "node:assert/strict"; const p=JSON.parse(execFileSync("npm",["pack","--dry-run","--workspaces","--include-workspace-root","--json"],{encoding:"utf8",maxBuffer:16777216})); assert.equal(p.length,28); for(const x of p){assert.equal((x.bundled??[]).length,0,x.name); console.log(x.name+" "+x.version+" files="+x.files.length);}'
```

**11.**
```sh
git diff --check
```

**12.**
```sh
node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {execFileSync} from "node:child_process"; const base="895e599289d4ce039c45f0fbc154f096a910fb51"; const paths=execFileSync("git",["ls-tree","-r","--name-only",base],{encoding:"utf8"}).trim().split("\n"); const markers=paths.filter(p=>p.endsWith(".pi-fleet-tested-version")); assert.equal(markers.length,28); for(const p of markers){const data=fs.readFileSync(p); assert.equal(data.toString().trim(),"0.84.4"); assert.ok(data.equals(execFileSync("git",["show",base+":"+p])));} for(const p of paths.filter(p=>/^docs\/(pi-.*-validation|release-notes-.*|github-release-.*|publish-checklist-.*)\.md$/.test(p))) assert.ok(fs.readFileSync(p).equals(execFileSync("git",["show",base+":"+p])),p); console.log("28 unchanged 0.84.4 markers; historical validation/release documents unchanged");'
```

**13.**
```sh
git diff --stat && git status --short && git diff --cached --name-only
```

The raw audit output reported one high vulnerability, `brace-expansion`, at `node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion`, with `metadata.vulnerabilities.total=1`, `high=1`, `critical=0`, and `fixAvailable=true`. Its `via` entries were exactly `GHSA-q2hr-2g5m-vwhr` (range `>=4.0.0 <5.0.12`), `GHSA-qhr7-859c-m2p7` (range `>=4.0.0 <5.0.11`), and `GHSA-6j4f-fj2g-mc7p` (range `>=4.0.0 <5.0.10`). No new advisory was found. The raw log is the source for the complete JSON; this record deliberately keeps the result visible as **FAIL/approved exception**, never as audit-clean or fully passing.

## Pi 1.0 upstream contract changes and local limits

### Fullscreen and native UI

Pi `1.0.0` changes the interactive TUI default to `fullscreen`; `tuiMode: "regular"` or `--tui-mode regular` is the explicit scrollback-preserving alternative. The `system` theme remains the terminal-palette default, and Pi 1.0 documents fullscreen mouse routing, theme changes, and terminal capability handling.

This repository did not run a native UI smoke in this ticket. The remaining manual gate must exercise fullscreen and regular-mode startup, narrow and wide footer/theme rendering, context and routed-model display, annotation submit/cancel/close behavior, clean shutdown, and packaged collection/standalone layouts. Native behavior on Windows, including PowerShell safety, remains unverified. No terminal, user configuration, or installed runtime was changed here.

### MCP naming, discovery, and OAuth credential migration

Pi `1.0.0` normalizes MCP server/tool names: characters outside letters, digits, and `_` become `_`; tool collisions receive a hash suffix; server names differing only by `-` and `_` are rejected. MCP servers with `codemode` exposure are discovered through `searchTools()`/`describeNamespace()` rather than being expanded in the codemode description, while deferred tools are activated through `tool_search`; direct tools remain the explicitly declared startup path. Background discovery and the new namespace names must not be confused with removal of MCP resources.

Pi `1.0.0` also keys MCP OAuth credentials by server name and URL. URL-only credentials migrate to the first server that uses them. A rollback to an older Pi must not assume that the older key layout or pre-normalization server name will consume the migrated entry. If an operator later authorizes a product rollback, preserve a separately created pre-upgrade copy of the MCP configuration/auth state and restore only that scoped copy after review; never delete credential files or apply a blanket home-directory restore. This ticket did not inspect or mutate any user configuration or credential file.

### Named-tool isolation is not resource isolation

The real-host child-session regression uses explicit tool allowlists and proves that built-in, MCP-namespaced, extension, and custom tools absent from the allowlist are absent from active, callable, and definition surfaces, including after reload, late registration, attempted reactivation, transcript restoration, and restored reload. It also proves the positive late direct/deferred tools when they are allowed.

The same fixture deliberately keeps resource discovery, extension hooks, provider registration, skills, prompt templates, themes, and context files enabled where the child policy permits them. The result is a **named-tool activation/callability boundary**, not blanket resource isolation and not a universal arbitrary-MCP or shell sandbox. The named-tool guarantee does not silently authorize arbitrary custom/override/later-handler behavior. This distinction is retained in the Code Reviewer and research/review workspace evidence.

### Default Codex model versus local policy

Upstream Pi `0.99.1`/`1.0.0` adds GPT-6.1 Sol to OpenAI, Azure OpenAI Responses, and OpenAI Codex and changes the upstream default OpenAI Codex model to `gpt-6.1-sol`. That upstream default is not a user-configuration change performed by this repository.

The local Oracle, Contrarian, and Code Reviewer changes add only verified exact normal GPT-6.1 Sol patterns at their existing preference slots. Explicit model selections, scoped models, provider/family policy, and explicit overrides retain authority; Pro and Fast variants are not promoted into the normal Sol slot. Oracle extends its existing exact Sol high-thinking rule to GPT-6.1 Sol. The installed catalog reports `off: null` for these models; capability clamping remains authoritative, and the tests cover the Codex `minimal` to `low` mapping and rejection of unsupported `off` reasoning. No user model settings were inspected or changed.

## GPT-6.1 Sol and Fast evidence

### Selection and thinking

`pel-4vsv` changed only the approved model-policy surfaces:

- Oracle, Contrarian, and Code Reviewer recognize exact normal GPT-6.1 Sol IDs in the installed Pi 1.0 catalog, including the verified regional/global Bedrock IDs where applicable.
- The normal slot is inserted before the prior normal Sol slot while preserving earlier Astra/cross-family choices and older fallback order.
- Bedrock Code Reviewer intentionally keeps Claude Sonnet 5 ahead of GPT-6.1 Sol; the correction removed the three inappropriate Code Reviewer Bedrock entries and added a regression for that boundary.
- OpenRouter/Vercel GPT-6.1 Sol Pro/Fast IDs are not treated as normal Sol matches.
- Oracle's automatic exact GPT-6.1 Sol choice requests `high` thinking, explicit choices still win, and model capability maps clamp the effective level. This is mocked/catalog evidence, not a provider response.

### Unified Fast: direct OpenAI only

The approved Fast scope is intentionally narrow. The active unified `fast` extension enables exact `gpt-6.1-sol` only on the existing direct OpenAI route (`provider: openai`, `openai-responses` or `openai-completions`), with the existing opt-in behavior, API-key or Pi `openai` ChatGPT OAuth eligibility, and `service_tier: "fast"` payload rule. Existing payload fields are not overwritten.

The direct OAuth gate is specific and remains open: acceptance of `service_tier: "fast"` by Pi's `openai` ChatGPT OAuth sign-in endpoint has **not** been live-verified and is deferred to manual gate `pel-71t6`. The direct route is never forwarded to legacy `openai-codex` or its subscription-usage endpoint. The OpenAI [Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode) and [GPT-6.1 Sol model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol) are request-shape/model evidence only; mocked tests do not certify the remote sign-in endpoint.

GPT-6.1 Sol remains intentionally unsupported on the legacy `openai-codex` Fast route. The [Codex speed guide](https://developers.openai.com/codex/speed/) lists GPT-6.1 Sol Fast, but Pi's legacy Codex service-tier cost handling accounts for `priority` and `flex`, not `fast`, and direct-API `priority` alias documentation does not prove legacy-Codex wire or cost behavior. The route therefore fails closed before OAuth inspection, receives no Fast tier, and remains deferred. No upstream pricing patch or live-certification claim was made. Retired `openai-fast` and `claude-fast` are unchanged.

## Known failed audit exception — not a pass

The completed ordered Pi 1.0 host validation (`run70d8b58f`, ticket step 9) ran `npm audit --json` and exited 1. It reported only the human-approved development-only exception at the nested path `node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion`, version `5.0.9`, under `minimatch@10.2.6`. The known advisory IDs are:

- `GHSA-q2hr-2g5m-vwhr`
- `GHSA-qhr7-859c-m2p7`
- `GHSA-6j4f-fj2g-mc7p`

The Pi 1.0.0 shrinkwrap and current lockfile still resolve that nested `brace-expansion@5.0.9`. The earlier `pel-9tf4` investigation found no safe effective repository fix: Pi coding-agent releases in the investigated range retain the shrinkwrapped resolution, an npm override cannot supersede it, and manually editing a lock entry would be false because `npm ci` restores the shrinkwrap. The exception is limited to this development Pi host dependency. Published extension packages keep Pi host modules as peers and do not bundle this nested host dependency. The separate embedded Monaco/DOMPurify risk remains an inherited, npm-audit-invisible issue and is not claimed fixed here.

The raw `run70d8b58f` output recorded exactly these three advisories and no new finding. The known audit failure remains **FAIL/exception**, never an audit pass or an overall passing result. The complete raw JSON path and reproducible audit command are preserved in the final-evidence section above.

## Complete 27-workspace inventory

Each row is included even when Pi 1.0 caused no workspace-specific source change. “Dependency-only” means there was no workspace-specific source change; the completed automated evidence below covers the full suite and the root-plus-27 pack assertion, while native/live/manual behavior remains a separate gate.

| Workspace | Package and entry | Pi 1.0 disposition | Evidence / remaining limit |
| --- | --- | --- | --- |
| `agent-workflow-audit` | `@diegopetrucci/pi-agent-workflow-audit`; `index.ts` | Dependency-only; isolated SDK workflow remains unchanged. | Existing safety/tool-boundary behavior is retained; the completed full-suite and root-plus-27 pack evidence is recorded above, while native, command, and live behavior remain separate gates. |
| `annotate-git-diff` | `@diegopetrucci/pi-annotate-git-diff`; `index.ts` | Dependency-only; native Glimpse annotation entry remains represented. | No Pi 1.0 source change; the package is included in the completed 28-package pack assertion, while submit/close/clipboard/worker/shutdown behavior remains a native manual gate. |
| `annotate-last-message` | `@diegopetrucci/pi-annotate-last-message`; `index.ts` | Dependency-only; native annotation entry remains represented. | No Pi 1.0 source change; the package is included in the completed 28-package pack assertion, while cancel/close/no-send and packaged native behavior remain a manual gate. |
| `brrr` | `@diegopetrucci/pi-brrr`; `index.ts` | Dependency-only; settled-run notification behavior remains unchanged. | No Pi 1.0 source change; the package is included in the completed pack assertion, while platform notification behavior remains a manual gate. |
| `claude-fast` | `@diegopetrucci/pi-claude-fast`; `index.ts` | Retired standalone Fast boundary; unchanged. | No GPT-6.1 Sol or new auth capability was added; live provider behavior is unclaimed. |
| `code-reviewer` | `@diegopetrucci/pi-code-reviewer`; `index.ts` | GPT-6.1 Sol preference and Pi 1.0 SDK-boundary regressions added. | `pel-govd` 33-test evidence and `pel-4vsv` 209-test evidence cover mocked/fixture behavior; the completed full suite and 28-package pack are recorded above, while packaged native/live behavior remains a separate gate. |
| `confirm-destructive` | `@diegopetrucci/pi-confirm-destructive`; `index.ts` | Dependency-only; confirmation guard unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while interactive confirmation remains a manual gate. |
| `context-cap` | `@diegopetrucci/pi-context-cap`; `index.ts` | Dependency-only; known-physical context-cap policy unchanged. | Pi 0.99 accepted process-wide cap limitation remains historical; Pi 1.0 routed/native/manual behavior is not certified. |
| `context-inspector` | `@diegopetrucci/pi-context-inspector`; `index.ts` | Dependency-only; canonical projection/routed identity behavior unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while native context display remains a manual gate. |
| `contrarian` | `@diegopetrucci/pi-contrarian`; `index.ts` | GPT-6.1 Sol preference policy updated; resource/tool boundary remains explicit. | Covered by the 209 targeted model-policy tests and accepted SDK/resource evidence; live subprocess/provider behavior remains unclaimed. |
| `dirty-repo-guard` | `@diegopetrucci/pi-dirty-repo-guard`; `index.ts` | Dependency-only; trust/dirty-state guard unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while the interactive prompt remains a manual gate. |
| `dynamic-context-pruning` | `pi-dynamic-context-pruning`; `index.ts` | Dependency-only; append-only pruning policy unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout; no separate native/live claim is made for context-hook behavior. |
| `fast` | `@diegopetrucci/pi-fast`; `index.ts` | Direct OpenAI GPT-6.1 Sol Fast added; legacy Codex route remains blocked. | `pel-fll8` 49 focused mocked tests pass; the completed full suite and pack assertion are recorded above, while direct OAuth remote acceptance, live pricing/cost, and native status remain separate gates. |
| `git-footer` | `@diegopetrucci/pi-git-footer`; `index.ts` | Dependency-only; host theme-controlled footer unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while fullscreen/theme/native rendering remains a manual gate. |
| `gnosis` | `@diegopetrucci/pi-gnosis`; `index.ts` | Dependency-only; bounded repo-knowledge tool unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while any nested-tool acceptance remains a separate gate where applicable. |
| `illustrations-to-explain-things` | `@diegopetrucci/pi-illustrations-to-explain-things`; `skills` | Dependency-only skill package; no executable entrypoint. | Skill remains represented in the 27-workspace inventory; executable typecheck is not applicable, and its package is included in the completed 28-package pack assertion. |
| `inline-bash` | `@diegopetrucci/pi-inline-bash`; `index.ts` | Dependency-only; input expansion guard unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while shell/platform behavior remains a manual gate. |
| `librarian` | `@diegopetrucci/pi-librarian`; `index.ts` | Dependency-only; isolated research SDK boundary unchanged. | Named-tool/resource distinction is covered by accepted boundary evidence; the completed full suite and pack assertion cover the automated checkout, while GitHub/live provider behavior remains a separate gate. |
| `minimal-footer` | `@diegopetrucci/pi-minimal-footer`; `index.ts` | Dependency-only; direct OAuth/legacy Codex usage separation from Pi 0.99 remains. | No Pi 1.0 source change; native footer and live usage behavior remain unclaimed. |
| `notify` | `@diegopetrucci/pi-notify`; `index.ts` | Dependency-only; settled-run notification behavior unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while platform notification behavior remains a manual gate. |
| `openai-fast` | `@diegopetrucci/pi-openai-fast`; `index.ts` | Retired standalone Fast boundary; unchanged. | No GPT-6.1 Sol or new auth capability was added; compatibility was not expanded to this package. |
| `oracle` | `@diegopetrucci/pi-oracle`; `index.ts` | GPT-6.1 Sol preference and exact Sol high-thinking rule added. | Covered by `pel-4vsv` targeted selection/thinking evidence and the completed full suite/pack assertion; live provider, resource, and native behavior remain separate gates. |
| `permission-gate` | `@diegopetrucci/pi-permission-gate`; `index.ts` | Dependency-only; named-tool safety guard unchanged. | Accepted Pi 0.99 nested evidence is historical; the completed full suite and pack assertion cover the automated checkout, while Pi 1.0 packaged/native/Windows/fake-UI behavior remains a manual gate. |
| `quiet-tools` | `@diegopetrucci/pi-quiet-tools`; `index.ts` | Dependency-only; render/wrapper behavior unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while named-tool and native rendering remain separate gates. |
| `review` | `@diegopetrucci/pi-review`; `index.ts` | Dependency-only; branch/review state behavior unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while interactive behavior remains a manual gate. |
| `todo` | `@diegopetrucci/pi-todo`; `index.ts` | Dependency-only; branch-local todo behavior unchanged. | No Pi 1.0 source change; the completed full suite and pack assertion cover the automated checkout, while interactive behavior remains a manual gate. |
| `triage-comments` | `@diegopetrucci/pi-triage-comments`; `index.ts` | Dependency-only; isolated read-only triage SDK boundary unchanged. | Named-tool/resource evidence is accepted at the boundary level; the completed full suite and pack assertion cover the automated checkout, while live GitHub, native, and packaged behavior remain separate gates. |

The completed final pack assertion covered the root plus all 27 workspaces: 28 packages, with no bundled dependencies. This is packaging evidence, not native, live-provider, Windows, fleet, or release certification.

## Actual Pi 1.0 implementation scope

Only the following current checkout changes belong to this Pi 1.0 slice:

- `package.json` and `package-lock.json`: direct development ranges move from Pi `0.99.0` to `^1.0.0`, with exact `1.0.0` lock resolutions and upstream transitive package changes.
- `test/code-reviewer-sdk-isolation.test.mjs`: real Pi 1.0 `AgentSession`/resource-loader coverage for explicit allowlists, late tools, reload, transcript restoration, positive controls, and absent/empty transcript controls. It asserts no fixture tool execution, provider stream, or credential lookup.
- `extensions/oracle/index.ts`, `extensions/contrarian/index.ts`, and `extensions/code-reviewer/index.ts`: exact verified GPT-6.1 Sol preference slots and Oracle's exact Sol thinking rule, without broad ranking or provider-policy redesign.
- `docs/oracle-provider-matrix.md` and the model-policy tests/support files: the matching selection evidence, Bedrock boundary regression, catalog checks, scope/override checks, and the corrected exact Fast allowlist expectation.
- `extensions/fast/index.ts`, `extensions/fast/README.md`, and Fast-related tests: direct OpenAI-only GPT-6.1 Sol Fast, direct OAuth caveat, explicit legacy Codex deferral, fail-closed negative cases, and no overwrite/default activation changes.

The accepted reports and the current worktree also contain the pre-existing Pi 0.99 baseline and human-owned `.gnosis/.tickets` state. Those are preserved, not reimplemented or cleaned up by this record.

## Completed review and remaining native, fleet, and release gates

### Independent final review completed

The `pel-9nkv` worker completed all 13 ordered automated steps and supplied the report/raw-log evidence transcribed above. The ticket is closed as `validation-completed-with-approved-audit-exception`. Independent reviewer `review1763e724` completed final review with development-handoff-only acceptance conditioned on this wording correction and found no code/test/dependency/policy blockers. This acceptance does not convert the approved audit exception into a pass or certify native, Windows, live-provider, fleet, release, or manual behavior.

The exact corrected commands are preserved above because the session tickets and worker artifacts may be cleaned after review.

### Manual/native/live gate

The existing human-coordinated manual gate `pel-71t6` remains pending and open. It must separately establish dated platform/package evidence for fullscreen and theme/footer rendering, packaged native annotation submit/cancel/clipboard/worker/shutdown behavior, direct and legacy provider/auth paths, direct Fast OAuth acceptance and usage isolation, research/review streaming and thinking, nested/parallel permission prompts, quiet tools, Windows PowerShell, and clean shutdown. It must use isolated test settings and explicit approval for any real or paid provider call. No credentials were inspected here, and no fleet marker may advance without separate approval.

### Fleet state

Fleet certification remains pending. All 28 markers stay at `0.84.4`: the root marker and one marker in each of the 27 workspaces. Pi `1.0.0` development compatibility is not Pi `0.84.4` fleet certification. No marker is changed merely because the dependency trio or targeted tests passed.

## Release handoff identification only

The release handoff remains pending and identification-only. `docs/prepare-release.md` was read for handoff identification. It requires an explicit release input, deterministic local/registry dry-run comparison, review of changed package artifacts, and only then an authorized write-mode manifest/lock/document update. Generated release documents are preserved byte-for-byte when they already exist. Its handoff separates later commit/tag/push/GitHub-release work from the human-only protected npm publication step.

Those are remaining handoff requirements, not actions completed here. This ticket does not bump versions, alter fleet markers, run `prepare-release` write mode, create a tag or commit, push, create a GitHub release, or publish. The completed final validation report does not replace the pending manual gates; those gates must be reviewed before any separately authorized release preparation. Existing tickets were not modified.

## Rollback, scoped and non-destructive

Rollback is evidence-preserving and must be authorized per owning ticket. Do not use `git reset`, blanket `git restore`, `git clean`, stash, checkout-discard options, or a broad install/configuration restore against this worktree: `.gnosis/entries.jsonl`, `.tickets/`, existing source/test changes, and human-owned index/worktree state must survive.

- **Pi dependency transition:** restore only the Pi `1.0.0` range/resolution hunks in `package.json` and `package-lock.json` to the recorded Pi `0.99.0` baseline, after reviewing the diff against the current human changes. If dependencies must be reinstalled, use a repository-only isolated home and the authorized lock state; do not overwrite user configuration or credentials.
- **SDK boundary evidence:** remove only the Pi 1.0 additions to `test/code-reviewer-sdk-isolation.test.mjs` (including the restoration/positive-control assertions) if that owning ticket is explicitly rolled back. Preserve the pre-existing Pi 0.99 test content and all unrelated test changes.
- **Model policy:** remove only the GPT-6.1 Sol preference/thinking hunks from `extensions/oracle/index.ts`, `extensions/contrarian/index.ts`, and `extensions/code-reviewer/index.ts`, plus their matching rows in `docs/oracle-provider-matrix.md` and targeted test/support additions. Do not restore whole files over accepted Pi 0.99 changes or human edits; preserve Bedrock Sonnet ordering and all older fallback entries.
- **Unified Fast:** remove only the direct `gpt-6.1-sol` eligibility/status/test/documentation additions in `extensions/fast/index.ts`, `extensions/fast/README.md`, and the matching Fast tests. Preserve existing direct OAuth isolation, existing Codex models/tiers, retired-package boundaries, and the explicit manual-gate caveat unless the owning ticket is rolled back as a whole.
- **New record:** deleting only `docs/pi-1.0.0-validation.md` is the documentation rollback. Never restore or overwrite `docs/pi-0.99.0-validation.md`, historical release documents, markers, `.gnosis`, or `.tickets` as part of that deletion.
- **Pi/MCP user state:** a product rollback after a real Pi 1.0 run would require an operator-created backup of the pre-upgrade `mcp.json`/`mcp-auth.json` state because normalized names and per-server OAuth keys may not be readable by Pi 0.99. Restore only the reviewed, matching configuration/auth files; do not indiscriminately delete, copy, or inspect secrets. No such state was touched by this ticket.
- **Fullscreen preference:** users can explicitly select `tuiMode: "regular"` or `--tui-mode regular` without changing this repository. No user setting was changed here.

Rollback does not remove the known audit exception by editing the lockfile. Any durable vulnerability remediation belongs to an upstream Pi package release and a separately authorized validation run.
