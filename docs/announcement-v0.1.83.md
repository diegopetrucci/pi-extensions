# Announcement drafts — v0.1.83

## Short

v0.1.83 moves the development baseline to Pi 1.5.0, refreshes model rankings (GPT-6.1 Terra, Kimi K3.1 Pro; dead Radius and Mistral entries removed), and tightens guards: grouped `gh -cw` flags in `code-reviewer` and `triage-comments`, the `librarian` bash denylist, `notify` config validation and command timeouts, and unknown `/context` flags. It is an automated development-compatibility result with no live-provider, interactive, or fleet certification, and not a publication claim.

Suggested public title: **Pi 1.5.0 compatibility, refreshed model rankings, and tighter subagent guards**.

## Highlights

- Pi 1.5.0 development compatibility: typing fixes, host-injected key hints, `review` selector paging and blocked status, and `inline-bash` failure reporting for nonzero exits, kills, and truncated output ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201)).
- Model rankings: GPT-6.1 Terra and Kimi K3.1 Pro added to the ladders; `oracle` and `contrarian` now pick K3.1 Pro on `kimi-coding`/`moonshotai(-cn)` ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201)).
- `code-reviewer` and `triage-comments` block grouped short flags such as `-cw` in the `gh --web` check ([#193](https://github.com/diegopetrucci/pi-extensions/pull/193)); `librarian` normalizes its bash denylist scan and clamps the bash timeout ([#199](https://github.com/diegopetrucci/pi-extensions/pull/199)).
- `notify` validates its config and times out hung notification commands ([#200](https://github.com/diegopetrucci/pi-extensions/pull/200)); `/context` rejects unknown flags ([#196](https://github.com/diegopetrucci/pi-extensions/pull/196)); `dynamic-context-pruning` protects the helper subagent tools by default ([#195](https://github.com/diegopetrucci/pi-extensions/pull/195)).

## Packages

- `@diegopetrucci/pi-code-reviewer@0.1.18`
- `@diegopetrucci/pi-context-inspector@0.1.18`
- `@diegopetrucci/pi-contrarian@0.1.20`
- `@diegopetrucci/pi-gnosis@0.1.13`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.10`
- `@diegopetrucci/pi-inline-bash@0.1.15`
- `@diegopetrucci/pi-librarian@0.1.23`
- `@diegopetrucci/pi-notify@0.1.21`
- `@diegopetrucci/pi-oracle@0.1.35`
- `@diegopetrucci/pi-quiet-tools@0.1.16`
- `@diegopetrucci/pi-review@0.1.17`
- `@diegopetrucci/pi-todo@0.1.13`
- `@diegopetrucci/pi-triage-comments@0.1.19`
- `pi-dynamic-context-pruning@0.1.16`
- `@diegopetrucci/pi-extensions@0.1.83`

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.18"],["@diegopetrucci/pi-context-inspector","0.1.18"],["@diegopetrucci/pi-contrarian","0.1.20"],["@diegopetrucci/pi-gnosis","0.1.13"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.10"],["@diegopetrucci/pi-inline-bash","0.1.15"],["@diegopetrucci/pi-librarian","0.1.23"],["@diegopetrucci/pi-notify","0.1.21"],["@diegopetrucci/pi-oracle","0.1.35"],["@diegopetrucci/pi-quiet-tools","0.1.16"],["@diegopetrucci/pi-review","0.1.17"],["@diegopetrucci/pi-todo","0.1.13"],["@diegopetrucci/pi-triage-comments","0.1.19"],["pi-dynamic-context-pruning","0.1.16"],["@diegopetrucci/pi-extensions","0.1.83"]] -->
