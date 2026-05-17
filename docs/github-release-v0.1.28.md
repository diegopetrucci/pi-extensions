This release improves `oracle` with hardcoded Together provider ranking and pi-compatible thinking-level clamping for matched models.

## Highlights

- adds Together to `oracle`'s hardcoded provider preference list so automatic selection uses known top Together models before the heuristic fallback
- documents Together as part of the built-in provider coverage, with `deepseek-ai/DeepSeek-V4-Pro` as the intended first match when available
- keeps `xhigh` as the default request for reasoning models while clamping the effective level to what the matched model supports before launching the oracle subprocess
- reports the effective thinking level and preserves requested-vs-effective context when a matched auto-selected model or matched explicit override is clamped
- leaves unmatched explicit model overrides on the requested fallback because no authenticated model capability map is available

## Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.28`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.8`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone oracle:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
