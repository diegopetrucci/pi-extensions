# Release notes — v0.1.58

## Highlights

This release fixes `minimal-footer` startup and Codex usage auth on Pi v0.81.1, where Pi removed the public `AuthStorage` export that the footer previously used at launch. The footer now reads OpenAI Codex usage tokens through the current model registry auth API, preserves the registry receiver for Pi runtime compatibility, and keeps legacy/stored-auth fallbacks for older installs.

## Minimal footer Pi 0.81 compatibility

- removes the direct `AuthStorage.create()` dependency from `minimal-footer` startup
- fetches OpenAI Codex usage auth through `ctx.modelRegistry.getProviderAuth()` on current Pi versions
- preserves OAuth account ID handling for the `ChatGPT-Account-Id` header when the account ID is available only in stored auth metadata
- keeps legacy `getApiKey()` and stored OAuth token fallbacks for older runtime/auth shapes
- marks `@diegopetrucci/pi-minimal-footer` as fleet-tested with Pi `0.81.1`

## Pi 0.81 SDK, catalog, and release tooling compatibility

- updates dev validation dependencies to Pi `0.81.1`
- passes the hidden `ModelRuntime` from Pi's compatibility `ModelRegistry` facade to isolated child `createAgentSession` calls when available, matching the Pi 0.81 SDK option shape while preserving older runtime fallback behavior
- refreshes oracle/contrarian provider preference coverage for Pi 0.81's built-in provider catalog changes, including Qwen token-plan providers and current Kimi/xAI/NVIDIA/Together model IDs
- hardens `prepare-release` so npm `pack` registry baselines that report `ETARGET` with `No matching version found` are treated as absent package versions, matching npm's current response for some unpublished scoped packages
- carries regression coverage and documentation for that npm registry response shape
- includes package catch-up for standalone packages whose local publish artifacts were absent from npm or differed from their currently published tarballs, plus the root collection package that bundles the fixed footer

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.5`
- `@diegopetrucci/pi-annotate-git-diff@0.1.5`
- `@diegopetrucci/pi-annotate-last-message@0.1.3`
- `@diegopetrucci/pi-brrr@0.1.8`
- `@diegopetrucci/pi-claude-fast@0.1.8`
- `@diegopetrucci/pi-code-reviewer@0.1.3`
- `@diegopetrucci/pi-confirm-destructive@0.1.6`
- `@diegopetrucci/pi-context-cap@0.1.5`
- `@diegopetrucci/pi-context-inspector@0.1.7`
- `@diegopetrucci/pi-contrarian@0.1.5`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.5`
- `@diegopetrucci/pi-git-footer@0.1.4`
- `@diegopetrucci/pi-gnosis@0.1.5`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.3`
- `@diegopetrucci/pi-inline-bash@0.1.5`
- `@diegopetrucci/pi-librarian@0.1.10`
- `@diegopetrucci/pi-minimal-footer@0.1.15`
- `@diegopetrucci/pi-notify@0.1.11`
- `@diegopetrucci/pi-openai-fast@0.1.10`
- `@diegopetrucci/pi-oracle@0.1.20`
- `@diegopetrucci/pi-permission-gate@0.1.8`
- `@diegopetrucci/pi-quiet-tools@0.1.6`
- `@diegopetrucci/pi-review@0.1.8`
- `@diegopetrucci/pi-todo@0.1.5`
- `@diegopetrucci/pi-triage-comments@0.1.6`
- `pi-dynamic-context-pruning@0.1.1`
- `@diegopetrucci/pi-extensions@0.1.58`

## Validation

- `npm ci --ignore-scripts --no-audit --no-fund` completed successfully after a direct foreground `npm ci` caused the parent Pi process to segfault; lifecycle scripts are disabled for release validation in this repository's release flow
- `npm run preflight:install-state` passed after clean install: `Package state matches package-lock.json (247 installed packages and 27 local package entries checked).`
- version consistency check passed for every v0.1.58 target manifest and matching local `package-lock.json` entry
- `npm run ci` passed with 479/479 tests passing under Pi `0.81.1` dev dependencies
- `node --test test/provider-model-preferences-catalog.test.mjs` passed for Pi 0.81 catalog coverage and provider matrix alignment
- `npm audit --omit=dev` was run and is blocked by Pi `0.81.1`'s published `@earendil-works/pi-coding-agent` shrinkwrap pinning nested `protobufjs@7.6.4` (GHSA-j3f2-48v5-ccww, moderate); root override updates direct/top-level resolution to `^7.6.5`, but npm still installs the shrinkwrapped nested copy from the upstream package
- `npm audit --omit=dev --audit-level=high` exited 0; the remaining audit finding is moderate and in an upstream dev-only validation dependency, not in published extension package contents
- `git diff --check` passed and `git diff --cached --name-only` had no output
- exact npm registry checks confirmed all 27 target package versions are unpublished
- `npm pack --dry-run --json` and `npm publish --dry-run --access public` passed for the root collection and all 26 standalone target packages; every pack reported `suspicious=0` and every publish dry-run reached the public registry dry-run path
- `find . -name '*.tgz' -o -name '*.npmrc' | sort` produced no output after dry-runs

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.5"],["@diegopetrucci/pi-annotate-git-diff","0.1.5"],["@diegopetrucci/pi-annotate-last-message","0.1.3"],["@diegopetrucci/pi-brrr","0.1.8"],["@diegopetrucci/pi-claude-fast","0.1.8"],["@diegopetrucci/pi-code-reviewer","0.1.3"],["@diegopetrucci/pi-confirm-destructive","0.1.6"],["@diegopetrucci/pi-context-cap","0.1.5"],["@diegopetrucci/pi-context-inspector","0.1.7"],["@diegopetrucci/pi-contrarian","0.1.5"],["@diegopetrucci/pi-dirty-repo-guard","0.1.5"],["@diegopetrucci/pi-git-footer","0.1.4"],["@diegopetrucci/pi-gnosis","0.1.5"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.3"],["@diegopetrucci/pi-inline-bash","0.1.5"],["@diegopetrucci/pi-librarian","0.1.10"],["@diegopetrucci/pi-minimal-footer","0.1.15"],["@diegopetrucci/pi-notify","0.1.11"],["@diegopetrucci/pi-openai-fast","0.1.10"],["@diegopetrucci/pi-oracle","0.1.20"],["@diegopetrucci/pi-permission-gate","0.1.8"],["@diegopetrucci/pi-quiet-tools","0.1.6"],["@diegopetrucci/pi-review","0.1.8"],["@diegopetrucci/pi-todo","0.1.5"],["@diegopetrucci/pi-triage-comments","0.1.6"],["pi-dynamic-context-pruning","0.1.1"],["@diegopetrucci/pi-extensions","0.1.58"]] -->
