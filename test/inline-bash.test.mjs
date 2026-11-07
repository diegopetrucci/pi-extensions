import assert from "node:assert/strict";
import test from "node:test";
import { createExtensionHarness, loadExtension } from "./extension-test-helpers.mjs";

function getInputHandler(harness) {
  const handler = harness.handlers.get("input");
  assert.equal(typeof handler, "function", "expected input handler");
  return handler;
}

async function loadInputHandler(execImpl) {
  const inlineBash = await loadExtension("extensions/inline-bash/index.ts");
  const harness = createExtensionHarness({ execImpl });
  inlineBash(harness.pi);
  return { handler: getInputHandler(harness), harness };
}

test("inline-bash expands RPC steer and follow-up input as user-origin text", async () => {
  const { signal } = new AbortController();
  const { handler, harness } = await loadInputHandler(async (command, args, options) => {
    assert.equal(command, "bash");
    assert.equal(options.timeout, 30000);
    return { stdout: `${args[1]} output\n`, stderr: "", code: 0 };
  });

  const steerEvent = {
    type: "input",
    text: "Steer with !{printf steer}",
    source: "rpc",
    streamingBehavior: "steer",
  };
  const followUpEvent = {
    type: "input",
    text: "Follow up with !{printf follow-up}",
    source: "rpc",
    streamingBehavior: "followUp",
  };

  assert.deepEqual(await handler(steerEvent, { hasUI: false, signal }), {
    action: "transform",
    text: "Steer with printf steer output",
    images: undefined,
  });
  assert.deepEqual(await handler(followUpEvent, { hasUI: false }), {
    action: "transform",
    text: "Follow up with printf follow-up output",
    images: undefined,
  });
  assert.deepEqual(harness.execCalls, [
    ["bash", ["-c", "printf steer"], { timeout: 30000, signal }],
    ["bash", ["-c", "printf follow-up"], { timeout: 30000, signal: undefined }],
  ]);
});

test("inline-bash skips extension-origin input even for follow-ups", async () => {
  const { handler, harness } = await loadInputHandler(async () => {
    throw new Error("extension-origin input must not execute bash");
  });

  assert.deepEqual(
    await handler(
      {
        type: "input",
        text: "Extension follow-up !{printf should-not-run}",
        source: "extension",
        streamingBehavior: "followUp",
      },
      { hasUI: false },
    ),
    { action: "continue" },
  );
  assert.deepEqual(harness.execCalls, []);
});

test("inline-bash leaves whole-line bash syntax untouched for RPC input", async () => {
  const { handler, harness } = await loadInputHandler(async () => {
    throw new Error("whole-line bash input must not execute inline expansion");
  });

  assert.deepEqual(
    await handler(
      {
        type: "input",
        text: "!echo whole-line !{printf should-not-run}",
        source: "rpc",
        streamingBehavior: "steer",
      },
      { hasUI: false },
    ),
    { action: "continue" },
  );
  assert.deepEqual(harness.execCalls, []);
});

test("inline-bash inserts $& command output as raw text", async () => {
  const { handler } = await loadInputHandler(async () => ({
    stdout: "$&\n",
    stderr: "",
    code: 0,
  }));

  assert.deepEqual(
    await handler(
      {
        type: "input",
        text: "value !{printf $&} done",
        source: "rpc",
      },
      { hasUI: false },
    ),
    {
      action: "transform",
      text: "value $& done",
      images: undefined,
    },
  );
});

test("inline-bash inserts $$ command output as raw text", async () => {
  const { handler } = await loadInputHandler(async () => ({
    stdout: "$$\n",
    stderr: "",
    code: 0,
  }));

  assert.deepEqual(
    await handler(
      {
        type: "input",
        text: "value !{printf $$} done",
        source: "rpc",
      },
      { hasUI: false },
    ),
    {
      action: "transform",
      text: "value $$ done",
      images: undefined,
    },
  );
});

