import * as fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentSession, ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  createAgentSession,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import * as piCodingAgent from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { Usage } from "@earendil-works/pi-ai";

const MAX_TOOL_CALLS_TO_KEEP = 80;
const MAX_TURNS = 8;
const MAX_RUN_MS = 8 * 60 * 1000;
const DEFAULT_BASH_TIMEOUT_SECONDS = 30;
const DEFAULT_THINKING_LEVEL = "medium";
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

type ThinkingLevel = (typeof THINKING_LEVELS)[number];
type ThinkingLevelMap = Partial<Record<ThinkingLevel, unknown | null>>;

const SUBAGENT_MCP_TOOLS = [
  "mcp__*",
  "tool_search",
  "list_mcp_resources",
  "list_mcp_resource_templates",
  "read_mcp_resource",
];

// Derive project-trust for the isolated subagent session from the host tool context.
// Fails closed: returns false if the host has not trusted the project, or if the subagent
// runs in a different directory (e.g. a temp workspace), preventing an untrusted project's
// .pi/mcp.json from being loaded by the MCP extension.
function resolveSubagentProjectTrusted(
  ctx: { cwd: string; isProjectTrusted(): boolean },
  subagentCwd: string,
): boolean {
  // Feature-detected for older Pi hosts that may lack isProjectTrusted.
  const hostTrusted =
    typeof (ctx as { isProjectTrusted?: unknown }).isProjectTrusted === "function"
      ? ctx.isProjectTrusted()
      : false;
  if (!hostTrusted) return false;
  try {
    return realpathSync(subagentCwd) === realpathSync(ctx.cwd);
  } catch {
    return false; // fail closed if realpath resolution fails
  }
}

function isSubagentMcpTool(toolName: string): boolean {
  return (
    toolName.startsWith("mcp__") ||
    toolName === "tool_search" ||
    toolName === "list_mcp_resources" ||
    toolName === "list_mcp_resource_templates" ||
    toolName === "read_mcp_resource"
  );
}

/** Returns true when v is a semver string >=1.0.4 (ignores prerelease; missing/garbage -> false). */
function isMcpCompatibleVersion(v: string | undefined): boolean {
  if (!v) return false;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return false;
  const major = Number(m[1]),
    minor = Number(m[2]),
    patch = Number(m[3]);
  if (major !== 1) return major > 1;
  if (minor !== 0) return minor > 0;
  return patch >= 4;
}

// Gated on VERSION >=1.0.4: on older hosts mcp__* allowlist entries are exact-name
// matches that resolve nothing, so spawning MCP servers provides no benefit.
function createMcpSubagentFactories(): ExtensionFactory[] {
  const ns = piCodingAgent as Record<string, unknown>;
  if (!isMcpCompatibleVersion(ns["VERSION"] as string | undefined)) return [];
  const factories: ExtensionFactory[] = [];
  const mcp = ns["createMcpExtension"];
  const toolSearch = ns["createToolSearchExtension"];
  if (typeof mcp === "function") factories.push((mcp as () => ExtensionFactory)());
  if (typeof toolSearch === "function") factories.push((toolSearch as () => ExtensionFactory)());
  return factories;
}

// Emit session_shutdown before dispose so MCP closes server connections (no leaked child processes).
async function disposeSubagentSession(session: AgentSession | undefined): Promise<void> {
  if (!session) return;
  try {
    const runner = (
      session as unknown as {
        extensionRunner?: {
          hasHandlers(n: string): boolean;
          emit(e: { type: string; reason: string }): Promise<unknown>;
        };
      }
    ).extensionRunner;
    if (runner?.hasHandlers("session_shutdown")) {
      await runner.emit({ type: "session_shutdown", reason: "quit" });
    }
  } catch {
    // Shutdown errors must not prevent dispose.
  }
  session.dispose();
}

const READ_ONLY_TOOL_NAMES = new Set(["read", "grep", "find", "ls", "bash"]);
const READ_ONLY_BASH_COMMANDS = new Set(["gh", "git", "pwd"]);
const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  "blame",
  "cat-file",
  "describe",
  "diff",
  "for-each-ref",
  "log",
  "ls-files",
  "ls-tree",
  "merge-base",
  "name-rev",
  "remote",
  "rev-parse",
  "shortlog",
  "show",
  "show-ref",
  "status",
  "whatchanged",
]);
const SAFE_GIT_BRANCH_FLAGS = new Set([
  "-a",
  "--all",
  "-r",
  "--remotes",
  "-v",
  "-vv",
  "--verbose",
  "-l",
  "--list",
  "--show-current",
  "--column",
  "--no-column",
  "--color",
  "--no-color",
  "-i",
  "--ignore-case",
]);
const SAFE_GIT_BRANCH_VALUE_FLAGS = new Set([
  "--contains",
  "--no-contains",
  "--merged",
  "--no-merged",
  "--points-at",
  "--sort",
  "--format",
]);
// Flags that make `git branch` list instead of create a branch from positional args.
const GIT_BRANCH_LISTING_FLAGS = new Set([
  "-a",
  "--all",
  "-r",
  "--remotes",
  "-l",
  "--list",
  "--contains",
  "--no-contains",
  "--merged",
  "--no-merged",
  "--points-at",
]);
const SAFE_GIT_GLOBAL_FLAGS = new Set(["--no-pager", "--no-optional-locks"]);
const SAFE_GIT_CONFIG_OVERRIDES = [
  "core.pager=cat",
  "core.fsmonitor=false",
  "diff.external=",
  "log.showSignature=false",
];
const GIT_SUBCOMMAND_SAFE_FLAGS: Partial<Record<string, string[]>> = {
  blame: ["--no-textconv"],
  diff: ["--no-ext-diff", "--no-textconv"],
  log: ["--no-ext-diff", "--no-textconv"],
  show: ["--no-ext-diff", "--no-textconv"],
  whatchanged: ["--no-ext-diff", "--no-textconv"],
};
const GIT_OPTIONS_REQUIRING_LOCAL_FILE = [
  {
    flag: "--pathspec-from-file",
    blockedPrefixes: ["--pathspec"],
    reason:
      "Diff summarizer bash blocks git --pathspec-from-file because it can read local files outside built-in path guards.",
  },
  {
    flag: "--ignore-revs-file",
    blockedPrefixes: ["--ignore-rev"],
    reason:
      "Diff summarizer bash blocks git --ignore-revs-file because it can read local files outside built-in path guards.",
  },
] as const;
const GIT_SUBCOMMAND_OPTIONS_REQUIRING_LOCAL_FILE: Partial<
  Record<string, Array<{ reason: string; matches: (token: string) => boolean }>>
