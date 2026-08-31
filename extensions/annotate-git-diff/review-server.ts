import { createReadStream, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildReviewHtml } from "./ui.js";
import type { ReviewWindowData } from "./types.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const loopbackHost = "127.0.0.1";

export interface ReviewUiServer {
	readonly failure: Error | null;
	html: string;
	url: string;
	onError(listener: (error: Error) => void): () => void;
	dispose(): void;
}

export interface ReviewUiAssetPaths {
	tailwindBrowserPath: string;
	monacoLoaderPath: string;
	monacoVsDirectory: string;
}

interface StartReviewUiServerOptions {
	extensionDir?: string;
	token?: string;
}

function parentDirectories(startPath: string): string[] {
	const directories: string[] = [];
	let current = resolve(startPath);

	while (true) {
		directories.push(current);
		const parent = dirname(current);
		if (parent === current) return directories;
		current = parent;
	}
}

function findInstalledAsset(extensionDir: string, dependencyPath: string, label: string, expected: "file" | "directory"): string {
	const searched: string[] = [];
	const starts = [extensionDir];

	try {
		const realExtensionDir = realpathSync(extensionDir);
		if (realExtensionDir !== resolve(extensionDir)) starts.push(realExtensionDir);
	} catch {
		// The direct path below will produce the useful not-found diagnostic.
	}

	for (const start of starts) {
		for (const ancestor of parentDirectories(start)) {
			const candidate = join(ancestor, "node_modules", dependencyPath);
			if (searched.includes(candidate)) continue;
			searched.push(candidate);

			try {
				const stats = statSync(candidate);
				const matches = expected === "file" ? stats.isFile() : stats.isDirectory();
				if (matches) return realpathSync(candidate);
			} catch {
				// Keep walking toward the package-manager installation root.
			}
		}
	}

	throw new Error(`Unable to locate packaged ${label}. Searched: ${searched.join(", ")}`);
}

function readDependencyVersion(packageRoot: string, packageName: string): string {
	try {
		const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
			name?: unknown;
			version?: unknown;
		};
		if (manifest.name !== packageName || typeof manifest.version !== "string") throw new Error("invalid manifest");
		return manifest.version;
	} catch {
		throw new Error(`Unable to validate packaged ${packageName} runtime at ${packageRoot}.`);
	}
}

function isCompatibleTailwindBrowserVersion(version: string): boolean {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (match == null) return false;
	const [, major, minor, patch] = match.map(Number);
	return major === 4 && (minor > 3 || (minor === 3 && patch >= 2));
}

export function resolveTailwindBrowserPath(extensionDir = moduleDir): string {
	const browserPath = findInstalledAsset(
		extensionDir,
		join("@tailwindcss", "browser", "dist", "index.global.js"),
		"@tailwindcss/browser runtime",
		"file",
	);
	const version = readDependencyVersion(dirname(dirname(browserPath)), "@tailwindcss/browser");
	if (!isCompatibleTailwindBrowserVersion(version)) {
		throw new Error(`Incompatible packaged @tailwindcss/browser runtime ${version}; expected ^4.3.2.`);
	}
	return browserPath;
}

export function resolveMonacoVsDirectory(extensionDir = moduleDir): string {
	const vsDirectory = findInstalledAsset(extensionDir, join("monaco-editor", "min", "vs"), "monaco-editor runtime", "directory");
	const version = readDependencyVersion(dirname(dirname(vsDirectory)), "monaco-editor");
	if (version !== "0.52.2") {
		throw new Error(`Incompatible packaged monaco-editor runtime ${version}; expected 0.52.2.`);
	}
	return vsDirectory;
}

export function resolveReviewUiAssetPaths(extensionDir = moduleDir): ReviewUiAssetPaths {
	const tailwindBrowserPath = resolveTailwindBrowserPath(extensionDir);
	const monacoVsDirectory = resolveMonacoVsDirectory(extensionDir);
	const monacoLoaderPath = join(monacoVsDirectory, "loader.js");

	try {
		if (!statSync(monacoLoaderPath).isFile()) throw new Error("not a file");
	} catch {
		throw new Error(`Unable to locate packaged Monaco loader: ${monacoLoaderPath}`);
	}

	return {
		tailwindBrowserPath,
		monacoLoaderPath: realpathSync(monacoLoaderPath),
		monacoVsDirectory,
	};
}

