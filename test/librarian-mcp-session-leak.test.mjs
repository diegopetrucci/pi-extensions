import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import ts from "typescript";

import { createExtensionHarness } from "./extension-test-helpers.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function setEnv(t, key, value) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });
}

async function loadLibrarianWithSessionHook(t) {
  const root = await mkdtemp(path.join(repoRoot, "test/.tmp-librarian-mcp-leak-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const mockPath = path.join(root, "pi-coding-agent-mock.mjs");
  const mockHref = pathToFileURL(mockPath).href;
  await writeFile(
    mockPath,
    `import {
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  getAgentDir,
  getMarkdownTheme,
} from "@earendil-works/pi-coding-agent";

export {
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  getAgentDir,
  getMarkdownTheme,
};

let createAgentSessionImpl;

export function setCreateAgentSession(impl) {
  createAgentSessionImpl = impl;
}

export async function createAgentSession(options) {
  if (!createAgentSessionImpl) {
    throw new Error("createAgentSession test hook is not set");
  }
  return createAgentSessionImpl(options);
}
`,
    "utf8",
  );

  const source = await readFile(path.join(repoRoot, "extensions/librarian/index.ts"), "utf8");
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replaceAll(
      'from "@earendil-works/pi-coding-agent"',
      `from ${JSON.stringify(mockHref)}`,
    );
  const compiledPath = path.join(root, "librarian.mjs");
  await writeFile(compiledPath, compiled, "utf8");

  const [librarian, sessionMock] = await Promise.all([
    import(pathToFileURL(compiledPath).href),
    import(mockHref),
  ]);
  return { librarian, sessionMock };
}

test("librarian disposes a bind-failed session before the next model attempt", async (t) => {
  const agentDir = await mkdtemp(path.join(os.tmpdir(), "librarian-mcp-leak-agent-"));
  await mkdir(path.join(agentDir, "extensions"), { recursive: true });
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  setEnv(t, "PI_CODING_AGENT_DIR", agentDir);

  const { librarian, sessionMock } = await loadLibrarianWithSessionHook(t);
  const order = [];
  let created = 0;
  sessionMock.setCreateAgentSession(async () => {
    created += 1;
    const id = created;
    order.push(`create:${id}`);
    const session = {
      state: { messages: [] },
      async bindExtensions() {
        order.push(`bind:${id}`);
        if (id === 1) throw new Error("sh: mcp-server: command not found");
      },
      subscribe() {
        order.push(`subscribe:${id}`);
        return () => {
          order.push(`unsubscribe:${id}`);
        };
      },
      async prompt() {
        order.push(`prompt:${id}`);
        session.state.messages.push({
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: "## Summary\nok" }],
        });
      },
      abort() {
        order.push(`abort:${id}`);
      },
      dispose() {
        order.push(`dispose:${id}`);
      },
    };
    return { session };
  });

  const harness = createExtensionHarness();
  librarian.default(harness.pi);
  const tool = harness.tools.get("librarian");
  assert.ok(tool, "expected librarian tool to be registered");

  const firstModel = { provider: "openai", id: "gpt-5-mini" };
  const fallbackModel = { provider: "anthropic", id: "claude-haiku-4-5" };
  const result = await tool.execute(
    "call-1",
    { query: "where is the session disposed" },
    undefined,
    undefined,
    {
      cwd: agentDir,
      isProjectTrusted: () => false,
      model: fallbackModel,
      modelRegistry: {
        async getAvailable() {
          return [firstModel, fallbackModel];
        },
      },
    },
  );

  const disposeFirst = order.indexOf("dispose:1");
  const createSecond = order.indexOf("create:2");
  assert.ok(disposeFirst !== -1, `session 1 was disposed; order=${order.join(" ")}`);
  assert.ok(createSecond !== -1, `attempt 2 started; order=${order.join(" ")}`);
  assert.ok(
    disposeFirst < createSecond,
    `session 1 disposed before attempt 2; order=${order.join(" ")}`,
  );
  assert.deepEqual(
    order.filter((event) => event.startsWith("dispose:")),
    ["dispose:1", "dispose:2"],
  );
  assert.equal(result.details.status, "done");
});