> = {
  blame: [
    {
      reason:
        "Diff summarizer bash blocks git blame --contents because it can read local files outside built-in path guards.",
      matches: (token) => {
        if (!token.startsWith("--")) return false;
        const option = token.split("=", 1)[0]?.toLowerCase() ?? "";
        return option === "--contents" || option.startsWith("--con");
      },
    },
    {
      reason:
        "Diff summarizer bash blocks git blame -S because it can read local revs files outside built-in path guards.",
      matches: (token) => token === "-S" || (token.startsWith("-S") && token.length > 2),
    },
  ],
  "ls-files": [
    {
      reason:
        "Diff summarizer bash blocks git ls-files -X/--exclude-from because it can read local files outside built-in path guards.",
      matches: (token) => token === "-X" || (token.startsWith("-X") && token.length > 2),
    },
    {
      reason:
        "Diff summarizer bash blocks git ls-files -X/--exclude-from because it can read local files outside built-in path guards.",
      matches: (token) => {
        if (!token.startsWith("--")) return false;
        const option = token.split("=", 1)[0]?.toLowerCase() ?? "";
        return option === "--exclude-from" || option.startsWith("--exclude-f");
      },
    },
  ],
};
const GH_GLOBAL_OPTIONS_WITH_VALUE = new Set([
  "--repo",
  "-R",
  "--hostname",
  "--jq",
  "-q",
  "--template",
]);
const MUTATING_GH_API_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const DiffSummarizerParams = Type.Object({
  diff: Type.Optional(
    Type.String({
      description:
        "Optional diff or patch to summarize. When omitted, the current local git diff, staged diff, and untracked files are collected.",
    }),
  ),
  requirements: Type.Optional(
    Type.String({
      description:
        "Optional requirements, ticket text, or intent to check the diff against. When omitted, intent is inferred with low confidence.",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description:
        "Optional working directory (checkout) to summarize; defaults to the current session directory.",
    }),
  ),
});

type ToolCall = {
  name: string;
  args: unknown;
};

type RunStatus = "running" | "done" | "error" | "aborted";

type RunDetails = {
  status: RunStatus;
  cwd: string;
  turns: number;
  toolCalls: ToolCall[];
  startedAt: number;
  endedAt?: number;
  error?: string;
  modelRef?: string;
  modelName?: string;
  requestedThinkingLevel?: ThinkingLevel;
  effectiveThinkingLevel?: ThinkingLevel;
  thinkingLevelClamped?: boolean;
  thinkingLevelNote?: string;
};

type PiModel = {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  thinkingLevelMap?: ThinkingLevelMap;
};

type CreateAgentSessionOptions = NonNullable<Parameters<typeof createAgentSession>[0]>;
type CreateAgentSessionModel = CreateAgentSessionOptions["model"];

function getModelRuntimeOption(ctx: {
  modelRegistry?: unknown;
}): Pick<CreateAgentSessionOptions, "modelRuntime"> {
  const modelRuntime = (
    ctx.modelRegistry as { runtime?: CreateAgentSessionOptions["modelRuntime"] } | undefined
  )?.runtime;
  return modelRuntime ? { modelRuntime } : {};
}

function normalizeThinkingLevel(value: unknown): ThinkingLevel | undefined {
  return typeof value === "string" && THINKING_LEVELS.includes(value as ThinkingLevel)
    ? (value as ThinkingLevel)
    : undefined;
}

// Keep these local so the extension stays compatible with older pi peer installs that do not export clamp helpers.
function isThinkingLevelSupported(model: PiModel, level: ThinkingLevel): boolean {
  if (!model.reasoning) return level === "off";

  const map = model.thinkingLevelMap;
  if (level === "xhigh" || level === "max") {
    return !!map && Object.prototype.hasOwnProperty.call(map, level) && map[level] != null;
  }
  return map?.[level] !== null;
}

function clampThinkingLevel(model: PiModel, requested: ThinkingLevel): ThinkingLevel {
  if (isThinkingLevelSupported(model, requested)) return requested;

  const requestedIndex = THINKING_LEVELS.indexOf(requested);
  for (let index = requestedIndex + 1; index < THINKING_LEVELS.length; index += 1) {
    const level = THINKING_LEVELS[index];
    if (isThinkingLevelSupported(model, level)) return level;
  }
  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    const level = THINKING_LEVELS[index];
    if (isThinkingLevelSupported(model, level)) return level;
  }

  return "off";
}

function resolveThinkingLevel(
  model: PiModel | undefined,
  requestedThinkingLevel: ThinkingLevel | undefined,
): {
  requested: ThinkingLevel;
  effective: ThinkingLevel;
  clamped: boolean;
  note: string;
} {
  const requested = requestedThinkingLevel ?? (model?.reasoning ? DEFAULT_THINKING_LEVEL : "off");
  const effective = model ? clampThinkingLevel(model, requested) : requested;
  const clamped = effective !== requested;
  if (clamped) {
    return {
      requested,
      effective,
      clamped,
      note: `requested ${requested}; clamped to ${effective}`,
    };
  }
  if (requestedThinkingLevel) {
    return { requested, effective, clamped, note: `requested ${requested}` };
  }
  return {
    requested,
    effective,
    clamped,
    note: model?.reasoning
      ? `defaulted to ${effective}`
      : `defaulted to off for non-reasoning model`,
  };
}

function applyModelAttemptDetails(
  details: RunDetails,
  model: PiModel,
  thinking: ReturnType<typeof resolveThinkingLevel>,
): void {
  details.modelRef = `${model.provider}/${model.id}`;
  details.modelName = model.name;
  details.requestedThinkingLevel = thinking.requested;
  details.effectiveThinkingLevel = thinking.effective;
  details.thinkingLevelClamped = thinking.clamped || undefined;
  details.thinkingLevelNote = thinking.note;
}

function createEmptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function addUsage(total: Usage, usage: Usage): void {
  total.input += usage.input || 0;
  total.output += usage.output || 0;
  total.cacheRead += usage.cacheRead || 0;
  total.cacheWrite += usage.cacheWrite || 0;
  if (usage.cacheWrite1h !== undefined)
    total.cacheWrite1h = (total.cacheWrite1h ?? 0) + usage.cacheWrite1h;
  if (usage.reasoning !== undefined) total.reasoning = (total.reasoning ?? 0) + usage.reasoning;
  total.totalTokens += usage.totalTokens || 0;
  total.cost.input += usage.cost?.input || 0;
  total.cost.output += usage.cost?.output || 0;
  total.cost.cacheRead += usage.cost?.cacheRead || 0;
  total.cost.cacheWrite += usage.cost?.cacheWrite || 0;
  total.cost.total += usage.cost?.total || 0;
}

type AssistantLikeMessage = {
  role?: string;
  content?: unknown;
  stopReason?: unknown;
  errorMessage?: unknown;
  usage?: unknown;
};

function addAssistantMessageUsage(total: Usage, message: unknown): void {
  const assistant = message as AssistantLikeMessage;
  if (assistant?.role !== "assistant" || !assistant.usage || typeof assistant.usage !== "object")
    return;
  addUsage(total, assistant.usage as Usage);
}

function addSessionEventUsage(total: Usage, event: unknown): void {
  const sessionEvent = event as {
    type?: string;
    message?: unknown;
    result?: { usage?: Usage };
  };
  if (sessionEvent?.type === "message_end")
    return void addAssistantMessageUsage(total, sessionEvent.message);
  if (sessionEvent?.type === "compaction_end" && sessionEvent.result?.usage)
    addUsage(total, sessionEvent.result.usage);
}

