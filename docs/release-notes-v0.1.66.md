# Release notes — v0.1.66

## Highlights

- All 28 packages are certified against Pi `0.84.4`, including explicit coverage of the intervening `0.84.3` runtime. Every `.pi-fleet-tested-version` marker advances from `0.84.2` to `0.84.4`.
- `permission-gate` now guards Pi's optional `powershell` tool. It combines bounded conservative lexical checks on every platform with native PowerShell AST analysis on Windows, fails closed on malformed or dynamic command forms and direct function/filter command-resolution changes, and preserves benign quoted/commented text, literal here-strings, and definitely enabled `-WhatIf` removals.
- `/annotate-git-diff` now works from both the root collection and standalone package under normal Node Pi and official Pi SEA builds. Packaged Tailwind and Monaco assets are delivered without a CDN through a tokenized `127.0.0.1` server that closes with the review session.
- Both annotation extensions now buffer native-host failures, reject concurrent startup, close native windows on submit/cancel/error, and suppress windows that finish opening after Pi shutdown.
- Oracle and Contrarian model ladders are synchronized with Pi `0.84.4`'s pinned provider catalog, including current Kimi K3, GLM 5.3, GPT-5.6, DeepSeek V4 Pro, and provider-specific fallbacks.

## Pi 0.84.3–0.84.4 compatibility

- Audited prompt lifecycle events, terminal capability overrides, delta-only nested `message_update`, RPC queue clearing, bundled entrypoints, root Markdown skill discovery, model/thinking persistence, and the optional PowerShell tool. No blanket extension API migration was required.
- Verified valid root and grouped Markdown skills load while root documentation files remain silently ignored, and verified terminal JSON settings override environment capability variables while `auto` preserves detection.
- Official checksum-verified Pi `0.84.3` and `0.84.4` SEA artifacts loaded the collection entries; the final installed-tarball annotation matrix exercised Node Pi `0.84.4` plus official SEA `0.84.3` and `0.84.4` in root and standalone layouts.
- PowerShell safety remains a targeted confirmation guard rather than a shell sandbox. Trusted later extensions, remote/custom tools, spawn hooks, and post-gate mutation remain outside its boundary.

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.11`
- `@diegopetrucci/pi-annotate-git-diff@0.1.11`
- `@diegopetrucci/pi-annotate-last-message@0.1.9`
- `@diegopetrucci/pi-brrr@0.1.14`
- `@diegopetrucci/pi-claude-fast@0.1.15`
- `@diegopetrucci/pi-code-reviewer@0.1.9`
- `@diegopetrucci/pi-confirm-destructive@0.1.12`
- `@diegopetrucci/pi-context-cap@0.1.11`
- `@diegopetrucci/pi-context-inspector@0.1.13`
- `@diegopetrucci/pi-contrarian@0.1.11`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.11`
- `@diegopetrucci/pi-fast@0.1.2`
- `@diegopetrucci/pi-git-footer@0.1.10`
- `@diegopetrucci/pi-gnosis@0.1.11`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`
- `@diegopetrucci/pi-inline-bash@0.1.11`
- `@diegopetrucci/pi-librarian@0.1.16`
- `@diegopetrucci/pi-minimal-footer@0.1.20`
- `@diegopetrucci/pi-notify@0.1.18`
- `@diegopetrucci/pi-openai-fast@0.1.17`
- `@diegopetrucci/pi-oracle@0.1.26`
- `@diegopetrucci/pi-permission-gate@0.1.14`
- `@diegopetrucci/pi-quiet-tools@0.1.12`
- `@diegopetrucci/pi-review@0.1.14`
- `@diegopetrucci/pi-todo@0.1.11`
- `@diegopetrucci/pi-triage-comments@0.1.12`
- `pi-dynamic-context-pruning@0.1.8`
- `@diegopetrucci/pi-extensions@0.1.66`

## Validation

- Clean `npm ci` completed with 0 vulnerabilities, and `npm run preflight:install-state` matched 238 installed packages plus all 28 local package entries.
- `npm run typecheck` and the full suite passed: 602 tests total, 601 passed, with the native-Windows-only fixture skipped on macOS. GitHub's Windows job separately passed all 29 shell-safety tests under PowerShell 7 and Windows PowerShell 5.1.
- Official Pi `0.84.4` fullscreen smoke covered both footers, context-cap, context-inspector, quiet-tools, permission-gate, Oracle streaming, safe/denied shell actions, native annotation launch, and clean child shutdown.
- Exact `0.1.66` root and `0.1.11` standalone tarballs installed offline in isolated layouts with Tailwind `4.3.2`, Monaco `0.52.2`, and Glimpse `0.8.1`. A six-run native matrix passed Node Pi `0.84.4`, official SEA `0.84.4`, and official SEA `0.84.3`; every run observed 11,787 bytes of generated Tailwind CSS and initialized Monaco controls, a real submit/cancel protocol message, native exit 0, and a closed loopback port. Submit runs verified the composed prompt in Pi's editor, while cancel runs verified the editor remained empty.
- Deterministic release preparation selected all 28 unpublished next-patch targets and preserved all four managed release documents on its final rerun. Package dry-runs total 319 files, 2,483,764 packed bytes, and 4,283,407 unpacked bytes; the 163-file root is 1,288,662 packed / 2,215,560 unpacked bytes and remains within its 2,225,000-byte unpacked budget.

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.11"],["@diegopetrucci/pi-annotate-git-diff","0.1.11"],["@diegopetrucci/pi-annotate-last-message","0.1.9"],["@diegopetrucci/pi-brrr","0.1.14"],["@diegopetrucci/pi-claude-fast","0.1.15"],["@diegopetrucci/pi-code-reviewer","0.1.9"],["@diegopetrucci/pi-confirm-destructive","0.1.12"],["@diegopetrucci/pi-context-cap","0.1.11"],["@diegopetrucci/pi-context-inspector","0.1.13"],["@diegopetrucci/pi-contrarian","0.1.11"],["@diegopetrucci/pi-dirty-repo-guard","0.1.11"],["@diegopetrucci/pi-fast","0.1.2"],["@diegopetrucci/pi-git-footer","0.1.10"],["@diegopetrucci/pi-gnosis","0.1.11"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.9"],["@diegopetrucci/pi-inline-bash","0.1.11"],["@diegopetrucci/pi-librarian","0.1.16"],["@diegopetrucci/pi-minimal-footer","0.1.20"],["@diegopetrucci/pi-notify","0.1.18"],["@diegopetrucci/pi-openai-fast","0.1.17"],["@diegopetrucci/pi-oracle","0.1.26"],["@diegopetrucci/pi-permission-gate","0.1.14"],["@diegopetrucci/pi-quiet-tools","0.1.12"],["@diegopetrucci/pi-review","0.1.14"],["@diegopetrucci/pi-todo","0.1.11"],["@diegopetrucci/pi-triage-comments","0.1.12"],["pi-dynamic-context-pruning","0.1.8"],["@diegopetrucci/pi-extensions","0.1.66"]] -->
