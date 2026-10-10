/**
 * Permission Gate Extension
 *
 * Prompts for confirmation before running potentially dangerous bash or
 * PowerShell commands, or modifying protected paths via write/edit.
 * Protected paths include exact .git and node_modules path segments plus
 * secret-bearing .env files (excluding example/template variants).
 */

import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  analyzePowerShellLexically,
  buildPowerShellAstCommand,
  MAX_POWERSHELL_ANALYSIS_SOURCE_BYTES,
  parsePowerShellAstOutput,
} from "./powershell-safety.ts";

/**
 * Unicode space characters that Pi's path normalizer replaces with an ASCII space.
 * Mirrors the UNICODE_SPACES constant in dist/utils/paths.js.
 */
const UNICODE_SPACES_PATTERN = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

const dangerousPatterns = [/\bsudo\b/i, /\b(chmod|chown)\b.*777/i];
const protectedPathSegments = new Set([".git", "node_modules"]);
const shellCommandSeparators = new Set([";", "&", "&&", "||", "|", "\n", "(", ")", "{", "}"]);
const safeEnvSuffixes = new Set(["example", "examples", "template", "templates"]);
const MAX_SHELL_TIMEOUT_SECONDS = 2_147_483_647 / 1000;
const POWERSHELL_ANALYSIS_TIMEOUT_MS = 5_000;

type GuardDecision = { block: true; reason: string } | undefined;
type ConfirmationContext = {
  hasUI?: boolean;
  signal?: AbortSignal;
  ui?: {
    select(
      prompt: string,
      choices: string[],
      dialogOptions?: { signal?: AbortSignal },
    ): Promise<string | undefined>;
  };
};
type NormalizedPath = {
  original: string;
  displayPath: string;
  segments: string[];
  basename: string;
};
type ShellToken = {
  text: string;
  quote?: '"' | "'";
};

