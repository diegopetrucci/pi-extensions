/**
 * Parse Claude Code-style .mcp.json files into Pi McpServerConfig objects.
 *
 * Design constraints:
 * - Strict field allowlist — never spreads raw input.
 * - One-pass ${VAR} / ${VAR:-default} expansion (non-recursive).
 * - Env/header/oauth.clientSecret values are encoded as Pi resolver literals
 *   after expansion so Pi's second pass does not re-interpret them.
 * - Warnings never contain config values, expanded strings, or raw JSON text.
 */

import type { McpServerConfig } from "@earendil-works/pi-coding-agent";

// Local types matching Pi's McpServerConfig shape.
// McpStdioServerConfig / McpHttpServerConfig / McpOAuthConfig are not part
// of the public package exports; we replicate the relevant subset here.

type McpServerConfigBase = {
  description?: string;
  timeout?: number;
};

type McpStdioServerConfig = McpServerConfigBase & {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

type McpOAuthConfig = {
  clientId?: string;
  clientSecret?: string;
  callbackPort?: number;
  callbackUrl?: string;
  scope?: string;
};

type McpHttpServerConfig = McpServerConfigBase & {
  type: "http";
  url: string;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
};

type ParsedServer = {
  name: string;
  // Cast to McpServerConfig (the public Pi type) for use with pi.registerMcpServer.
  config: McpServerConfig;
};

type ParseResult = {
  servers: ParsedServer[];
  warnings: string[];
};

const SERVER_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** All top-level fields that the strict allowlist recognises. */
const ALL_KNOWN_FIELDS = new Set([
  // Shared
  "type",
  "timeout",
  "description",
  // stdio
  "command",
  "args",
  "env",
  "cwd",
  // http
  "url",
  "headers",
  "oauth",
]);

/** Fields that are always rejected regardless of server type. */
const REJECTED_FIELDS = new Set(["auth", "headersHelper"]);

/** Claude-side type values that map to Pi stdio. */
const STDIO_TYPE_VALUES = new Set(["stdio"]);

/** Claude-side type values that map to Pi http. */
const HTTP_TYPE_VALUES = new Set(["http", "streamable-http"]);

/** All allowed type values — anything else causes the entry to be skipped. */
const ALLOWED_TYPE_VALUES = new Set([...STDIO_TYPE_VALUES, ...HTTP_TYPE_VALUES]);

/** Allowed sub-fields of the oauth object. */
const OAUTH_ALLOWED_FIELDS = new Set([
  "clientId",
  "clientSecret",
  "callbackPort",
  "callbackUrl",
  "scope",
]);

/**
 * Encode a string so Pi's resolve-config-value treats it as a literal.
 *
 * Pi's second-pass resolver interprets:
 *   - Leading `!` as a shell-command invocation
 *   - `${NAME}` / `$NAME` as environment-variable references
 *   - `$$` as an escaped literal `$`
 *   - `$!` as an escaped literal `!`
 *
 * To make an already-expanded value pass through unchanged:
 *   1. Replace every `$` with `$$` (prevents env-var and escape sequences).
 *   2. If the result starts with `!`, prepend `$` (renders as `$!` → `!`).
 */
export function encodeLiteral(value: string): string {
  // Use a replacer function so the replacement string is never treated as a
  // special pattern (a plain replacement of "$$" would be interpreted by
  // String.replace as the escape sequence for a literal "$", making it a no-op).
  const escaped = value.replace(/\$/g, () => "$$");
  return escaped.startsWith("!") ? `$${escaped}` : escaped;
}

/**
 * Pattern for safe-to-echo variable names.
 * Only names that look like valid POSIX identifiers are shown in warnings;
 * anything else is replaced with a generic placeholder to prevent adversarial
 * content from appearing in user-visible messages.
 */
const SAFE_VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function safeVarName(name: string): string {
  return SAFE_VAR_NAME_RE.test(name) ? name : "<invalid variable name>";
}

/**
 * Sanitize an untrusted string for safe inclusion in a warning message.
 * Strips all ASCII control characters (0x00–0x1f, including ESC = 0x1b) and
 * the DEL character (0x7f), then caps the output at 80 characters to prevent
 * log flooding or terminal injection.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g;

export function sanitizeStringForWarning(s: string): string {
  const stripped = s.replace(CONTROL_CHARS_RE, "");
  return stripped.length <= 80 ? stripped : stripped.slice(0, 80) + "\u2026";
}

type ExpandOk = { ok: true; value: string };
type ExpandFail = { ok: false; missingVar: string };
type ExpandResult = ExpandOk | ExpandFail;

/**
 * Look up a variable name using only own properties of env and process.env.
 *
 * Using bracket notation directly (e.g. env[name]) would resolve inherited
 * prototype properties such as "constructor", "toString", or "__proto__".
 * Object.hasOwn guards against that by only matching keys the object itself
 * declares.  We also require typeof === "string" to reject any non-string
 * own property that somehow ends up in the env record.
 */
function lookupVar(
  env: Record<string, string>,
  name: string
): string | undefined {
  if (Object.hasOwn(env, name) && typeof env[name] === "string") {
    return env[name];
  }
  if (Object.hasOwn(process.env, name) && typeof process.env[name] === "string") {
    return process.env[name];
  }
  return undefined;
}

/**
 * One-pass expansion of `${VAR}` and `${VAR:-default}` in a template string.
 *
 * - Substitution is non-recursive: values that contain `${…}` are not
 *   processed again.
 * - A missing variable with no default causes a failure result that names
 *   only the variable (never its value).
 * - `env` supplements `process.env`; `env` values take precedence.
 */
export function expandVars(
  template: string,
  env: Record<string, string>
): ExpandResult {
  let missingVar: string | undefined;

  const result = template.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    if (missingVar !== undefined) return "";

    const sepIdx = expr.indexOf(":-");
    if (sepIdx >= 0) {
      const varName = expr.slice(0, sepIdx);
      const defaultVal = expr.slice(sepIdx + 2);
      const val = lookupVar(env, varName);
      return val !== undefined ? val : defaultVal;
    }

    const varName = expr;
    const val = lookupVar(env, varName);
    if (val === undefined) {
      missingVar = varName;
      return "";
    }
    return val;
  });

  if (missingVar !== undefined) {
    return { ok: false, missingVar };
  }
  return { ok: true, value: result };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((e) => typeof e === "string");
}