function inspectFinalAssistant(
  messages: unknown[],
):
  | { ok: true; answer: string; stopReason?: string }
  | { ok: false; reason: string; stopReason?: string; errorMessage?: string } {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as AssistantLikeMessage;
    if (message?.role !== "assistant") continue;
    const stopReason = typeof message.stopReason === "string" ? message.stopReason.trim() : "";
    const errorMessage =
      typeof message.errorMessage === "string" ? message.errorMessage.trim() : "";
    const answer = Array.isArray(message.content)
      ? message.content
          .map((part) =>
            part &&
            typeof part === "object" &&
            (part as { type?: string }).type === "text" &&
            typeof (part as { text?: unknown }).text === "string"
              ? (part as { text: string }).text
              : "",
          )
          .join("")
          .trim()
      : "";
    if (stopReason === "error")
      return {
        ok: false,
        reason: `diff_summarizer subagent error: ${errorMessage || "provider/model error"}`,
        stopReason,
        errorMessage,
      };
    if (stopReason === "aborted")
      return {
        ok: false,
        reason: "diff_summarizer subagent aborted before producing a usable answer",
        stopReason,
      };
    if (answer) return { ok: true, answer, stopReason: stopReason || undefined };
    return {
      ok: false,
      reason: stopReason
        ? `diff_summarizer subagent produced no final assistant text (stopReason: ${stopReason})`
        : "diff_summarizer subagent produced no final assistant text",
      stopReason: stopReason || undefined,
      errorMessage: errorMessage || undefined,
    };
  }
  return {
    ok: false,
    reason: "diff_summarizer subagent produced no assistant message",
  };
}

function classifyRunFailure(
  error: unknown,
  aborted: boolean,
): { status: "aborted" | "error"; message: string; error?: string } {
  const message = aborted ? "Aborted" : error instanceof Error ? error.message : String(error);
  return {
    status: aborted ? "aborted" : "error",
    message,
    error: aborted ? undefined : message,
  };
}

function isInside(parent: string, child: string): boolean {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);
  return (
    childResolved === parentResolved || childResolved.startsWith(`${parentResolved}${path.sep}`)
  );
}

const UNICODE_SPACES_PATTERN = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Mirrors normalizeWindowsShellPath from dist/utils/paths.js. No-op on
 * non-win32 paths.
 */
function normalizeWindowsShellPathLocal(filePath: string): string {
  if (!filePath.startsWith("/") || filePath.startsWith("//") || filePath.includes("\\"))
    return filePath;
  const match = filePath.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
  if (!match) return filePath;
  const suffix = match[2]?.replaceAll("/", "\\");
  return `${match[1].toUpperCase()}:\\${suffix ?? ""}`;
}

/**
 * Mirrors Pi's normalizePath (dist/utils/paths.js). On win32, Git Bash / WSL
 * drive-path normalisation always runs; only tilde expansion is gated by
 * expandTilde.
 */
