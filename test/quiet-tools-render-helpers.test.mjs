import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  initTheme,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

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
  QuietCallRenderComponent,
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
  bg(kind, text) {
    return `<bg:${kind}>${text}</bg:${kind}>`;
  },
};

function context(overrides = {}) {
  return {
    expanded: false,
    executionStarted: false,
    argsComplete: true,
    cwd: repoRoot,
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    isPartial: true,
    isError: false,
    durationMs: undefined,
    outputPad: 1,
    ...overrides,
  };
}

const quietToolCases = new Map([
  ["bash", { command: "echo hello" }],
  ["edit", { file_path: "README.md" }],
  ["find", { pattern: "src/**/*.ts" }],
  ["grep", { pattern: "TODO" }],
  ["ls", { path: "." }],
  ["read", { path: "README.md" }],
  ["write", { path: "README.md", content: "" }],
]);

const bashResult = { content: [{ type: "text", text: "ok" }], details: {}, isError: false };

function makeQuietBashRenderers() {
  const bash = createBashToolDefinition(repoRoot);
  const resolver = createQuietResolver();
  return resolver("bash", () => bash);
}

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
      args: { command: 'printf "\u001b[31mhi\u001b[0m\tthere"', timeout: 5 },
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

test("quiet-tools read ranges match Pi semantics for numeric and malformed values", () => {
  const base = "<toolTitle>*read*</toolTitle> <accent>README.md</accent>";
  const read = (args) => formatQuietCallLine("read", { path: "README.md", ...args }, theme);

  assert.equal(read({ offset: "10", limit: 5 }), `${base}<warning>:10-14</warning>`);
  assert.equal(read({ offset: 10, limit: 5 }), `${base}<warning>:10-14</warning>`);
  assert.equal(read({ limit: 5 }), `${base}<warning>:1-5</warning>`);
  assert.equal(read({ offset: null, limit: 5 }), `${base}<warning>:1-5</warning>`);
  assert.equal(read({ offset: "10" }), `${base}<warning>:10</warning>`);
  assert.equal(read({ offset: 10, limit: null }), `${base}<warning>:10</warning>`);
  assert.equal(read({}), base);
  assert.equal(read({ offset: null, limit: null }), base);

  for (const args of [
    { offset: "", limit: 5 },
    { offset: "not-a-number", limit: 5 },
    { offset: Number.NaN, limit: 5 },
    { offset: Number.POSITIVE_INFINITY, limit: 5 },
    { offset: 10, limit: "not-a-number" },
    { offset: 10, limit: Number.NaN },
    { offset: 10, limit: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(read(args), base, JSON.stringify(args));
  }
});

test("formatMcpCallLine renders tool name + compact JSON args on one line", () => {
  assert.equal(
    formatMcpCallLine("mcp__server__tool", { key: "value" }, theme),
    '<toolTitle>*mcp__server__tool*</toolTitle> <toolOutput>{"key":"value"}</toolOutput>',
  );
  assert.equal(
    formatMcpCallLine("mcp__server__tool", { msg: "line1\nline2\ttab" }, theme),
    '<toolTitle>*mcp__server__tool*</toolTitle> <toolOutput>{"msg":"line1\\nline2\\ttab"}</toolOutput>',
  );
  assert.equal(
    formatMcpCallLine("mcp__server__tool", null, theme),
    "<toolTitle>*mcp__server__tool*</toolTitle>",
  );
  assert.equal(
    formatMcpCallLine("mcp__server__tool", undefined, theme),
    "<toolTitle>*mcp__server__tool*</toolTitle>",
  );
});

test("createQuietResolver quiets all seven built-ins and delegates expanded rows", () => {
  const baseCall = { type: "base-call", render: () => [] };
  const baseResult = { type: "base-result", render: () => [] };
  const nextRenderers = {
    renderShell: "default",
    renderCall() {
      return baseCall;
    },
    renderResult() {
      return baseResult;
    },
  };
  const resolver = createQuietResolver();

  for (const [toolName, args] of quietToolCases) {
    const renderers = resolver(toolName, () => nextRenderers);
    assert.ok(renderers, `${toolName}: resolver returns renderers`);
    const collapsed = renderers.renderCall(args, theme, context());
    assert.equal(collapsed.render(200).length, 2, `${toolName}: collapsed call has two lines`);
    assert.match(collapsed.render(200)[1], /to expand/, `${toolName}: expand hint present`);
    assert.equal(
      renderers.renderCall(args, theme, context({ expanded: true })),
      baseCall,
      `${toolName}: expanded call delegates`,
    );
    assert.equal(
      renderers.renderResult(
        { content: [], details: {} },
        { expanded: true, isPartial: false },
        theme,
        context({ expanded: true }),
      ),
      baseResult,
      `${toolName}: expanded result delegates`,
    );
    const hiddenText = `secret ${toolName} output`;
    const collapsedResult = renderers.renderResult(
      { content: [{ type: "text", text: hiddenText }], details: {} },
      { expanded: false, isPartial: false },
      theme,
      context({ isPartial: false }),
    );
    assert.ok(
      !collapsedResult.render(200).join("\n").includes(hiddenText),
      `${toolName}: collapsed result text stays hidden`,
    );
  }
});

test("createQuietResolver quiets collapsed mcp__ rows and leaves unrelated tools untouched", () => {
  const resolver = createQuietResolver();
  const renderers = resolver("mcp__my_server__do_thing", () => undefined);
  assert.ok(renderers, "mcp__ tool: resolver returns renderers");

  const collapsed = renderers.renderCall(
    { input: "hello\nworld" },
    theme,
    context({ executionStarted: true }),
  );
  const lines = collapsed.render(200);
  assert.equal(lines.length, 2, "mcp collapsed call has two lines");
  assert.match(lines[0], /mcp__my_server__do_thing/, "mcp tool name present");
  assert.match(lines[0], /hello/, "mcp arg content present");
  assert.match(lines[1], /to expand/, "mcp expand hint present");

  const nextRenderers = {
    renderCall() {
      return { type: "next" };
    },
  };
  assert.equal(
    resolver("my_custom_tool", () => nextRenderers),
    nextRenderers,
    "unrelated tools pass through",
  );
  assert.equal(
    resolver("mcpserver", () => nextRenderers),
    nextRenderers,
    "mcp names without the namespace separator pass through",
  );
});

test("createQuietResolver stays always on and marks collapsed errors", () => {
  const resolver = createQuietResolver();
  const renderers = resolver("bash", () => undefined);
  const collapsed = renderers.renderCall(
    { command: "false" },
    theme,
    context({ isPartial: false, isError: true }),
  );
  const lines = collapsed.render(200);
  assert.equal(lines.length, 2, "failed rows retain the compact two-line shape");
  assert.match(lines[0], /\[failed\]/, "failed marker is visible");

  const result = renderers.renderResult(
    { content: [{ type: "text", text: "secret error detail" }], details: {} },
    { expanded: false, isPartial: false },
    theme,
    context({ isPartial: false, isError: true }),
  );
  assert.deepEqual(result.render(200), [], "collapsed result remains hidden");
});

test("failed markers reserve width before truncating long collapsed calls", () => {
  const resolver = createQuietResolver();
  const renderers = resolver("mcp__server__very_long_tool_name", () => undefined);
  const component = renderers.renderCall(
    { argument: "x".repeat(200) },
    theme,
    context({ isPartial: false, isError: true }),
  );

  const normalWidth = component.render(30)[0];
  assert.match(normalWidth, /\[failed\]/, "width 30 keeps the failed marker visible");
  for (const width of [1, 2, 3, 4, 8, 30]) {
    for (const line of component.render(width)) {
      assert.ok(visibleWidth(line) <= width, `failed row fits width ${width}`);
    }
  }
});

test("native self-shell edit rows get host framing and never adopt the quiet wrapper", () => {
  const edit = createEditToolDefinition(repoRoot);
  const resolver = createQuietResolver();
  const renderers = resolver("edit", () => edit);
  assert.equal(renderers.renderShell, "self", "edit keeps its native self-render shell");

  const state = {};
  const args = {
    path: "README.md",
    edits: [{ oldText: "# pi-extensions", newText: "# pi extensions" }],
  };
  const collapsed = renderers.renderCall(
    args,
    theme,
    context({ state, outputPad: 0, isPartial: true }),
  );
  assert.ok(
    collapsed instanceof QuietCallRenderComponent,
    "quiet call wrapper remains identifiable",
  );
  const padZeroLines = collapsed.render(80);
  assert.equal(padZeroLines.length, 4, "native self shell has top/bottom framing");
  assert.match(padZeroLines[0], /toolPendingBg/, "pending native background is preserved");
  assert.match(
    padZeroLines[1],
    /<bg:toolPendingBg><toolTitle>/,
    "zero horizontal padding is applied",
  );
  assert.equal(state.callComponent, undefined, "quiet path does not mutate native edit state");

  const failed = renderers.renderCall(
    args,
    theme,
    context({ state, lastComponent: collapsed, outputPad: 1, isPartial: false, isError: true }),
  );
  const padOneLines = failed.render(80);
  assert.match(padOneLines[0], /toolErrorBg/, "error native background is preserved");
  assert.match(padOneLines.join("\n"), /\[failed\]/, "collapsed edit errors are marked");
  assert.match(padOneLines[1], /<bg:toolErrorBg> <toolTitle>/, "one horizontal pad is applied");
  assert.equal(
    state.callComponent,
    undefined,
    "failed quiet path still leaves native edit state alone",
  );

  const expanded = renderers.renderCall(
    args,
    theme,
    context({ state, expanded: true, lastComponent: failed, isPartial: false }),
  );
  assert.notEqual(expanded, failed, "expanded edit gets a native component");
  assert.notEqual(state.callComponent, failed, "native edit never adopts the quiet wrapper");
});

test("expanded delegation clears only quiet last components", () => {
  const resolver = createQuietResolver();
  let receivedContext;
  const native = {
    renderCall(_args, _theme, received) {
      receivedContext = received;
      return { type: "native-call" };
    },
    renderResult(_result, _options, _theme, received) {
      receivedContext = received;
      return { type: "native-result" };
    },
  };
  const renderers = resolver("bash", () => native);
  const quietCall = renderers.renderCall({ command: "echo" }, theme, context());
  assert.equal(
    renderers.renderCall({}, theme, context({ expanded: true, lastComponent: quietCall })).type,
    "native-call",
  );
  assert.equal(
    receivedContext.lastComponent,
    undefined,
    "quiet call state is not passed to native",
  );

  const nativeLast = { type: "native-call" };
  assert.equal(
    renderers.renderCall({}, theme, context({ expanded: true, lastComponent: nativeLast })).type,
    "native-call",
  );
  assert.equal(receivedContext.lastComponent, nativeLast, "native call state remains intact");

  const quietResult = renderers.renderResult(
    { content: [], details: {} },
    { expanded: false, isPartial: false },
    theme,
    context({ isPartial: false }),
  );
  assert.equal(
    renderers.renderResult(
      { content: [], details: {} },
      { expanded: true, isPartial: false },
      theme,
      context({ expanded: true, lastComponent: quietResult }),
    ).type,
    "native-result",
  );
  assert.equal(
    receivedContext.lastComponent,
    undefined,
    "quiet result state is not passed to native",
  );
});

test("unregistered mcp__ expanded slots throw the Pi fallback sentinel", () => {
  const resolver = createQuietResolver();
  const renderers = resolver("mcp__server__tool", () => undefined);
  assert.equal(renderers.renderShell, undefined);
  assert.throws(
    () => renderers.renderCall({}, theme, context({ expanded: true })),
    QuietToolsDelegateToDefault,
  );
  assert.throws(
    () =>
      renderers.renderResult(
        { content: [], details: {} },
        { expanded: true, isPartial: false },
        theme,
        context({ expanded: true, isPartial: false }),
      ),
    QuietToolsDelegateToDefault,
  );
});

test("MCP argument formatting remains bounded for circular, BigInt, and huge values", () => {
  const resolver = createQuietResolver();
  function renderCollapsedLine(args) {
    const renderers = resolver("mcp__s__t", () => undefined);
    return renderers.renderCall(args, theme, context()).render(200);
  }

  const circular = {};
  circular.self = circular;
  const circularLines = renderCollapsedLine(circular);
  assert.match(circularLines[0], /\[…\]/, "circular args use a placeholder");

  const bigintLines = renderCollapsedLine({ n: 42n });
  assert.match(bigintLines[0], /\[…\]/, "BigInt args use a placeholder");

  const hugeLines = renderCollapsedLine({ data: "x".repeat(1_000_000) });
  assert.ok(hugeLines[0].length < 1000, "huge args are bounded before rendering");
});

test("timing state follows native bash ownership and supports live partial-to-done/error", (t) => {
  const renderers = makeQuietBashRenderers();
  const state = {};
  t.after(() => {
    if (state.interval) clearInterval(state.interval);
  });

  renderers.renderCall(
    { command: "echo hello" },
    theme,
    context({ state, executionStarted: true }),
  );
  assert.equal(typeof state.startedAt, "number", "collapsed bash call starts native timing");

  renderers.renderResult(
    bashResult,
    { expanded: false, isPartial: true },
    theme,
    context({ state, isPartial: true }),
  );
  assert.equal(
    state.interval,
    undefined,
    "collapsed partial bash result does not create a redundant refresh interval",
  );

  renderers.renderResult(
    { ...bashResult, isError: true },
    { expanded: false, isPartial: false },
    theme,
    context({ state, isPartial: false, isError: true }),
  );
  assert.equal(state.interval, undefined, "error completion clears the native interval");
  assert.equal(typeof state.endedAt, "number", "error completion stamps native endedAt");
});

test("timing state is untouched for non-bash quiet tools", (t) => {
  const resolver = createQuietResolver();
  const renderers = resolver("read", () => undefined);
  const state = {
    startedAt: 10,
    endedAt: 20,
    interval: setInterval(() => {}, 100000),
  };
  t.after(() => clearInterval(state.interval));

  renderers.renderCall({ path: "README.md" }, theme, context({ state, executionStarted: true }));
  renderers.renderResult(
    { content: [], details: {} },
    { expanded: false, isPartial: false },
    theme,
    context({ state, isPartial: false }),
  );
  assert.deepEqual(state, { startedAt: 10, endedAt: 20, interval: state.interval });
});

test("delegated bash timers are cleared when a running row finishes collapsed", (t) => {
  for (const isError of [false, true]) {
    const renderers = makeQuietBashRenderers();
    const state = {};
    t.after(() => {
      if (state.interval) clearInterval(state.interval);
    });

    renderers.renderCall(
      { command: "echo hello" },
      theme,
      context({ state, expanded: true, executionStarted: true }),
    );
    renderers.renderResult(
      bashResult,
      { expanded: true, isPartial: true },
      theme,
      context({ state, expanded: true, isPartial: true, invalidate: () => {} }),
    );
    assert.ok(state.interval, "native expanded bash starts its timer");

    renderers.renderResult(
      { ...bashResult, isError },
      { expanded: false, isPartial: false },
      theme,
      context({ state, isPartial: false, isError }),
    );
    assert.equal(
      state.interval,
      undefined,
      `${isError ? "error" : "success"} collapse clears native timer`,
    );
    assert.equal(
      typeof state.endedAt,
      "number",
      `${isError ? "error" : "success"} collapse stamps native end time`,
    );
  }
});