/**
 * Parse a Claude Code-style `.mcp.json` file and return Pi-ready server
 * configs plus any warnings encountered.
 *
 * @param text  Raw UTF-8 content of the `.mcp.json` file.
 * @param env   Optional supplemental environment variables used for
 *              `${VAR}` expansion (merged over `process.env`).
 */
export function parseMcpJson(
  text: string,
  env: Record<string, string> = {}
): ParseResult {
  const warnings: string[] = [];
  const servers: ParsedServer[] = [];

  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    // Never include raw parse error text in warnings.
    warnings.push("project-mcp-json: .mcp.json could not be parsed as JSON; skipping all servers");
    return { servers, warnings };
  }

  if (!isRecord(root)) {
    warnings.push("project-mcp-json: .mcp.json root must be a JSON object; skipping all servers");
    return { servers, warnings };
  }

  const mcpServers = root["mcpServers"];
  if (mcpServers === undefined) {
    return { servers, warnings };
  }

  if (!isRecord(mcpServers)) {
    warnings.push("project-mcp-json: mcpServers must be an object; skipping all servers");
    return { servers, warnings };
  }

  for (const [name, rawEntry] of Object.entries(mcpServers)) {
    const safeName = sanitizeStringForWarning(name);
    const warn = (msg: string) =>
      warnings.push(`project-mcp-json: server "${safeName}": ${msg}`);

    if (!SERVER_NAME_RE.test(name)) {
      warn("invalid name (allowed: letters, digits, _ and -); skipping");
      continue;
    }

    if (!isRecord(rawEntry)) {
      warn("entry must be an object; skipping");
      continue;
    }

    let rejectedField: string | undefined;
    for (const rejected of REJECTED_FIELDS) {
      if (rejected in rawEntry) {
        rejectedField = rejected;
        break;
      }
    }
    if (rejectedField !== undefined) {
      warn(`field "${rejectedField}" is not allowed; skipping`);
      continue;
    }

    const unknownFields = Object.keys(rawEntry).filter(
      (k) => !ALL_KNOWN_FIELDS.has(k)
    );
    if (unknownFields.length > 0) {
      warn(
        `unknown field(s) "${unknownFields.map(sanitizeStringForWarning).join('", "')}" are not allowed; skipping`
      );
      continue;
    }

    const rawType = rawEntry["type"];
    if (rawType !== undefined && typeof rawType !== "string") {
      warn("type must be a string; skipping");
      continue;
    }
    const typeStr: string | undefined = rawType as string | undefined;

    if (typeStr !== undefined && !ALLOWED_TYPE_VALUES.has(typeStr)) {
      warn("type value is not supported (allowed: stdio, http, streamable-http); skipping");
      continue;
    }

    const hasCommand = "command" in rawEntry;
    const hasUrl = "url" in rawEntry;

    if (hasCommand && hasUrl) {
      warn("cannot have both command and url; skipping");
      continue;
    }

    let kind: "stdio" | "http";
    if (typeStr !== undefined) {
      kind = STDIO_TYPE_VALUES.has(typeStr) ? "stdio" : "http";
    } else if (hasCommand) {
      kind = "stdio";
    } else if (hasUrl) {
      kind = "http";
    } else {
      warn("must have either command (stdio) or url (http); skipping");
      continue;
    }

    if (kind === "stdio" && hasUrl) {
      warn("type stdio cannot have a url field; skipping");
      continue;
    }
    if (kind === "http" && hasCommand) {
      warn("type http cannot have a command field; skipping");
      continue;
    }

    if (kind === "stdio") {
      const parsed = parseStdioEntry(rawEntry, env, warn);
      if (parsed !== null) servers.push({ name, config: parsed });
    } else {
      const parsed = parseHttpEntry(rawEntry, env, warn);
      if (parsed !== null) servers.push({ name, config: parsed });
    }
  }

  return { servers, warnings };
}

