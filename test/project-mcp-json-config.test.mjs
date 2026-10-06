/**
 * Tests for extensions/project-mcp-json/config.ts
 *
 * Covers:
 *  - Valid stdio / http mapping
 *  - Allowlist enforcement (auth, headersHelper, unknown fields)
 *  - command+url rejection
 *  - sse / ws type rejection
 *  - ${VAR} / ${VAR:-default} expansion including missing vars
 *  - Non-recursive substitution
 *  - Literal encoding: $ and leading ! round-trip through installed Pi resolver
 *  - Warning redaction (no config values in warning text)
 *  - Malformed JSON
 *  - Server name validation
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Import the module under test
const { parseMcpJson, expandVars, encodeLiteral } = await import(
  pathToFileURL(path.join(repoRoot, "extensions/project-mcp-json/config.ts")).href
);

// Import the installed Pi resolver for round-trip checks
const { resolveConfigValue } = await import(
  pathToFileURL(
    path.join(
      repoRoot,
      "node_modules/@earendil-works/pi-coding-agent/dist/core/resolve-config-value.js",
    ),
  ).href
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(mcpServers) {
  return JSON.stringify({ mcpServers });
}

// ---------------------------------------------------------------------------
// encodeLiteral
// ---------------------------------------------------------------------------

test("encodeLiteral: plain string is unchanged", () => {
  assert.equal(encodeLiteral("hello world"), "hello world");
});

test("encodeLiteral: $ is doubled", () => {
  assert.equal(encodeLiteral("$FOO"), "$$FOO");
  assert.equal(encodeLiteral("hello $WORLD end"), "hello $$WORLD end");
});

test("encodeLiteral: leading ! is prefixed with $", () => {
  assert.equal(encodeLiteral("!cmd arg"), "$!cmd arg");
});

test("encodeLiteral: non-leading ! is unchanged", () => {
  assert.equal(encodeLiteral("hello!world"), "hello!world");
});

test("encodeLiteral: $ round-trip through Pi resolver", () => {
  const original = "$MY_SECRET_VALUE";
  const encoded = encodeLiteral(original);
  assert.equal(resolveConfigValue(encoded, {}), original);
});

test("encodeLiteral: leading ! round-trip through Pi resolver", () => {
  const original = "!this-looks-like-a-command";
  const encoded = encodeLiteral(original);
  assert.equal(resolveConfigValue(encoded, {}), original);
});

test("encodeLiteral: multiple $ round-trip through Pi resolver", () => {
  const original = "prefix$VAR1 and $VAR2 end";
  const encoded = encodeLiteral(original);
  assert.equal(resolveConfigValue(encoded, {}), original);
});

test("encodeLiteral: value that is just $$ (two dollars) round-trips", () => {
  const original = "$$";
  const encoded = encodeLiteral(original);
  assert.equal(resolveConfigValue(encoded, {}), original);
});

test("encodeLiteral: value with $! round-trips", () => {
  const original = "token$!suffix";
  const encoded = encodeLiteral(original);
  assert.equal(resolveConfigValue(encoded, {}), original);
});

// ---------------------------------------------------------------------------
// expandVars
// ---------------------------------------------------------------------------

test("expandVars: expands ${VAR} from env", () => {
  const result = expandVars("hello ${NAME}", { NAME: "world" });
  assert.ok(result.ok);
  assert.equal(result.value, "hello world");
});

test("expandVars: expands ${VAR:-default} when var missing", () => {
  const result = expandVars("${MISSING:-fallback}", {});
  assert.ok(result.ok);
  assert.equal(result.value, "fallback");
});

test("expandVars: expands ${VAR:-} with empty default", () => {
  const result = expandVars("prefix${MISSING:-}suffix", {});
  assert.ok(result.ok);
  assert.equal(result.value, "prefixsuffix");
});

test("expandVars: prefers env over process.env", () => {
  const original = process.env["HOME"];
  const result = expandVars("${HOME}", { HOME: "/custom" });
  assert.ok(result.ok);
  assert.equal(result.value, "/custom");
  // cleanup: process.env was not mutated
  assert.equal(process.env["HOME"], original);
});

test("expandVars: missing var without default returns failure naming the var", () => {
  const result = expandVars("${NO_SUCH_VAR_XYZ}", {});
  assert.ok(!result.ok);
  assert.equal(result.missingVar, "NO_SUCH_VAR_XYZ");
});

test("expandVars: non-recursive — expanded value with ${NESTED} is not expanded", () => {
  const result = expandVars("${OUTER}", { OUTER: "${INNER}", INNER: "deep" });
  assert.ok(result.ok);
  // One-pass: OUTER expands to literal '${INNER}', which is not re-processed
  assert.equal(result.value, "${INNER}");
});

test("expandVars: no substitution when no ${} patterns present", () => {
  const result = expandVars("plain text", {});
  assert.ok(result.ok);
  assert.equal(result.value, "plain text");
});

test("expandVars: multiple variables in one string", () => {
  const result = expandVars("${A}-${B}", { A: "foo", B: "bar" });
  assert.ok(result.ok);
  assert.equal(result.value, "foo-bar");
});

test("expandVars: process.env used when env record does not have the key", () => {
  // Use a variable that is reliably set in the test process
  const envKey = "PATH";
  const expected = process.env[envKey];
  if (expected === undefined) return; // skip if PATH not set (unusual)
  const result = expandVars(`\${${envKey}}`, {});
  assert.ok(result.ok);
  assert.equal(result.value, expected);
});

test('expandVars: inherited prototype name "constructor" without default is treated as missing', () => {
  // Object.prototype.constructor is an own property of Object.prototype but NOT
  // an own property of a plain {} record — lookupVar must only match own props.
  const result = expandVars("${constructor}", {});
  assert.ok(!result.ok, "should fail: inherited name must not resolve to a prototype member");
  assert.equal(result.missingVar, "constructor");
});

test('expandVars: inherited prototype name "toString" without default is treated as missing', () => {
  const result = expandVars("${toString}", {});
  assert.ok(!result.ok, "should fail: inherited name must not resolve to a prototype member");
  assert.equal(result.missingVar, "toString");
});

test('expandVars: inherited prototype name "constructor" with :- default uses the default', () => {
  const result = expandVars("${constructor:-fallback}", {});
  assert.ok(result.ok);
  assert.equal(result.value, "fallback");
});

test('expandVars: inherited prototype name "__proto__" with :- default uses the default', () => {
  const result = expandVars("${__proto__:-safe}", {});
  assert.ok(result.ok);
  assert.equal(result.value, "safe");
});

// ---------------------------------------------------------------------------
// parseMcpJson — malformed input
// ---------------------------------------------------------------------------

test("parseMcpJson: malformed JSON returns empty servers and a warning", () => {
  const result = parseMcpJson("{not valid json}");
  assert.equal(result.servers.length, 0);
  assert.ok(result.warnings.length > 0);
  // Warning must not contain the raw JSON text
  for (const w of result.warnings) {
    assert.ok(!w.includes("not valid json"), `warning leaks JSON content: ${w}`);
  }
});

test("parseMcpJson: non-object root returns empty servers and a warning", () => {
  const result = parseMcpJson('"just a string"');
  assert.equal(result.servers.length, 0);
  assert.ok(result.warnings.length > 0);
});

test("parseMcpJson: non-object mcpServers returns warning", () => {
  const result = parseMcpJson(JSON.stringify({ mcpServers: [1, 2] }));
  assert.equal(result.servers.length, 0);
  assert.ok(result.warnings.length > 0);
});

test("parseMcpJson: missing mcpServers key produces no warnings and no servers", () => {
  const result = parseMcpJson(JSON.stringify({ other: "key" }));
  assert.equal(result.servers.length, 0);
  assert.equal(result.warnings.length, 0);
});

// ---------------------------------------------------------------------------
// parseMcpJson — server name validation
// ---------------------------------------------------------------------------

test("parseMcpJson: invalid server name is skipped with a warning", () => {
  const result = parseMcpJson(json({ "bad name!": { command: "foo" } }));
  assert.equal(result.servers.length, 0);
  assert.ok(result.warnings.some((w) => w.includes("bad name!")));
});

test("parseMcpJson: valid server name passes through", () => {
  const result = parseMcpJson(json({ "my-server_1": { command: "foo" } }));
  assert.equal(result.servers.length, 1);
  assert.equal(result.servers[0]?.name, "my-server_1");
});

// ---------------------------------------------------------------------------
// parseMcpJson — stdio
// ---------------------------------------------------------------------------

test("parseMcpJson: valid stdio server is parsed correctly", () => {
  const input = json({
    myServer: {
      type: "stdio",
      command: "npx",
      args: ["-y", "some-package"],
      env: { KEY: "VALUE" },
      cwd: "/tmp",
      timeout: 30,
      description: "A test server",
    },
  });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(warnings.length, 0);
  assert.equal(servers.length, 1);
  const s = servers[0];
  assert.equal(s?.name, "myServer");
  const cfg = s?.config;
  assert.equal(cfg?.type, "stdio");
  if (cfg?.type !== "stdio") throw new Error("expected stdio");
  assert.equal(cfg.command, "npx");
  assert.deepEqual(cfg.args, ["-y", "some-package"]);
  // env values are encoded literals
  assert.equal(cfg.env?.["KEY"], "VALUE"); // plain value, no encoding needed
  assert.equal(cfg.cwd, "/tmp");
  assert.equal(cfg.timeout, 30);
  assert.equal(cfg.description, "A test server");
});

test("parseMcpJson: stdio with no type field inferred from command", () => {
  const { servers } = parseMcpJson(json({ s: { command: "sh" } }));
  assert.equal(servers.length, 1);
  assert.equal(servers[0]?.config.type, "stdio");
});

test("parseMcpJson: stdio env values with $ are encoded as Pi literals", () => {
  const input = json({ s: { command: "sh", env: { TOKEN: "$RAW_VALUE" } } });
  const { servers } = parseMcpJson(input);
  assert.equal(servers.length, 1);
  const cfg = servers[0]?.config;
  if (cfg?.type !== "stdio") throw new Error("expected stdio");
  const encoded = cfg.env?.["TOKEN"];
  assert.ok(encoded !== undefined);
  // The encoded value, when resolved by Pi, should yield the original
  assert.equal(resolveConfigValue(encoded, {}), "$RAW_VALUE");
});

test("parseMcpJson: stdio env value with leading ! is encoded as Pi literal", () => {
  const input = json({ s: { command: "sh", env: { CMD: "!echo hi" } } });
  const { servers } = parseMcpJson(input);
  const cfg = servers[0]?.config;
  if (cfg?.type !== "stdio") throw new Error("expected stdio");
  const encoded = cfg.env?.["CMD"];
  assert.ok(encoded !== undefined);
  assert.equal(resolveConfigValue(encoded, {}), "!echo hi");
});

test("parseMcpJson: stdio env variable expansion then encode", () => {
  const input = json({ s: { command: "sh", env: { COMPOSED: "${MY_VAR}" } } });
  const { servers } = parseMcpJson(input, { MY_VAR: "actual-secret" });
  const cfg = servers[0]?.config;
  if (cfg?.type !== "stdio") throw new Error("expected stdio");
  const encoded = cfg.env?.["COMPOSED"];
  assert.ok(encoded !== undefined);
  // Pi resolver should see the expanded-then-encoded value and return the expanded string
  assert.equal(resolveConfigValue(encoded, {}), "actual-secret");
});

test("parseMcpJson: command variable expansion, not encoded", () => {
  const input = json({ s: { command: "${MY_CMD}" } });
  const { servers } = parseMcpJson(input, { MY_CMD: "node" });
  const cfg = servers[0]?.config;
  if (cfg?.type !== "stdio") throw new Error("expected stdio");
  assert.equal(cfg.command, "node");
});

test("parseMcpJson: stdio with missing var in env skips server with warning naming var", () => {
  const input = json({ s: { command: "sh", env: { KEY: "${NO_SUCH_38fh}" } } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.some((w) => w.includes("NO_SUCH_38fh")));
  // Warning must not contain any config value
  for (const w of warnings) {
    assert.ok(!w.includes("sh"), `warning leaks command value: ${w}`);
  }
});

test("parseMcpJson: stdio with missing var in command skips server", () => {
  const input = json({ s: { command: "${UNDEFINED_CMD_jk2}" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.some((w) => w.includes("UNDEFINED_CMD_jk2")));
});

test("parseMcpJson: stdio with ${VAR:-default} for missing var uses default", () => {
  const input = json({ s: { command: "${MY_CMD:-node}" } });
  const { servers } = parseMcpJson(input);
  assert.equal(servers.length, 1);
  const cfg = servers[0]?.config;
  if (cfg?.type !== "stdio") throw new Error("expected stdio");
  assert.equal(cfg.command, "node");
});

// ---------------------------------------------------------------------------
// parseMcpJson — http
// ---------------------------------------------------------------------------

test("parseMcpJson: valid http server is parsed correctly", () => {
  const input = json({
    remote: {
      type: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer token" },
      timeout: 60,
      description: "Remote server",
    },
  });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(warnings.length, 0);
  assert.equal(servers.length, 1);
  const cfg = servers[0]?.config;
  assert.equal(cfg?.type, "http");
  if (cfg?.type !== "http") throw new Error("expected http");
  assert.equal(cfg.url, "https://example.com/mcp");
  assert.equal(cfg.timeout, 60);
  assert.equal(cfg.description, "Remote server");
});

test("parseMcpJson: streamable-http type maps to Pi http", () => {
  const input = json({ s: { type: "streamable-http", url: "https://x.com/mcp" } });
  const { servers } = parseMcpJson(input);
  assert.equal(servers.length, 1);
  assert.equal(servers[0]?.config.type, "http");
});

test("parseMcpJson: http inferred from url field when no type", () => {
  const { servers } = parseMcpJson(json({ s: { url: "https://x.com/mcp" } }));
  assert.equal(servers.length, 1);
  assert.equal(servers[0]?.config.type, "http");
});

test("parseMcpJson: http header values with $ are encoded as Pi literals", () => {
  const input = json({ s: { url: "https://x.com", headers: { X: "$TOKEN" } } });
  const { servers } = parseMcpJson(input);
  const cfg = servers[0]?.config;
  if (cfg?.type !== "http") throw new Error("expected http");
  const encoded = cfg.headers?.["X"];
  assert.ok(encoded !== undefined);
  assert.equal(resolveConfigValue(encoded, {}), "$TOKEN");
});

test("parseMcpJson: http header leading ! is encoded as Pi literal", () => {
  const input = json({ s: { url: "https://x.com", headers: { X: "!val" } } });
  const { servers } = parseMcpJson(input);
  const cfg = servers[0]?.config;
  if (cfg?.type !== "http") throw new Error("expected http");
  const encoded = cfg.headers?.["X"];
  assert.ok(encoded !== undefined);
  assert.equal(resolveConfigValue(encoded, {}), "!val");
});

test("parseMcpJson: http oauth subset fields are parsed", () => {
  const input = json({
    s: {
      url: "https://x.com/mcp",
      oauth: {
        clientId: "cid",
        clientSecret: "csecret",
        callbackPort: 8080,
        callbackUrl: "http://localhost:8080/cb",
        scope: "read write",
      },
    },
  });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(warnings.length, 0);
  assert.equal(servers.length, 1);
  const cfg = servers[0]?.config;
  if (cfg?.type !== "http") throw new Error("expected http");
  assert.equal(cfg.oauth?.clientId, "cid");
  assert.equal(cfg.oauth?.callbackPort, 8080);
  assert.equal(cfg.oauth?.callbackUrl, "http://localhost:8080/cb");
  assert.equal(cfg.oauth?.scope, "read write");
  // clientSecret is encoded — verify round-trip
  const encodedSecret = cfg.oauth?.clientSecret;
  assert.ok(encodedSecret !== undefined);
  assert.equal(resolveConfigValue(encodedSecret, {}), "csecret");
});

test("parseMcpJson: oauth.clientSecret with $ is encoded as Pi literal", () => {
  const input = json({ s: { url: "https://x.com", oauth: { clientSecret: "$SEC" } } });
  const { servers } = parseMcpJson(input);
  const cfg = servers[0]?.config;
  if (cfg?.type !== "http") throw new Error("expected http");
  const encoded = cfg.oauth?.clientSecret;
  assert.ok(encoded !== undefined);
  assert.equal(resolveConfigValue(encoded, {}), "$SEC");
});

test("parseMcpJson: oauth.clientSecret with leading ! is encoded as Pi literal", () => {
  const input = json({ s: { url: "https://x.com", oauth: { clientSecret: "!secret-cmd" } } });
  const { servers } = parseMcpJson(input);
  const cfg = servers[0]?.config;
  if (cfg?.type !== "http") throw new Error("expected http");
  const encoded = cfg.oauth?.clientSecret;
  assert.ok(encoded !== undefined);
  assert.equal(resolveConfigValue(encoded, {}), "!secret-cmd");
});

test("parseMcpJson: http missing var in url skips server with warning", () => {
  const input = json({ s: { url: "https://${NO_HOST_xyz}.com" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.some((w) => w.includes("NO_HOST_xyz")));
});

// ---------------------------------------------------------------------------
// parseMcpJson — allowlist enforcement
// ---------------------------------------------------------------------------

test("parseMcpJson: auth field causes skip with warning", () => {
  const input = json({ s: { command: "sh", auth: { provider: "github" } } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.some((w) => w.includes('"auth"')));
});

test("parseMcpJson: headersHelper field causes skip with warning", () => {
  const input = json({ s: { url: "https://x.com", headersHelper: "fn" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.some((w) => w.includes('"headersHelper"')));
});

test("parseMcpJson: unknown field causes skip with warning", () => {
  const input = json({ s: { command: "sh", secretToken: "value" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.some((w) => w.includes('"secretToken"')));
  // Warning must not contain the value
  for (const w of warnings) {
    assert.ok(!w.includes("value"), `warning leaks field value: ${w}`);
  }
});

test("parseMcpJson: oauth unknown field causes skip with warning", () => {
  const input = json({ s: { url: "https://x.com", oauth: { clientName: "myapp" } } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.some((w) => w.includes('"clientName"')));
});

// ---------------------------------------------------------------------------
// parseMcpJson — command+url rejection
// ---------------------------------------------------------------------------

test("parseMcpJson: server with both command and url is skipped", () => {
  const input = json({ s: { command: "sh", url: "https://x.com" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.some((w) => w.includes("command") && w.includes("url")));
});

// ---------------------------------------------------------------------------
// parseMcpJson — unsupported types
// ---------------------------------------------------------------------------

test('parseMcpJson: type "sse" is rejected with warning (type value not echoed)', () => {
  const input = json({ s: { type: "sse", url: "https://x.com/events" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.length > 0, "expected a warning");
  // The type value itself must not appear in warning text
  assert.ok(!warnings.some((w) => w.includes("sse")), "type value must not be echoed in warning");
});

test('parseMcpJson: type "ws" is rejected with warning (type value not echoed)', () => {
  const input = json({ s: { type: "ws", url: "wss://x.com" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.length > 0, "expected a warning");
  assert.ok(!warnings.some((w) => w.includes("ws")), "type value must not be echoed in warning");
});

test('parseMcpJson: type "websocket" is rejected without echoing value', () => {
  const input = json({ s: { type: "websocket", url: "wss://x.com" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(
    !warnings.some((w) => w.includes("websocket")),
    "type value must not be echoed in warning",
  );
});

test("parseMcpJson: adversarial type value with injection chars is not echoed", () => {
  // An adversarial type value with control characters or escape sequences
  // must never appear in warning text.
  const evilType = "<script>alert(1)</script>\u0007\u001b[1m";
  const input = json({ s: { type: evilType, url: "https://x.com" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.length > 0);
  for (const w of warnings) {
    assert.ok(!w.includes("<script>"), "adversarial type must not appear in warning");
    assert.ok(!w.includes("\u001b"), "escape sequences must not appear in warning");
  }
});

// ---------------------------------------------------------------------------
// parseMcpJson — warning redaction
// ---------------------------------------------------------------------------

test("parseMcpJson: warnings for missing var name the var, not the template or value", () => {
  const input = json({ s: { command: "sh", env: { SECRET: "${SUPER_SECRET_VAR_abc}" } } });
  const { warnings } = parseMcpJson(input);
  assert.ok(warnings.length > 0);
  for (const w of warnings) {
    // The warning should contain the variable name
    assert.ok(w.includes("SUPER_SECRET_VAR_abc"), `expected var name in warning: ${w}`);
    // But must not contain the template value
    assert.ok(!w.includes("${SUPER_SECRET_VAR_abc}"), `warning leaks template: ${w}`);
    // Must not contain sh (the command value)
    assert.ok(!w.includes("sh"), `warning leaks command: ${w}`);
  }
});

test("parseMcpJson: adversarial variable name with injection chars is sanitized", () => {
  // An adversarial variable name that fails the safe-name regex must be
  // replaced with a placeholder and must not appear literally in warnings.
  const evilVar = "<script>\u001b[1m!bad";
  const input = json({ s: { command: "${" + evilVar + "}" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(warnings.length > 0);
  for (const w of warnings) {
    assert.ok(!w.includes("<script>"), "adversarial var name must not appear in warning");
    assert.ok(!w.includes("\u001b"), "escape sequences must not appear in warning");
    assert.ok(!w.includes("!bad"), "adversarial var fragment must not appear in warning");
  }
});

test("parseMcpJson: safe variable name (valid identifier) is echoed in warning", () => {
  const input = json({ s: { command: "${MY_VALID_VAR_123}" } });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 0);
  assert.ok(
    warnings.some((w) => w.includes("MY_VALID_VAR_123")),
    "valid var name should be shown in warning",
  );
});

// ---------------------------------------------------------------------------
// parseMcpJson — multiple servers, partial failures
// ---------------------------------------------------------------------------

test("parseMcpJson: valid and invalid servers in one file — only valid ones returned", () => {
  const input = json({
    good: { command: "node", args: ["server.js"] },
    bad: { type: "sse", url: "https://x.com" },
  });
  const { servers, warnings } = parseMcpJson(input);
  assert.equal(servers.length, 1);
  assert.equal(servers[0]?.name, "good");
  assert.ok(warnings.length > 0);
});

// ---------------------------------------------------------------------------
// parseMcpJson — empty inputs
// ---------------------------------------------------------------------------

test("parseMcpJson: empty mcpServers object produces no servers and no warnings", () => {
  const { servers, warnings } = parseMcpJson(json({}));
  assert.equal(servers.length, 0);
  assert.equal(warnings.length, 0);
});

test("parseMcpJson: stdio server with no optional fields", () => {
  const { servers, warnings } = parseMcpJson(json({ s: { command: "sh" } }));
  assert.equal(warnings.length, 0);
  assert.equal(servers.length, 1);
  const cfg = servers[0]?.config;
  if (cfg?.type !== "stdio") throw new Error("expected stdio");
  assert.equal(cfg.command, "sh");
  assert.equal(cfg.args, undefined);
  assert.equal(cfg.env, undefined);
  assert.equal(cfg.cwd, undefined);
});

// ---------------------------------------------------------------------------
// sanitizeStringForWarning: control-character injection in names/keys
// ---------------------------------------------------------------------------

test("parseMcpJson: invalid server name with ESC sequence is stripped in warning", () => {
  // An invalid server name containing ESC + ANSI colour codes — must not
  // appear in warning output.
  const evilName = "bad\u001b[31mserver\u001b[0m";
  const input = JSON.stringify({ mcpServers: { [evilName]: { command: "x" } } });
  const { warnings } = parseMcpJson(input);
  assert.ok(warnings.length > 0, "should produce a warning for invalid name");
  for (const w of warnings) {
    assert.ok(!w.includes("\u001b"), `ESC must not appear in warning: ${JSON.stringify(w)}`);
  }
});

test("parseMcpJson: unknown field name with ESC sequence is stripped in warning", () => {
  const evilField = "bad\u001b[31mfield\u001b[0m";
  // valid server name, but inject ESC in the unknown field name
  const input = JSON.stringify({
    mcpServers: {
      myserver: { type: "stdio", command: "node", [evilField]: "x" },
    },
  });
  const { warnings } = parseMcpJson(input);
  assert.ok(warnings.length > 0, "should produce a warning for unknown field");
  for (const w of warnings) {
    assert.ok(!w.includes("\u001b"), `ESC must not appear in warning: ${JSON.stringify(w)}`);
  }
});

test("parseMcpJson: env key with ESC sequence is stripped in warning", () => {
  const evilKey = "KEY\u001b[31mBad\u001b[0m";
  const input = JSON.stringify({
    mcpServers: {
      myserver: {
        type: "stdio",
        command: "node",
        // env value is a non-string to trigger the env[k] warning
        env: { [evilKey]: 42 },
      },
    },
  });
  const { warnings } = parseMcpJson(input);
  assert.ok(warnings.length > 0, "should produce a warning for invalid env value");
  for (const w of warnings) {
    assert.ok(!w.includes("\u001b"), `ESC must not appear in warning: ${JSON.stringify(w)}`);
  }
});

test("parseMcpJson: header key with ESC sequence is stripped in warning", () => {
  const evilKey = "X-Token\u001b[31mEsc\u001b[0m";
  const input = JSON.stringify({
    mcpServers: {
      myserver: {
        type: "http",
        url: "https://example.com",
        // header value is a non-string to trigger the headers[k] warning
        headers: { [evilKey]: 99 },
      },
    },
  });
  const { warnings } = parseMcpJson(input);
  assert.ok(warnings.length > 0, "should produce a warning for invalid header value");
  for (const w of warnings) {
    assert.ok(!w.includes("\u001b"), `ESC must not appear in warning: ${JSON.stringify(w)}`);
  }
});

test("parseMcpJson: unknown oauth field with ESC sequence is stripped in warning", () => {
  const evilOauthField = "evil\u001b[31mOauth\u001b[0m";
  const input = JSON.stringify({
    mcpServers: {
      myserver: {
        type: "http",
        url: "https://example.com",
        oauth: { [evilOauthField]: "x" },
      },
    },
  });
  const { warnings } = parseMcpJson(input);
  assert.ok(warnings.length > 0, "should produce a warning for unknown oauth field");
  for (const w of warnings) {
    assert.ok(!w.includes("\u001b"), `ESC must not appear in warning: ${JSON.stringify(w)}`);
  }
});

test("parseMcpJson: long server name is capped in warning (no overflow)", () => {
  // Create a name that is > 80 chars but fails SERVER_NAME_RE so it triggers
  // the invalid-name warning path.
  const longName = "a".repeat(100) + "!bad";
  const input = JSON.stringify({ mcpServers: { [longName]: { command: "x" } } });
  const { warnings } = parseMcpJson(input);
  assert.ok(warnings.length > 0);
  for (const w of warnings) {
    // Warning must not contain the full 104-char name
    assert.ok(!w.includes(longName), "long name must be truncated in warning");
    // The truncated form (	at 80 chars + \u2026) should appear
    assert.ok(w.includes("a".repeat(80)), "truncated prefix should appear");
  }
});