test("inline-bash keeps !{...} inside command output next to a later expansion", async () => {
  const { handler, harness } = await loadInputHandler(async (_command, args) => {
    const command = args[1];
    if (command === "echo-nested") return { stdout: "!{uname}\n", stderr: "", code: 0 };
    if (command === "uname") return { stdout: "Linux\n", stderr: "", code: 0 };
    throw new Error(`unexpected command ${command}`);
  });

  assert.deepEqual(
    await handler(
      {
        type: "input",
        text: "run !{echo-nested} then !{uname}",
        source: "rpc",
      },
      { hasUI: false },
    ),
    {
      action: "transform",
      text: "run !{uname} then Linux",
      images: undefined,
    },
  );
  assert.deepEqual(harness.execCalls, [
    ["bash", ["-c", "echo-nested"], { timeout: 30000, signal: undefined }],
    ["bash", ["-c", "uname"], { timeout: 30000, signal: undefined }],
  ]);
});

async function runWithResult(result) {
  const { handler } = await loadInputHandler(async () => result);
  const notes = [];
  const out = await handler(
    { type: "input", text: "x !{cmd} y", source: "rpc" },
    { hasUI: true, ui: { notify: (m) => notes.push(m) } },
  );
  return { out, notes };
}

test("inline-bash reports nonzero exit with empty stderr as failure", async () => {
  const { out, notes } = await runWithResult({ stdout: "partial\n", stderr: "", code: 2 });
  assert.equal(out.text, "x partial y");
  assert.match(notes[0], /\(exit code 2\)/);
});

test("inline-bash reports truncated output as failure", async () => {
  const { out, notes } = await runWithResult({
    stdout: "partial\n",
    stderr: "",
    code: 1,
    truncated: true,
  });
  assert.match(out.text, /partial/);
  assert.match(out.text, /output exceeded limit; command terminated/);
  assert.match(notes[0], /output exceeded limit/);
});

