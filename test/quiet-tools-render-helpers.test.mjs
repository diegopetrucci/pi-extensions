import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBashToolDefinition, initTheme } from "@earendil-works/pi-coding-agent";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const quietToolsModule = await import(
  pathToFileURL(path.join(repoRoot, "extensions/quiet-tools/index.ts")).href
);
const {
  sanitizeInlineText,
  formatQuietCallLine,
  formatMcpCallLine,
  createQuietResolver,
  QuietToolsDelegateToDefault,
} = quietToolsModule.__testing;
initTheme("dark");

const theme = {
  fg(kind, text) {
    return `<${kind}>${text}</${kind}>`;
  },
  bold(text) {
    return `*${text}*`;
  },
};

test("quiet-tools strips ANSI and control characters before building one-line summaries", () => {
  assert.equal(
    sanitizeInlineText(
      "\u001b]8;;file:///tmp/secret\u0007label\u001b]8;;\u0007\tline\r\nnext\u0000\u001b[31m!\u001b[0m",
    ),
    "label line next!",
  );
});

test("quiet-tools formats focused call summaries for built-in tools without multiline spill", () => {
  const homeFile = path.join(homedir(), "project", "notes.txt");
  const shortHomeFile = `~${homeFile.slice(homedir().length)}`;
  const cases = [
    {
      toolName: "bash",
      args: { command: 'printf \"\u001b[31mhi\u001b[0m\tthere\"', timeout: 5 },
      expected:
        '<toolTitle>*$*</toolTitle> <toolTitle>*printf "hi there"*</toolTitle><muted> (timeout 5s)</muted>',
    },
    {
      toolName: "read",
      args: { path: homeFile, offset: 4, limit: 3 },
      expected: `<toolTitle>*read*</toolTitle> <accent>${shortHomeFile}</accent><warning>:4-6</warning>`,
    },
    {
      toolName: "grep",
      args: { pattern: "TODO", path: "/tmp/work", glob: "**/*.ts", limit: 7 },
      expected:
        "<toolTitle>*grep*</toolTitle> <accent>/TODO/</accent><toolOutput> in /tmp/work</toolOutput><toolOutput> (**/*.ts)</toolOutput><toolOutput> limit 7</toolOutput>",
    },
    {
      toolName: "find",
      args: { pattern: "src/**/*.ts", limit: 2 },
      expected:
        "<toolTitle>*find*</toolTitle> <accent>src/**/*.ts</accent><toolOutput> in .</toolOutput><toolOutput> (limit 2)</toolOutput>",
    },
    {
      toolName: "ls",
      args: { path: homeFile, limit: 1 },
      expected: `<toolTitle>*ls*</toolTitle> <accent>${shortHomeFile}</accent><toolOutput> (limit 1)</toolOutput>`,
    },
    {
      toolName: "edit",
      args: { file_path: homeFile },
      expected: `<toolTitle>*edit*</toolTitle> <accent>${shortHomeFile}</accent>`,
    },
    {
      toolName: "write",
      args: { path: homeFile },
      expected: `<toolTitle>*write*</toolTitle> <accent>${shortHomeFile}</accent>`,
    },
  ];

  for (const { toolName, args, expected } of cases) {
    assert.equal(formatQuietCallLine(toolName, args, theme), expected, toolName);
  }
});