function normalizePath(
  input: string,
  opts: {
    normalizeUnicodeSpaces?: boolean;
    stripAtPrefix?: boolean;
    expandTilde?: boolean;
  } = {},
): string {
  const { normalizeUnicodeSpaces = false, stripAtPrefix = false, expandTilde = true } = opts;
  let p = input;
  if (normalizeUnicodeSpaces) p = p.replace(UNICODE_SPACES_PATTERN, " ");
  if (stripAtPrefix && p.startsWith("@")) p = p.slice(1);
  if (process.platform === "win32") p = normalizeWindowsShellPathLocal(p);
  if (expandTilde) {
    const home = os.homedir();
    if (p === "~") p = home;
    else if (p.startsWith("~/") || (process.platform === "win32" && p.startsWith("~\\")))
      p = path.join(home, p.slice(2));
  }
  if (/^file:\/\//.test(p)) p = fileURLToPath(p);
  return p;
}

/**
 * Mirrors Pi's resolveToCwd (dist/core/tools/path-utils.js). Exposed via
 * __test__ for parity tests; not imported by other extensions.
 */
function resolveToCwd(rawPath: string, cwd: string): string {
  const normalized = normalizePath(rawPath, {
    normalizeUnicodeSpaces: true,
    stripAtPrefix: true,
  });
  const base = normalizePath(cwd);
  return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(base, normalized);
}

/** Mirrors tryMacOSScreenshotPath from dist/core/tools/path-utils.js */
function tryMacOSScreenshotPathVariant(filePath: string): string {
  return filePath.replace(/ (AM|PM)\./gi, "\u202F$1.");
}
/** Mirrors tryNFDVariant from dist/core/tools/path-utils.js */
function tryNFDPathVariant(filePath: string): string {
  return filePath.normalize("NFD");
}
/** Mirrors tryCurlyQuoteVariant from dist/core/tools/path-utils.js */
function tryCurlyQuotePathVariant(filePath: string): string {
  return filePath.replace(/'/g, "\u2019");
}
/**
 * Returns all read path candidates including Pi's resolveReadPathAsync fallback
 * variants. Used only for the read tool guard; grep/find/ls use resolveToCwd only.
 */
function getReadPathCandidates(resolved: string): string[] {
  const nfd = tryNFDPathVariant(resolved);
  return [
    resolved,
    tryMacOSScreenshotPathVariant(resolved),
    nfd,
    tryCurlyQuotePathVariant(resolved),
    tryCurlyQuotePathVariant(nfd),
  ];
}

async function assertToolPathInsideCwd(
  cwd: string,
  rawPath: unknown,
  toolName: string,
): Promise<string | undefined> {
  if (rawPath !== undefined && typeof rawPath !== "string")
    return `${toolName} path must be a string.`;
  // A path is allowed if it resolves inside EITHER the realpath'd root (root) OR
  // the lexical cwd (lexicalCwd). This handles missing files in symlinked workspaces
  // where realpath fails and the lexical fallback starts with the alias prefix.
  const root = await fs.realpath(cwd).catch(() => path.resolve(cwd));
  const lexicalCwd = path.resolve(cwd);
  // For the read tool, also check Pi's resolveReadPathAsync fallback variants so
  // a missing file whose variant resolves outside is not silently allowed.
  try {
    const piResolved = resolveToCwd(typeof rawPath === "string" ? rawPath : ".", cwd);
    const candidates = toolName === "read" ? getReadPathCandidates(piResolved) : [piResolved];
    // Deliberate policy: all candidates are checked regardless of existence (not
    // Pi's existence-ordered selection) so the guard cannot be raced by creating
    // a variant between the hook and the read. Trade-off: a read is blocked when
    // an escaping variant symlink sits next to a safe primary file.
    for (const candidate of candidates) {
      const candidateRealPath = await fs.realpath(candidate).catch(() => candidate);
      if (!isInside(root, candidateRealPath) && !isInside(lexicalCwd, candidateRealPath))
        return `${toolName} is limited to the local checkout: ${candidateRealPath}`;
    }
  } catch {
    return `${toolName} path could not be resolved safely.`;
  }
  return undefined;
}

function getUnsafePathPatternReason(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return `${label} must be a string.`;
  if (path.isAbsolute(value)) return `${label} must be relative to the local checkout.`;
  if (/(^|[/\\])\.\.(?:[/\\]|$)/.test(value))
    return `${label} must not traverse outside the local checkout.`;
  return undefined;
}

function stripTokenQuotes(token: string): string {
  if (
    (token.startsWith("'") && token.endsWith("'")) ||
    (token.startsWith('"') && token.endsWith('"'))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

type ShellTokenizeResult = {
  tokens: string[];
  reason?: string;
};

function tokenizeShellCommand(command: string): ShellTokenizeResult {
  const tokens: string[] = [];
  let token = "";
  let tokenStarted = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  const pushToken = () => {
    if (!tokenStarted) return;
    tokens.push(token);
    token = "";
    tokenStarted = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1] ?? "";

    if (inSingleQuote) {
      if (char === "'") {
        inSingleQuote = false;
        continue;
      }
      token += char;
      tokenStarted = true;
      continue;
    }

    if (char === "\\") {
      return {
        tokens,
        reason:
          "Diff summarizer bash blocks shell escape sequences; pass plain git, gh, or pwd arguments without backslashes.",
      };
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
        continue;
      }
      if (char === "`" || char === "$") {
        return {
          tokens,
          reason:
            char === "`" || next === "("
              ? "Diff summarizer bash blocks command substitution."
              : "Diff summarizer bash blocks shell expansion in double quotes.",
        };
      }
      token += char;
      tokenStarted = true;
      continue;
    }

    if (char === "\n" || char === "\r") {
      return {
        tokens,
        reason:
          "Diff summarizer bash allows one git, gh, or pwd invocation only; pipelines, shell control operators, and multiple commands are blocked.",
      };
    }
    if (/\s/.test(char)) {
      pushToken();
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      tokenStarted = true;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      tokenStarted = true;
      continue;
    }
    if (char === "`")
      return {
        tokens,
        reason: "Diff summarizer bash blocks command substitution.",
      };
    if (char === "$") {
      return {
        tokens,
        reason:
          next === "'" || next === '"'
            ? "Diff summarizer bash blocks ANSI-C and localized shell quotes."
            : next === "("
              ? "Diff summarizer bash blocks command substitution."
              : "Diff summarizer bash blocks shell expansion.",
      };
    }
    if (/[;&|()]/.test(char)) {
      return {
        tokens,
        reason:
          "Diff summarizer bash allows one git, gh, or pwd invocation only; pipelines, shell control operators, and multiple commands are blocked.",
      };
    }
    if (char === ">" || char === "<") {
      return {
        tokens,
        reason: "Diff summarizer bash blocks shell redirection to keep inspection read-only.",
      };
    }
    if (char === "{" || char === "}")
      return {
        tokens,
        reason: "Diff summarizer bash blocks shell brace expansion.",
      };
    if (char === "*" || char === "?" || char === "[" || char === "]") {
      return {
        tokens,
        reason: "Diff summarizer bash blocks shell glob expansion.",
      };
    }
    if (char === "~" && !tokenStarted)
      return {
        tokens,
        reason: "Diff summarizer bash blocks shell home-directory expansion.",
      };

    token += char;
    tokenStarted = true;
  }

  if (inSingleQuote || inDoubleQuote)
    return {
      tokens,
      reason: "Diff summarizer bash blocks unterminated or malformed shell quoting.",
    };
  pushToken();
  return { tokens };
}

function tokenizeSegment(segment: string): string[] {
  return tokenizeShellCommand(segment).tokens;
}

function shellQuoteToken(token: string): string {
  return `'${token.replace(/'/g, `'"'"'`)}'`;
}

function getExecutableName(token: string): string {
  return path.basename(token).toLowerCase();
}

function getShellSyntaxReason(command: string): string | undefined {
  return tokenizeShellCommand(command).reason;
}

function getUnsafeGitTokenPathReason(token: string): string | undefined {
  const valueParts = [token];
  const equalsIndex = token.indexOf("=");
  if (equalsIndex >= 0 && equalsIndex < token.length - 1)
    valueParts.push(token.slice(equalsIndex + 1));
  for (const value of valueParts) {
    const normalized = value.startsWith("@") ? value.slice(1) : value;
    if (normalized === "~" || normalized.startsWith("~/") || /^~[^/\\]*/.test(normalized)) {
      return "Diff summarizer bash git arguments must not use home-directory paths; use built-in read/grep/find/ls for local files.";
    }
    if (path.isAbsolute(normalized)) {
      return "Diff summarizer bash git arguments must not use absolute filesystem paths; use built-in read/grep/find/ls for local files.";
    }
    if (/(^|[/\\])\.\.(?:[/\\]|$)/.test(normalized)) {
      return "Diff summarizer bash git arguments must not traverse outside the local checkout.";
    }
  }
  return undefined;
}

function getBlockedPwdReason(tokens: string[]): string | undefined {
  const args = tokens.slice(1);
  if (args.length === 0) return undefined;
  if (args.length === 1 && (args[0] === "-P" || args[0] === "-L")) return undefined;
  return "Diff summarizer bash allows pwd only with no arguments or -P/-L.";
}

function getGitSubcommand(tokens: string[]): {
  subcommand?: string;
  index: number;
  reason?: string;
} {
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token.startsWith("-")) break;
    if (token === "--git-dir" || token.startsWith("--git-dir=")) {
      return {
        index,
        reason:
          "Diff summarizer bash blocks git --git-dir because it can inspect or mutate outside the checkout.",
      };
    }
    if (token === "--work-tree" || token.startsWith("--work-tree=")) {
      return {
        index,
        reason:
          "Diff summarizer bash blocks git --work-tree because it can inspect or mutate outside the checkout.",
      };
    }
    if (token === "-C") {
      const gitCwd = tokens[index + 1];
      if (gitCwd !== ".")
        return {
          index,
          reason: "Diff summarizer bash only allows git -C .; run git from the local checkout.",
        };
      index += 2;
      continue;
    }
    if (token.startsWith("-C")) {
      if (token !== "-C.")
        return {
          index,
          reason: "Diff summarizer bash only allows git -C .; run git from the local checkout.",
        };
      index += 1;
      continue;
    }
    if (token === "--paginate" || token === "-p") {
      return {
        index,
        reason:
          "Diff summarizer bash blocks git pagination because pagers can execute local utilities.",
      };
    }
    if (SAFE_GIT_GLOBAL_FLAGS.has(token)) {
      index += 1;
      continue;
    }
    return {
      index,
      reason: `Diff summarizer bash blocks git global option ${token}; use direct read-only git inspection commands from the checkout.`,
    };
  }
  return { subcommand: tokens[index]?.toLowerCase(), index };
}

function isSafeGitBranchCommand(tokens: string[], subcommandIndex: number): boolean {
  const args = tokens.slice(subcommandIndex + 1);
  if (args.length === 0) return true;
  let hasListingMode = false;
  let hasPositional = false;
  for (const arg of args) {
    if (!arg.startsWith("-")) {
      hasPositional = true;
      continue;
    }
    const name = arg.split("=", 1)[0] ?? "";
    const hasValue = arg.includes("=");
    if (!hasValue && SAFE_GIT_BRANCH_FLAGS.has(arg)) {
      if (GIT_BRANCH_LISTING_FLAGS.has(arg)) hasListingMode = true;
      continue;
    }
    if (SAFE_GIT_BRANCH_VALUE_FLAGS.has(name)) {
      if (GIT_BRANCH_LISTING_FLAGS.has(name)) hasListingMode = true;
      continue;
    }
    return false;
  }
  if (args.includes("--show-current")) return !hasPositional;
  return !hasPositional || hasListingMode;
}

