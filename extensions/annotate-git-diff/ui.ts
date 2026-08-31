import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewWindowData } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "web");

function escapeForInlineScript(value: string): string {
	return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function escapeInlineScriptSource(value: string): string {
	return value.replace(/<\/(script)/gi, "<\\/$1");
}

export interface ReviewUiAssets {
	tailwindBrowserJs: string;
	monacoLoaderJs: string;
	monacoVsBaseUrl: string;
}

export function buildReviewHtml(data: ReviewWindowData, assets: ReviewUiAssets): string {
	const templateHtml = readFileSync(join(webDir, "index.html"), "utf8");
	const appJs = escapeInlineScriptSource(readFileSync(join(webDir, "app.js"), "utf8"));
	const payload = escapeForInlineScript(JSON.stringify(data));
	const assetConfig = escapeForInlineScript(
		JSON.stringify({
			monacoVsBaseUrl: assets.monacoVsBaseUrl,
			bootstrapError: null,
		}),
	);
	return templateHtml
		.replace('"__INLINE_DATA__"', () => payload)
		.replace("__INLINE_ASSET_CONFIG__", () => assetConfig)
		.replace("__INLINE_TAILWIND_JS__", () => escapeInlineScriptSource(assets.tailwindBrowserJs))
		.replace("__INLINE_MONACO_LOADER_JS__", () => escapeInlineScriptSource(assets.monacoLoaderJs))
		.replace("__INLINE_JS__", () => appJs);
}
