# Bug handoff

This document records 13 findings from the adversarial review of
`f27251a12a43ddc4f436f29ddf1f77c07a7d7fb1` (`@diegopetrucci/pi-extensions@0.1.76`).
The review was performed on 2026-10-08; this handoff was assembled on 2026-10-10.
The source checkout was still at the reviewed commit when the handoff was prepared.

All findings were reproduced by reviewers and independently checked by the primary
reviewer. They remain **open and pending owner triage**: the owner has not reported
independent verification, and this document does not include fixes or regression
tests. Evidence limitations are recorded per issue. In particular, BUG-008 uses a
controlled orchestration harness backed by the installed SDK's scheduling code,
and BUG-009 proves a request header/body mismatch without claiming a live API
rejection. BUG-002 also needs an explicit decision about failed-read retention.

## Review environment and baseline

- macOS, Node.js `v26.8.2`, and the committed `package-lock.json`.
- Installed Pi packages: `@earendil-works/pi-coding-agent@1.0.4`,
  `@earendil-works/pi-ai@1.0.4`, and `@earendil-works/pi-tui@1.0.4`.
- After `npm ci`, install-state preflight passed. The 2026-10-08 baseline had
  **1,019 passing tests, one skipped test, and zero failures**; typechecking and
  formatting also passed. The skipped check required a native Windows PowerShell
  parser. These passing checks do not cover the scenarios below.
- On 2026-10-10, the source commit and installed dependency state were checked
  again. All 11 embedded diagnostics were run directly from this document and
  reproduced the reported observations; the shared Git diagnostic covers three issues.

Run the examples from the repository root after installing the locked dependencies:

```bash
npm ci
npm run preflight:install-state
```

The examples contain their own setup and use temporary fixtures. They do not rely
on paths from the original reviewer's computer or on files preserved from the
review chat. Local probes do not make model API calls or require credentials.
The Fast probe intercepts requests with a fake `fetch`; Git probes use disposable
local repositories. UI reproduction instructions assume the relevant extension is
installed and loaded. Inspect an example before running it, as with any diagnostic.

Source links point to files in this repository; line numbers and function names
refer to the reviewed commit. Installed SDK source pointers refer to the locked
Pi 1.0.4 packages under `node_modules`. Revalidate findings before applying a fix
against a newer source or dependency version.

## Open issues

P1 means priority attention for context loss or a violated enforcement boundary.
P2 means a normal-priority correctness defect. These are review priorities, not
CVSS scores or release-blocking decisions.