test("formatMcpCallLine renders tool name + compact JSON args on one line", () => {
  assert.equal(
    formatMcpCallLine("mcp__server__tool", { key: "value" }, theme),
    '<toolTitle>*mcp__server__tool*</toolTitle> <toolOutput>{"key":"value"}</toolOutput>',
  );
  // JSON.stringify encodes actual newlines/tabs as \n/\t escape sequences (already single-line)
  // sanitizeInlineText then leaves those escape sequences as-is (not actual control chars)
  assert.equal(
    formatMcpCallLine("mcp__server__tool", { msg: "line1\nline2\ttab" }, theme),
    '<toolTitle>*mcp__server__tool*</toolTitle> <toolOutput>{"msg":"line1\\nline2\\ttab"}</toolOutput>',
  );
  // null args renders just the tool name
  assert.equal(
    formatMcpCallLine("mcp__server__tool", null, theme),
    "<toolTitle>*mcp__server__tool*</toolTitle>",
  );
  // undefined args renders just the tool name
  assert.equal(
    formatMcpCallLine("mcp__server__tool", undefined, theme),
    "<toolTitle>*mcp__server__tool*</toolTitle>",
  );
  // ANSI codes: JSON.stringify encodes ESC as \u001b (6 chars), which is already safe/visible
  assert.equal(
    formatMcpCallLine("mcp__s__t", { x: "\u001b[31mred\u001b[0m" }, theme),
    '<toolTitle>*mcp__s__t*</toolTitle> <toolOutput>{"x":"\\u001b[31mred\\u001b[0m"}</toolOutput>',
  );
});

test("createQuietResolver quiets collapsed built-in rows and delegates when expanded", () => {
  const baseCall = { type: "base-call", render: () => [] };
  const baseResult = { type: "base-result", render: () => [] };
  const nextRenderers = {
    renderShell: "self",
    renderCall() {
      return baseCall;
    },
    renderResult() {
      return baseResult;
    },
  };

  let enabled = true;
  const resolver = createQuietResolver(() => enabled);
  const renderers = resolver("bash", () => nextRenderers);

  assert.ok(renderers, "resolver returns renderers for built-in tool");
  assert.equal(renderers.renderShell, "self", "renderShell is preserved from next");

  // Collapsed call: quiet 2-line preview
  const collapsedCall = renderers.renderCall({ command: "echo hello" }, theme, {
    expanded: false,
    executionStarted: true,
    lastComponent: undefined,
    state: {},
  });
  const collapsedLines = collapsedCall.render(200);
  assert.equal(collapsedLines.length, 2, "collapsed built-in: 2 lines");
  assert.match(collapsedLines[1], /to expand/, "expand hint present");

  // Expanded call: delegates to next
  assert.equal(
    renderers.renderCall({}, theme, {
      expanded: true,
      executionStarted: false,
      lastComponent: undefined,
      state: {},
    }),
    baseCall,
    "expanded call delegates to next",
  );

  // Collapsed result: empty
  const collapsedResult = renderers.renderResult(
    { content: [], details: {} },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined, state: { startedAt: Date.now() } },
  );
  assert.deepEqual(collapsedResult.render(200), [], "collapsed result renders empty");

  // Expanded result: delegates to next
  assert.equal(
    renderers.renderResult(
      { content: [], details: {} },
      { expanded: true, isPartial: false },
      theme,
      { isError: false, lastComponent: undefined, state: {} },
    ),
    baseResult,
    "expanded result delegates to next",
  );
});

test("createQuietResolver quiets collapsed mcp__ rows with sanitized compact args", () => {
  let enabled = true;
  const resolver = createQuietResolver(() => enabled);
  const renderers = resolver("mcp__my_server__do_thing", () => undefined);

  assert.ok(renderers, "resolver returns renderers for mcp__ tool");

  // Collapsed call with args: shows tool name + compact JSON
  const collapsedCall = renderers.renderCall({ input: "hello\nworld" }, theme, {
    expanded: false,
    executionStarted: false,
    lastComponent: undefined,
    state: {},
  });
  const lines = collapsedCall.render(200);
  assert.equal(lines.length, 2, "mcp collapsed call: 2 lines");
  assert.match(lines[0], /mcp__my_server__do_thing/, "tool name in first line");
  // JSON.stringify encodes actual newline to \n escape sequence — stays single-line
  assert.match(lines[0], /hello/, "arg content present in first line");
  assert.match(lines[1], /to expand/, "expand hint present");

  // Collapsed result: empty
  const collapsedResult = renderers.renderResult(
    { content: [], details: {} },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined, state: { startedAt: Date.now() } },
  );
  assert.deepEqual(collapsedResult.render(200), [], "mcp collapsed result renders empty");
});