type ShellInput = { command: string; timeout?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Converts Git Bash / MSYS / Cygwin / WSL drive paths to a form native Windows
 * APIs accept. Mirrors normalizeWindowsShellPath from
 * dist/utils/paths.js. No-op on non-win32 paths.
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
 * Mirrors Pi's normalizePath (dist/utils/paths.js).
 *
 * Options (all default false/true as noted):
 *   normalizeUnicodeSpaces — replace Unicode space characters with ASCII space.
 *   stripAtPrefix         — strip a leading "@" path sigil.
 *   expandTilde           — expand "~"/"~/" to homedir (default true).
 *
 * On win32, Git Bash / WSL drive-path normalisation always runs (not gated
 * by expandTilde); only the tilde expansion itself is gated by expandTilde.
 * Always resolves "file://" URLs via fileURLToPath; throws for non-local hosts
 * (e.g. file://hostname/…) or invalid URLs.
 */
function normalizePath(
  input: string,
  opts: { normalizeUnicodeSpaces?: boolean; stripAtPrefix?: boolean; expandTilde?: boolean } = {},
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
 * Mirrors Pi's resolveToCwd (dist/core/tools/path-utils.js): normalises the
 * raw path with { normalizeUnicodeSpaces: true, stripAtPrefix: true }, normalises
 * cwd with default options (expandTilde: true, so win32 shell-path handling
 * also applies to cwd as Pi does), then resolves absolute paths via
 * path.resolve and relative paths against cwd.
 *
 * Exported for tests that check parity with Pi's resolveToCwd. Note: other
 * extensions will not import this file; each extension keeps its own local copy.
 */
export function resolveToCwd(rawPath: string, cwd: string): string {
  const normalized = normalizePath(rawPath, { normalizeUnicodeSpaces: true, stripAtPrefix: true });
  const base = normalizePath(cwd);
  return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(base, normalized);
}

type PiCheckResult =
  | { status: "protected"; resolvedPath: string }
  | { status: "error" }
  | { status: "allowed" };

/**
 * Resolves rawPath via the Pi-mirroring resolveToCwd, then checks whether the
 * resulting absolute path is a protected path.
 */
function checkPiResolvedPath(rawPath: string, cwd: string): PiCheckResult {
  try {
    const resolved = resolveToCwd(rawPath, cwd);
    const normalized = normalizeToolPath(resolved);
    if (normalized !== undefined && isProtectedPath(normalized)) {
      return { status: "protected", resolvedPath: resolved };
    }
    return { status: "allowed" };
  } catch {
    return { status: "error" };
  }
}

function normalizeToolPath(rawPath: string): NormalizedPath | undefined {
  const trimmed = rawPath.trim();
  if (!trimmed) return undefined;

  // Pi's built-in path tools treat a leading @ as path syntax and strip it
  // before execution, so inspect the same effective target.
  const withoutPathSigil = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (!withoutPathSigil) return undefined;

  const withPosixSeparators = withoutPathSigil.replace(/\\+/g, "/");
  const normalizedPath = path.posix.normalize(
    withPosixSeparators.startsWith("/")
      ? withPosixSeparators
      : path.posix.join("/", withPosixSeparators),
  );
  const segments = normalizedPath.split("/").filter(Boolean);
  const basename = segments.at(-1) ?? "";

  return {
    original: rawPath,
    displayPath: withPosixSeparators,
    segments,
    basename,
  };
}

function isSafeEnvTemplate(basename: string): boolean {
  const normalizedBasename = basename.toLowerCase();
  if (!normalizedBasename.startsWith(".env.")) return false;
  const terminalSuffix = normalizedBasename.split(".").at(-1) ?? "";
  return safeEnvSuffixes.has(terminalSuffix);
}

function isProtectedEnvFile(basename: string): boolean {
  const normalizedBasename = basename.toLowerCase();
  if (normalizedBasename === ".env") return true;
  if (!normalizedBasename.startsWith(".env.")) return false;
  return !isSafeEnvTemplate(normalizedBasename);
}

function isProtectedPath(normalizedPath: NormalizedPath): boolean {
  if (normalizedPath.segments.some((segment) => protectedPathSegments.has(segment.toLowerCase())))
    return true;
  return isProtectedEnvFile(normalizedPath.basename);
}

function findClosingDelimiter(command: string, start: number, delimiter: ")" | "`"): number {
  let quote: '"' | "'" | undefined;
  let escaping = false;
  let depth = delimiter === ")" ? 1 : 0;

  for (let index = start; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (quote) {
      if (char === "\\" && quote === '"') {
        escaping = true;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (delimiter === ")" && char === "$" && next === "(") {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      if (delimiter === ")") {
        depth -= 1;
        if (depth === 0) return index;
        continue;
      }
      return index;
    }
  }

  return -1;
}

function tokenizeShellWords(command: string): ShellToken[] {
  // Intentionally shallow tokenization for reviewable safety checks. This handles
  // simple quoting, command separators, and nested command substitutions, but it does
  // not attempt full shell grammar such as heredocs, arrays, or parameter expansion.
  const tokens: ShellToken[] = [];
  let current = "";
  let currentQuote: '"' | "'" | undefined;
  let escaping = false;

  const flushCurrent = () => {
    if (!current) return;
    tokens.push({ text: current, quote: currentQuote });
    current = "";
    currentQuote = undefined;
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (currentQuote) {
      if (char === "\\" && currentQuote === '"') {
        escaping = true;
        continue;
      }
      if (char === currentQuote) {
        flushCurrent();
        continue;
      }
      current += char;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"' || char === "'") {
      flushCurrent();
      currentQuote = char;
      continue;
    }

    if (char === "$" && next === "(") {
      const closingIndex = findClosingDelimiter(command, index + 2, ")");
      if (closingIndex !== -1) {
        flushCurrent();
        tokens.push({ text: command.slice(index, closingIndex + 1) });
        index = closingIndex;
        continue;
      }
    }

    if (char === "`") {
      const closingIndex = findClosingDelimiter(command, index + 1, "`");
      if (closingIndex !== -1) {
        flushCurrent();
        tokens.push({ text: command.slice(index, closingIndex + 1) });
        index = closingIndex;
        continue;
      }
    }

    if (char === "&" && next === "&") {
      flushCurrent();
      tokens.push({ text: "&&" });
      index += 1;
      continue;
    }

    if (char === "|" && next === "|") {
      flushCurrent();
      tokens.push({ text: "||" });
      index += 1;
      continue;
    }

    if (
      char === ";" ||
      char === "&" ||
      char === "|" ||
      char === "\n" ||
      char === "(" ||
      char === ")" ||
      char === "{" ||
      char === "}"
    ) {
      flushCurrent();
      tokens.push({ text: char });
      continue;
    }

    if (/\s/.test(char)) {
      flushCurrent();
      continue;
    }

    current += char;
  }

  flushCurrent();
  return tokens;
}

function isShellAssignmentToken(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

function hasDangerousSubstitution(command: string): boolean {
  let quote: '"' | "'" | undefined;
  let escaping = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (quote === "'") {
      if (char === "'") quote = undefined;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === "'") {
      quote = "'";
      continue;
    }

    if (char === '"') {
      quote = quote === '"' ? undefined : '"';
      continue;
    }

    if (char === "$" && next === "(") {
      const closingIndex = findClosingDelimiter(command, index + 2, ")");
      if (closingIndex !== -1 && hasDangerousRecursiveRm(command.slice(index + 2, closingIndex)))
        return true;
      if (closingIndex !== -1) index = closingIndex;
      continue;
    }

    if (char === "`") {
      const closingIndex = findClosingDelimiter(command, index + 1, "`");
      if (closingIndex !== -1 && hasDangerousRecursiveRm(command.slice(index + 1, closingIndex)))
        return true;
      if (closingIndex !== -1) index = closingIndex;
    }
  }

  return false;
}

function basenameToken(token: string): string {
  return path.posix.basename(token);
}

function unwrapLeadingWrappers(
  tokens: ShellToken[],
  startIndex: number,
): { headIndex: number; nonExecuting: boolean; consumed: number } {
  let index = startIndex;

  const consumeOptionValue = (
    inlinePrefix: string,
    separateOptions: string[],
    longOption: string,
  ): boolean => {
    const token = tokens[index]?.text;
    if (!token) return false;
    if (token === longOption || separateOptions.includes(token)) {
      index += 1;
      if (index < tokens.length) index += 1;
      return true;
    }
    if (
      token.startsWith(`${longOption}=`) ||
      (inlinePrefix && token.startsWith(inlinePrefix) && token.length > inlinePrefix.length)
    ) {
      index += 1;
      return true;
    }
    return false;
  };

  const consumeOptionalLongOption = (
    inlinePrefix: string,
    shortOption: string,
    longOption: string,
  ): boolean => {
    const token = tokens[index]?.text;
    if (!token) return false;
    if (token === longOption) {
      index += 1;
      return true;
    }
    if (token === shortOption) {
      index += 1;
      if (index < tokens.length) index += 1;
      return true;
    }
    if (
      token.startsWith(`${longOption}=`) ||
      (token.startsWith(inlinePrefix) && token.length > inlinePrefix.length)
    ) {
      index += 1;
      return true;
    }
    return false;
  };

  while (index < tokens.length && isShellAssignmentToken(tokens[index].text)) index += 1;
  while (tokens[index]?.text === "sudo") index += 1;

  while (index < tokens.length) {
    const current = tokens[index]?.text;
    const currentBase = current ? basenameToken(current) : undefined;
    if (!current) break;

    if (current === "command") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index]?.text;
        if (!option?.startsWith("-")) break;
        if (option === "--") {
          index += 1;
          break;
        }
        if (option === "-v" || option === "-V") {
          return { headIndex: tokens.length, nonExecuting: true, consumed: index + 1 - startIndex };
        }
        index += 1;
      }
      continue;
    }

    if (currentBase === "env") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index]?.text;
        if (!option) break;
        if (option === "--") {
          index += 1;
          break;
        }
        if (option === "--help" || option === "--version") {
          return { headIndex: tokens.length, nonExecuting: true, consumed: index + 1 - startIndex };
        }
        if (isShellAssignmentToken(option)) {
          index += 1;
          continue;
        }
        if (consumeOptionValue("-u", ["-u"], "--unset")) continue;
        if (consumeOptionValue("-C", ["-C"], "--chdir")) continue;
        if (!option.startsWith("-")) break;
        index += 1;
      }
      continue;
    }

    if (currentBase === "xargs") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index]?.text;
        if (!option) break;
        if (option === "--") {
          index += 1;
          break;
        }
        if (option === "--help" || option === "--version") {
          return { headIndex: tokens.length, nonExecuting: true, consumed: index + 1 - startIndex };
        }
        if (consumeOptionValue("-n", ["-n"], "--max-args")) continue;
        if (consumeOptionValue("-P", ["-P"], "--max-procs")) continue;
        if (consumeOptionalLongOption("-I", "-I", "--replace")) continue;
        if (consumeOptionValue("-a", ["-a"], "--arg-file")) continue;
        if (consumeOptionalLongOption("-E", "-E", "--eof")) continue;
        if (consumeOptionValue("-s", ["-s"], "--max-chars")) continue;
        if (consumeOptionValue("-d", ["-d"], "--delimiter")) continue;
        if (consumeOptionalLongOption("-L", "-L", "--max-lines")) continue;
        if (!option.startsWith("-")) break;
        index += 1;
      }
      continue;
    }

    break;
  }

  return { headIndex: index, nonExecuting: false, consumed: index - startIndex };
}

