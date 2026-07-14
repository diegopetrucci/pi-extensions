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

const dangerousPatterns = [/\brm\s+(-rf?|--recursive)/i, /\bsudo\b/i, /\b(chmod|chown)\b.*777/i];
const protectedPathSegments = new Set([".git", "node_modules"]);
const safeEnvSuffixes = new Set(["example", "examples", "template", "templates"]);

type GuardDecision = { block: true; reason: string } | undefined;
type NormalizedPath = {
	original: string;
	displayPath: string;
	segments: string[];
	basename: string;
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

			const isDangerous = dangerousPatterns.some((p) => p.test(command));

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