test("inline-bash success and older-host result shape are not failures", async () => {
  const { out, notes } = await runWithResult({ stdout: "ok\n", stderr: "", code: 0 });
  assert.equal(out.text, "x ok y");
  assert.doesNotMatch(notes[0], /\(exit code|exceeded/);
});

test("inline-bash extracts a command past a brace inside double quotes", async () => {
  const capturedCommands = [];
  const { handler } = await loadInputHandler(async (_cmd, args) => {
    capturedCommands.push(args[1]);
    return { stdout: "a}b", stderr: "", code: 0 };
  });

  const result = await handler(
    { text: 'Check !{printf "%s" "a}b"}', source: "rpc" },
    { hasUI: false },
  );

  assert.deepEqual(capturedCommands, ['printf "%s" "a}b"']);
  assert.deepEqual(result, {
    action: "transform",
    text: "Check a}b",
    images: undefined,
  });
});

test("inline-bash extracts a command past a brace in parameter expansion", async () => {
  const capturedCommands = [];
  const { handler } = await loadInputHandler(async (_cmd, args) => {
    capturedCommands.push(args[1]);
    return { stdout: "fixed", stderr: "", code: 0 };
  });

  const result = await handler(
    { text: 'Check !{printf "%s" "${PROBE_VALUE}"}', source: "rpc" },
    { hasUI: false },
  );

  assert.deepEqual(capturedCommands, ['printf "%s" "${PROBE_VALUE}"']);
  assert.deepEqual(result, {
    action: "transform",
    text: "Check fixed",
    images: undefined,
  });
});

test("inline-bash extracts nested command substitutions", async () => {
  const capturedCommands = [];
  const { handler } = await loadInputHandler(async (_cmd, args) => {
    capturedCommands.push(args[1]);
    return { stdout: "nested", stderr: "", code: 0 };
  });

  const result = await handler(
    { text: "Run !{echo $(echo nested)}", source: "rpc" },
    { hasUI: false },
  );

  assert.deepEqual(capturedCommands, ["echo $(echo nested)"]);
  assert.deepEqual(result, {
    action: "transform",
    text: "Run nested",
    images: undefined,
  });
});

test("inline-bash ignores an escaped closing brace while scanning", async () => {
  const capturedCommands = [];
  const { handler } = await loadInputHandler(async (_cmd, args) => {
    capturedCommands.push(args[1]);
    return { stdout: "}", stderr: "", code: 0 };
  });

  const result = await handler(
    { text: "Literal !{printf '\\}'}", source: "rpc" },
    { hasUI: false },
  );

  assert.deepEqual(capturedCommands, ["printf '\\}'"]);
  assert.deepEqual(result, {
    action: "transform",
    text: "Literal }",
    images: undefined,
  });
});

test("inline-bash extracts multiple quoted-brace expansions independently", async () => {
  const capturedCommands = [];
  const { handler } = await loadInputHandler(async (_cmd, args) => {
    capturedCommands.push(args[1]);
    if (args[1] === 'echo "a}b"') return { stdout: "a}b", stderr: "", code: 0 };
    if (args[1] === "echo end") return { stdout: "end", stderr: "", code: 0 };
    throw new Error(`unexpected command: ${args[1]}`);
  });

  const result = await handler(
    { text: 'First !{echo "a}b"} second !{echo end}', source: "rpc" },
    { hasUI: false },
  );

  assert.deepEqual(capturedCommands, ['echo "a}b"', "echo end"]);
  assert.deepEqual(result, {
    action: "transform",
    text: "First a}b second end",
    images: undefined,
  });
});

test("inline-bash leaves an unmatched opener literal without executing it", async () => {
  const { handler, harness } = await loadInputHandler(async () => {
    throw new Error("unmatched opener must not execute bash");
  });

  const result = await handler(
    { text: "Unmatched !{echo no closing brace", source: "rpc" },
    { hasUI: false },
  );

  assert.deepEqual(harness.execCalls, []);
  assert.deepEqual(result, { action: "continue" });
});

test("inline-bash warns when an unmatched opener is found with UI", async () => {
  const { handler, harness } = await loadInputHandler(async () => {
    throw new Error("unmatched opener must not execute bash");
  });

  const notifications = [];
  const result = await handler(
    { text: "Unmatched !{echo no closing brace", source: "rpc" },
    {
      hasUI: true,
      ui: { notify: (msg, level) => notifications.push({ msg, level }) },
    },
  );

  assert.deepEqual(harness.execCalls, []);
  assert.equal(result.action, "continue");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, "warning");
  assert.match(notifications[0].msg, /!\{/);
});

test("inline-bash handles nested quotes, groups, a literal suffix, and extension input", async () => {
  const capturedCommands = [];
  const { handler } = await loadInputHandler(async (_cmd, args) => {
    capturedCommands.push(args[1]);
    return { stdout: "X", stderr: "", code: 0 };
  });

  const cases = [
    ["A !{echo 'it'\\''s }'} tail", "echo 'it'\\''s }'"],
    ['A !{echo "$(echo \"}\" ${V:-\"}\"})"} tail', 'echo "$(echo "}" ${V:-"}"})"'],
    ["A !{f() { echo hi; }; f} tail", "f() { echo hi; }; f"],
  ];
  for (const [text, command] of cases) {
    capturedCommands.length = 0;
    const result = await handler({ text, source: "rpc" }, { hasUI: false });
    assert.deepEqual(capturedCommands, [command]);
    assert.equal(result.text, "A X tail");
  }

  const extensionResult = await handler(
    { text: 'x !{echo "a}b"}', source: "extension" },
    { hasUI: false },
  );
  assert.deepEqual(extensionResult, { action: "continue" });
});

test("inline-bash stops scanning after an unmatched opener and keeps its suffix literal", async () => {
  const commands = [];
  const { handler } = await loadInputHandler(async (_cmd, args) => {
    commands.push(args[1]);
    return { stdout: "ok", stderr: "", code: 0 };
  });

  const result = await handler(
    { text: '!{echo a} then !{echo "oops !{printf nested} then !{echo after}', source: "rpc" },
    { hasUI: false },
  );

  assert.deepEqual(commands, ["echo a"]);
  assert.equal(result.text, 'ok then !{echo "oops !{printf nested} then !{echo after}');
});

test("inline-bash leaves an unmatched nested opener unchanged and executes nothing", async () => {
  const { handler, harness } = await loadInputHandler(async () => {
    throw new Error("unmatched opener must not execute bash");
  });
  const notifications = [];

  const result = await handler(
    { text: 'x !{echo "oops !{printf nested} y', source: "rpc" },
    {
      hasUI: true,
      ui: { notify: (msg, level) => notifications.push({ msg, level }) },
    },
  );

  assert.deepEqual(harness.execCalls, []);
  assert.deepEqual(result, { action: "continue" });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, "warning");
});
