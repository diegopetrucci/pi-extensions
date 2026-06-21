# Announcement copy — v0.1.46

## Short post

Released `@diegopetrucci/pi-extensions@0.1.46` and `@diegopetrucci/pi-oracle@0.1.13`.

This release fixes a long-standing oracle visibility bug. Transient upstream provider errors (overloaded, rate-limit, 5xx, gateway/timeout, network) used to be reported as the generic "Oracle finished without returning any text." Now they are surfaced as `Oracle model error: <detail>` with a transient-retry hint when applicable.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or standalone:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Standalone package: `@diegopetrucci/pi-oracle@0.1.13`.

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.46` / `@diegopetrucci/pi-oracle@0.1.13`.

Oracle now surfaces transient upstream model errors (overloaded / rate-limit / 5xx / timeout) instead of swallowing them as "no text".

## Very short version

Released `pi-oracle@0.1.13` / `pi-extensions` v0.1.46.

Oracle no longer silently masks upstream API errors.

## Discord / forum version

`pi-oracle@0.1.13` / `pi-extensions@0.1.46` is out.

This release fixes [#13](https://github.com/diegopetrucci/pi-extensions/issues/13): when the pi subprocess in `--mode json` ends an assistant turn with `stopReason === "error"`, the error detail is carried only on the streamed message. The old oracle parser ignored it and fell through to the generic "no text" message, which made transient provider errors (overloaded / 429 / 5xx) look like a misconfigured oracle.

Oracle now reads `stopReason` and `errorMessage` from `message_end` and reports `Oracle model error: <detail>` instead, with a `(transient; retry may succeed)` hint for known-transient signatures.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone package:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

The standalone package version is `@diegopetrucci/pi-oracle@0.1.13`.