test("createQuietResolver delegates to next() at render time when quiet is toggled off", () => {
  let enabled = true;
  const resolver = createQuietResolver(() => enabled);

  const nextCall = { type: "next-call", render: () => [] };
  const nextResult = { type: "next-result", render: () => [] };
  const nextRenderers = {
    renderCall() {
      return nextCall;
    },
    renderResult() {
      return nextResult;
    },
  };

  // Resolver is called once per row at row-creation time
  const renderers = resolver("bash", () => nextRenderers);

  // Initially quiet
  const quietCall = renderers.renderCall({ command: "echo" }, theme, {
    expanded: false,
    executionStarted: false,
    lastComponent: undefined,
    state: {},
  });
  assert.equal(quietCall.render(200).length, 2, "initially quiet: 2 lines");

  // Toggle off at render time — same renderers object, flag read fresh each call
  enabled = false;
  const delegatedCall = renderers.renderCall({ command: "echo" }, theme, {
    expanded: false,
    executionStarted: false,
    lastComponent: undefined,
    state: {},
  });
  assert.equal(delegatedCall, nextCall, "after quiet off: delegates to next at render time");

  const delegatedResult = renderers.renderResult(
    { content: [], details: {} },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined, state: { startedAt: Date.now() } },
  );
  assert.equal(
    delegatedResult,
    nextResult,
    "after quiet off: result delegates to next at render time",
  );
});

test("createQuietResolver passes through for non-builtin non-mcp__ tools", () => {
  const resolver = createQuietResolver(() => true);
  const nextRenderers = {
    renderCall() {
      return { type: "next" };
    },
  };

  // Returns next() directly for unrelated tools
  const result = resolver("my_custom_tool", () => nextRenderers);
  assert.equal(result, nextRenderers, "non-builtin non-mcp__ tool: returns next() directly");

  // Also for tools that start with mcp but not mcp__
  const result2 = resolver("mcpserver", () => nextRenderers);
  assert.equal(
    result2,
    nextRenderers,
    "tool starting with mcp but not mcp__: returns next() directly",
  );
});

test("createQuietResolver handles next() returning undefined: collapsed is quiet, delegating slots throw sentinel", () => {
  const resolver = createQuietResolver(() => true);
  const renderers = resolver("mcp__server__tool", () => undefined);

  assert.ok(renderers, "returns renderers even when next() is undefined");
  assert.equal(renderers.renderShell, undefined, "renderShell is undefined when next is undefined");

  // Collapsed call still renders 2 lines (quiet path is taken, sentinel not thrown)
  const collapsedCall = renderers.renderCall({ key: "val" }, theme, {
    expanded: false,
    executionStarted: false,
    lastComponent: undefined,
    state: {},
  });
  assert.equal(
    collapsedCall.render(200).length,
    2,
    "collapsed call: 2 lines even with undefined next",
  );

  // Expanded call with no next renderCall: throws QuietToolsDelegateToDefault so Pi uses
  // createCallFallback (formatToolCallWithArgs — tool name + args, respects expanded)
  assert.throws(
    () =>
      renderers.renderCall({}, theme, {
        expanded: true,
        executionStarted: false,
        lastComponent: undefined,
        state: {},
      }),
    QuietToolsDelegateToDefault,
    "expanded call with no next renderCall throws sentinel for Pi fallback",
  );

  // Quiet-off call with no next renderCall: also throws sentinel
  const resolver2 = createQuietResolver(() => false);
  const renderers2 = resolver2("mcp__server__tool", () => undefined);
  assert.throws(
    () =>
      renderers2.renderCall({}, theme, {
        expanded: false,
        executionStarted: false,
        lastComponent: undefined,
        state: {},
      }),
    QuietToolsDelegateToDefault,
    "quiet-off call with no next renderCall throws sentinel for Pi fallback",
  );

  // Expanded result with no next renderResult: throws sentinel so Pi uses createResultFallback
  assert.throws(
    () =>
      renderers.renderResult(
        { content: [], details: {} },
        { expanded: true, isPartial: false },
        theme,
        { isError: false, lastComponent: undefined, state: {} },
      ),
    QuietToolsDelegateToDefault,
    "expanded result with no next renderResult throws sentinel for Pi fallback",
  );
});

