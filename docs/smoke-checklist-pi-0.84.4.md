# Manual smoke checklist — Pi 0.84.4

**Required target:** Pi `0.84.4`.<br>
**Intervening runtime:** Repeat the packaged annotation subset with official Pi `0.84.3`.<br>
**Verify with:** `pi --version` before each run.<br>
**Isolation:** Use an explicit `PI_CODING_AGENT_DIR`, `--no-extensions`, and only the extension entry under test. For packaged checks, install fresh tarballs into temporary root and standalone layouts rather than resolving files from the checkout.

Pi 0.84.3–0.84.4 changed prompt lifecycle events, terminal capability overrides, bundled entrypoints, root Markdown skill discovery, RPC queue handling, model persistence, and the optional Windows PowerShell tool. The steps below cover the runtime and UI surfaces that static tests alone cannot certify.

---

1. **Version and artifact gate** — Run `pi --version`; for SEA runs, verify the downloaded release archive against its published SHA-256 first.<br>
   PASS: the runtime reports exactly `0.84.4` (or `0.84.3` for the intervening matrix).<br>
   FAIL: any other version or a checksum mismatch; stop before testing.

2. **Collection entry loading** — Launch with the root package entries and no ambient extensions.<br>
   PASS: all declared root entries load without a startup error under normal Node Pi and official Pi SEA.<br>
   FAIL: Jiti/module-resolution, manifest, or startup errors.

3. **Fullscreen rendering** — Launch with `--tui-mode fullscreen` in a git repository and inspect `minimal-footer` and `git-footer`.<br>
   PASS: the fixed two-line footer, branch, and change counts render within their docks and update after a file change.<br>
   FAIL: missing, garbled, stale, or out-of-bound footer content.

4. **Context and quiet-tool commands** — Run `/context-cap status`, `/context`, and `/quiet-tools status`, then trigger an `ls` tool call.<br>
   PASS: the 200,000-token effective cap is reported, a nonblank redacted context report opens, and the collapsed `ls` row remains a one-line summary with an expand hint.<br>
   FAIL: missing commands, an unredacted/blank report, or expanded noisy tool output by default.

5. **Oracle streaming and catalog selection** — Run `/oracle-model`, then ask Oracle a short question.<br>
   PASS: the selected authenticated model follows the curated provider ladder, the child response streams incrementally, and the final assembled answer is complete.<br>
   FAIL: a catalog pattern matches no pinned model, Oracle escapes the session model scope, or only delta fragments appear.

6. **Shell permission gate** — Exercise a benign command, a denied recursive Bash removal, and, on native Windows, representative PowerShell removals/wrappers under both PowerShell 7 and Windows PowerShell 5.1.<br>
   PASS: benign commands proceed; destructive, malformed, dynamic, nested, splatted, oversized, and unanalyzable forms prompt interactively or fail closed headlessly. Literal quoted/commented text, literal here-strings, and definitely enabled `-WhatIf` removals stay benign.<br>
   FAIL: a destructive form bypasses the prompt, or benign literal text is treated as destructive.

7. **Root Markdown skills** — In an isolated skills directory, include root `README.md`/`AGENTS.md`, one valid root skill Markdown file, and one valid grouped nested skill.<br>
   PASS: both valid skills load; documentation files are ignored silently unless they contain valid skill frontmatter.<br>
   FAIL: documentation produces diagnostics, or a valid root/grouped skill is missed.

8. **Terminal capability precedence** — Test JSON settings set to explicit values, unset, and `auto` while varying `PI_HYPERLINKS`, `PI_IMAGE_PROTOCOL`, and `PI_TRUE_COLOR`.<br>
   PASS: explicit terminal JSON values override the environment; unset/`auto` preserves environment detection in SDK and SEA runs.<br>
   FAIL: environment variables override explicit settings or `auto` disables detection.

9. **Packaged `/annotate-git-diff` submit** — From a git repository with a small working-tree diff, install a fresh root or standalone tarball with its declared Tailwind, Monaco, and Glimpse dependencies. Run `/annotate-git-diff` and wait for the redirected review document.<br>
   PASS: the second document reaches `ready`; generated Tailwind CSS is present; Monaco initializes; review controls become naturally enabled; saving an overall note enables Submit; clicking Submit emits a real `type:"submit"` message; the composed prompt appears in Pi's editor; Glimpse exits 0; and the tokenized `127.0.0.1` port refuses connections afterward.<br>
   FAIL: CDN access, disabled/force-enabled controls, `assetInitFailed`, missing CSS/editor assets, injected review state, forced process termination, missing editor text, or a surviving loopback listener.

10. **Packaged `/annotate-git-diff` cancel** — Reopen the review and click its naturally available Cancel control.<br>
    PASS: a real `type:"cancel"` message reaches Pi, no review prompt is inserted, Glimpse exits normally, and the loopback listener closes.<br>
    FAIL: using SIGTERM or `/quit` as a substitute for cancel, editor mutation, abnormal native exit, or a surviving listener.

11. **`/annotate-last-message` lifecycle** — Open the latest completed assistant reply, submit a note, then repeat with Cancel; also quit Pi while a launch is pending.<br>
    PASS: Submit appends the composed note, Cancel leaves the editor unchanged, each native window closes normally, and a window returned after shutdown is immediately closed without applying feedback.<br>
    FAIL: duplicate windows, fatal EventEmitter errors, late feedback after shutdown, or orphaned Glimpse processes.

12. **Shutdown cleanup** — With child UI/subagent activity completed, run `/quit` and inspect child processes/listeners.<br>
    PASS: Pi exits cleanly with no Glimpse child, watcher, or loopback server left running. This proves cleanup only; it does not substitute for steps 9–11's real submit/cancel protocol evidence.<br>
    FAIL: orphaned children, watchers, or listening ports.