- [BUG-001 — P1: Truncated reread removes file content it did not return](#bug-001)
- [BUG-002 — P2: Failed reread replaces the only successful result](#bug-002)
- [BUG-003 — P2: Another strategy immediately undoes a prune restore](#bug-003)
- [BUG-004 — P1: Guarded paths resolve differently from Pi's actual targets](#bug-004)
- [BUG-005 — P2: Model fallback inherits a disposed extension runtime](#bug-005)
- [BUG-006 — P2: Librarian rejects ordinary macOS workspace reads](#bug-006)
- [BUG-007 — P2: Oracle and Contrarian corrupt split UTF-8 output](#bug-007)
- [BUG-008 — P2: Review loop can proceed before its fix pass starts](#bug-008)
- [BUG-009 — P2: Fast suppresses required Anthropic feature headers](#bug-009)
- [BUG-010 — P2: Git-quoted filenames yield empty annotation diffs](#bug-010)
- [BUG-011 — P2: Annotation Branch scope is blank before the first commit](#bug-011)
- [BUG-012 — P2: Merge commits show no changed files](#bug-012)
- [BUG-013 — P2: Inline Bash terminates at quoted or nested braces](#bug-013)

## Handoff workflow

For each accepted issue, reproduce it against the target branch, add a focused
regression test, and demonstrate that the test fails before changing the
implementation. Then fix the defect, run the test again, and run the relevant
existing suite and repository checks. Update the issue with the fixing PR and
validation evidence when resolved. Proposed test cases below are acceptance
criteria, not tests already added to the repository.

Coordinate overlapping fixes: BUG-001 and BUG-002 affect read supersession;
BUG-003 changes restore protection; BUG-004 and BUG-006 affect Librarian path
handling; BUG-010 through BUG-012 share annotation Git discovery/loading.

Follow `AGENTS.md` for branches and PRs. This documentation handoff does not
certify compatibility with a new Pi version or request a package release.

<a id="bug-001"></a>

## BUG-001 — Truncated reread removes previously read lines absent from its replacement

**Priority:** P1. **Status:** agent reproduced; pending owner triage. No fix or regression test has been committed.

**Impact and scope:** Dynamic Context Pruning can remove the only model-visible copy of part of a file. A later read with no `offset`/`limit` is treated as covering the entire file even when Pi truncates the result. The original session transcript remains recoverable; the loss is in the effective context sent onward. This affects read-versus-read supersession when recency protection and the cost gate permit pruning.

**Source pointers at reviewed commit `f27251a12a43ddc4f436f29ddf1f77c07a7d7fb1`:** [`collectFileOpOccurrences`](extensions/dynamic-context-pruning/index.ts#L1774) derives its range exclusively from arguments at line 1791; [`computeFileReadRange`](extensions/dynamic-context-pruning/index.ts#L1723) treats absent `limit` as unbounded; [`supersededFileOpsStrategy.propose`](extensions/dynamic-context-pruning/index.ts#L1887) accepts that inferred coverage. Pi's installed `createReadToolDefinition` in `node_modules/@earendil-works/pi-coding-agent/dist/core/tools/read.js` truncates text by line/byte limits and supplies `details.truncation` (lines 133–153 in the reviewed Pi 1.0.4 installation).

**Preconditions:** Dependencies from the reviewed lockfile are installed; Dynamic Context Pruning uses its defaults; the result is old enough to leave the recency window. The file has 3,000 short lines. The first read returns lines 1001–3000; the second requests the whole file but returns only lines 1–2000. The snippet ends on a user message and passes the real state classifier, matching the idle-classified boundary before a subsequent response. Gate acceptance depends on state and transcript size; the default idle threshold is 22, versus 1 for `mid_loop`.

**Repeatable reproduction:** Run from the repository root with a Node version that supports direct `.ts` imports, after the shared dependency setup. This uses the real installed SDK read tool and does not call a model.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.cwd();
const load = (relative) => import(pathToFileURL(path.join(repo, relative)).href);
const dcp = await load('extensions/dynamic-context-pruning/index.ts');
const { createReadToolDefinition } = await load('node_modules/@earendil-works/pi-coding-agent/dist/core/tools/read.js');
const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-bug-001-'));
const text = (message) => message.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
const pair = (id, args, result) => [
  { role: 'assistant', content: [{ type: 'toolCall', id, name: 'read', arguments: args }], timestamp: 0 },
  { role: 'toolResult', toolCallId: id, toolName: 'read', isError: false, timestamp: 0, ...result },
];
try {
  await fs.writeFile(path.join(cwd, 'large.txt'), Array.from({ length: 3000 }, (_, i) => `line ${String(i + 1).padStart(4, '0')} data`).join('\n'));
  const read = createReadToolDefinition(cwd);
  const earlierArgs = { path: 'large.txt', offset: 1001, limit: 2000 };
  const laterArgs = { path: 'large.txt' };
  const earlier = await read.execute('earlier', earlierArgs);
  const later = await read.execute('later', laterArgs);
  const messages = [
    { role: 'user', content: 'Inspect the file.', timestamp: 0 },
    ...pair('earlier', earlierArgs, earlier), ...pair('later', laterArgs, later),
  ];
  for (let i = 0; i < 4; i++) {
    messages.push({ role: 'user', content: 'Continue.', timestamp: 0 });
    if (i < 3) messages.push({ role: 'assistant', content: [{ type: 'text', text: 'OK.' }], timestamp: 0 });
  }
  const agentState = dcp.classifyAgentStateFromMessages(messages);
  const result = dcp.runDynamicContextPruningPipeline({ messages, config: dcp.defaultConfig(), persistedDecisions: [], knownIdempotencyKeys: new Set(), cwd, agentState });
  console.log(JSON.stringify({
    agentState,
    earlierContainsLine2500: text(earlier).includes('line 2500'),
    laterContainsLine2500: text(later).includes('line 2500'),
    laterWasTruncated: later.details?.truncation?.truncated,
    laterOutputLines: later.details?.truncation?.outputLines,
    afterPruningContainsLine2500: result.messages.some((m) => m.role === 'toolResult' && text(m).includes('line 2500')),
    decisions: result.newlyAppliedDecisions.map((d) => ({ strategy: d.strategyId, target: d.correlation.toolCallId })),
  }, null, 2));
} finally {
  await fs.rm(cwd, { recursive: true, force: true });
}
NODE
```

**Actual:** `agentState` is `idle`; `earlierContainsLine2500=true`, `laterContainsLine2500=false`, `laterWasTruncated=true`, `laterOutputLines=2000`, and `afterPruningContainsLine2500=false`. A `superseded-file-ops` decision targets `earlier`.

**Expected:** The earlier result remains because the later result does not contain all of its returned lines. In particular, lines 2001–3000 must not disappear solely because the later request omitted a limit.

**Root cause:** Requested coverage is confused with delivered coverage. `collectFileOpOccurrences` reads content length but ignores truncation metadata when assigning ranges, so the later `[1, EOF)` range incorrectly covers the earlier `[1001, 3000]` range.

**Suggested regression tests and fix guidance:** Add a real-SDK regression for this line-limit example and another for byte-limit truncation. Include bounded later reads whose requested range covers the old result but whose delivered output stops early. Derive coverage from trustworthy returned-range/truncation metadata; conservatively retain the earlier result when complete coverage cannot be proven. Keep a control case showing that a genuinely covering successful read still prunes when eligible. Coordinate with BUG-002 so failed reads cannot accidentally supply coverage under the chosen policy.

**Validation limits:** The SDK file reads and default pipeline are exercised; no live model, interactive Pi UI, or downstream wrong answer was observed. This demonstrates missing effective-context content at an idle-classified boundary, not pruning on every immediate follow-up tool call. Files and original session records are not deleted by this bug.

<a id="bug-002"></a>

## BUG-002 — Failed reread can supersede the only successful tool result

**Priority:** P2. **Status:** agent reproduced; pending owner triage **and intended-policy confirmation**. No fix or regression test has been committed.

**Impact and scope:** After a successful file read followed by a failed read, Dynamic Context Pruning can replace the successful content with a pointer to the error. Identical arguments take the `dedupe` path; different arguments with nominally covering ranges take `superseded-file-ops`. A transient failure can therefore leave the model without previously obtained evidence. Whether old content should remain after a known deletion or intentional permission change is a separate policy decision.

**Source pointers at the reviewed commit:** [`dedupeStrategy.propose`](extensions/dynamic-context-pruning/index.ts#L1588), especially newest selection at line 1605; [`supersededFileOpsStrategy.propose`](extensions/dynamic-context-pruning/index.ts#L1928), which admits errored reads into `nearestCoveringReads`; [`collectCompletedToolCallOccurrences`](extensions/dynamic-context-pruning/index.ts#L1550), which already records `isError`. The current [deduplication contract](extensions/dynamic-context-pruning/README.md#L52) explicitly chooses the newest completed occurrence by arguments without a success condition, and the read supersession rules at [lines 1651–1660](extensions/dynamic-context-pruning/index.ts#L1651) also lack one. This makes the behavior certain but the desired change subject to owner confirmation.

**Preconditions:** Default strategies enabled; a sufficiently large successful output; a later failed read; enough subsequent turns to leave recency protection; a cost-gate-eligible boundary. The reproduction uses an explicit `EACCES` error message to represent a transient failed read and the real state classifier on a final user message.

**Repeatable reproduction:** Run from the repository root. Error and success transcript results are synthetic; the production pipeline and default gate are real.

```sh
node --input-type=module <<'NODE'
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const cwd = process.cwd();
const dcp = await import(pathToFileURL(path.join(cwd, 'extensions/dynamic-context-pruning/index.ts')).href);
const pair = (id, args, body, isError) => [
  { role: 'assistant', content: [{ type: 'toolCall', id, name: 'read', arguments: args }], timestamp: 0 },
  { role: 'toolResult', toolCallId: id, toolName: 'read', isError, content: [{ type: 'text', text: body }], timestamp: 0 },
];
for (const identicalArguments of [true, false]) {
  const args = { path: 'a.txt', offset: 1, limit: 500 };
  const messages = [
    { role: 'user', content: 'Inspect the file.', timestamp: 0 },
    ...pair('success', args, 'valuable result\n'.repeat(500), false),
    ...pair('failure', identicalArguments ? args : { path: 'a.txt' }, 'EACCES: permission denied, open a.txt', true),
  ];
  for (let i = 0; i < 4; i++) {
    messages.push({ role: 'user', content: 'Continue.', timestamp: 0 });
    if (i < 3) messages.push({ role: 'assistant', content: [{ type: 'text', text: 'OK.' }], timestamp: 0 });
  }
  const agentState = dcp.classifyAgentStateFromMessages(messages);
  const result = dcp.runDynamicContextPruningPipeline({ messages, config: dcp.defaultConfig(), persistedDecisions: [], knownIdempotencyKeys: new Set(), cwd, agentState });
  console.log(JSON.stringify({
    identicalArguments, agentState,
    decisions: result.newlyAppliedDecisions.map((d) => ({ strategy: d.strategyId, target: d.correlation.toolCallId })),
    results: result.messages.filter((m) => m.role === 'toolResult').map((m) => ({ id: m.toolCallId, text: m.content[0].text })),
  }, null, 2));
}
NODE
```

**Actual:** Both runs classify as `idle` and prune `success`. With identical arguments the strategy is `dedupe`; with differing arguments it is `superseded-file-ops`. The older text becomes a pruning placeholder; `failure` retains only `EACCES: permission denied, open a.txt`.

**Expected, subject to owner decision:** A failed read should not by itself establish that an earlier successful output is redundant. Preserve the earlier evidence alongside the error, or explicitly document and test a policy that intentionally discards it. Do not present old contents as proof of the current file state.

**Root cause:** `isError` is collected but ignored when selecting the newest duplicate and when admitting later reads as coverage candidates. Successful writes/edits already have an error filter in the adjacent strategy code, but reads do not.

**Suggested regression tests and fix guidance:** First agree on successful-read retention versus newest-state policy. If retention is intended, cover success→failure with identical and covering-but-different arguments under defaults, as well as success→failure→success and error-only sequences. Ensure both dedupe and read supersession honor the decision; fixing one leaves the other able to prune. Avoid indiscriminately changing all repeated-tool semantics without deciding how non-read tools should behave.

**Validation limits:** This proves pipeline behavior for correctly shaped failed-read records; it does not induce a real OS permission failure or observe a model mistake. The original diagnostic used `ENOENT` and reproduced the same strategy outcomes; deletion may make previous contents stale, so that fixture alone cannot settle desired retention semantics. Default gate acceptance is established for the shown idle-classified transcript, not for every transcript/state.

<a id="bug-003"></a>

## BUG-003 — Restoring a result is undone by another automatic pruning strategy

**Priority:** P2. **Status:** agent reproduced; pending owner triage. No fix or regression test has been committed.

**Impact and scope:** `/prune` reports that a result was restored and will appear on the next call, but a different automatic strategy immediately prunes the same result again. The problem affects overlapping strategy targets: identical repeated reads qualify for both `dedupe` and `superseded-file-ops`. It survives rebuilding extension state from the session branch.

**Source pointers at the reviewed commit:** [`runDynamicContextPruningPipeline`](extensions/dynamic-context-pruning/index.ts#L2053) filters restored proposals by strategy-specific idempotency key; overlapping targets are collapsed only afterward at [lines 2089–2105](extensions/dynamic-context-pruning/index.ts#L2089). [`persistRestore`](extensions/dynamic-context-pruning/index.ts#L2679) records only the active decision key. The [`/prune` command restore branch](extensions/dynamic-context-pruning/index.ts#L2755) promises original content on the next call at line 2764. The [existing restore regression](test/dynamic-context-pruning-commands.test.mjs#L885) covers only one synthetic strategy.

**Preconditions:** Defaults enabled; two identical substantial read results; older result eligible for pruning; restore that result through `/prune`; request context again. The diagnostic uses an isolated agent-config directory, a real SDK `SessionManager`, the registered command handler, and real session custom entries; only UI selection/confirmation and tool-result contents are stubbed.

**Repeatable reproduction:** Run from the repository root. Both the initial context and subsequent context end on a user message, so the extension's actual context hook classifies the state itself. The script simulates extension reload between restore and the next context event.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.cwd();
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-bug-003-'));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = dir;
try {
  const load = (relative) => import(pathToFileURL(path.join(repo, relative)).href);
  const { default: extension } = await load('extensions/dynamic-context-pruning/index.ts');
  const { SessionManager } = await load('node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js');
  const sessionManager = SessionManager.inMemory(dir);
  const append = (message) => sessionManager.appendMessage({ ...message, timestamp: 0 });
  append({ role: 'user', content: 'Read the file.' });
  for (const id of ['old', 'new']) {
    append({ role: 'assistant', content: [{ type: 'toolCall', id, name: 'read', arguments: { path: 'a.txt' } }] });
    append({ role: 'toolResult', toolCallId: id, toolName: 'read', isError: false, content: [{ type: 'text', text: 'valuable result\n'.repeat(500) }] });
  }
  for (let i = 0; i < 4; i++) {
    append({ role: 'user', content: 'Continue.' });
    if (i < 3) append({ role: 'assistant', content: [{ type: 'text', text: 'OK.' }] });
  }
  let selections = 0;
  const notifications = [];
  const ctx = { cwd: dir, hasUI: true, sessionManager, ui: {
    select: async (_prompt, options) => selections++ === 0 ? options.find((o) => o.includes('pruned')) : 'Done',
    confirm: async () => true,
    notify: (message) => notifications.push(message),
  } };
  function loadExtension() {
    const handlers = new Map(), commands = new Map();
    extension({
      on: (name, handler) => handlers.set(name, handler),
      registerCommand: (name, command) => commands.set(name, command),
      appendEntry: (type, data) => sessionManager.appendCustomEntry(type, data),
    });
    return { handlers, commands };
  }
  const messages = () => sessionManager.buildSessionProjection().messages;
  const entries = () => sessionManager.getBranch().filter((e) => e.type === 'custom' && e.data?.idempotencyKey).map((e) => ({ type: e.customType, key: e.data.idempotencyKey }));
  let runtime = loadExtension();
  await runtime.handlers.get('session_start')({}, ctx);
  await runtime.handlers.get('context')({ messages: messages() }, ctx);
  await runtime.commands.get('prune').handler('', ctx);
  console.log('after restore', JSON.stringify({ notifications, entries: entries() }, null, 2));
  runtime = loadExtension();
  await runtime.handlers.get('session_start')({}, ctx);
  const next = await runtime.handlers.get('context')({ messages: messages() }, ctx);
  console.log('after reload and next context', JSON.stringify({
    oldResult: next.messages.find((m) => m.role === 'toolResult' && m.toolCallId === 'old').content[0].text,
    entries: entries(),
  }, null, 2));
} finally {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await fs.rm(dir, { recursive: true, force: true });
}
NODE
```

**Actual:** The command notifies `Restored read result; it will show its original content on the next call.` Session entries include a restore for `dedupe:tool_result_content:old`. On the next context event, `oldResult` is again a pruning placeholder pointing to `new`, and a new `superseded-file-ops:tool_result_content:old` decision is persisted.

**Expected:** The restored result contains its original `valuable result` text on the next context call, including after rebuilding extension state. Automatic strategies should not immediately override the explicit restore through a different key for the same target.

**Root cause:** Restore suppression identifies a decision by `strategyId:kind:toolCallId`, while the user's action identifies the tool result. Once the dedupe key is tombstoned, the other strategy's key remains eligible and wins the next target-collapse pass.

**Suggested regression tests and fix guidance:** Add an integration-style restore test with both production strategies enabled, real custom-entry persistence, and a state rebuild before the next context event. Assert the restored text survives and no other automatic strategy persists a decision for that target. Apply automatic suppression at the intended target scope while preserving explicit manual re-pruning, branch-local history, and last-event-wins behavior. Include restore→manual re-prune and switching branches as controls; decide whether later genuinely new evidence can make a restored target eligible again.

**Validation limits:** Real SDK session projection and registered extension handlers are exercised, but the `SessionManager` is in memory and UI responses are stubbed. This validates extension-state reload from recorded branch entries, not a disk-backed process restart or a full terminal interaction. The original transcript is retained, and manually restoring again or changing strategy settings can recover access.

<a id="bug-004"></a>

## BUG-004 — Path guards disagree with Pi about file URLs and relative paths

**Priority:** P1. **Status:** Agent-reproduced; pending owner triage. **Evidence:** Real extension hooks followed by real SDK `read`/`write` tools on disposable fixtures; no secrets or model calls.

**Impact and conditions.** Permission Gate can allow a protected `.env` write without the required confirmation when the path is a percent-encoded file URL. It also misses a protected parent directory when a relative filename is used while the tool cwd is already inside `node_modules`. Separately, the Code Reviewer, Triage Comments, Agent Workflow Audit, and Librarian read guards allow a file URL pointing outside their allowed checkout/workspace. Pi then reads the actual outside file. These are guard-boundary failures within the process's existing filesystem access; they do not grant OS permissions. They require the respective extension to be loaded and an applicable tool call with one of these path spellings.

**Affected source at the reviewed commit.**

- [`extensions/permission-gate/index.ts:57`](extensions/permission-gate/index.ts#L57) (`normalizeToolPath`, especially line 66), `:637`/`:643` (`validateWriteInput`/`validateEditInput`), and `:684`/`:730` (`confirmProtectedPathAction` and write hook).
- [`extensions/code-reviewer/index.ts:951`](extensions/code-reviewer/index.ts#L951) (`resolveToolPath`) and `:957` (`assertToolPathInsideCwd`).
- [`extensions/triage-comments/index.ts:662`](extensions/triage-comments/index.ts#L662) (`resolveToolPath`) and `:668` (`assertToolPathInsideCwd`).
- [`extensions/agent-workflow-audit/index.ts:298`](extensions/agent-workflow-audit/index.ts#L298) (`resolveToolPath`) and `:312` (`assertToolPathInsideCwd`).
- [`extensions/librarian/index.ts:984`](extensions/librarian/index.ts#L984) (`resolveToolPath`) and `:1070` (`createLibrarianRuntimeGuardExtension` read check).

**Root cause.** Permission Gate normalizes the raw string with POSIX path operations, without URL decoding or the tool's cwd. `%2eenv` therefore does not match `.env`, and a bare filename has no protected parent segment. The four workspace guards treat `file:///outside/file` as a relative string and resolve a fictitious `workspace/file:/outside/file`. When `realpath` fails for that fictitious path, they retain the lexically inside path and allow it. Pi 1.0.4 instead uses `fileURLToPath` and resolves relative paths against cwd (`node_modules/@earendil-works/pi-coding-agent/dist/utils/paths.js:59`, especially `:78` and `:83`; built-in tool resolution delegates through `dist/core/tools/path-utils.js:42`).

**Portable reproduction.** Run from the repository root with the lockfile dependencies installed and the repository-supported Node version. This creates only fake `.env` content and an outside sentinel inside one temporary fixture. Canonicalizing the fixture root prevents BUG-006 from masking the Librarian URL case. The hooks are invoked directly and their allow/block result determines whether the actual built-in tool executes; this is not a full interactive Pi session.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.cwd();
const load = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { createReadTool, createWriteTool } = await load(
  'node_modules/@earendil-works/pi-coding-agent/dist/index.js');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pi-path-handoff-')));
try {
  const workspace = path.join(root, 'workspace');
  const modules = path.join(workspace, 'node_modules', 'fixture');
  await fs.mkdir(modules, { recursive: true });
  const hooks = new Map();
  (await load('extensions/permission-gate/index.ts')).default({
    on(name, handler) { hooks.set(name, handler); },
  });
  const guard = hooks.get('tool_call');
  const envFile = path.join(workspace, '.env');
  await fs.writeFile(envFile, 'FAKE_VALUE=before\n');
  const cases = [
    { name: 'encoded .env URL', cwd: workspace, target: envFile,
      raw: pathToFileURL(envFile).href.replace(/\/\.env$/, '/%2eenv') },
    { name: 'relative file under node_modules cwd', cwd: modules,
      target: path.join(modules, 'fixture.txt'), raw: 'fixture.txt' },
  ];
  for (const item of cases) {
    const content = 'FAKE_VALUE=after\n';
    const ctx = { cwd: item.cwd, hasUI: false };
    const control = await guard({ toolName: 'write', input: {
      path: item.target, content,
    } }, ctx);
    const verdict = await guard({ toolName: 'write', input: {
      path: item.raw, content,
    } }, ctx);
    if (!verdict?.block) {
      await createWriteTool(item.cwd).execute('diagnostic', { path: item.raw, content });
    }
    console.log(JSON.stringify({ case: item.name, normalPathBlocked: !!control?.block,
      bypassBlocked: !!verdict?.block,
      actualFile: await fs.readFile(item.target, 'utf8').catch(() => '(not created)') }));
  }
  const outside = path.join(root, 'outside.txt');
  await fs.writeFile(outside, 'OUTSIDE_WORKSPACE_DIAGNOSTIC');
  const roles = [
    ['code-reviewer', 'createCodeReviewerRuntimeGuardExtension'],
    ['triage-comments', 'createTriageRuntimeGuardExtension'],
    ['agent-workflow-audit', 'createAuditRuntimeGuardExtension'],
    ['librarian', 'createLibrarianRuntimeGuardExtension'],
  ];
  for (const [role, factory] of roles) {
    const { __test__ } = await load(`extensions/${role}/index.ts`);
    const handlers = new Map();
    __test__[factory]({ cwd: workspace, workspace, maxTurns: 10,
      cacheRoot: path.join(root, 'cache'), cacheEnabled: false, planOnly: true })({
      on(name, handler) { handlers.set(name, handler); },
    });
    const hook = handlers.get('tool_call');
    const control = await hook({ toolName: 'read', input: { path: outside } });
    const raw = pathToFileURL(outside).href;
    const verdict = await hook({ toolName: 'read', input: { path: raw } });
    const result = verdict?.block ? null :
      await createReadTool(workspace).execute('diagnostic', { path: raw });
    console.log(JSON.stringify({ role, normalPathBlocked: !!control?.block,
      urlBlocked: !!verdict?.block, actual: result?.content }));
  }
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
NODE
```

**Actual:** Both write cases have `normalPathBlocked: true`, `bypassBlocked: false`, and `actualFile: "FAKE_VALUE=after\n"`. All four readers have `normalPathBlocked: true`, `urlBlocked: false`, and return `OUTSIDE_WORKSPACE_DIAGNOSTIC`. **Expected:** The write cases require confirmation and fail closed without UI; all outside-workspace reads are blocked regardless of equivalent path syntax.

**Suggested regression coverage and fix direction.** Resolve the same effective path as the supported Pi built-in tool before applying the policy, including URL decoding, cwd, and supported path sigils. Canonicalize both the allowed roots and resolved targets for containment checks; keep a deliberate policy for missing write targets and existing symlink parents. Cover plain/file-URL/encoded equivalents, protected relative cwd, allowed ordinary files, and outside-root reads for every affected guard. Exercise the real SDK tool after the hook so a matching mistake in a fake tool cannot conceal a bypass. Confirm the shared write/edit normalization fix with actual edits too; the demonstrated mutations above are writes, not edits. Review other path-taking tools for the same mismatch without treating untested variants as already reproduced.

**Caveats.** The demonstrated SDK is the installed Pi 1.0.4. Do not assume all older SDK versions accept these spellings. The finding concerns the named built-in path guards, not a universal subagent sandbox. Gnosis decision `vvnhar` intentionally makes all configured MCP tools available to these subagents; this finding does not expand the guard policy to MCP or ask to narrow that access. Other spelling differences, such as tilde expansion, are not claimed as reproduced here.

<a id="bug-005"></a>

## BUG-005 — Model fallback reuses an extension runtime invalidated by disposal

**Priority:** P2. **Status:** Agent-reproduced; pending owner triage. **Evidence:** Actual registered Code Reviewer and Librarian tools, actual SDK session creation/binding/disposal, a stubbed `AgentSession.prompt`, and actual built-in `tool_search` execution.

**Impact and conditions.** If a model attempt fails with a recognized availability error and another candidate exists, the fallback session can inherit a stale extension runtime. Using `tool_search` on that fallback raises the stale-context error instead of discovering tools. This compromises fallback runs that need extension-backed discovery/MCP access. It requires a fallback path; it is not a claim that every first attempt or every built-in filesystem tool fails.

**Affected source at the reviewed commit.** Code Reviewer creates/reloads one `DefaultResourceLoader` at [`extensions/code-reviewer/index.ts:1760`](extensions/code-reviewer/index.ts#L1760)/`:1786`, passes that same object into successive sessions at `:1803`, and disposes failed attempts at `:1895`. Librarian does the corresponding work at [`extensions/librarian/index.ts:1743`](extensions/librarian/index.ts#L1743)/`:1766`, `:1776` (`runAttempt`), and `:1847`–`:1855` (attempt cleanup).

**Root cause.** The loader's extension result includes mutable runtime state. Disposing the first session invalidates that runtime; rebinding a second session around the same loaded extensions does not make the captured extension API active again. In the installed Pi 1.0.4 SDK, `dist/core/resource-loader.js:292` returns the cached extension result, `dist/core/sdk.js:309` consumes it, `dist/core/agent-session.js:988`/`:999` invalidates the runner on disposal, and `dist/core/extensions/runner.js:482` invalidates the shared runtime. The extensions need a fresh runtime/extension instance lifecycle for each disposed-and-retried session.

**Portable reproduction.** Run this in a fresh Node process from the repository root. It isolates Pi configuration in a disposable directory, supplies two fake authenticated models, and prevents provider requests. The first prompt throws `404 model not found`; the second calls the real `tool_search`. The fake model error is a controlled trigger, not an observed external provider incident. The harness stubs the host Pi API, while the subagent SDK sessions and tool implementation remain real.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.cwd();
const load = rel => import(pathToFileURL(path.join(repo, rel)).href);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-fallback-handoff-'));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = root;
const sdk = await load('node_modules/@earendil-works/pi-coding-agent/dist/index.js');
const { createExtensionHarness } = await load('test/extension-test-helpers.mjs');
const originalPrompt = sdk.AgentSession.prototype.prompt;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Diagnostic forbids network requests'); };
const base = { provider: 'fixture', api: 'openai-completions', name: 'Fixture',
  reasoning: false, input: ['text'], contextWindow: 16000, maxTokens: 1000,
  baseUrl: 'https://fixture.invalid',
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
const models = ['a', 'b'].map(id => ({ ...base, id }));
const modelRuntime = {
  getModel: (_provider, id) => models.find(model => model.id === id),
  hasConfiguredAuth: () => true,
  streamSimple: () => { throw Error('Diagnostic forbids provider requests'); },
};
try {
  for (const role of ['code-reviewer', 'librarian']) {
    let attempts = 0;
    sdk.AgentSession.prototype.prompt = async function () {
      attempts++;
      if (attempts === 1) throw Error('404 model not found');
      const discovery = await this.getToolDefinition('tool_search').execute(
        'diagnostic', { query: 'fixture' });
      this.state.messages.push({ role: 'assistant', stopReason: 'stop',
        content: [{ type: 'text', text: JSON.stringify(discovery) }] });
    };
    const harness = createExtensionHarness();
    harness.pi.getThinkingLevel = () => 'off';
    (await load(`extensions/${role}/index.ts`)).default(harness.pi);
    const ctx = { cwd: root, hasUI: false, model: models[0],
      isProjectTrusted: () => false,
      modelRegistry: { getAvailable: () => models, runtime: modelRuntime } };
    await harness.handlers.get('session_start')?.({}, ctx);
    const tool = harness.tools.get(role === 'code-reviewer' ? 'code_reviewer' : role);
    const result = await tool.execute('diagnostic', role === 'code-reviewer'
      ? { task: 'diagnostic' } : { query: 'diagnostic' }, undefined, undefined, ctx);
    console.log(JSON.stringify({ role, attempts, status: result.details.status,
      content: result.content }));
    if (result.details.workspace) {
      await fs.rm(result.details.workspace, { recursive: true, force: true });
    }
  }
} finally {
  sdk.AgentSession.prototype.prompt = originalPrompt;
  globalThis.fetch = originalFetch;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await fs.rm(root, { recursive: true, force: true });
}
NODE
```

**Actual:** Both roles reach `attempts: 2`, report an error status, and include `This extension ctx is stale after session replacement or reload` in the failure. **Expected:** The second session has an active runtime; `tool_search` returns a normal discovery result, which may legitimately contain no matches in the empty fixture configuration.

**Suggested regression coverage and fix direction.** Add an offline fallback regression using real session creation/binding/disposal and discovery, with only the provider prompt controlled. Cover both the thrown availability-error path and an assistant error outcome, cleanup on abort, and no-fallback errors. Create/reload an independent loader/runtime per attempt, or otherwise establish an SDK-supported lifecycle that does not reuse invalidated extension closures. Preserve shutdown/disposal of failed attempts so the correction does not leak MCP connections. The project's recorded policy intentionally enables MCP discovery for SDK subagents; removing those tools would avoid the symptom by removing intended functionality.

**Caveats.** No live LLM, external MCP server, or full interactive session was used. The probe directly calls the real discovery definition inside the stubbed prompt. It demonstrates the stale runtime, not the exact downstream behavior of every configured MCP tool. Its SDK lifecycle details are version-specific to Pi 1.0.4.

<a id="bug-006"></a>

## BUG-006 — Librarian rejects valid files under macOS temporary-directory aliases

**Priority:** P2. **Status:** Agent-reproduced; pending owner triage. **Evidence:** Actual Librarian read hook on a real macOS temporary workspace and an ordinary sentinel file.

**Impact and conditions.** On macOS, a workspace expressed as `/var/folders/...` can contain a file whose `realpath` is `/private/var/folders/...`. Librarian rejects that file even though it is inside its own workspace. This can prevent reading locally saved research evidence. The default workspace construction uses `os.tmpdir()`; the failure depends on its spelling or another allowed-root alias differing from the canonical spelling, not on all macOS temporary directories always returning `/var`.

**Affected source at the reviewed commit.** [`extensions/librarian/index.ts:1073`](extensions/librarian/index.ts#L1073)–`:1077` in `createLibrarianRuntimeGuardExtension` resolves the file and canonicalizes it but compares it to uncanonicalized `options.workspace`/`options.cacheRoot`. Default workspace creation is at `:1652`–`:1655`.

**Root cause.** Target and allowed root use different normalization rules. `isInside` performs a lexical resolved-path comparison; it cannot infer that `/var` and `/private/var` refer to the same directory. This is the inverse of BUG-004: an allowed normal path is denied, rather than an outside file URL being admitted.

**Portable reproduction.** Run from the repository root on macOS. The probe retains or constructs the ordinary `/var` spelling of a temporary directory if the underlying location is `/private/var`. It does not create system symlinks or read personal files. Other operating systems report a skip; a temporary location outside this alias reports that the precondition is absent.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
if (process.platform !== 'darwin') {
  console.log('SKIP: this reproduction needs the macOS /var alias');
  process.exit(0);
}
const { __test__ } = await import(pathToFileURL(path.join(
  process.cwd(), 'extensions/librarian/index.ts')).href);
const created = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-librarian-path-handoff-'));
try {
  const canonicalRoot = await fs.realpath(created);
  if (!canonicalRoot.startsWith('/private/var/')) {
    console.log('SKIP: temporary location has no /private/var alias', canonicalRoot);
  } else {
    const workspace = canonicalRoot.slice('/private'.length);
    await fs.mkdir(path.join(workspace, 'repos'));
    const evidence = path.join(workspace, 'repos', 'evidence.txt');
    await fs.writeFile(evidence, 'LOCAL_EVIDENCE_DIAGNOSTIC');
    const handlers = new Map();
    __test__.createLibrarianRuntimeGuardExtension({ workspace, maxTurns: 10,
      cacheRoot: path.join(workspace, 'cache'), cacheEnabled: false })({
      on(name, handler) { handlers.set(name, handler); },
    });
    const verdict = await handlers.get('tool_call')({
      toolName: 'read', input: { path: 'repos/evidence.txt' },
    });
    console.log(JSON.stringify({ workspace, canonicalRoot,
      sameDirectory: (await fs.realpath(workspace)) === canonicalRoot,
      realFile: await fs.realpath(evidence),
      fileContent: await fs.readFile(evidence, 'utf8'), verdict }));
  }
} finally {
  await fs.rm(created, { recursive: true, force: true });
}
NODE
```

**Actual:** `sameDirectory: true`, `fileContent: "LOCAL_EVIDENCE_DIAGNOSTIC"`, and a blocked verdict stating `Librarian read is limited to its workspace/cache: /private/var/.../repos/evidence.txt`. **Expected:** No block for that in-workspace file.

**Suggested regression coverage and fix direction.** Canonicalize the allowed workspace/cache roots consistently with the effective read target. Add coverage using a symlinked allowed root plus ordinary relative reads, canonical absolute reads, and a symlink that genuinely escapes the allowed root. A portable symlink-root test can cover the normalization mistake in CI; retain the macOS alias probe as platform-specific confirmation. Cover cache roots as well, since the same comparison is used there.

**Caveats.** The observed failure is the read-guard decision, not a reproduced full GitHub research run. No network request is needed. Do not remove canonicalization of the target merely to make the alias work, since that would weaken protection against real symlink escapes.

<a id="bug-007"></a>

## BUG-007 — Oracle and Contrarian corrupt UTF-8 split across subprocess chunks

**Priority:** P2. **Status:** Agent-reproduced; pending owner triage. **Evidence:** Real local Node child processes producing valid UTF-8 JSONL, parsed by the actual Oracle/Contrarian subprocess runners.

**Impact and conditions.** If a multibyte UTF-8 character crosses an OS pipe chunk boundary, the returned assistant text is silently changed to replacement characters. The runners can still report success. This affects international text, symbols, filenames, or other evidence in a subagent answer; whether a particular live run hits the boundary is timing-dependent.

**Affected source at the reviewed commit.** [`extensions/oracle/index.ts:1358`](extensions/oracle/index.ts#L1358)–`:1367` in `runOracle` and [`extensions/contrarian/index.ts:1487`](extensions/contrarian/index.ts#L1487)–`:1496` in `runContrarian`. Both stdout JSONL buffering and stderr accumulation convert each incoming buffer separately with `data.toString()`.

**Root cause.** UTF-8 decoding is stateful across byte chunks. Decoding each buffer independently loses an incomplete character at the end of one chunk and its continuation at the start of the next. String concatenation afterward cannot recover those bytes. The JSON remains syntactically valid when the split character is within a JSON string, so parsing does not expose the corruption.

**Portable reproduction.** Run from the repository root. The injected spawn function uses a real child process instead of invoking Pi or a model. The child sends its first byte segment and waits for an IPC acknowledgment after that segment is delivered to the parent's stdout stream, ensuring the split happens within `é`. The extension's real stdout listener handles both segments.

```sh
node --input-type=module <<'NODE'
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
const repo = process.cwd();
const expected = 'café 東京 🔮';
const selection = { modelRef: 'fixture/test', provider: 'fixture', modelId: 'test',
  thinkingLevel: 'off', autoSelected: false, selectionReason: 'diagnostic' };
const childSource = `
  const bytes = Buffer.from(JSON.stringify({ type: 'message_end', message: {
    role: 'assistant', content: [{ type: 'text', text: 'café 東京 🔮' }],
    stopReason: 'stop'
  } }) + '\\n');
  const split = bytes.indexOf(Buffer.from('é')) + 1;
  process.once('message', () => {
    process.stdout.end(bytes.subarray(split));
    process.disconnect();
  });
  process.stdout.write(bytes.subarray(0, split));
`;
for (const role of ['oracle', 'contrarian']) {
  const { __test__ } = await import(pathToFileURL(path.join(
    repo, `extensions/${role}/index.ts`)).href);
  const spawnImpl = () => {
    const child = spawn(process.execPath, ['-e', childSource], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    child.stdout.once('data', () => child.send('continue'));
    return child;
  };
  const runner = __test__[role === 'oracle' ? 'runOracle' : 'runContrarian'];
  const result = await runner(selection, { task: 'diagnostic' },
    undefined, undefined, repo, spawnImpl);
  console.log(JSON.stringify({ role, expected, actual: result.output, ok: result.ok }));
}
NODE
```

**Actual:** Both return `ok: true` with `actual: "caf�� 東京 🔮"`. **Expected:** The exact original `café 東京 🔮`.

**Suggested regression coverage and fix direction.** Decode the streams with a persistent UTF-8 decoder, such as `setEncoding('utf8')` or `StringDecoder`, before newline splitting. Flush the decoder correctly on close and handle stderr the same way. Test splits within two-, three-, and four-byte characters, multiple messages, and an unterminated final line, while retaining correct handling of provider error and abort events. The implementation is duplicated, so cover both runners or extract a carefully scoped shared reader.

**Caveats.** This is a real subprocess/pipe decoding reproduction with injected child content, not evidence of a particular live provider returning corrupted bytes. The demonstrated output corruption is stdout; stderr uses the same vulnerable pattern but is not independently demonstrated here.

<a id="bug-008"></a>

## BUG-008 — Review loop mistakes the original branch's assistant for a finished fix turn

**Priority:** P2. **Status:** Agent-reproduced in a command harness; pending owner triage. **Evidence:** Actual `/review` handler under a controlled branch/scheduling harness, corroborated by installed SDK scheduling source. Full interactive end-to-end reproduction remains unperformed.

**Impact and conditions.** With loop fixing enabled, a review of a session that already contains an assistant message can start its next review before its queued fix prompt has started. The timing window exists while an asynchronous input or `before_agent_start` hook is still processing the fix prompt and the SDK still reports idle/no queued messages. The next review can therefore run against unfixed code; later overlap or cancellation consequences have not been independently reproduced.

**Affected source at the reviewed commit.** [`extensions/review/index.ts:1659`](extensions/review/index.ts#L1659) captures `fixBaselineAssistantId` on the review branch before `executeEndReviewAction(..., "returnAndFix")` returns to the original branch. `waitForLoopTurnToStart` at `:1029`–`:1044` accepts any last-assistant ID different from that baseline as evidence that the fix started. The subsequent `ctx.waitForIdle()` at `:1674` and `fixSnapshot` check at `:1676`–`:1679` accept the original branch's older assistant message. The fix prompt is submitted through `pi.sendUserMessage` at `:1999`.

**Root cause and SDK scheduling evidence.** The baseline is taken from the wrong branch, and "different assistant ID" is treated as proof of a new turn. A branch switch alone satisfies that predicate. In the installed Pi 1.0.4 SDK:

- `dist/core/agent-session.js:2708` launches `sendUserMessage` without returning its promise to the extension API.
- `:1534` and `:1587` await input and before-start hooks before `_runAgentPrompt` sets `_isAgentRunActive` at `:1384`.
- `:1049` reports idle when no agent run/compaction is active; `:1888` counts only steering/follow-up queues, not a prompt waiting in preflight.
- `:1917` returns from `waitForIdle` immediately when already idle.

These paths support the harness's modeled pending-preflight state. The source evidence does not itself establish a full live TUI run.

**Portable reproduction.** Run from the repository root. This registers the real extension and executes its real command handler, while mocking session navigation, review messages, UI summary completion, and SDK scheduling. The first review has a P2 finding; the second has none to keep the diagnostic finite. The fix stays pending in the modeled preflight state throughout.

```sh
node --input-type=module <<'NODE'
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { default: extension, __test__: review } = await import(pathToFileURL(path.join(
  process.cwd(), 'extensions/review/index.ts')).href);
review.resetReviewRuntimeState();
const assistant = (id, text) => ({ id, type: 'message', message: {
  role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text }],
} });
const user = { id: 'user-origin', type: 'message',
  message: { role: 'user', content: 'Original task' } };
const original = assistant('assistant-origin', 'Completed original coding task.');
const settings = { id: 'settings', type: 'custom', customType: 'review-settings',
  data: { loopFixingEnabled: true } };
const entries = [user, original, settings];
let branch = [...entries];
let reviewPasses = 0;
let fixPromptPending = false;
const calls = [];
const commands = new Map();
review.applyReviewSettings({ sessionManager: { getEntries: () => entries } });
const ctx = {
  cwd: process.cwd(), hasUI: true, mode: 'tui', isProjectTrusted: () => false,
  ui: { notify: text => calls.push(['notify', text]), setWidget() {},
    setEditorText() {}, getEditorText() { return ''; },
    async custom() { branch = [user, original]; return { status: 'success' }; } },
  sessionManager: { getEntries: () => entries, getBranch: () => branch,
    getLeafId: () => branch.at(-1)?.id },
  async navigateTree() { branch = []; return { cancelled: false }; },
  isIdle: () => true, hasPendingMessages: () => false,
  async waitForIdle() {
    calls.push(['waitForIdle', { fixPromptPending, lastAssistant:
      branch.filter(item => item.type === 'message' &&
        item.message.role === 'assistant').at(-1)?.id }]);
  },
};
extension({
  on() {}, registerCommand: (name, spec) => commands.set(name, spec),
  appendEntry: (customType, data) => branch.push({
    id: 'custom', type: 'custom', customType, data }),
  async exec() { return { code: 0, stdout: '.git\n', stderr: '' }; },
  sendUserMessage(message) {
    if (message.startsWith('Use the latest review summary')) {
      fixPromptPending = true;
      calls.push(['fix prompt pending in preflight']);
      return;
    }
    reviewPasses++;
    calls.push(['send review', reviewPasses, { fixPromptPending }]);
    branch.push(assistant(`review-${reviewPasses}`, reviewPasses === 1
      ? '## Findings\n- [P2] Demonstrated bug\n## Verdict\nneeds attention'
      : '## Findings\nNone.\n## Verdict\ncorrect'));
  },
});
try {
  await commands.get('review').handler('uncommitted', ctx);
  console.log(JSON.stringify(calls, null, 2));
} finally {
  review.resetReviewRuntimeState();
}
NODE
```

**Actual:** The trace first shows review 1, then `fix prompt pending in preflight`, then `waitForIdle` with `lastAssistant: "assistant-origin"` and `fixPromptPending: true`, followed by `send review`, pass `2`, while `fixPromptPending` remains true. **Expected:** The next review cannot begin until the intended fix turn has actually run and produced its own completed assistant result.

**Suggested regression coverage and fix direction.** Tie the fix to a completion signal or message/turn identity on the destination branch, rather than comparing against the review branch's last assistant. Capturing the destination baseline is necessary if this predicate remains, but also account for asynchronous preflight, input interception, failed startup, and a prompt that is queued but has not run. Add a deterministic SDK-backed regression with a deferred input/before-start hook: assert that review 2 does not start while the hook is blocked, then release it and verify review 2 starts only after a real fix completion. Retain coverage for empty sessions, an existing assistant on the origin branch, abort/error outcomes, and failed prompt startup. Avoid arbitrary sleeps as the correctness condition.

**Caveats.** The command harness reproduces the extension's incorrect decision given a state the SDK source permits. It does not instantiate the actual SDK/TUI scheduling path, run a model, modify source files, or prove every downstream race consequence. Owner confirmation should include an SDK-backed or interactive reproduction before broadening the impact claim.

<a id="bug-009"></a>

## BUG-009 — Fast overrides provider-required Anthropic beta headers

**Priority:** P2. **Status:** agent-reproduced; pending owner triage. **Scope:** the unified `fast` extension on supported direct Anthropic models with provider beta features, including native mid-conversation tool changes.

**Impact:** enabling `/fast` removes feature flags that the installed Pi provider would otherwise send, while leaving the corresponding features in the request body. This establishes an inconsistent outgoing request. Live Anthropic rejection or the exact server-side consequence has **not** been verified.

**Source at reviewed commit:** [extensions/fast/index.ts](extensions/fast/index.ts#L386), lines 386–398, `getAnthropicProviderBetas()`, reconstructs only two older provider betas; [extensions/fast/index.ts](extensions/fast/index.ts#L401), lines 401–427, `injectAnthropicFastHeader()`, writes the resulting explicit `anthropic-beta` header. In installed Pi AI 1.0.4, `node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js:820–855`, `getBetaFeatures()`, treats an explicit header as the complete feature list and returns before generating its defaults. These dependency lines describe the installed version, not repository-owned source. Its README section on system-message replay/native tool changes explicitly associates native `tool_addition`/`tool_removal` blocks with `inline-tools-2026-09-15`.

**Preconditions and manual reproduction:** use the reviewed lockfile's Pi 1.0.4 packages and a supported Anthropic model. Start with at least one tool, then add a tool later in the transcript so Pi emits a native `tool_addition` block. Compare the outgoing request with `/fast` off and on. For Opus 5/5.5 also inspect the provider's thinking-binding/mid-conversation-output betas. A request recorder or the offline diagnostic below is sufficient; no paid API call is required.

**Portable diagnostic:** from the repository root, with its locked dependencies installed and Node supporting native TypeScript imports (the package declares Node >=22.19.0), run this complete block. It calls the real extension hooks and real installed provider serializer, routes every request to a fake `fetch`, uses dummy credentials, and cleans up its isolated config directory.

```sh
node --input-type=module <<'NODE'
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const scratch = await mkdtemp(join(tmpdir(), 'pi-bug-009-'));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = scratch;
try {
  const load = (relative) => import(pathToFileURL(join(root, relative)).href);
  const { default: extension } = await load('extensions/fast/index.ts');
  const { ANTHROPIC_MODELS } = await load(
    'node_modules/@earendil-works/pi-ai/dist/providers/anthropic.models.js');
  const { streamSimple } = await load(
    'node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js');
  const handlers = new Map(), commands = new Map();
  extension({ on: (name, fn) => handlers.set(name, fn),
    registerCommand: (name, value) => commands.set(name, value),
    getActiveTools: () => ['read'] });
  const tool = (name) => ({ name, description: name,
    parameters: { type: 'object', properties: {} } });
  const transcript = { messages: [
    { role: 'system', content: 'Diagnostic', toolsAdded: [tool('read')], timestamp: 0 },
    { role: 'user', content: 'hello', timestamp: 0 },
    { role: 'system', content: '', toolsAdded: [tool('later')], timestamp: 1 },
    { role: 'user', content: 'continue', timestamp: 2 },
  ] };
  for (const id of ['claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5']) {
    const catalogModel = Object.values(ANTHROPIC_MODELS).find((m) => m.id === id);
    if (!catalogModel) throw new Error(`Model missing from installed catalog: ${id}`);
    const model = { ...catalogModel, baseUrl: 'https://capture.invalid' };
    const ctx = { cwd: scratch, model, sessionManager: {}, hasUI: false,
      isProjectTrusted: () => false, ui: { notify() {}, setStatus() {} },
      modelRegistry: { isUsingOAuth: () => false,
        getProviderAuth: async () => ({ auth: { apiKey: 'diagnostic-only' } }) } };
    await handlers.get('session_start')({}, ctx);
    let baseline;
    for (const fast of [false, true]) {
      if (fast) await commands.get('fast').handler('', ctx);
      const headers = {};
      await handlers.get('before_provider_headers')({ headers }, ctx);
      let captured;
      const stream = streamSimple(model, transcript, {
        apiKey: 'diagnostic-only', headers, reasoning: 'high',
        onPayload: (payload) => handlers.get('before_provider_request')({ payload }, ctx),
        fetch: async (_input, init) => {
          captured = { headers: Object.fromEntries(new Headers(init.headers)),
            body: JSON.parse(init.body) };
          return new Response(JSON.stringify({ error: { message: 'capture complete' } }),
            { status: 400, headers: { 'content-type': 'application/json' } });
        },
      });
      await stream.result(); // The fake 400 terminates the stream after serialization.
      if (!captured) throw new Error('No request captured');
      const betas = (captured.headers['anthropic-beta'] ?? '').split(',');
      if (!fast) baseline = betas;
      console.log(JSON.stringify({ model: id, fast, betas,
        missingFromFast: fast ? baseline.filter((b) => !betas.includes(b)) : [],
        speed: captured.body.speed, thinking: captured.body.thinking,
        blockTypes: captured.body.messages.flatMap((m) =>
          Array.isArray(m.content) ? m.content.map((b) => b.type) : []) }));
    }
  }
} finally {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(scratch, { recursive: true, force: true });
}
NODE
```

**Actual versus expected:** at the reviewed version, `/fast` removes `inline-tools-2026-09-15` for all three supported models even though `blockTypes` still contains `tool_addition`. Opus 5/5.5 additionally lose `mid-conversation-output-config-2026-07-01` and `thinking-binding-controls-2026-08-01`; their adaptive-thinking body retains `block_binding: { prefix_mismatch_behavior: "drop_block" }`. Expected: preserve every beta required by the request's provider-generated features and add the Fast beta. The diagnostic's fabricated 400 is only a capture mechanism and is not evidence of a real service rejection.

**Root cause and fix guidance:** the extension assumes that supplying a partially reconstructed beta list augments the provider defaults. In Pi 1.0.4 it replaces them. Prefer an additive hook at a point where the complete provider list is available, or a supported provider API that merges flags. If reconstruction is unavoidable, cover the provider's current compatibility/feature conditions rather than appending an unconditional list copied from this example. Preserve explicit user/model header intent as well as provider requirements.

**Suggested regression:** through the actual installed provider request builder and a fake `fetch`, capture otherwise identical requests with Fast off/on for each supported Anthropic model, initial and later tool additions, and relevant reasoning modes. Assert that enabled body features keep their required betas and the Fast flag is added exactly once. Include preexisting mixed-case headers and OAuth handling. This handoff adds no regression test or fix. The current reproduction uses dummy API-key auth; OAuth and live service behavior remain follow-up coverage.

<a id="bug-010"></a>

## BUG-010 — Git-quoted and trailing-space filenames lose annotation content

**Priority:** P2. **Status:** agent-reproduced; pending owner triage. **Scope:** `annotate-git-diff` name-status parsing for tracked changes and other paths that use the same parser.

**Impact:** valid modified files can appear under corrupted names with empty diffs, hiding their old/new content from annotation. The backend can also retain a correctly named snapshot row alongside the malformed diff row, so merely seeing the real filename elsewhere does not establish a working Branch diff.

**Source at reviewed commit:** [extensions/annotate-git-diff/git.ts](extensions/annotate-git-diff/git.ts#L169), lines 169–180, `parseNameStatus()`, splits line-oriented output and trims each line without decoding Git's quoted path format. `parseNameStatusLine()` at lines 150–166 consumes those tokens as literal filenames. `getTrackedBranchReviewChanges()` at lines 503–519 requests `--name-status` without `-z`; `getCommitFiles()` at lines 757–768 and the working-tree snapshot helper also feed this parser.

**Preconditions and manual reproduction:** in a disposable Git repository with `core.quotePath=true` (Git's default), commit a nonempty `café.txt` and a filename ending in a literal space such as `tail .txt `; edit both. Open `/annotate-git-diff` in Branch scope and select their changed-file entries. Keep the trailing space in the actual filename. The shared diagnostic below creates these fixtures without editing the working repository.

**Actual versus expected:** the changed pathname for `café.txt` is the literal quoted/octal string `"caf\303\251.txt"`; `tail .txt ` becomes `tail .txt`. Their loaded original/modified contents are empty and `modifiedExists` is false. Expected: exact path bytes preserved, `old\n` versus `new\n`, and `modifiedExists=true` for both.

**Root cause and fix guidance:** Git's display-oriented path output is being treated as a path interchange format. Request NUL-delimited name-status output (`-z`) and parse its status/path records without trimming path bytes; handle the extra old/new paths for renames/copies. Apply the transport/parser change consistently to all call sites. Turning off `core.quotePath` alone would not fix trailing spaces, tabs, or newlines.

**Suggested regression:** real temporary repositories containing non-ASCII, trailing-space, tab, newline, and quote/backslash names, plus renamed paths. Assert exact returned paths and actual old/new contents through the public loader in Branch and Commits/working-tree scopes. The concrete reproduction covers non-ASCII and trailing-space names; the other cases are proposed coverage, not claimed observations. The agent verified backend outputs, not a live annotation-window screenshot.

### Shared portable diagnostic for BUG-010, BUG-011, and BUG-012

Run from the repository root with Node >=22.19.0 and Git installed. This calls the actual source functions against three fresh repositories, disables global/system Git configuration and signing, uses a local disposable identity, avoids shell startup profiles, and deletes all fixture repositories in `finally`. The source's temporary-index helper cleans up its own index via its shell trap. No remote, authentication, or existing commits are used.

```sh
node --input-type=module <<'NODE'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(pathToFileURL(join(process.cwd(),
  'extensions/annotate-git-diff/git.ts')).href);
const scratch = await mkdtemp(join(tmpdir(), 'pi-bugs-010-012-'));
try {
  const configPath = join(scratch, 'empty-gitconfig');
  const templatePath = join(scratch, 'empty-template');
  await writeFile(configPath, '');
  await mkdir(templatePath);
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.startsWith('GIT_') && key !== 'BASH_ENV'));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: configPath,
    GIT_ATTR_NOSYSTEM: '1', BASH_ENV: configPath });
  const exec = (cmd, args, cwd) => {
    // The source uses bash -lc for a temporary index. Suppress startup files.
    if (cmd === 'bash' && args[0] === '-lc')
      args = ['--noprofile', '--norc', '-c', args[1]];
    const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
    if (r.error) throw r.error;
    return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  const pi = { exec: async (cmd, args, opts) => exec(cmd, args, opts.cwd) };
  const repo = async (name) => {
    const dir = join(scratch, name);
    await mkdir(dir);
    const git = (...args) => {
      const r = exec('git', args, dir);
      if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
      return r.stdout.trimEnd();
    };
    git('init', '-b', 'main', `--template=${templatePath}`);
    for (const [key, value] of Object.entries({ 'user.name': 'Diagnostic',
      'user.email': 'diagnostic@example.invalid', 'commit.gpgsign': 'false',
      'tag.gpgsign': 'false', 'core.quotePath': 'true', 'core.autocrlf': 'false' }))
      git('config', key, value);
    return { dir, git };
  };
  {
    const { dir, git } = await repo('filenames');
    for (const name of ['café.txt', 'tail .txt ']) await writeFile(join(dir, name), 'old\n');
    git('add', '.'); git('commit', '-m', 'base');
    for (const name of ['café.txt', 'tail .txt ']) await writeFile(join(dir, name), 'new\n');
    const data = await mod.getReviewWindowData(pi, dir);
    for (const file of data.files.filter((f) => f.inGitDiff))
      console.log('BUG-010', JSON.stringify({ path: file.path,
        contents: await mod.loadReviewFileContents(pi, dir, file,
          'branch', null, data.branchMergeBaseSha) }));
  }
  {
    const { dir } = await repo('unborn');
    await writeFile(join(dir, 'file.txt'), 'first content\n');
    const data = await mod.getReviewWindowData(pi, dir);
    const file = data.files.find((f) => f.inGitDiff);
    const workingSha = '__tlh_working_tree__';
    const workingFile = (await mod.getCommitFiles(pi, dir, workingSha))[0];
    console.log('BUG-011', JSON.stringify({ repositoryHasHead: data.repositoryHasHead,
      branchMergeBaseSha: data.branchMergeBaseSha, file,
      branch: await mod.loadReviewFileContents(pi, dir, file, 'branch', null,
        data.branchMergeBaseSha),
      workingTree: await mod.loadReviewFileContents(pi, dir, workingFile,
        'commits', workingSha) }));
  }
  {
    const { dir, git } = await repo('merge');
    await writeFile(join(dir, 'base.txt'), 'base\n');
    git('add', '.'); git('commit', '-m', 'base');
    git('checkout', '-b', 'topic');
    await writeFile(join(dir, 'topic.txt'), 'topic\n');
    git('add', '.'); git('commit', '-m', 'topic');
    git('checkout', 'main');
    await writeFile(join(dir, 'main.txt'), 'main\n');
    git('add', '.'); git('commit', '-m', 'main');
    git('merge', '--no-ff', 'topic', '-m', 'merge');
    console.log('BUG-012', JSON.stringify({
      parentCount: git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length - 1,
      firstParentDiff: git('diff', '--name-status', 'HEAD^', 'HEAD'),
      files: await mod.getCommitFiles(pi, dir, git('rev-parse', 'HEAD')) }));
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
NODE
```

The diagnostic reports observations instead of asserting the bug, so it can also show the intended values after a future fix. Its shell adapter deliberately removes login/startup-profile effects; it does not reproduce the full Pi UI lifecycle.

<a id="bug-011"></a>

## BUG-011 — Annotation Branch scope is blank before the first commit

**Priority:** P2. **Status:** agent-reproduced; pending owner triage. **Scope:** an unborn Git repository with reviewable files and the default Branch annotation scope.

**Impact:** the file list marks a nonempty new file as added, but its Branch diff appears empty. The same backend can load the real content through the working-tree pseudo-commit, so the data exists and is accessible.

**Source at reviewed commit:** [extensions/annotate-git-diff/git.ts](extensions/annotate-git-diff/git.ts#L652), lines 652–670, `getReviewWindowData()`, correctly enumerates unborn-repository changes but produces a null `branchMergeBaseSha`. `loadReviewFileContents()` at lines 980–990 returns empty text immediately when that base is absent. Its binary path has the equivalent early return at line 865.

**Preconditions and manual reproduction:** run `git init` in a disposable directory, create a nonempty `file.txt`, and do not make a first commit. Start Pi there and open `/annotate-git-diff` in Branch scope. Compare the selected file with the uncommitted-changes entry in Commits scope. Staging is not necessary for the diagnostic's reproduction. Run the [shared diagnostic under BUG-010](#shared-portable-diagnostic-for-bug-010-bug-011-and-bug-012) and inspect `BUG-011` for a portable backend reproduction.

**Actual versus expected:** the diagnostic returns `repositoryHasHead=false`, `branchMergeBaseSha=null`, a file with status `added`, and Branch contents `originalContent=""`, `modifiedContent=""`, `modifiedExists=false`. The working-tree pseudo-commit returns `modifiedContent="first content\n"` and `modifiedExists=true`. Expected Branch behavior is an addition against an empty baseline: absent original side and the existing nonempty working-tree side.

**Root cause and fix guidance:** the loader equates “there is no branch comparison commit” with “there is no file content,” although an unborn repository has a valid working-tree side. Give the no-HEAD state an explicit empty-tree comparison semantics, or propagate that state to the loader and read the working tree while marking the original side absent. Preserve errors for genuinely invalid comparison references and apply the same behavior to binary previews.

**Suggested regression:** a real `git init` fixture without commits containing unstaged and staged text additions, an empty text file, and a binary/image addition. Assert Branch and working-tree content/existence flags and binary previews agree on the modified side. The reproduction establishes the nonempty text case; binary behavior is supported by the equivalent source guard and needs its own test. No live annotation-window screenshot was captured.

<a id="bug-012"></a>

## BUG-012 — Selecting a merge commit yields no annotation files

**Priority:** P2. **Status:** agent-reproduced; pending owner triage. **Scope:** `annotate-git-diff` Commits scope when a selected commit has multiple parents.

**Impact:** a merge that introduces changes relative to its first parent can have an empty changed-file picker, preventing annotation of that merge's changes.

**Source at reviewed commit:** [extensions/annotate-git-diff/git.ts](extensions/annotate-git-diff/git.ts#L735), lines 735–780, `getCommitFiles()`, invokes `git diff-tree --root … <sha>` at lines 757–767 without asking for a merge-parent comparison. `loadReviewFileContents()` already reads ordinary commit originals from `${commitSha}^` at lines 960–967, implying first-parent content semantics; the binary path uses the same parent convention at lines 842–855.

**Preconditions and manual reproduction:** create a base commit, branch to `topic` and add `topic.txt`, return to `main` and add a different `main.txt`, then merge `topic` with `--no-ff`. Open `/annotate-git-diff`, choose Commits scope, and select the merge. A direct `git diff --name-status HEAD^ HEAD` lists `topic.txt`. The [shared diagnostic under BUG-010](#shared-portable-diagnostic-for-bug-010-bug-011-and-bug-012) builds this graph with local commits and prints `BUG-012`.

**Actual versus expected:** a real two-parent merge has `firstParentDiff="A\ttopic.txt"`, but `getCommitFiles()` returns `[]`. Expected: enumerate the changes from the selected merge's first parent to the merge, consistent with the existing content loader. If the product instead wants a different merge presentation, that policy must be made explicit and applied to both listing and content loading.

**Root cause and fix guidance:** `diff-tree` does not emit this merge comparison by default. Resolve the intended parent and compare it explicitly with the merge, or choose an appropriate Git first-parent merge-diff option. Retain the existing empty-tree behavior for root commits. Avoid simply listing all parents' changes while loading only first-parent content; that would make the picker and diff sides disagree.

**Suggested regression:** a real two-parent merge where a topic file is added, plus a merge with a modified file/conflict resolution. Assert the list and loaded old/new contents match a first-parent Git diff. Keep single-parent and root-commit coverage and decide explicitly how octopus merges should behave. The reproduced merge is a clean two-parent merge; live UI rendering, conflict-resolution merges, and octopus merges were not tested.

<a id="bug-013"></a>

## BUG-013 — Inline Bash ends commands at quoted or nested braces

**Priority:** P2. **Status:** agent-reproduced; pending owner triage. **Scope:** the `inline-bash` user-input expansion syntax `!{…}` when an otherwise valid Bash command includes `}` inside a quote or parameter expansion.

**Impact:** ordinary valid commands are cut off early, Bash receives invalid syntax, and the transformed prompt contains shell error text plus an unexpanded command suffix. The user can send this corrupted prompt onward to the model.

**Source at reviewed commit:** [extensions/inline-bash/index.ts](extensions/inline-bash/index.ts#L4), line 4, the `PATTERN` regex inside the default registration function, accepts every character only up to the first `}`. The input handler at lines 27–36 records that truncated match; lines 46–52 run it as Bash; lines 54–75 insert its output/error and append the unmatched suffix.

**Preconditions and manual reproduction:** with `inline-bash` loaded, submit this harmless user prompt:

```text
Check !{printf "%s" "a}b"}
```

Expected expanded prompt: `Check a}b`. Also try `Check !{printf "%s" "${USER}"}`: its parameter-expansion brace is mistaken for the outer delimiter. This second manual prompt depends on the user's `USER` value; the diagnostic below uses a fixed `PROBE_VALUE` instead.

**Portable diagnostic:** run from the repository root with Node >=22.19.0 and Bash available. This loads the real input handler, executes the harmless parsed commands in a real local Bash process with startup files disabled, and prints the exact command passed to Bash alongside the transformed prompt. It creates no files and makes no network calls.

```sh
node --input-type=module <<'NODE'
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { default: extension } = await import(pathToFileURL(join(process.cwd(),
  'extensions/inline-bash/index.ts')).href);
let input;
let executed = [];
extension({ on: (name, fn) => { if (name === 'input') input = fn; },
  exec: async (cmd, args) => {
    const r = spawnSync(cmd, ['--noprofile', '--norc', ...args], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, BASH_ENV: '', PROBE_VALUE: 'fixed' },
    });
    if (r.error) throw r.error;
    executed.push({ command: args[1], code: r.status, stderr: r.stderr });
    return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
  },
});
for (const [prompt, expected] of [
  ['Check !{printf "%s" "a}b"}', 'Check a}b'],
  ['Check !{printf "%s" "${PROBE_VALUE}"}', 'Check fixed'],
]) {
  executed = [];
  const result = await input({ text: prompt, source: 'interactive', images: [] },
    { hasUI: false });
  console.log(JSON.stringify({ prompt, executed, expected, actual: result.text }));
}
NODE
```

**Actual versus expected:** the first command sent to Bash is `printf "%s" "a`, which exits nonzero for an unterminated quote; the transformed result appends the leftover `b"}` after the shell error. The parameter example executes `printf "%s" "${PROBE_VALUE`, likewise truncated before the parameter and quoted string can close. Expected: execute each full command and replace exactly the outer `!{…}` span with `a}b` or `fixed` respectively. Error wording varies with the installed Bash version.

**Root cause and fix guidance:** the delimiter regex has no concept of Bash quoting, escaping, or nested expansion syntax. Define the accepted command grammar and use a scanner/parser that finds the matching outer delimiter while accounting for those constructs. Preserve literal suffixes and multiple expansions, and handle unmatched/unsupported syntax explicitly rather than executing a silently truncated prefix. A fix must keep the existing restriction on extension-injected input and existing timeout/output bounds.

**Suggested regression:** invoke the registered input handler with a capturing executor and the two prompts above; assert complete command extraction and exact transformed text. Add quoted/escaped braces, `${…}`, nested command substitutions, multiple expansions, unmatched delimiters, and extension-origin input. Retain a small real-Bash integration case to prove the captured command remains executable. The agent reproduced two harmless quoting/parameter cases; this is not a claim that every Bash grammar construct has been exercised.

## Existing regression suites to extend

These files are starting points for the eventual fixes; the handoff itself adds no tests.
Run a focused file with `node --test test/<name>.test.mjs`, then use `npm run ci`
for the repository's full validation once implementation work is ready.

- BUG-001–002: [file-operation strategies](test/dynamic-context-pruning-strategies-b.test.mjs),
  [dedupe strategies](test/dynamic-context-pruning-strategies-a.test.mjs), and
  [pipeline integration](test/dynamic-context-pruning-pipeline.test.mjs).
- BUG-003: [commands](test/dynamic-context-pruning-commands.test.mjs) and
  [persistence](test/dynamic-context-pruning-persistence.test.mjs).
- BUG-004: [shell/path safety](test/shell-safety.test.mjs),
  [code-reviewer runtime](test/code-reviewer-runtime.test.mjs),
  [triage safety](test/triage-comments-safety.test.mjs),
  [audit safety](test/agent-workflow-audit-safety.test.mjs), and
  [Librarian configuration/cache](test/librarian-command-config-cache.test.mjs).
- BUG-005: [SDK/MCP integration](test/sdk-subagent-mcp.test.mjs),
  [code-reviewer runtime](test/code-reviewer-runtime.test.mjs), and
  [Librarian model selection](test/librarian-model-selection.test.mjs).
- BUG-006: [Librarian configuration/cache](test/librarian-command-config-cache.test.mjs).
- BUG-007: [Oracle/Contrarian runtime](test/oracle-contrarian-runtime.test.mjs).
- BUG-008: [review extension](test/review-extension.test.mjs).
- BUG-009: [Fast extension](test/fast-extension.test.mjs) and
  [provider mutation integration](test/provider-context-mutation-extensions.test.mjs).
- BUG-010–012: [annotation Git access](test/annotate-git-access.test.mjs) and
  [annotation helpers](test/annotate-helpers.test.mjs).
- BUG-013: [inline Bash](test/inline-bash.test.mjs).

## Review coverage and exclusions

The review combined independent passes over subagent runtimes, context/provider
behavior, annotation/review/UI behavior, and safety/utility/release tooling.
Reported findings were checked with source inspection and focused diagnostics
against the locked SDK. Existing tests and relevant repository knowledge were
reviewed to avoid reporting deliberate behavior as a defect.

In particular, granting configured MCP tools to subagents is intentional. BUG-004
concerns enforcement by existing built-in path guards, not a proposal to filter
MCP tools or introduce a universal sandbox. The retired `openai-fast` and
`claude-fast` packages intentionally do not implement the current Fast feature;
BUG-009 belongs to `extensions/fast`.

No additional sufficiently supported finding was promoted from the reviewed
notification, todo, gnosis, context-cap, context-inspector, project-mcp-json,
annotate-last-message, quiet-tools, footer, or release-tooling paths. That is a
statement of review results, not a claim that those areas are defect-free. This
handoff does not include live provider validation, native Windows reproduction,
or an exhaustive end-to-end UI pass.