function isSafeGitRemoteCommand(tokens: string[], subcommandIndex: number): boolean {
  const args = tokens.slice(subcommandIndex + 1);
  if (args.length === 0) return true;
  if (args.length === 1 && (args[0] === "-v" || args[0] === "--verbose")) return true;
  const remoteAction = args.find((arg) => !arg.startsWith("-"));
  if (remoteAction !== "get-url") return false;
  return true;
}

function isBlockedGitLocalFileOption(
  token: string,
  flag: string,
  blockedPrefixes: readonly string[],
): boolean {
  if (!token.startsWith("--")) return false;
  const option = token.split("=", 1)[0]?.toLowerCase() ?? "";
  if (option === flag) return true;
  return blockedPrefixes.some((prefix) => option.startsWith(prefix));
}

function getUnsafeGitArgumentReason(
  tokens: string[],
  parsed: { subcommand?: string; index: number },
): string | undefined {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lowerToken = token.toLowerCase();
    if (token === "--no-index" || token.startsWith("--no-index=")) {
      return "Diff summarizer bash blocks git --no-index because it can inspect arbitrary filesystem paths outside the checkout.";
    }
    if (token === "--paginate" || token.startsWith("--paginate=")) {
      return "Diff summarizer bash blocks git --paginate because pagers can execute local utilities.";
    }
    if (token === "--open-files-in-pager" || token.startsWith("--open-files-in-pager=")) {
      return "Diff summarizer bash blocks git --open-files-in-pager because it can execute local utilities.";
    }
    if (token === "-O" || token.startsWith("-O")) {
      return "Diff summarizer bash blocks git -O because it can execute local utilities for some subcommands.";
    }
    if (token === "--ext-diff" || token.startsWith("--ext-diff=")) {
      return "Diff summarizer bash blocks git --ext-diff because it can execute external diff helpers.";
    }
    if (token === "--textconv" || token.startsWith("--textconv=")) {
      return "Diff summarizer bash blocks git --textconv because it can execute external text conversion filters.";
    }
    if (token === "--filters" || token.startsWith("--filters=")) {
      return "Diff summarizer bash blocks git --filters because it can execute clean/smudge filters from local config.";
    }
    if (token === "--show-signature" || lowerToken.startsWith("--show-signat")) {
      return "Diff summarizer bash blocks git signature verification flags because they can execute configured GPG helpers.";
    }
    if (token === "--help" || token.startsWith("--help=")) {
      return "Diff summarizer bash blocks git help output because it can execute configured help, man, or browser helpers.";
    }
    if (token.includes("%G") || /%\((?:[^)]*signature[^)]*)\)/i.test(token)) {
      return "Diff summarizer bash blocks git signature format atoms because they can execute configured GPG helpers.";
    }
    if (token === "--output" || token.startsWith("--output=")) {
      return "Diff summarizer bash blocks git output-writing flags.";
    }
    for (const { flag, blockedPrefixes, reason } of GIT_OPTIONS_REQUIRING_LOCAL_FILE) {
      if (isBlockedGitLocalFileOption(token, flag, blockedPrefixes)) return reason;
    }
    if (index > parsed.index) {
      for (const option of GIT_SUBCOMMAND_OPTIONS_REQUIRING_LOCAL_FILE[parsed.subcommand ?? ""] ??
        []) {
        if (option.matches(token)) return option.reason;
      }
    }
    const pathReason = getUnsafeGitTokenPathReason(token);
    if (pathReason) return pathReason;
  }
  return undefined;
}

function buildSafeGitCommand(tokens: string[]): string {
  const parsed = getGitSubcommand(tokens);
  const prefix = [
    "git",
    "--no-pager",
    "--no-optional-locks",
    ...SAFE_GIT_CONFIG_OVERRIDES.flatMap((value) => ["-c", value]),
  ];
  const subcommand = parsed.subcommand;
  if (!subcommand) return prefix.map(shellQuoteToken).join(" ");
  const args = tokens.slice(parsed.index + 1);
  const injectedFlags = (GIT_SUBCOMMAND_SAFE_FLAGS[subcommand] ?? []).filter(
    (flag) => !args.includes(flag),
  );
  return [...prefix, subcommand, ...injectedFlags, ...args].map(shellQuoteToken).join(" ");
}

function getBlockedGitReason(tokens: string[]): string | undefined {
  if (getExecutableName(tokens[0] ?? "") !== "git") return undefined;
  const parsed = getGitSubcommand(tokens);
  if (parsed.reason) return parsed.reason;
  if (parsed.subcommand === "help") {
    return "Diff summarizer bash blocks git help because it can execute configured help, man, or browser helpers.";
  }
  const argumentReason = getUnsafeGitArgumentReason(tokens, parsed);
  if (argumentReason) return argumentReason;
  if (!parsed.subcommand) return undefined;
  if (parsed.subcommand === "branch") {
    if (!isSafeGitBranchCommand(tokens, parsed.index)) {
      return "Diff summarizer bash allows git branch only for read-only listing/show-current/contains/merged queries.";
    }
    return undefined;
  }
  if (parsed.subcommand === "remote") {
    if (!isSafeGitRemoteCommand(tokens, parsed.index)) {
      return "Diff summarizer bash allows git remote only for read-only list or get-url queries.";
    }
    return undefined;
  }
  if (!READ_ONLY_GIT_SUBCOMMANDS.has(parsed.subcommand)) {
    return `Diff summarizer bash blocks git ${parsed.subcommand}; only known read-only git subcommands are allowed.`;
  }
  return undefined;
}

function getGhCommand(tokens: string[]): {
  command?: string;
  subcommand?: string;
} {
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token.startsWith("-")) break;
    if (GH_GLOBAL_OPTIONS_WITH_VALUE.has(token)) {
      index += 2;
      continue;
    }
    index += 1;
  }
  return {
    command: tokens[index]?.toLowerCase(),
    subcommand: tokens[index + 1]?.toLowerCase(),
  };
}

function normalizeFlagValue(value: string | undefined): string | undefined {
  return value ? stripTokenQuotes(value).trim() : undefined;
}