function parseStdioEntry(
  raw: Record<string, unknown>,
  env: Record<string, string>,
  warn: (msg: string) => void
): McpStdioServerConfig | null {
  const rawCommand = raw["command"];
  if (typeof rawCommand !== "string" || rawCommand.length === 0) {
    warn("command must be a non-empty string; skipping");
    return null;
  }
  const commandExpanded = expandVars(rawCommand, env);
  if (!commandExpanded.ok) {
    warn(`variable "${safeVarName(commandExpanded.missingVar)}" in command is not set and has no default; skipping`);
    return null;
  }

  const rawArgs = raw["args"];
  if (rawArgs !== undefined && !isStringArray(rawArgs)) {
    warn("args must be an array of strings; skipping");
    return null;
  }
  const expandedArgs: string[] = [];
  for (const arg of rawArgs ?? []) {
    const res = expandVars(arg, env);
    if (!res.ok) {
      warn(`variable "${safeVarName(res.missingVar)}" in args is not set and has no default; skipping`);
      return null;
    }
    expandedArgs.push(res.value);
  }

  const rawEnv = raw["env"];
  if (rawEnv !== undefined && !isRecord(rawEnv)) {
    warn("env must be an object; skipping");
    return null;
  }
  const encodedEnv: Record<string, string> = {};
  if (isRecord(rawEnv)) {
    for (const [k, v] of Object.entries(rawEnv)) {
      if (typeof v !== "string") {
        warn(`env["${sanitizeStringForWarning(k)}"] must be a string; skipping`);
        return null;
      }
      const res = expandVars(v, env);
      if (!res.ok) {
        warn(`variable "${safeVarName(res.missingVar)}" in env["${sanitizeStringForWarning(k)}"] is not set and has no default; skipping`);
        return null;
      }
      // Encode so Pi's second pass treats the expanded value as a literal
      encodedEnv[k] = encodeLiteral(res.value);
    }
  }

  const rawCwd = raw["cwd"];
  if (rawCwd !== undefined && typeof rawCwd !== "string") {
    warn("cwd must be a string; skipping");
    return null;
  }
  let expandedCwd: string | undefined;
  if (typeof rawCwd === "string") {
    const res = expandVars(rawCwd, env);
    if (!res.ok) {
      warn(`variable "${safeVarName(res.missingVar)}" in cwd is not set and has no default; skipping`);
      return null;
    }
    expandedCwd = res.value;
  }

  const config: McpStdioServerConfig = {
    type: "stdio",
    command: commandExpanded.value,
    ...(expandedArgs.length > 0 ? { args: expandedArgs } : {}),
    ...(Object.keys(encodedEnv).length > 0 ? { env: encodedEnv } : {}),
    ...(expandedCwd !== undefined ? { cwd: expandedCwd } : {}),
    ...parseSharedFields(raw),
  };

  return config;
}

