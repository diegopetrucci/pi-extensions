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
const MAX_TURNS = 40;
const MAX_RUN_MS = 30 * 60 * 1000;
const DEFAULT_BASH_TIMEOUT_SECONDS = 120;
const DEFAULT_THINKING_LEVEL = "high";
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const BUILTIN_TOOL_NAMES = ["read", "write", "edit", "grep", "find", "ls", "bash"] as const;

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

const DeveloperParams = Type.Object({
  task: Type.String({
    description: "The single task to implement, including acceptance criteria and validation.",
  }),
  ticket: Type.Optional(
    Type.String({
      description: "Optional ticket ID or ticket text that is the source of truth for the task.",
    }),
  ),
  context: Type.Optional(
    Type.String({
      description: "Optional caller context such as constraints, conventions, or known risks.",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description:
        "Optional working directory (checkout) for the developer; defaults to the current session directory.",
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
  task: string;
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
        reason: `developer subagent error: ${errorMessage || "provider/model error"}`,
        stopReason,
        errorMessage,
      };
    if (stopReason === "aborted")
      return {
        ok: false,
        reason: "developer subagent aborted before producing a usable answer",
        stopReason,
      };
    if (answer) return { ok: true, answer, stopReason: stopReason || undefined };
    return {
      ok: false,
      reason: stopReason
        ? `developer subagent produced no final assistant text (stopReason: ${stopReason})`
        : "developer subagent produced no final assistant text",
      stopReason: stopReason || undefined,
      errorMessage: errorMessage || undefined,
    };
  }
  return {
    ok: false,
    reason: "developer subagent produced no assistant message",
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

/**
 * Write/edit guard. Resolves the nearest existing ancestor through symlinks so that
 * new files created beneath a symlinked directory cannot escape the checkout.
 */
async function assertMutationPathInsideCwd(
  cwd: string,
  rawPath: unknown,
  toolName: string,
): Promise<string | undefined> {
  if (typeof rawPath !== "string" || !rawPath.trim())
    return `${toolName} path must be a non-empty string.`;
  try {
    const root = await fs.realpath(cwd).catch(() => path.resolve(cwd));
    let existing = resolveToCwd(rawPath, cwd);
    const remainder: string[] = [];
    let hops = 0;
    for (;;) {
      try {
        existing = await fs.realpath(existing);
        break;
      } catch {
        // A dangling symlink is followed by write/edit, so resolve its target instead.
        const linkTarget = await fs.readlink(existing).catch(() => undefined);
        if (linkTarget !== undefined && ++hops < 40) {
          existing = path.resolve(path.dirname(existing), linkTarget);
          continue;
        }
        const parent = path.dirname(existing);
        if (parent === existing) break;
        remainder.unshift(path.basename(existing));
        existing = parent;
      }
    }
    const target = path.join(existing, ...remainder);
    if (!isInside(root, target)) return `${toolName} is limited to the local checkout: ${target}`;
  } catch {
    return `${toolName} path could not be resolved safely.`;
  }
  return undefined;
}

function createDeveloperRuntimeGuardExtension(options: {
  cwd: string;
  maxTurns: number;
}): ExtensionFactory {
  return (pi) => {
    let currentTurn = 0;

    pi.on("turn_start", async (event) => {
      currentTurn = event.turnIndex;
    });

    pi.on("tool_call", async (event) => {
      const allowed =
        (BUILTIN_TOOL_NAMES as readonly string[]).includes(event.toolName) ||
        isSubagentMcpTool(event.toolName);
      if (!allowed) {
        return {
          block: true,
          reason: `developer exposes read, write, edit, grep, find, ls, bash, and MCP tools; ${event.toolName} is not allowed.`,
        };
      }

      if (currentTurn >= options.maxTurns - 1) {
        return {
          block: true,
          reason: `Tool use is disabled on final developer turn ${options.maxTurns}/${options.maxTurns}. Report what is done and any blockers now.`,
        };
      }

      if (event.toolName === "write" || event.toolName === "edit") {
        const reason = await assertMutationPathInsideCwd(
          options.cwd,
          (event.input as { path?: unknown }).path,
          event.toolName,
        );
        if (reason) return { block: true, reason };
      }

      if (event.toolName === "bash") {
        const input = event.input as { timeout?: unknown };
        if (typeof input.timeout !== "number") input.timeout = DEFAULT_BASH_TIMEOUT_SECONDS;
      }

      return undefined;
    });

    pi.on("tool_result", async (event) => ({
      content: [
        ...(event.content ?? []),
        {
          type: "text",
          text: `\n\n[developer turn budget] turn ${Math.min(currentTurn + 1, options.maxTurns)}/${options.maxTurns}`,
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
  return `You are the Developer, an isolated senior-engineer agent running inside the developer package. Implement exactly one task in the local checkout, validate it, and return a concise completion report.

Working directory: ${options.cwd}
Turn budget: ${options.maxTurns} turns total, including your final answer.
Wall-clock budget: ${options.maxRunSeconds} seconds.

Available tools: read, write, edit, grep, find, ls, bash, and any configured MCP tools. A runtime guard limits write/edit to paths inside the working directory. bash is unrestricted and is not sandboxed: use it only for the task (inspection, validation, repository tooling) and never to modify files outside the checkout or to bypass the rules below. Prefer the built-in read, grep, find, ls, write, and edit tools for local files. MCP tools run without confirmation; use them only within the task scope and avoid state-changing actions the task does not require. MCP access requires host Pi >=1.0.4; on older hosts MCP tools are absent with no error.

## Source of truth

The task (and ticket text, if supplied) in the user message is the source of truth and your authorization to proceed; do not ask for confirmation before starting. If it is missing, invalid, or ambiguous in a way that blocks safe implementation, do not guess on important decisions: stop without editing files and report the blocker in your final result. There is no way to ask questions mid-run.

## Operating model

- Plan approval or task approval is not authorization to mutate, revert, overwrite, or clean up pre-existing worktree or index changes you did not create for the current task.
- Treat pre-existing worktree and index changes as human-owned. Touch them only with scoped authorization given in the task or context.
- Do not use git stash, git restore, git reset, non-dry-run git clean, or checkout/switch discard or force options against pre-existing state without that authorization.
- Never create a git commit, push, or publish unless the task explicitly authorizes it.
- Preserve unrelated state while implementing the task.
- Implement only what the task asks for. Do not implement future tasks, nice-to-haves, speculative refactors, or unrelated cleanup.
- Keep changes small, cohesive, and easy to review.
- Follow existing repository conventions for structure, naming, formatting, tests, and error handling.

## Blockers

Report blockers in your final result instead of guessing when: the task is ambiguous or missing a decision needed for safe implementation; requirements conflict with existing behavior or project conventions; a product/API/scope decision appears; a discovery invalidates the intended approach; pre-existing changes overlap the task and block a safe, scoped implementation; or validation cannot be completed for an environmental reason.

## Implementation expectations

- Prefer the simplest correct implementation.
- Add or update high-ROI tests for meaningful behavior, regressions, edge cases, error handling, or security-sensitive logic. Avoid low-value tests that merely restate implementation details.
- Update docs or comments only when they materially help users or maintainers.
- Handle errors deliberately; avoid fragile behavior and silent failure.
- Keep secrets and PII out of code, logs, tests, and reports.

## Validation

- Discover the repository's checks and run the narrowest meaningful validation before reporting completion, unless the task explicitly says otherwise.
- If the task defines a specific validation scope, follow it exactly.
- If validation you were expected to run fails, fix the issue and rerun it until it passes. Do not claim validation you did not perform.

## Completion report

Finish with a report containing, in this order:

- Summary: 2–4 bullets describing what changed and why.
- Files changed: list of file paths.
- Validation: exact commands run and outcomes, or note when validation was explicitly deferred.
- Problems encountered: unclear, surprising, or worked-around issues, including any blockers.
- Tradeoffs or risks: only meaningful ones.

Do not request code review yourself; the caller owns review.`;
}

function buildUserPrompt(
  input: { task: string; ticket?: string; context?: string },
  cwd: string,
): string {
  return `Task to implement:\n${input.task}\n\nLocal checkout: ${cwd}\n\nOptional ticket (source of truth when provided):\n${input.ticket?.trim() ? input.ticket : "(not provided)"}\n\nOptional caller context:\n${input.context?.trim() ? input.context : "(not provided)"}\n\nImplement only this task, validate it, and respond using the required completion report format.`;
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
  if (call.name === "write" || call.name === "edit") {
    return `${call.name} ${typeof args.path === "string" ? args.path : ""}`.trim();
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
    return `## Summary\n- No completion report was produced.\n\n## Files changed\n- unknown\n\n## Validation\n- none\n\n## Problems encountered\n- The isolated developer session returned no assistant text.${suffix}`;
  return `${trimmed}${suffix}`;
}

export const __test__ = {
  SUBAGENT_MCP_TOOLS,
  BUILTIN_TOOL_NAMES,
  isMcpCompatibleVersion,
  resolveSubagentProjectTrusted,
  createMcpSubagentFactories,
  disposeSubagentSession,
  createDeveloperRuntimeGuardExtension,
  assertMutationPathInsideCwd,
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

export default function developerExtension(pi: ExtensionAPI) {
  pi.on("tool_result", async (event) => {
    if (event.toolName !== "developer") return undefined;
    const details = event.details as RunDetails | undefined;
    if (details?.status !== "error") return undefined;
    return { isError: true };
  });

  pi.registerTool({
    name: "developer",
    label: "Developer",
    description:
      "Isolated developer that implements exactly one task in the local checkout using read, write, edit, grep, find, ls, unrestricted bash, and configured MCP tools, then returns a completion report.",
    promptSnippet:
      "Delegate one well-scoped implementation task to an isolated developer child agent that edits the checkout, validates its work, and returns a completion report with run details.",
    promptGuidelines: [
      "Use developer to implement one clearly scoped task in an isolated child agent; provide the task, acceptance criteria, validation expectations, and any ticket text.",
      "developer can edit files and run arbitrary bash commands in the checkout (write/edit are limited to the checkout; bash is not sandboxed). Do not hand it destructive or out-of-scope work.",
    ],
    parameters: DeveloperParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const task = typeof params.task === "string" ? params.task.trim() : "";
      if (!task) throw new Error("Invalid parameters: expected task to be a non-empty string.");
      const cwd = await resolveRunCwd(ctx.cwd, params.cwd);

      const input = {
        task,
        ticket: typeof params.ticket === "string" ? params.ticket : undefined,
        context: typeof params.context === "string" ? params.context : undefined,
      };
      const details: RunDetails = {
        status: "running",
        cwd,
        task,
        turns: 0,
        toolCalls: [],
        startedAt: Date.now(),
      };

      let lastContent = "(implementing task...)";
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
            "No active session model is available. Select a model before using developer.",
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
            createDeveloperRuntimeGuardExtension({ cwd, maxTurns: MAX_TURNS }),
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

        const thinking = resolveThinkingLevel(model, normalizeThinkingLevel(pi.getThinkingLevel()));
        applyModelAttemptDetails(details, model, thinking);

        const created = await createAgentSession({
          cwd,
          ...getModelRuntimeOption(ctx),
          resourceLoader,
          settingsManager: isolatedSettingsManager,
          sessionManager: SessionManager.inMemory(cwd),
          model: model as CreateAgentSessionModel,
          thinkingLevel: thinking.effective,
          tools: [...BUILTIN_TOOL_NAMES, ...SUBAGENT_MCP_TOOLS],
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
                new Error(`developer timed out after ${Math.round(MAX_RUN_MS / 1000)} seconds.`),
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
          `## Summary\n- Developer run failed before completing the task.\n\n## Files changed\n- unknown (the run may have modified files before failing; inspect the checkout)\n\n## Validation\n- none\n\n## Problems encountered\n- ${failure.message}`,
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