function getBlockedGhApiReason(tokens: string[]): string | undefined {
  const parsed = getGhCommand(tokens);
  if (parsed.command !== "api") return undefined;
  if (tokens.find((token) => token.toLowerCase() === "graphql")) {
    return "Diff summarizer bash blocks gh api graphql because it uses POST/body fields.";
  }
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lowerToken = token.toLowerCase();
    if (
      token === "-f" ||
      token === "-F" ||
      token === "--field" ||
      token === "--raw-field" ||
      token === "--input" ||
      lowerToken.startsWith("-f") ||
      lowerToken.startsWith("--field=") ||
      lowerToken.startsWith("--raw-field=") ||
      lowerToken.startsWith("--input=")
    ) {
      return "Diff summarizer bash allows read-only gh api calls only; request fields and input files are blocked.";
    }
    if (token === "--cache" || lowerToken.startsWith("--cache=")) {
      return "Diff summarizer bash blocks gh api --cache because it writes local cache files.";
    }

    let method: string | undefined;
    if (lowerToken === "-x" || lowerToken === "--method")
      method = normalizeFlagValue(tokens[index + 1]);
    else if (lowerToken.startsWith("-x") && token.length > 2)
      method = normalizeFlagValue(token.slice(2).replace(/^=/, ""));
    else if (lowerToken.startsWith("--method="))
      method = normalizeFlagValue(token.slice("--method=".length));
    if (method && MUTATING_GH_API_METHODS.has(method.toUpperCase())) {
      return "Diff summarizer bash allows read-only gh api calls only; mutating methods are blocked.";
    }
  }
  return undefined;
}

function isReadOnlyGhCommand(command: string | undefined, subcommand: string | undefined): boolean {
  if (!command) return true;
  if (command === "api") return true;
  if (command === "search") return true;
  if (command === "repo") return subcommand === "view" || subcommand === "list";
  if (command === "pr")
    return (
      subcommand === "view" ||
      subcommand === "list" ||
      subcommand === "diff" ||
      subcommand === "status" ||
      subcommand === "checks"
    );
  if (command === "issue")
    return subcommand === "view" || subcommand === "list" || subcommand === "status";
  if (command === "release") return subcommand === "view" || subcommand === "list";
  if (command === "run") return subcommand === "view" || subcommand === "list";
  if (command === "workflow") return subcommand === "view" || subcommand === "list";
  if (command === "label") return subcommand === "list";
  if (command === "milestone") return subcommand === "list";
  return false;
}

function getBlockedGhReason(command: string): string | undefined {
  const tokens = tokenizeSegment(command);
  if (getExecutableName(tokens[0] ?? "") !== "gh") return undefined;
  if (/\bgh\s+auth\s+(?:login|logout|refresh|setup-git|token)\b/i.test(command)) {
    return "Diff summarizer bash blocks gh auth commands and token inspection.";
  }
  if (
    tokens.some((token) => {
      const lowerToken = token.toLowerCase();
      return (
        lowerToken === "--web" ||
        lowerToken === "-w" ||
        lowerToken.startsWith("--web=") ||
        lowerToken.startsWith("-w=")
      );
    })
  ) {
    return "Diff summarizer bash blocks gh --web because it can launch external browser helpers.";
  }
  const apiReason = getBlockedGhApiReason(tokens);
  if (apiReason) return apiReason;
  if (
    /\bgh\s+(?:repo\s+(?:archive|clone|create|delete|edit|fork|rename|sync)|pr\s+(?:checkout|close|comment|create|edit|lock|merge|ready|reopen|review|unlock)|issue\s+(?:close|comment|create|delete|edit|lock|reopen|transfer|unlock)|release\s+(?:create|delete|edit|upload)|workflow\s+run|run\s+(?:cancel|delete|rerun)|gist\s+(?:create|delete|edit))\b/i.test(
      command,
    )
  ) {
    return "Diff summarizer bash blocks mutating gh commands.";
  }
  const parsed = getGhCommand(tokens);
  if (!isReadOnlyGhCommand(parsed.command, parsed.subcommand)) {
    return `Diff summarizer bash blocks gh ${[parsed.command, parsed.subcommand].filter(Boolean).join(" ")}; only known read-only gh commands are allowed.`;
  }
  return undefined;
}