test("createQuietResolver timing state: tracks startedAt and clears interval on final result", () => {
  const resolver = createQuietResolver(() => true);
  const renderers = resolver("read", () => ({
    renderCall() {
      return { render: () => [] };
    },
    renderResult() {
      return { render: () => [] };
    },
  }));

  const state = {
    startedAt: undefined,
    endedAt: undefined,
    interval: setInterval(() => {}, 100000),
  };

  // Partial collapsed result: keeps interval alive
  renderers.renderResult(
    { content: [], details: {} },
    { expanded: false, isPartial: true },
    theme,
    { isError: false, lastComponent: undefined, state },
  );
  assert.ok(state.interval, "partial: interval kept alive");

  // Set startedAt to simulate call having started
  state.startedAt = Date.now();

  // Final collapsed result: clears interval and sets endedAt
  renderers.renderResult(
    { content: [], details: {} },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined, state },
  );
  assert.equal(state.interval, undefined, "final: interval cleared");
  assert.ok(state.endedAt, "final: endedAt set");
});

test("createQuietResolver next() lacking renderCall/renderResult throws sentinel for Pi fallback", () => {
  const resolver = createQuietResolver(() => true);
  // nextRenderers exists but has no renderCall or renderResult
  const renderers = resolver("mcp__s__t", () => ({ renderShell: "default" }));

  assert.equal(renderers.renderShell, "default", "renderShell preserved from next");

  // Expanded call: next has no renderCall at all
  // Pi will catch QuietToolsDelegateToDefault and use createCallFallback instead
  assert.throws(
    () =>
      renderers.renderCall({}, theme, {
        expanded: true,
        executionStarted: false,
        lastComponent: undefined,
        state: {},
      }),
    QuietToolsDelegateToDefault,
    "expanded call with next lacking renderCall throws sentinel",
  );

  // Expanded result: next has no renderResult
  // Pi will catch QuietToolsDelegateToDefault and use createResultFallback instead
  assert.throws(
    () =>
      renderers.renderResult(
        { content: [], details: {} },
        { expanded: true, isPartial: false },
        theme,
        { isError: false, lastComponent: undefined, state: {} },
      ),
    QuietToolsDelegateToDefault,
    "expanded result with next lacking renderResult throws sentinel",
  );
});

const bashResult = { content: [{ type: "text", text: "ok" }] };

// Returns resolver-wrapped renderers backed by the real Pi 1.0.4 bash renderers.
// Pi's bash renderer manages state.startedAt, state.endedAt, and state.interval
// inside context.state; the quiet resolver reads and mutates the same object via
// markToolTiming when it takes the collapsed quiet path.
function makeQuietBashRenderers() {
  const bash = createBashToolDefinition(repoRoot);
  const resolver = createQuietResolver(() => true);
  return resolver("bash", () => bash);
}

