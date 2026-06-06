import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import type { ReviewWindowData } from "./types.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "web");

function escapeForInlineScript(value: string): string {
	return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function escapeInlineScriptSource(value: string): string {
	return value.replace(/<\/(script)/gi, "<\\/$1");
}

interface ReviewUiAssets {
	tailwindBrowserJs: string;
	monacoLoaderJs: string;
	monacoVsBaseUrl: string;
	bootstrapError: string | null;
}

function safeReadResolvedAsset(specifier: string): string {
	return readFileSync(require.resolve(specifier), "utf8");
}

function resolveReviewUiAssets(): ReviewUiAssets {
	try {
		const tailwindBrowserJs = safeReadResolvedAsset("@tailwindcss/browser");
		const monacoLoaderPath = join(dirname(require.resolve("monaco-editor/package.json")), "min", "vs", "loader.js");
		const monacoLoaderJs = readFileSync(monacoLoaderPath, "utf8");
		const monacoVsBaseUrl = pathToFileURL(dirname(monacoLoaderPath)).href;
		return {
			tailwindBrowserJs,
			monacoLoaderJs,
			monacoVsBaseUrl,
			bootstrapError: null,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			tailwindBrowserJs: "",
			monacoLoaderJs: "",
			monacoVsBaseUrl: "",
			bootstrapError: `Unable to load packaged review UI assets: ${message}`,
		};
	}
}

export function buildReviewHtml(data: ReviewWindowData): string {
	const templateHtml = readFileSync(join(webDir, "index.html"), "utf8");
	const appJs = escapeInlineScriptSource(readFileSync(join(webDir, "app.js"), "utf8"));
	const assets = resolveReviewUiAssets();
	const payload = escapeForInlineScript(JSON.stringify(data));
	const assetConfig = escapeForInlineScript(
		JSON.stringify({
			monacoVsBaseUrl: assets.monacoVsBaseUrl,
			bootstrapError: assets.bootstrapError,
		}),
	);
	return templateHtml
		.replace('"__INLINE_DATA__"', payload)
		.replace("__INLINE_ASSET_CONFIG__", assetConfig)
		.replace("__INLINE_TAILWIND_JS__", escapeInlineScriptSource(assets.tailwindBrowserJs))
		.replace("__INLINE_MONACO_LOADER_JS__", escapeInlineScriptSource(assets.monacoLoaderJs))
		.replace("__INLINE_JS__", appJs);
}
