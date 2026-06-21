Fixes a long-standing visibility bug where transient upstream provider errors in the `oracle` tool were reported as the generic "Oracle finished without returning any text." message, hiding the real cause.

## Highlights

- Oracle now surfaces upstream model errors from the streamed `message_end` event instead of falling through to the generic empty-text fallback.
- Errored turns are reported as `Oracle model error: <detail>`, with a `(transient; retry may succeed)` hint for recognized transient signatures (overloaded, rate limit / 429, 5xx, bad gateway, service unavailable, gateway timeout, request timeout, ECONNRESET / ECONNREFUSED / ETIMEDOUT / ENETUNREACH, socket hang up, fetch failed).
- Upstream-aborted turns are reported as `Oracle model turn aborted`, distinct from the existing local-cancel message.
- Genuine empty non-error responses and local SIGTERM cancels keep their existing messages.
- Fixes [#13](https://github.com/diegopetrucci/pi-extensions/issues/13).

## Packages

- `@diegopetrucci/pi-extensions@0.1.46`
- `@diegopetrucci/pi-oracle@0.1.13`

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
