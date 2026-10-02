import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AnnotateTheme } from "./theme.js";
import { getThemeCssVars } from "./theme.js";
import type { LastAssistantMessageData } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "web");

function escapeForInlineScript(value: string): string {
	return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function escapeInlineScriptSource(value: string): string {
	return value.replace(/<\/(script)/gi, "<\\/$1");
}

function buildThemeCssBlock(vars: Record<string, string>): string {
	const declarations = Object.entries(vars)
		.map(([key, value]) => `  ${key}: ${value};`)
		.join("\n");
	return `:root {\n${declarations}\n}`;
}

export function buildAnnotateLastMessageHtml(
	data: LastAssistantMessageData,
	theme?: AnnotateTheme,
): string {
	const templateHtml = readFileSync(join(webDir, "index.html"), "utf8");
	const mdRendererJs = escapeInlineScriptSource(readFileSync(join(webDir, "md-renderer.js"), "utf8"));
	const appJs = escapeInlineScriptSource(readFileSync(join(webDir, "app.js"), "utf8"));
	const payload = escapeForInlineScript(JSON.stringify(data));
	const themeBlock = buildThemeCssBlock(getThemeCssVars(theme));
	const replacements = new Map([
		['"__INLINE_DATA__"', payload],
		["__INLINE_MD_RENDERER_JS__", mdRendererJs],
		["__INLINE_JS__", appJs],
		["__INLINE_THEME__", themeBlock],
	]);

	// Replace the original template in one pass so marker-like message data,
	// theme values, or runtime source is never scanned as another placeholder.
	return templateHtml.replace(
		/"__INLINE_DATA__"|__INLINE_MD_RENDERER_JS__|__INLINE_JS__|__INLINE_THEME__/g,
		(marker) => replacements.get(marker) ?? marker,
	);
}
