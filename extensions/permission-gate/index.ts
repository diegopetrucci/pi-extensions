/**
 * Permission Gate Extension
 *
 * Prompts for confirmation before running potentially dangerous bash commands
 * or modifying protected paths via write/edit.
 * Protected paths include exact .git and node_modules path segments plus
 * secret-bearing .env files (excluding example/template variants).
 */

import * as path from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const dangerousPatterns = [/\bsudo\b/i, /\b(chmod|chown)\b.*777/i];
const protectedPathSegments = new Set([".git", "node_modules"]);
const shellCommandSeparators = new Set([";", "&", "&&", "||", "|", "\n", "(", ")", "{", "}"]);
const safeEnvSuffixes = new Set(["example", "examples", "template", "templates"]);

type GuardDecision = { block: true; reason: string } | undefined;
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

type WriteInput = { path: string; content: string };
type EditInput = { path: string; edits: Array<{ oldText: string; newText: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
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
		withPosixSeparators.startsWith("/") ? withPosixSeparators : path.posix.join("/", withPosixSeparators),
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
	if (normalizedPath.segments.some((segment) => protectedPathSegments.has(segment.toLowerCase()))) return true;
	return isProtectedEnvFile(normalizedPath.basename);
}

function findClosingDelimiter(command: string, start: number, delimiter: ')' | '`'): number {
	let quote: '"' | "'" | undefined;
	let escaping = false;
	let depth = delimiter === ')' ? 1 : 0;

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

		if (delimiter === ')' && char === '$' && next === '(') {
			depth += 1;
			index += 1;
			continue;
		}

		if (char === delimiter) {
			if (delimiter === ')') {
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
			const closingIndex = findClosingDelimiter(command, index + 2, ')');
			if (closingIndex !== -1) {
				flushCurrent();
				tokens.push({ text: command.slice(index, closingIndex + 1) });
				index = closingIndex;
				continue;
			}
		}

		if (char === "`") {
			const closingIndex = findClosingDelimiter(command, index + 1, '`');
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

		if (char === ";" || char === "&" || char === "|" || char === "\n" || char === "(" || char === ")" || char === "{" || char === "}") {
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

		if (char === '$' && next === '(') {
			const closingIndex = findClosingDelimiter(command, index + 2, ')');
			if (closingIndex !== -1 && hasDangerousRecursiveRm(command.slice(index + 2, closingIndex))) return true;
			if (closingIndex !== -1) index = closingIndex;
			continue;
		}

		if (char === '`') {
			const closingIndex = findClosingDelimiter(command, index + 1, '`');
			if (closingIndex !== -1 && hasDangerousRecursiveRm(command.slice(index + 1, closingIndex))) return true;
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

	const consumeOptionValue = (inlinePrefix: string, separateOptions: string[], longOption: string): boolean => {
		const token = tokens[index]?.text;
		if (!token) return false;
		if (token === longOption || separateOptions.includes(token)) {
			index += 1;
			if (index < tokens.length) index += 1;
			return true;
		}
		if (token.startsWith(`${longOption}=`) || (inlinePrefix && token.startsWith(inlinePrefix) && token.length > inlinePrefix.length)) {
			index += 1;
			return true;
		}
		return false;
	};

	const consumeOptionalLongOption = (inlinePrefix: string, shortOption: string, longOption: string): boolean => {
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
		if (token.startsWith(`${longOption}=`) || token.startsWith(inlinePrefix) && token.length > inlinePrefix.length) {
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
		return headIndex + 1 < tokens.length && hasDangerousRecursiveRm(tokens.slice(headIndex + 1).map(({ text }) => text).join(" "));
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

	const evaluateTokens = (commandTokens: ShellToken[]): boolean => hasDangerousCommandSuffix(commandTokens);

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

function validateWriteInput(input: unknown): WriteInput | undefined {
	if (!isRecord(input)) return undefined;
	if (typeof input.path !== "string" || typeof input.content !== "string") return undefined;
	if (!normalizeToolPath(input.path)) return undefined;
	return { path: input.path, content: input.content };
}

function validateEditInput(input: unknown): EditInput | undefined {
	if (!isRecord(input)) return undefined;
	if (typeof input.path !== "string" || !Array.isArray(input.edits)) return undefined;
	if (!normalizeToolPath(input.path)) return undefined;

	const edits = input.edits;
	if (
		edits.some(
			(edit) =>
				!isRecord(edit) || typeof edit.oldText !== "string" || typeof edit.newText !== "string",
		)
	) {
		return undefined;
	}

	return {
		path: input.path,
		edits: edits as Array<{ oldText: string; newText: string }>,
	};
}

async function confirmProtectedPathAction(
	toolName: "write" | "edit",
	normalizedPath: NormalizedPath,
	ctx: { hasUI?: boolean; ui?: { select(prompt: string, options: string[]): Promise<string | undefined> } },
): Promise<GuardDecision> {
	if (!isProtectedPath(normalizedPath)) return undefined;
	if (!ctx.hasUI || !ctx.ui) {
		return { block: true, reason: `Protected path blocked (${toolName} without UI confirmation): ${normalizedPath.displayPath}` };
	}

	const choice = await ctx.ui.select(
		`⚠️ Protected path ${toolName} request:\n\n  ${normalizedPath.displayPath}\n\nAllow?`,
		["Yes", "No"],
	);

	if (choice !== "Yes") {
		return { block: true, reason: "Blocked by user" };
	}

	return undefined;
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "bash") {
			const command = event.input?.command;
			if (typeof command !== "string" || command.trim() === "") {
				return { block: true, reason: "Malformed bash command blocked" };
			}

			const isDangerous = hasDangerousRecursiveRm(command) || dangerousPatterns.some((p) => p.test(command));

			if (isDangerous) {
				if (!ctx.hasUI) {
					return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
				}

				const choice = await ctx.ui.select(`⚠️ Dangerous command:\n\n  ${command}\n\nAllow?`, ["Yes", "No"]);

				if (choice !== "Yes") {
					return { block: true, reason: "Blocked by user" };
				}
			}

			return undefined;
		}

		if (event.toolName === "write") {
			const input = validateWriteInput(event.input);
			if (!input) {
				return { block: true, reason: "Malformed write input blocked" };
			}
			const normalizedPath = normalizeToolPath(input.path);
			if (!normalizedPath) {
				return { block: true, reason: "Malformed write input blocked" };
			}
			return confirmProtectedPathAction("write", normalizedPath, ctx);
		}

		if (event.toolName === "edit") {
			const input = validateEditInput(event.input);
			if (!input) {
				return { block: true, reason: "Malformed edit input blocked" };
			}
			const normalizedPath = normalizeToolPath(input.path);
			if (!normalizedPath) {
				return { block: true, reason: "Malformed edit input blocked" };
			}
			return confirmProtectedPathAction("edit", normalizedPath, ctx);
		}

		return undefined;
	});
}
