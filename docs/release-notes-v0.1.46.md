# Release notes — v0.1.46

## Highlights

This release fixes a long-standing visibility bug in the `oracle` tool where transient upstream provider errors (overloaded, rate-limit, 5xx, gateway/timeout, network) were reported as the generic "Oracle finished without returning any text." message, masking the real cause and making callers misdiagnose the oracle as broken.

## oracle

- surfaces upstream model errors from the streamed assistant message instead of falling through to the generic empty-text fallback
- reads `stopReason` and `errorMessage` from `message_end` events emitted by the pi `--mode json` subprocess
- reports `Oracle model error: <detail>` when the assistant turn ends with `stopReason === "error"`, including a `(transient; retry may succeed)` hint for recognized transient signatures (overloaded, rate limit / 429, 5xx, bad gateway, service unavailable, gateway timeout, request timeout, ECONNRESET, ECONNREFUSED, ETIMEDOUT, ENETUNREACH, socket hang up, fetch failed)
- reports `Oracle model turn aborted` when an upstream turn ends with `stopReason === "aborted"`, distinct from the existing local-abort message
- preserves the existing `Oracle finished without returning any text.` fallback for genuine empty non-error responses
- preserves the existing `Oracle was aborted.` message for local SIGTERM/abort-signal cancellations
- publishes `@diegopetrucci/pi-oracle@0.1.13` alongside the collection package

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.46`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.13`

## Validation

- verified npm registry state for the root and standalone oracle packages
- verified package JSON metadata and release docs
- verified whitespace and patch formatting
- ran TypeScript and bundling checks for the oracle extension
- ran a 12-case unit check covering transient detection, non-transient errors, missing detail, and aborted-with/without detail through the new `formatOracleModelError` helper
- verified root and standalone package dry-runs
- verified root and standalone publish dry-runs