function detectRecursiveForceRm(tokens: ShellToken[], headIndex: number): boolean {
  const commandName = tokens[headIndex];
  if (!commandName || basenameToken(commandName.text) !== "rm") return false;

  let sawRecursive = false;
  let sawForce = false;

  for (let index = headIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index]?.text;
    if (!token) continue;
    if (token === "--") break;
    if (!token.startsWith("-") || token === "-") continue;
    if (token === "--recursive") sawRecursive = true;
    if (token === "--force") sawForce = true;
    if (/^-[^-]+$/.test(token)) {
      const flags = token.slice(1);
      if (flags.includes("r") || flags.includes("R")) sawRecursive = true;
      if (flags.includes("f")) sawForce = true;
    }
  }

  return sawRecursive && sawForce;
}

function hasDangerousCommandHead(tokens: ShellToken[], headIndex: number): boolean {
  if (detectRecursiveForceRm(tokens, headIndex)) return true;

  const firstToken = tokens[headIndex];
  if (!firstToken) return false;

  if (["sh", "bash", "zsh", "dash", "ksh"].includes(basenameToken(firstToken.text))) {
    for (let index = headIndex + 1; index < tokens.length; index += 1) {
      const token = tokens[index]?.text;
      if (!token) break;
      if (token === "--") break;
      if (token === "-c" || (/^-[A-Za-z]+$/.test(token) && token.includes("c"))) {
        const script = tokens[index + 1]?.text;
        return typeof script === "string" && hasDangerousRecursiveRm(script);
      }
      if (!token.startsWith("-")) break;
    }
  }

  if (firstToken.text === "eval") {
    return (
      headIndex + 1 < tokens.length &&
      hasDangerousRecursiveRm(
        tokens
          .slice(headIndex + 1)
          .map(({ text }) => text)
          .join(" "),
      )
    );
  }

  return false;
}