function contentType(filePath: string): string {
	switch (extname(filePath).toLowerCase()) {
		case ".css":
			return "text/css; charset=utf-8";
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
		case ".mjs":
			return "text/javascript; charset=utf-8";
		case ".json":
			return "application/json; charset=utf-8";
		case ".svg":
			return "image/svg+xml";
		case ".ttf":
			return "font/ttf";
		case ".wasm":
			return "application/wasm";
		default:
			return "application/octet-stream";
	}
}

function setSecurityHeaders(response: ServerResponse): void {
	response.setHeader("Cache-Control", "no-store");
	response.setHeader(
		"Content-Security-Policy",
		"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'",
	);
	response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
	response.setHeader("Referrer-Policy", "no-referrer");
	response.setHeader("X-Content-Type-Options", "nosniff");
}

function sendText(response: ServerResponse, statusCode: number, body: string): void {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "text/plain; charset=utf-8");
	response.setHeader("Content-Length", Buffer.byteLength(body));
	response.end(body);
}

function isContainedPath(rootPath: string, candidatePath: string): boolean {
	const relativePath = relative(rootPath, candidatePath);
	return relativePath.length > 0 && !relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath);
}

function decodeAssetPath(encodedPath: string): string | null {
	try {
		const decoded = decodeURIComponent(encodedPath);
		if (!decoded || decoded.includes("\0") || decoded.includes("\\")) return null;
		const segments = decoded.split("/");
		if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
		return segments.join(sep);
	} catch {
		return null;
	}
}

function serveMonacoAsset(
	request: IncomingMessage,
	response: ServerResponse,
	monacoVsDirectory: string,
	encodedPath: string,
): void {
	const relativePath = decodeAssetPath(encodedPath);
	if (relativePath == null) {
		sendText(response, 404, "Not found");
		return;
	}

	let assetPath: string;
	let assetSize: number;
	try {
		const candidate = resolve(monacoVsDirectory, relativePath);
		if (!isContainedPath(monacoVsDirectory, candidate)) throw new Error("outside asset root");
		assetPath = realpathSync(candidate);
		const stats = statSync(assetPath);
		if (!isContainedPath(monacoVsDirectory, assetPath) || !stats.isFile()) throw new Error("not a file");
		assetSize = stats.size;
	} catch {
		sendText(response, 404, "Not found");
		return;
	}

	response.statusCode = 200;
	response.setHeader("Content-Type", contentType(assetPath));
	response.setHeader("Content-Length", assetSize);
	if (request.method === "HEAD") {
		response.end();
		return;
	}

	const stream = createReadStream(assetPath);
	stream.on("error", () => {
		if (!response.headersSent) sendText(response, 500, "Unable to read asset");
		else response.destroy();
	});
	response.on("close", () => stream.destroy());
	stream.pipe(response);
}

function redirectHtml(url: string): string {
	const safeUrl = JSON.stringify(url).replace(/</g, "\\u003c");
	return `<!doctype html><html><head><meta charset="utf-8"><title>annotate-git-diff</title></head><body><p>Loading review…</p><script>location.replace(${safeUrl});</script></body></html>`;
}

function disposeServer(server: Server): void {
	server.close();
	server.closeAllConnections();
}

