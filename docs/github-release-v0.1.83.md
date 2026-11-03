This release moves the development baseline to Pi 1.5.0, refreshes model rankings, and tightens read-only and config guards in several extensions and bundled subagents.

## Highlights

- **Pi 1.5.0 compatibility:** The development baseline moves to Pi `1.5.0` ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201); see `docs/pi-1.5.0-validation.md`). `oracle`, `contrarian`, `gnosis`, and `todo` use a package-local `Type.Unsafe`-based enum helper so TypeBox `Static` inference works again with pi-ai 1.5 `StringEnum`; emitted tool schemas are byte-identical. `quiet-tools`, `oracle`, `contrarian`, `librarian`, and `triage-comments` use the host-injected `keyHint` (respecting user keybindings) with a fallback on older hosts. `review` selector dialogs report blocked status (OSC 7501) and support PageUp/PageDown. This is an automated development-compatibility result; it was not verified in live-provider, interactive, or fleet sessions, and the `.pi-fleet-tested-version` markers are unchanged.
- **Refreshed model rankings:** Dead Radius (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`) and Mistral (`mistral-large-2411`) ladder entries are removed, GPT-6.1 Terra ranks after all Sol tiers and before GPT-5.6 Terra, and Kimi K3.1 Pro (then HighSpeed) ranks above K3 ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201)). The only selection change is that `oracle` and `contrarian` pick K3.1 Pro on `kimi-coding`/`moonshotai(-cn)`; `librarian`'s cost-led `kimi-coding` choice changes from `k3-256k` to `kimi-for-coding`. Terra is not added to fast mode.
- **inline-bash failures:** Nonzero exits, killed commands, and Pi 1.5 output-cap truncation are now reported as failures, and truncated output is marked in the prompt ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201)).
- **Provider-billed cost provenance:** `Usage.cost.totalFromProvider` is preserved across all ten subagent usage aggregators and is true only if every record was provider-billed ([#201](https://github.com/diegopetrucci/pi-extensions/pull/201)).
- **Tighter `gh --web` guards:** Grouped short flags such as `-cw`, `-wb`, and `-cw=true` are now blocked in the read-only bash guards of `code-reviewer` and `triage-comments` ([#193](https://github.com/diegopetrucci/pi-extensions/pull/193)). The guard fails closed, so an attached value containing `w` (for example `-Sworkflow`) is also blocked; use the long form (`--search workflow`). The same clause was added to the `diff_summarizer` and `repo_scout` subagents in the umbrella package ([#198](https://github.com/diegopetrucci/pi-extensions/pull/198)).
- **librarian bash guard:** The denylist scan now joins line continuations, drops quotes, and treats leading `NAME=value`, `command`, and `builtin` prefixes as transparent, so quoted or prefixed forms of `find -delete`/`-exec`, `rm`, and `eval` no longer bypass it; `source` and `.` as command words are blocked. The bash timeout is clamped to 1–300 s ([#199](https://github.com/diegopetrucci/pi-extensions/pull/199)).
- **notify config and timeouts:** `notify` validates `notify.json` field by field (invalid fields warn and keep defaults) and notification/sound commands time out after 10 s and count as failed instead of hanging the settled-run handler ([#200](https://github.com/diegopetrucci/pi-extensions/pull/200)).
- **context-inspector flags:** `/context` now rejects unknown `-`/`--` flags (for example `--redct`) with an error and usage text instead of writing and opening an unredacted report ([#196](https://github.com/diegopetrucci/pi-extensions/pull/196)).
- **dynamic-context-pruning defaults:** The `developer`, `diff_summarizer`, `repo_scout`, `test_runner`, and `web_scout` tool results are now protected by default, like the other subagent tools. A user-set `protections.toolNames` replaces the default list ([#195](https://github.com/diegopetrucci/pi-extensions/pull/195)).
- **Umbrella-only subagent cleanups:** The five helper subagents bundled in `@diegopetrucci/pi-extensions` also received fixes ([#198](https://github.com/diegopetrucci/pi-extensions/pull/198)): `test_runner`'s tool description no longer promises it does not change the repository (its no-edit rules are prompt guidance), the `diff_summarizer`/`repo_scout` prompts allow network only through read-only `gh`, unused code was removed, and READMEs state the default `bash` timeouts. These five have no standalone packages.

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

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

The five helper subagent extensions (`developer`, `diff_summarizer`, `repo_scout`, `test_runner`, `web_scout`) are included in `@diegopetrucci/pi-extensions` only; they have no standalone package in this release.

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.18"],["@diegopetrucci/pi-context-inspector","0.1.18"],["@diegopetrucci/pi-contrarian","0.1.20"],["@diegopetrucci/pi-gnosis","0.1.13"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.10"],["@diegopetrucci/pi-inline-bash","0.1.15"],["@diegopetrucci/pi-librarian","0.1.23"],["@diegopetrucci/pi-notify","0.1.21"],["@diegopetrucci/pi-oracle","0.1.35"],["@diegopetrucci/pi-quiet-tools","0.1.16"],["@diegopetrucci/pi-review","0.1.17"],["@diegopetrucci/pi-todo","0.1.13"],["@diegopetrucci/pi-triage-comments","0.1.19"],["pi-dynamic-context-pruning","0.1.16"],["@diegopetrucci/pi-extensions","0.1.83"]] -->