function hasDangerousCommandSuffix(tokens: ShellToken[]): boolean {
  let index = 0;

  while (index < tokens.length) {
    const unwrapped = unwrapLeadingWrappers(tokens, index);
    if (unwrapped.nonExecuting) return false;
    if (hasDangerousCommandHead(tokens, unwrapped.headIndex)) return true;

    // Check every possible executable head once, while skipping known-wrapper
    // option values so data such as an xargs EOF marker is never treated as a command.
    index += unwrapped.consumed + 1;
  }

  return false;
}

function hasDangerousRecursiveRm(command: string): boolean {
  // Conservative detector: recurse through obvious command-substitution and shell-wrapper
  // surfaces, then inspect argv-like tokens for rm plus recursive+force semantics.
  if (hasDangerousSubstitution(command)) return true;

  const tokens = tokenizeShellWords(command);
  let currentCommand: ShellToken[] = [];
  let findExecCommand: ShellToken[] | undefined;

  const evaluateTokens = (commandTokens: ShellToken[]): boolean =>
    hasDangerousCommandSuffix(commandTokens);

  const resetCurrentCommand = () => {
    currentCommand = [];
  };

  for (const token of tokens) {
    if (findExecCommand) {
      if (token.text === ";" || token.text === "+") {
        if (evaluateTokens(findExecCommand)) return true;
        findExecCommand = undefined;
        resetCurrentCommand();
        continue;
      }
      findExecCommand.push(token);
      continue;
    }

    if (token.text === "-exec" || token.text === "-execdir") {
      findExecCommand = [];
      continue;
    }

    if (shellCommandSeparators.has(token.text)) {
      if (evaluateTokens(currentCommand)) return true;
      resetCurrentCommand();
      continue;
    }

    currentCommand.push(token);
  }

  if (findExecCommand && evaluateTokens(findExecCommand)) return true;
  return evaluateTokens(currentCommand);
}