export async function startReviewUiServer(
	data: ReviewWindowData,
	options: StartReviewUiServerOptions = {},
): Promise<ReviewUiServer> {
	const assetPaths = resolveReviewUiAssetPaths(options.extensionDir ?? moduleDir);
	const token = options.token ?? randomBytes(24).toString("hex");
	if (!/^[A-Za-z0-9_-]{24,128}$/.test(token)) throw new Error("Invalid review UI server token.");

	const routeRoot = `/${token}/`;
	const monacoRoutePrefix = `${routeRoot}vs/`;
	let expectedHost = "";
	let reviewHtml = "";

	const server = createServer((request, response) => {
		setSecurityHeaders(response);
		if (request.headers.host !== expectedHost) {
			sendText(response, 403, "Forbidden");
			return;
		}
		if (request.method !== "GET" && request.method !== "HEAD") {
			response.setHeader("Allow", "GET, HEAD");
			sendText(response, 405, "Method not allowed");
			return;
		}

		let pathname: string;
		try {
			pathname = new URL(request.url ?? "/", `http://${expectedHost}`).pathname;
		} catch {
			sendText(response, 400, "Bad request");
			return;
		}

		if (pathname === routeRoot || pathname === `${routeRoot}index.html`) {
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/html; charset=utf-8");
			response.setHeader("Content-Length", Buffer.byteLength(reviewHtml));
			response.end(request.method === "HEAD" ? undefined : reviewHtml);
			return;
		}

		if (pathname.startsWith(monacoRoutePrefix)) {
			serveMonacoAsset(request, response, assetPaths.monacoVsDirectory, pathname.slice(monacoRoutePrefix.length));
			return;
		}

		sendText(response, 404, "Not found");
	});
	// Keep Node's special EventEmitter `error` event non-fatal across disposal
	// races; the scoped listener below still records and reports live failures.
	server.on("error", () => {});
	server.maxHeadersCount = 50;
	server.headersTimeout = 5_000;
	server.keepAliveTimeout = 1_000;
	server.requestTimeout = 15_000;
	server.on("clientError", (_error, socket) => socket.destroy());
	const errorListeners = new Set<(error: Error) => void>();
	let disposed = false;
	let runtimeFailure: Error | null = null;
	const onRuntimeServerError = (error: Error): void => {
		if (disposed || runtimeFailure != null) return;
		runtimeFailure = error;
		disposeServer(server);
		for (const listener of [...errorListeners]) {
			try {
				listener(error);
			} catch {
				// A lifecycle observer must not turn a server failure into an
				// uncaught process-level exception.
			}
		}
	};

	try {
		await new Promise<void>((resolveListen, rejectListen) => {
			const onError = (error: Error): void => {
				server.off("listening", onListening);
				rejectListen(error);
			};
			const onListening = (): void => {
				server.off("error", onError);
				resolveListen();
			};
			server.once("error", onError);
			server.once("listening", onListening);
			server.listen({ host: loopbackHost, port: 0, exclusive: true });
		});
		server.on("error", onRuntimeServerError);

		const address = server.address();
		if (address == null || typeof address === "string") throw new Error("Review UI server did not expose a TCP address.");
		expectedHost = `${loopbackHost}:${address.port}`;
		const url = `http://${expectedHost}${routeRoot}`;
		reviewHtml = buildReviewHtml(data, {
			tailwindBrowserJs: readFileSync(assetPaths.tailwindBrowserPath, "utf8"),
			monacoLoaderJs: readFileSync(assetPaths.monacoLoaderPath, "utf8"),
			monacoVsBaseUrl: `${url}vs`,
		});
		server.unref();

		return {
			get failure() {
				return runtimeFailure;
			},
			html: redirectHtml(url),
			url,
			onError(listener) {
				if (runtimeFailure != null) {
					let active = true;
					queueMicrotask(() => {
						if (active) listener(runtimeFailure as Error);
					});
					return () => {
						active = false;
					};
				}
				if (disposed) return () => {};
				errorListeners.add(listener);
				return () => errorListeners.delete(listener);
			},
			dispose() {
				if (disposed) return;
				disposed = true;
				errorListeners.clear();
				server.off("error", onRuntimeServerError);
				disposeServer(server);
			},
		};
	} catch (error) {
		disposed = true;
		errorListeners.clear();
		server.off("error", onRuntimeServerError);
		disposeServer(server);
		throw error;
	}
}
