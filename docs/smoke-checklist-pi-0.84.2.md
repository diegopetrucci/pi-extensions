# Manual smoke checklist — Pi 0.84.2

**Required pi version:** 0.84.2<br>
**Verify with:** `pi --version` — output must begin with `0.84.2`.<br>
**Why:** Pi 0.84.0 added fullscreen TUI mode and changed `message_update` to emit deltas only; 0.84.2 fixed fallback rendering for extension tool results (#7979). These are runtime/UI surfaces the headless suite cannot reach.

**Enter fullscreen:** Start the session normally, then run `/settings` and set `tuiMode` to `fullscreen` (or launch with `pi --tui-mode fullscreen`).<br>
**Leave fullscreen:** Run `/settings` and set `tuiMode` back to `regular`, or quit the session.

---

1. **Version gate** — Run `pi --version`.<br>
   PASS: first token is `0.84.2`.<br>
   FAIL: any other version; stop here and upgrade before continuing.

2. **minimal-footer** — Start a session in fullscreen mode. Look at the fixed footer dock at the bottom of the screen.<br>
   PASS: two-line footer visible showing context percentage on the left and model name on the right; no garbled or missing lines.<br>
   FAIL: footer absent, truncated mid-character, or rendered outside the dock boundary.

3. **git-footer** — In the same session, open a git repository directory. Check the status bar just above the input editor.<br>
   PASS: branch name and change counts (e.g. `main • 2+0`) appear in the status bar, updating within ~8 s of a file change.<br>
   FAIL: status bar row is blank where git info should appear, or text is corrupted.

4. **context-cap** — Run `/context-cap status`.<br>
   PASS: reply states context cap is enabled and shows an effective window of 200 000 tokens.<br>
   FAIL: command not found, or reported window exceeds 200 000 tokens.

5. **context-inspector** — Run `/context`.<br>
   PASS: pi opens an HTML file in the default browser showing a breakdown of context categories (System, Tool schemas, User, Assistant, Tool results, etc.); no error notification.<br>
   FAIL: error notification appears, browser does not open, or the report page is blank.

6. **quiet-tools** — Run `/quiet-tools status`, then ask pi to list the files in the current directory (triggering an `ls` tool call).<br>
   PASS: `/quiet-tools status` reports enabled; the `ls` tool row in the transcript collapses to a single summary line with an expand hint rather than printing every file.<br>
   FAIL: `/quiet-tools status` reports disabled, or the tool result renders as a full uncollapsed block with no expand hint.

7. **oracle streaming** — Run `/oracle status` to confirm the oracle is configured, then send a short coding question (e.g. "What does this file export?"). Watch the oracle response stream in the transcript.<br>
   PASS: oracle response text appears incrementally as it streams; the final message is complete and readable with no missing chunks.<br>
   FAIL: oracle response is empty, cut off mid-sentence, or shows only a diff/delta fragment instead of assembled text (regression from the 0.84.0 delta-only `message_update` change).