function validateShellInput(input: unknown): ShellInput | undefined {
  if (!isRecord(input) || typeof input.command !== "string" || input.command.trim() === "")
    return undefined;
  if (
    input.timeout !== undefined &&
    (typeof input.timeout !== "number" ||
      !Number.isFinite(input.timeout) ||
      input.timeout <= 0 ||
      input.timeout > MAX_SHELL_TIMEOUT_SECONDS)
  ) {
    return undefined;
  }
  return input.timeout === undefined
    ? { command: input.command }
    : { command: input.command, timeout: input.timeout };
}

async function hasDangerousPowerShellCommand(
  pi: ExtensionAPI,
  command: string,
  signal?: AbortSignal,
): Promise<boolean> {
  // Keep both lexical work and Windows' base64-expanded -Command transport
  // bounded below the platform command-line limit. Oversized input is
  // deliberately treated as requiring confirmation rather than failing open.
  if (Buffer.byteLength(command, "utf8") > MAX_POWERSHELL_ANALYSIS_SOURCE_BYTES) return true;

  const lexicalAnalysis = analyzePowerShellLexically(command);
  if (lexicalAnalysis.risky) return true;

  // Pi only exposes its built-in PowerShell tool on Windows. On that platform,
  // ask PowerShell's own parser for the final word so ordinary syntax features
  // (module qualification, interpolation, splatting, and backtick escapes) cannot
  // bypass the fallback lexer. Parser failures and malformed output fail closed.
  if (process.platform !== "win32") return false;

  try {
    const { getPowerShellConfig } = await import("@earendil-works/pi-coding-agent");
    const config = getPowerShellConfig();
    const result = await pi.exec(
      config.shell,
      [...config.args, buildPowerShellAstCommand(command)],
      {
        timeout: POWERSHELL_ANALYSIS_TIMEOUT_MS,
        signal,
      },
    );
    if (result.code !== 0 || result.killed) return true;
    return parsePowerShellAstOutput(result.stdout).risky;
  } catch {
    return true;
  }
}

function validateWriteInput(input: unknown): NormalizedPath | undefined {
  if (!isRecord(input)) return undefined;
  if (typeof input.path !== "string" || typeof input.content !== "string") return undefined;
  return normalizeToolPath(input.path);
}

function validateEditInput(input: unknown): NormalizedPath | undefined {
  if (!isRecord(input)) return undefined;
  if (typeof input.path !== "string" || !Array.isArray(input.edits)) return undefined;
  const normalizedPath = normalizeToolPath(input.path);
  if (!normalizedPath) return undefined;

  if (
    input.edits.some(
      (edit) =>
        !isRecord(edit) || typeof edit.oldText !== "string" || typeof edit.newText !== "string",
    )
  ) {
    return undefined;
  }

  return normalizedPath;
}

async function requestConfirmation(
  prompt: string,
  ctx: ConfirmationContext,
): Promise<GuardDecision> {
  if (!ctx.hasUI || !ctx.ui) {
    return { block: true, reason: "Confirmation unavailable (no UI)" };
  }
  if (ctx.signal?.aborted) {
    return { block: true, reason: "Confirmation cancelled" };
  }

  try {
    const choice = await ctx.ui.select(prompt, ["Yes", "No"], { signal: ctx.signal });
    if (ctx.signal?.aborted) {
      return { block: true, reason: "Confirmation cancelled" };
    }
    return choice === "Yes" ? undefined : { block: true, reason: "Blocked by user" };
  } catch {
    // A dismissed or failed UI must never turn a confirmation failure into an allow.
    return { block: true, reason: "Confirmation unavailable" };
  }
}