function parseHttpEntry(
  raw: Record<string, unknown>,
  env: Record<string, string>,
  warn: (msg: string) => void
): McpHttpServerConfig | null {
  const rawUrl = raw["url"];
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    warn("url must be a non-empty string; skipping");
    return null;
  }
  const urlExpanded = expandVars(rawUrl, env);
  if (!urlExpanded.ok) {
    warn(`variable "${safeVarName(urlExpanded.missingVar)}" in url is not set and has no default; skipping`);
    return null;
  }

  const rawHeaders = raw["headers"];
  if (rawHeaders !== undefined && !isRecord(rawHeaders)) {
    warn("headers must be an object; skipping");
    return null;
  }
  const encodedHeaders: Record<string, string> = {};
  if (isRecord(rawHeaders)) {
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (typeof v !== "string") {
        warn(`headers["${sanitizeStringForWarning(k)}"] must be a string; skipping`);
        return null;
      }
      const res = expandVars(v, env);
      if (!res.ok) {
        warn(`variable "${safeVarName(res.missingVar)}" in headers["${sanitizeStringForWarning(k)}"] is not set and has no default; skipping`);
        return null;
      }
      encodedHeaders[k] = encodeLiteral(res.value);
    }
  }

  const rawOauth = raw["oauth"];
  let parsedOauth: McpOAuthConfig | undefined;
  if (rawOauth !== undefined) {
    if (!isRecord(rawOauth)) {
      warn("oauth must be an object; skipping");
      return null;
    }
    const oauthUnknown = Object.keys(rawOauth).filter(
      (k) => !OAUTH_ALLOWED_FIELDS.has(k)
    );
    if (oauthUnknown.length > 0) {
      warn(
        `unknown oauth field(s) "${oauthUnknown.map(sanitizeStringForWarning).join('", "')}" are not allowed; skipping`
      );
      return null;
    }

    const oauth: McpOAuthConfig = {};

    const rawClientId = rawOauth["clientId"];
    if (rawClientId !== undefined) {
      if (typeof rawClientId !== "string") {
        warn("oauth.clientId must be a string; skipping");
        return null;
      }
      oauth.clientId = rawClientId;
    }

    const rawClientSecret = rawOauth["clientSecret"];
    if (rawClientSecret !== undefined) {
      if (typeof rawClientSecret !== "string") {
        warn("oauth.clientSecret must be a string; skipping");
        return null;
      }
      const res = expandVars(rawClientSecret, env);
      if (!res.ok) {
        warn(`variable "${safeVarName(res.missingVar)}" in oauth.clientSecret is not set and has no default; skipping`);
        return null;
      }
      oauth.clientSecret = encodeLiteral(res.value);
    }

    const rawCallbackPort = rawOauth["callbackPort"];
    if (rawCallbackPort !== undefined) {
      if (typeof rawCallbackPort !== "number") {
        warn("oauth.callbackPort must be a number; skipping");
        return null;
      }
      oauth.callbackPort = rawCallbackPort;
    }

    const rawCallbackUrl = rawOauth["callbackUrl"];
    if (rawCallbackUrl !== undefined) {
      if (typeof rawCallbackUrl !== "string") {
        warn("oauth.callbackUrl must be a string; skipping");
        return null;
      }
      oauth.callbackUrl = rawCallbackUrl;
    }

    const rawScope = rawOauth["scope"];
    if (rawScope !== undefined) {
      if (typeof rawScope !== "string") {
        warn("oauth.scope must be a string; skipping");
        return null;
      }
      oauth.scope = rawScope;
    }

    parsedOauth = oauth;
  }

  const config: McpHttpServerConfig = {
    type: "http",
    url: urlExpanded.value,
    ...(Object.keys(encodedHeaders).length > 0 ? { headers: encodedHeaders } : {}),
    ...(parsedOauth !== undefined ? { oauth: parsedOauth } : {}),
    ...parseSharedFields(raw),
  };

  return config;
}

type SharedFields = Pick<McpServerConfigBase, "timeout" | "description">;

function parseSharedFields(raw: Record<string, unknown>): SharedFields {
  const result: SharedFields = {};

  const rawTimeout = raw["timeout"];
  if (typeof rawTimeout === "number") {
    result.timeout = rawTimeout;
  }

  const rawDescription = raw["description"];
  if (typeof rawDescription === "string") {
    result.description = rawDescription;
  }

  return result;
}