function getBlockedBashReason(command: string): string | undefined {
  const trimmed = command.trim();
  if (!trimmed) return "Diff summarizer bash requires a non-empty command.";
  if (/`|\$\(/.test(trimmed)) return "Diff summarizer bash blocks command substitution.";
  const syntaxReason = getShellSyntaxReason(trimmed);
  if (syntaxReason) return syntaxReason;

  const tokens = tokenizeSegment(trimmed);
  if (tokens.length === 0) return "Diff summarizer bash requires a non-empty command.";
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]))
    return "Diff summarizer bash blocks inline environment assignment.";
  if (/[\\/]/.test(tokens[0])) {
    return "Diff summarizer bash requires direct git, gh, or pwd invocation without path-qualified executables.";
  }

  const executable = getExecutableName(tokens[0]);
  if (!READ_ONLY_BASH_COMMANDS.has(executable)) {
    return `Diff summarizer bash blocks ${executable || "this command"}; use built-in read/grep/find/ls for local files or read-only git/gh inspection commands.`;
  }
  if (executable === "pwd") return getBlockedPwdReason(tokens);
  if (executable === "git") return getBlockedGitReason(tokens);
  if (executable === "gh") return getBlockedGhReason(trimmed);
  return undefined;
}

function createDiffSummarizerRuntimeGuardExtension(options: {
  cwd: string;
  maxTurns: number;
}): ExtensionFactory {
  return (pi) => {
    let currentTurn = 0;

    pi.on("turn_start", async (event) => {
      currentTurn = event.turnIndex;
    });

    pi.on("tool_call", async (event) => {
      if (!READ_ONLY_TOOL_NAMES.has(event.toolName) && !isSubagentMcpTool(event.toolName)) {
        return {
          block: true,
          reason: `diff_summarizer exposes read-only built-in tools and MCP tools; ${event.toolName} is not allowed.`,
        };
      }

      if (currentTurn >= options.maxTurns - 1) {
        return {
          block: true,
          reason: `Tool use is disabled on final diff_summarizer turn ${options.maxTurns}/${options.maxTurns}. Answer now with the evidence already gathered.`,
        };
      }

      if (event.toolName === "read") {
        const reason = await assertToolPathInsideCwd(
          options.cwd,
          (event.input as { path?: unknown }).path,
          "read",
        );
        if (reason) return { block: true, reason };
      }

      if (event.toolName === "grep" || event.toolName === "find" || event.toolName === "ls") {
        const reason = await assertToolPathInsideCwd(
          options.cwd,
          (event.input as { path?: unknown }).path,
          event.toolName,
        );
        if (reason) return { block: true, reason };
        if (event.toolName === "grep") {
          const globReason = getUnsafePathPatternReason(
            (event.input as { glob?: unknown }).glob,
            "grep glob",
          );
          if (globReason) return { block: true, reason: globReason };
        }
        if (event.toolName === "find") {
          const patternReason = getUnsafePathPatternReason(
            (event.input as { pattern?: unknown }).pattern,
            "find pattern",
          );
          if (patternReason) return { block: true, reason: patternReason };
        }
      }

      if (event.toolName === "bash") {
        const input = event.input as { command?: unknown; timeout?: unknown };
        if (typeof input.timeout !== "number") input.timeout = DEFAULT_BASH_TIMEOUT_SECONDS;
        const command = typeof input.command === "string" ? input.command : "";
        const reason = getBlockedBashReason(command);
        if (reason) return { block: true, reason };
        const tokens = tokenizeSegment(command.trim());
        if (getExecutableName(tokens[0] ?? "") === "git")
          input.command = buildSafeGitCommand(tokens);
      }

      return undefined;
    });

    pi.on("tool_result", async (event) => ({
      content: [
        ...(event.content ?? []),
        {
          type: "text",
          text: `\n\n[diff_summarizer turn budget] turn ${Math.min(currentTurn + 1, options.maxTurns)}/${options.maxTurns}`,
        },
      ],
    }));
  };
}

function buildSystemPrompt(options: {
  cwd: string;
  maxTurns: number;
  maxRunSeconds: number;
}): string {
  return `You are the diff summarizer, an isolated read-only agent running inside the diff-summarizer package. Your job is to produce a terse, high-signal summary of an existing change set for the caller and reviewers.\n\nWorking directory: ${options.cwd}\nTurn budget: ${options.maxTurns} turns total, including your final answer.\nWall-clock budget: ${options.maxRunSeconds} seconds.\n\nYou are read-only. Do not modify files, install dependencies, or use network access. Available tools are read, grep, find, ls, and bash. Use the built-in read, grep, find, and ls tools for local file inspection. Use bash only for a single read-only git, gh, or pwd invocation. A runtime guard blocks write/edit tools, shell pipelines/control operators, redirection, mutating git/gh commands, npm/publish commands, path traversal outside the checkout, and other filesystem mutation. Configured MCP tools are also available and run without confirmation; use them only for read-only research or inspection within your assignment and avoid mutations; if a tool's side effects are uncertain, do not call it. MCP access requires host Pi >=1.0.4; on older hosts MCP tools are absent with no error.\n\n## Diff collection\n\nIf the caller provides an explicit diff, use it. Otherwise collect the local diff:\n\n1. Collect \`git diff --no-color\`, \`git diff --cached --no-color\`, and \`git status --short --untracked-files=all\`.\n2. If relevant untracked new files appear, inspect those files as needed so the summary covers them.\n3. If diff collection fails, say so in the final result and state what diff or instructions you need.\n\n## Scope and stop rules\n\n- Stay limited to the supplied diff or current local change set.\n- Focus on user-visible behavior, requirements fit, and review risk; do not drift into implementation planning, architecture redesign, or exhaustive file narration.\n- Stop once the main behavior changes, risky areas, and requirement status are covered.\n\n## Analysis\n\nFocus on behavior and risk, not file-by-file narration.\n\nIdentify:\n\n- Primary components touched.\n- User-visible or developer-visible behavior changes.\n- Configuration, data format, public API, dependency, or installer changes.\n- Security-sensitive or failure-prone areas.\n- Tests added/changed and whether they cover the risky logic.\n- Explicit requirements satisfied, violated, or unclear. If no requirements were supplied, label inferred intent as low confidence.\n\nReport blockers in your final result instead of asking questions; you cannot ask follow-up questions. A missing requirement or inaccessible diff that blocks the summary is such a blocker.\n\n## Output format\n\nKeep it short:\n\n- Diff source: \`git diff + git diff --cached\` or caller-provided.\n- Files touched: one line with directories and key files.\n- What changed: 2–6 bullets.\n- Risky areas touched: 2–8 bullets, each tied to evidence.\n- Requirements:\n  - Appears satisfied: ...\n  - Appears violated: ...\n  - Unclear from diff: ...`;
}

function buildUserPrompt(input: { diff?: string; requirements?: string }, cwd: string): string {
  return `Local checkout: ${cwd}\n\nCaller-provided diff:\n${input.diff?.trim() ? input.diff : "(not provided; collect the local diff as instructed)"}\n\nOptional requirements:\n${input.requirements?.trim() ? input.requirements : "(not provided; label inferred intent as low confidence)"}\n\nSummarize the change set using the required output format. Do not modify anything.`;
}

function formatToolCall(call: ToolCall): string {
  const args =
    call.args && typeof call.args === "object" ? (call.args as Record<string, unknown>) : {};
  if (call.name === "read") {
    const readPath = typeof args.path === "string" ? args.path : "";
    const offset = typeof args.offset === "number" ? args.offset : undefined;
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    const range =
      offset || limit ? `:${offset ?? 1}${limit ? `-${(offset ?? 1) + limit - 1}` : ""}` : "";
    return `read ${readPath}${range}`.trim();
  }
  if (call.name === "grep") {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    const grepPath = typeof args.path === "string" ? args.path : ".";
    return `grep ${pattern.slice(0, 50)} ${grepPath}`.trim();
  }
  if (call.name === "find") {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    const findPath = typeof args.path === "string" ? args.path : ".";
    return `find ${pattern.slice(0, 50)} ${findPath}`.trim();
  }
  if (call.name === "ls") return `ls ${typeof args.path === "string" ? args.path : "."}`.trim();
  if (call.name === "bash") {
    const command = typeof args.command === "string" ? args.command : "";
    return `bash ${command.slice(0, 120)}`.trim();
  }
  return call.name;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round((seconds % 60) * 10) / 10;
  return `${minutes}m ${remainingSeconds}s`;
}

function appendRunDetails(report: string, details: RunDetails): string {
  const trimmed = report.trim();
  const toolSummary =
    details.toolCalls.length > 0 ? details.toolCalls.map(formatToolCall).join("; ") : "none";
  const duration = formatDuration((details.endedAt ?? Date.now()) - details.startedAt);
  const modelSummary = details.modelRef ? `model ${details.modelRef}` : "model unknown";
  const thinkingSummary = details.effectiveThinkingLevel
    ? `thinking ${details.effectiveThinkingLevel}${details.thinkingLevelNote ? ` (${details.thinkingLevelNote})` : ""}`
    : "thinking unknown";
  const suffix = `\n\n---\nRun details: ${modelSummary}; ${thinkingSummary}; ${details.turns} turn(s); ${details.toolCalls.length} tool call(s); duration ${duration}; cwd ${details.cwd}; tools ${toolSummary}.`;
  if (!trimmed)
    return `- Diff source: unknown\n- What changed: no summary was produced.\n- Requirements:\n  - Unclear from diff: the isolated diff_summarizer session returned no assistant text.${suffix}`;
  return `${trimmed}${suffix}`;
}

export const __test__ = {
  SUBAGENT_MCP_TOOLS,
  isMcpCompatibleVersion,
  resolveSubagentProjectTrusted,
  createMcpSubagentFactories,
  disposeSubagentSession,
  createDiffSummarizerRuntimeGuardExtension,
  assertToolPathInsideCwd,
  resolveToCwd,
  buildSafeGitCommand,
  getBlockedBashReason,
  buildSystemPrompt,
  buildUserPrompt,
  normalizeThinkingLevel,
  resolveThinkingLevel,
  createEmptyUsage,
  addAssistantMessageUsage,
  addSessionEventUsage,
  inspectFinalAssistant,
  classifyRunFailure,
  appendRunDetails,
};

async function resolveRunCwd(baseCwd: string, requested: unknown): Promise<string> {
  const base = path.resolve(baseCwd);
  if (requested === undefined) return base;
  if (typeof requested !== "string" || !requested.trim())
    throw new Error("Invalid parameters: expected cwd to be a non-empty string when provided.");
  const resolved = resolveToCwd(requested, base);
  const stat = await fs.stat(resolved).catch(() => undefined);
  if (!stat?.isDirectory())
    throw new Error(`Invalid parameters: cwd is not an existing directory: ${resolved}`);
  return resolved;
}

export default function diffSummarizerExtension(pi: ExtensionAPI) {
  pi.on("tool_result", async (event) => {
    if (event.toolName !== "diff_summarizer") return undefined;
    const details = event.details as RunDetails | undefined;
    if (details?.status !== "error") return undefined;
    return { isError: true };
  });

  pi.registerTool({
    name: "diff_summarizer",
    label: "Diff summarizer",
    description:
      "Isolated read-only agent with read, grep, find, ls, guarded read-only bash, and configured MCP tools that summarizes a diff or the current local change set and highlights review risk hotspots.",
    promptSnippet:
      "Summarize a caller-provided diff or the current local git changes with an isolated read-only child agent; returns a terse summary of changes, risky areas, and requirement status with run details.",
    promptGuidelines: [
      "Use diff_summarizer to get a terse, high-signal summary of a change set before review; optionally pass a diff and the requirements to check against.",
      "diff_summarizer is read-only: it cannot edit files. Without a diff it collects git diff, git diff --cached, and git status in the checkout.",
    ],
    parameters: DiffSummarizerParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const cwd = await resolveRunCwd(ctx.cwd, params.cwd);

      const input = {
        diff: typeof params.diff === "string" ? params.diff : undefined,
        requirements: typeof params.requirements === "string" ? params.requirements : undefined,
      };
      const details: RunDetails = {
        status: "running",
        cwd,
        turns: 0,
        toolCalls: [],
        startedAt: Date.now(),
      };

      let lastContent = "(summarizing diff...)";
      let session: AgentSession | undefined;
      let unsubscribe: (() => void) | undefined;
      let runTimeout: NodeJS.Timeout | undefined;
      let abortListenerAdded = false;
      let callerAborted = Boolean(signal?.aborted);
      const usage = createEmptyUsage();

      const emit = () => {
        onUpdate?.({ content: [{ type: "text", text: lastContent }], details });
      };

      const abortForCleanup = () => {
        void session?.abort();
      };

      const abortFromCaller = () => {
        callerAborted = true;
        details.status = "aborted";
        details.endedAt = Date.now();
        lastContent = "Aborted";
        emit();
        abortForCleanup();
      };

      if (signal?.aborted) abortFromCaller();
      if (signal && !signal.aborted) {
        signal.addEventListener("abort", abortFromCaller);
        abortListenerAdded = true;
      }

      try {
        emit();

        const model = ctx.model as PiModel | undefined;
        if (!model)
          throw new Error(
            "No active session model is available. Select a model before using diff_summarizer.",
          );

        const projectTrusted = resolveSubagentProjectTrusted(ctx, cwd);
        const isolatedSettingsManager = SettingsManager.inMemory({}, { projectTrusted });
        const resourceLoader = new DefaultResourceLoader({
          cwd,
          agentDir: getAgentDir(),
          settingsManager: isolatedSettingsManager,
          noExtensions: true,
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          extensionFactories: [
            createDiffSummarizerRuntimeGuardExtension({
              cwd,
              maxTurns: MAX_TURNS,
            }),
            ...createMcpSubagentFactories(),
          ],
          systemPromptOverride: () =>
            buildSystemPrompt({
              cwd,
              maxTurns: MAX_TURNS,
              maxRunSeconds: Math.round(MAX_RUN_MS / 1000),
            }),
          appendSystemPromptOverride: () => [],
          skillsOverride: () => ({ skills: [], diagnostics: [] }),
          promptsOverride: () => ({ prompts: [], diagnostics: [] }),
          themesOverride: () => ({ themes: [], diagnostics: [] }),
          agentsFilesOverride: () => ({ agentsFiles: [] }),
        });

        await resourceLoader.reload();

        const thinking = resolveThinkingLevel(model, DEFAULT_THINKING_LEVEL);
        applyModelAttemptDetails(details, model, thinking);

        const created = await createAgentSession({
          cwd,
          ...getModelRuntimeOption(ctx),
          resourceLoader,
          settingsManager: isolatedSettingsManager,
          sessionManager: SessionManager.inMemory(cwd),
          model: model as CreateAgentSessionModel,
          thinkingLevel: thinking.effective,
          tools: ["read", "grep", "find", "ls", "bash", ...SUBAGENT_MCP_TOOLS],
        });
        session = created.session;
        // Connect extensions (MCP servers) before prompting. Feature-detected: Pi >=0.99.0.
        await (created.session as any).bindExtensions?.({ mode: "json" });
        unsubscribe = session.subscribe((event) => {
          addSessionEventUsage(usage, event);
          switch (event.type) {
            case "turn_end":
              details.turns += 1;
              emit();
              break;
            case "tool_execution_start":
              details.toolCalls.push({
                name: event.toolName,
                args: event.args,
              });
              if (details.toolCalls.length > MAX_TOOL_CALLS_TO_KEEP) {
                details.toolCalls.splice(0, details.toolCalls.length - MAX_TOOL_CALLS_TO_KEEP);
              }
              emit();
              break;
            case "message_update":
              if (event.assistantMessageEvent?.type === "text_delta") {
                lastContent += event.assistantMessageEvent.delta ?? "";
                emit();
              }
              break;
          }
        });

        if (!callerAborted) {
          const promptPromise = session.prompt(buildUserPrompt(input, cwd), {
            expandPromptTemplates: false,
          });
          const timeoutPromise = new Promise<never>((_resolve, reject) => {
            runTimeout = setTimeout(() => {
              abortForCleanup();
              reject(
                new Error(
                  `diff_summarizer timed out after ${Math.round(MAX_RUN_MS / 1000)} seconds.`,
                ),
              );
            }, MAX_RUN_MS);
          });
          await Promise.race([promptPromise, timeoutPromise]);
        }

        const outcome = inspectFinalAssistant(session.state.messages);
        if (outcome.ok) {
          lastContent = outcome.answer;
          details.status = "done";
        } else if (callerAborted) {
          lastContent = "Aborted";
          details.status = "aborted";
        } else {
          throw new Error(outcome.reason);
        }
        details.endedAt = Date.now();
        const report = appendRunDetails(lastContent, details);
        lastContent = report;
        emit();
        return { content: [{ type: "text", text: report }], details, usage };
      } catch (error) {
        const failure = classifyRunFailure(error, callerAborted);
        details.status = failure.status;
        details.error = failure.error;
        details.endedAt = Date.now();
        lastContent = appendRunDetails(
          `- Diff source: unknown\n- What changed: diff summary failed.\n- Requirements:\n  - Unclear from diff: diff_summarizer execution failed. Evidence: ${failure.message}.`,
          details,
        );
        emit();
        return {
          content: [{ type: "text", text: lastContent }],
          details,
          usage,
        };
      } finally {
        if (runTimeout) clearTimeout(runTimeout);
        if (signal && abortListenerAdded) signal.removeEventListener("abort", abortFromCaller);
        unsubscribe?.();
        await disposeSubagentSession(session);
      }
    },
  });
}
