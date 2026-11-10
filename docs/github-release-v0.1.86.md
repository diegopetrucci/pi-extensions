This release adds the newly documented OpenAI and Anthropic Fast and Ultrafast models to `fast`, and fixes bugs in `dynamic-context-pruning`, the annotation and subagent extensions, and `inline-bash`.

## Highlights

- **More Fast-mode models (`fast`):** Codex Fast adds `gpt-6.1-terra`; direct OpenAI API Fast adds `gpt-6.1-terra` and `gpt-5.6-sol`; Anthropic Fast adds Claude Fable 5.2 and `claude-mythos-5-2`. Ultrafast now covers `gpt-6.1-sol` as well as `gpt-6-astra`, with the same API-key, Responses API, and canonical-endpoint gates ([#217](https://github.com/diegopetrucci/pi-extensions/pull/217), [#221](https://github.com/diegopetrucci/pi-extensions/pull/221)).
- **Claude Opus 4.8 removed from Anthropic Fast (`fast`):** removed ahead of Anthropic's Fast deprecation for that model, although Anthropic still lists it as a research preview until then ([#218](https://github.com/diegopetrucci/pi-extensions/pull/218)).
- **More accurate context pruning (`dynamic-context-pruning`):** read coverage now follows the range that was actually delivered, so a truncated reread no longer prunes evidence it didn't contain. Failed reads no longer replace earlier successful reads. Invalid numeric config values such as `null` now fall back to the defaults instead of becoming `0` ([#211](https://github.com/diegopetrucci/pi-extensions/pull/211), [#212](https://github.com/diegopetrucci/pi-extensions/pull/212)).
- **Bug fixes:** `oracle` and `contrarian` preserve multi-byte UTF-8 characters split across subprocess output chunks. `annotate-git-diff` handles unusual filenames, repositories without commits, and merge commits (compared with their first parent). `inline-bash` matches expansion delimiters with awareness of quoting ([#209](https://github.com/diegopetrucci/pi-extensions/pull/209)).
- **Shared footer backend:** `git-footer` and `minimal-footer` now ship generated copies of one shared Git status backend. This is maintenance only, with no intended behavior change ([#207](https://github.com/diegopetrucci/pi-extensions/pull/207)).

Fast-mode eligibility is based on vendor documentation and mocked tests; provider availability still depends on your plan and account. The Pi development baseline remains 1.5.0, and this release makes no new live-provider or fleet certification claim.

## Contributors

- [@chenxin-yan](https://github.com/chenxin-yan) added Claude Fable 5.2 to Anthropic Fast mode ([#217](https://github.com/diegopetrucci/pi-extensions/pull/217)).

## Packages

- `@diegopetrucci/pi-annotate-git-diff@0.1.17`
- `@diegopetrucci/pi-contrarian@0.1.22`
- `@diegopetrucci/pi-fast@0.1.12`
- `@diegopetrucci/pi-git-footer@0.1.14`
- `@diegopetrucci/pi-inline-bash@0.1.16`
- `@diegopetrucci/pi-minimal-footer@0.1.27`
- `@diegopetrucci/pi-oracle@0.1.37`
- `pi-dynamic-context-pruning@0.1.17`
- `@diegopetrucci/pi-extensions@0.1.86`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-git-diff","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.22"],["@diegopetrucci/pi-fast","0.1.12"],["@diegopetrucci/pi-git-footer","0.1.14"],["@diegopetrucci/pi-inline-bash","0.1.16"],["@diegopetrucci/pi-minimal-footer","0.1.27"],["@diegopetrucci/pi-oracle","0.1.37"],["pi-dynamic-context-pruning","0.1.17"],["@diegopetrucci/pi-extensions","0.1.86"]] -->
