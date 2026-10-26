import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

let tempDir;
let runtime;

async function loadRuntime() {
  if (runtime) return runtime;
  const source = await readFile(path.resolve("extensions/web-scout/index.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  tempDir = await mkdtemp(path.join(path.resolve("test"), ".tmp-web-scout-"));
  const compiledPath = path.join(tempDir, "index.mjs");
  await writeFile(compiledPath, compiled, "utf8");
  runtime = await import(pathToFileURL(compiledPath).href);
  return runtime;
}

test.after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

function sse(payload) {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

function okResponse(text) {
  return new Response(
    sse({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text }] },
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  );
}

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return handler(url, init);
  };
  fn.calls = calls;
  return fn;
}

test("registers web_scout with required task and optional cwd", async () => {
  const mod = await loadRuntime();
  const tools = [];
  mod.default({ on() {}, registerTool: (tool) => tools.push(tool) });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "web_scout");
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["task", "cwd"]);
  assert.deepEqual(tools[0].parameters.required, ["task"]);
});

test("system prompt keeps untrusted-content, citation and blocker rules without supervisor wording", async () => {
  const { buildSystemPrompt, buildUserPrompt } = (await loadRuntime()).__test__;
  const prompt = buildSystemPrompt({
    cwd: "/x",
    maxTurns: 8,
    maxRunSeconds: 480,
  });
  for (const needle of [
    "untrusted data",
    "verbatim quote",
    "No fabrication",
    "web_search",
    "fetch_url",
  ])
    assert.ok(prompt.includes(needle), needle);
  assert.ok(!/contact_supervisor|architect|\btk\b/i.test(prompt));
  assert.ok(buildUserPrompt({ task: "What is X?" }, "/x").includes("What is X?"));
});

test("web_search calls Exa statelessly without a key and parses SSE", async () => {
  const { createWebScoutCustomTools } = (await loadRuntime()).__test__;
  const fetchImpl = mockFetch(() => okResponse("result text"));
  const [search] = createWebScoutCustomTools({ fetchImpl, env: {} });
  const result = await search.execute("id", { query: "q", numResults: 99 });
  assert.equal(result.content[0].text, "result text");
  const call = fetchImpl.calls[0];
  assert.equal(call.url, "https://mcp.exa.ai/mcp");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.Accept, "application/json, text/event-stream");
  assert.equal(call.body.method, "tools/call");
  assert.equal(call.body.params.name, "web_search_exa");
  assert.deepEqual(call.body.params.arguments, {
    query: "q",
    objective: "q",
    numResults: 10,
  });
});

test("EXA_API_KEY is sent as query param and redacted from errors", async () => {
  const { createWebScoutCustomTools } = (await loadRuntime()).__test__;
  const secret = "sk-secret/key+1";
  const okFetch = mockFetch(() => okResponse("ok"));
  const [search] = createWebScoutCustomTools({
    fetchImpl: okFetch,
    env: { EXA_API_KEY: secret },
  });
  const result = await search.execute("id", { query: "q" });
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(
    okFetch.calls[0].url,
    `https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(secret)}`,
  );

  const failing = mockFetch(() => {
    throw new Error(`connect failed for ${secret}`);
  });
  const [search2] = createWebScoutCustomTools({
    fetchImpl: failing,
    env: { EXA_API_KEY: secret },
  });
  await assert.rejects(search2.execute("id", { query: "q" }), (error) => {
    assert.match(error.message, /network request failed/);
    assert.ok(!error.message.includes(secret));
    return true;
  });

  const httpError = mockFetch(() => new Response(`bad key ${secret}`, { status: 401 }));
  const [search3] = createWebScoutCustomTools({
    fetchImpl: httpError,
    env: { EXA_API_KEY: secret },
  });
  await assert.rejects(search3.execute("id", { query: "q" }), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});

test("fetch_url rejects non-http(s) URLs before any request and caps characters", async () => {
  const { createWebScoutCustomTools } = (await loadRuntime()).__test__;
  const fetchImpl = mockFetch(() => okResponse("page"));
  const [, fetchUrl] = createWebScoutCustomTools({ fetchImpl, env: {} });
  for (const bad of [
    "file:///etc/passwd",
    "ftp://example.com/x",
    "javascript:alert(1)",
    "not a url",
    "",
  ])
    await assert.rejects(fetchUrl.execute("id", { url: bad }), /fetch_url/);
  assert.equal(fetchImpl.calls.length, 0);
  await fetchUrl.execute("id", {
    url: "https://example.com/a",
    maxCharacters: 10_000_000,
  });
  const args = fetchImpl.calls[0].body.params;
  assert.equal(args.name, "web_fetch_exa");
  assert.deepEqual(args.arguments, {
    urls: ["https://example.com/a"],
    maxCharacters: 12000,
  });
});

test("rate limits, JSON bodies, tool errors and truncation are handled", async () => {
  const { callExaTool, parseExaResponseBody } = (await loadRuntime()).__test__;
  await assert.rejects(
    callExaTool("web_search_exa", {}, { fetchImpl: async () => new Response("", { status: 429 }) }),
    /rate limit/i,
  );
  await assert.rejects(
    callExaTool(
      "web_search_exa",
      {},
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: {
                isError: true,
                content: [{ type: "text", text: "Rate limit exceeded" }],
              },
            }),
          ),
      },
    ),
    /rate limit/i,
  );
  assert.deepEqual(parseExaResponseBody('{"a":1}'), { a: 1 });
  assert.throws(() => parseExaResponseBody("event: message\n\n"), /unparseable/);
  const big = await callExaTool(
    "web_search_exa",
    {},
    { fetchImpl: async () => okResponse("x".repeat(50_000)) },
  );
  assert.ok(big.length < 21_000 && big.includes("[truncated"));
});

test("runtime guard allows web tools and MCP, blocks bash/write and final-turn tools", async () => {
  const { createWebScoutRuntimeGuardExtension } = (await loadRuntime()).__test__;
  const handlers = new Map();
  createWebScoutRuntimeGuardExtension({ cwd: process.cwd(), maxTurns: 3 })({
    on: (name, handler) => handlers.set(name, handler),
  });
  const call = (toolName, input = {}) => handlers.get("tool_call")({ toolName, input });
  assert.equal(await call("web_search", { query: "q" }), undefined);
  assert.equal(await call("fetch_url", { url: "https://example.com" }), undefined);
  assert.equal(await call("mcp__s__t"), undefined);
  for (const name of ["bash", "write", "edit", "subagent"])
    assert.equal((await call(name, {}))?.block, true, name);
  await handlers.get("turn_start")({ turnIndex: 2 });
  assert.equal((await call("web_search", { query: "q" }))?.block, true);
});

test("package metadata registers web-scout in the collection", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));
  assert.ok(root.pi.extensions.includes("./extensions/web-scout/index.ts"));
  const pkg = JSON.parse(await readFile("extensions/web-scout/package.json", "utf8"));
  assert.equal(pkg.name, "@diegopetrucci/pi-web-scout");
  assert.equal(pkg.version, "0.1.0");
});