test("quiet-tools clears the delegated bash timer when a running row finishes collapsed", (t) => {
  // Risk: a row starts running while expanded (delegated to Pi's bash renderer, which sets
  // state.interval via setInterval). If the final result arrives while the row is collapsed,
  // the resolver takes the quiet path and must clear that live interval via markToolTiming.
  // With createQuietResolver this is guaranteed by construction: the quiet renderResult path
  // always calls markToolTiming(options, context) which clears state.interval unconditionally
  // on any non-partial final result, regardless of how the interval was created.
  const renderers = makeQuietBashRenderers();
  const state = {};
  t.after(() => {
    if (state.interval) clearInterval(state.interval);
  });

  // Expanded call: delegates to Pi, which sets state.startedAt
  renderers.renderCall({ command: "echo hello" }, theme, {
    expanded: true,
    executionStarted: true,
    lastComponent: undefined,
    state,
  });
  // Expanded partial result: delegates to Pi, which sets state.interval
  renderers.renderResult(bashResult, { expanded: true, isPartial: true }, theme, {
    isError: false,
    lastComponent: undefined,
    invalidate: () => {},
    state,
  });
  assert.equal(typeof state.interval, "object", "Pi bash sets interval on partial expanded result");

  // Final result arrives while collapsed: resolver takes quiet path, markToolTiming clears interval
  const collapsedFinal = renderers.renderResult(
    bashResult,
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined, state },
  );
  assert.deepEqual(collapsedFinal.render(200), [], "collapsed final renders empty");
  assert.equal(state.interval, undefined, "interval cleared by quiet path markToolTiming");
  assert.equal(typeof state.endedAt, "number", "endedAt stamped by quiet path markToolTiming");
});

test("quiet-tools keeps collapsed bash timing so a later expand is not Took 0.0s", (t) => {
  // Risk: a row runs entirely while collapsed (resolver sets state.startedAt and state.endedAt).
  // When the row later expands, Pi's bash renderResult must see those timestamps and display the
  // real elapsed duration rather than recalculating from scratch. Pi uses `??=` for endedAt, so
  // it preserves the value the quiet path already wrote; startedAt is only written once (when
  // undefined), so it also survives the expand. The invariant is testable end-to-end here.
  const renderers = makeQuietBashRenderers();
  const state = {};
  t.after(() => {
    if (state.interval) clearInterval(state.interval);
  });

  // Collapsed call: resolver (quiet path) sets state.startedAt
  renderers.renderCall({ command: "echo hello" }, theme, {
    expanded: false,
    executionStarted: true,
    lastComponent: undefined,
    state,
  });
  assert.equal(typeof state.startedAt, "number", "resolver sets startedAt on collapsed call");
  // Rewind to simulate a 10-second run
  state.startedAt = Date.now() - 10_000;

  // Collapsed final result: quiet path, markToolTiming stamps endedAt
  const collapsedFinal = renderers.renderResult(
    bashResult,
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined, state },
  );
  assert.deepEqual(collapsedFinal.render(200), [], "collapsed final renders empty");
  const startedAt = state.startedAt;
  const endedAt = state.endedAt;
  assert.equal(typeof endedAt, "number", "endedAt set by quiet path");
  assert.ok(endedAt - startedAt >= 9_000, "elapsed time >= 9s preserved in state");

  // Expand: Pi's bash renderCall does not reset startedAt (already set, guard is `=== undefined`)
  renderers.renderCall({ command: "echo hello" }, theme, {
    expanded: true,
    executionStarted: true,
    lastComponent: undefined,
    state,
  });
  assert.equal(state.startedAt, startedAt, "startedAt unchanged after expand");

  // Expanded final result: Pi's bash renderResult uses `endedAt ??= Date.now()`, so it preserves
  // the value already written by the quiet path. The rendered "Took Xs" uses startedAt/endedAt
  // from state, giving the real elapsed duration.
  const expandedFinal = renderers.renderResult(
    bashResult,
    { expanded: true, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined, invalidate: () => {}, state },
  );
  assert.equal(state.startedAt, startedAt, "startedAt still unchanged after expanded result");
  assert.equal(state.endedAt, endedAt, "endedAt preserved (Pi uses ??= so quiet value wins)");
  const durationSeconds = ((endedAt - startedAt) / 1000).toFixed(1);
  assert.notEqual(durationSeconds, "0.0", "elapsed duration is not zero");
  assert.match(
    expandedFinal.render(80).join("\n"),
    new RegExp(`Took ${durationSeconds.replace(".", "\\.")}s`),
    "expanded result shows real elapsed duration",
  );
});