async function confirmProtectedPathAction(
  toolName: "write" | "edit",
  normalizedPath: NormalizedPath,
  ctx: ConfirmationContext,
  alsoProtected = false,
  displaySuffix?: string,
): Promise<GuardDecision> {
  if (!alsoProtected && !isProtectedPath(normalizedPath)) return undefined;
  const displayLabel = displaySuffix
    ? `${normalizedPath.displayPath}${displaySuffix}`
    : normalizedPath.displayPath;
  if (!ctx.hasUI || !ctx.ui) {
    return {
      block: true,
      reason: `Protected path blocked (${toolName} without UI confirmation): ${displayLabel}`,
    };
  }

  return requestConfirmation(
    `⚠️ Protected path ${toolName} request:\n\n  ${displayLabel}\n\nAllow?`,
    ctx,
  );
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" || event.toolName === "powershell") {
      const shellToolName = event.toolName;
      const input = validateShellInput(event.input);
      if (!input) {
        return { block: true, reason: `Malformed ${shellToolName} command blocked` };
      }
      const { command } = input;

      const isDangerous =
        shellToolName === "powershell"
          ? await hasDangerousPowerShellCommand(pi, command, ctx.signal)
          : hasDangerousRecursiveRm(command) ||
            dangerousPatterns.some((pattern) => pattern.test(command));

      if (isDangerous) {
        if (!ctx.hasUI) {
          return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
        }

        return requestConfirmation(`⚠️ Dangerous command:\n\n  ${command}\n\nAllow?`, ctx);
      }

      return undefined;
    }

    if (event.toolName === "write") {
      const normalizedPath = validateWriteInput(event.input);
      if (!normalizedPath) {
        return { block: true, reason: "Malformed write input blocked" };
      }
      // Monotonic hardening: also check via Pi-style path resolution against ctx.cwd.
      // OR logic: protected if EITHER the lexical check OR the Pi-resolved check matches.
      // When only the Pi-resolved check catches a path, show the resolved absolute path in
      // the reason so the user understands why the plain-looking path is protected.
      const lexicalProtected = isProtectedPath(normalizedPath);
      const piResult = checkPiResolvedPath(normalizedPath.original, ctx.cwd ?? process.cwd());
      const piAlsoProtected = piResult.status === "protected" || piResult.status === "error";
      const displaySuffix = lexicalProtected
        ? undefined
        : piResult.status === "protected"
          ? ` (resolves to ${piResult.resolvedPath})`
          : piResult.status === "error"
            ? " (path could not be resolved)"
            : undefined;
      return confirmProtectedPathAction(
        "write",
        normalizedPath,
        ctx,
        piAlsoProtected,
        displaySuffix,
      );
    }

    if (event.toolName === "edit") {
      const normalizedPath = validateEditInput(event.input);
      if (!normalizedPath) {
        return { block: true, reason: "Malformed edit input blocked" };
      }
      // Monotonic hardening: also check via Pi-style path resolution against ctx.cwd.
      // OR logic: protected if EITHER the lexical check OR the Pi-resolved check matches.
      // When only the Pi-resolved check catches a path, show the resolved absolute path in
      // the reason so the user understands why the plain-looking path is protected.
      const lexicalProtected = isProtectedPath(normalizedPath);
      const piResult = checkPiResolvedPath(normalizedPath.original, ctx.cwd ?? process.cwd());
      const piAlsoProtected = piResult.status === "protected" || piResult.status === "error";
      const displaySuffix = lexicalProtected
        ? undefined
        : piResult.status === "protected"
          ? ` (resolves to ${piResult.resolvedPath})`
          : piResult.status === "error"
            ? " (path could not be resolved)"
            : undefined;
      return confirmProtectedPathAction(
        "edit",
        normalizedPath,
        ctx,
        piAlsoProtected,
        displaySuffix,
      );
    }

    return undefined;
  });
}
