import { type FSWatcher, watch } from "node:fs";

export interface RepoChangeWatcher {
	dispose(): void;
}

interface RepoChangeWatcherOptions {
	debounceMs?: number;
	onError?: (error: Error) => void;
}

const DEFAULT_DEBOUNCE_MS = 2000;

const ignoredPathSegments = new Set([
	".cache",
	".git",
	".hg",
	".next",
	".nuxt",
	".svn",
	".turbo",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"out",
	"target",
	"tmp",
]);

const ignoredFileNames = new Set([".DS_Store"]);

function normalizeWatchPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function isIgnoredWatchPath(path: string | Buffer | null | undefined): boolean {
	if (path == null) return false;
	const normalized = normalizeWatchPath(path.toString());
	if (normalized.length === 0) return false;

	const segments = normalized.split("/").filter((segment) => segment.length > 0);
	if (segments.some((segment) => ignoredPathSegments.has(segment))) return true;

	const fileName = segments.at(-1) ?? normalized;
	if (ignoredFileNames.has(fileName)) return true;
	if (fileName.endsWith("~") || fileName.endsWith(".swp") || fileName.endsWith(".tmp")) return true;

	return false;
}

export function createRepoChangeWatcher(
	repoRoot: string,
	onChange: () => void,
	options: RepoChangeWatcherOptions = {},
): RepoChangeWatcher {
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	let disposed = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let watcher: FSWatcher | null = null;

	const clearPending = (): void => {
		if (timer == null) return;
		clearTimeout(timer);
		timer = null;
	};

	const scheduleChange = (path: string | Buffer | null): void => {
		if (disposed || isIgnoredWatchPath(path)) return;
		clearPending();
		timer = setTimeout(() => {
			timer = null;
			if (!disposed) onChange();
		}, debounceMs);
	};

	try {
		watcher = watch(repoRoot, { recursive: true }, (_eventType, fileName) => {
			scheduleChange(fileName);
		});
		watcher.on("error", (error) => {
			if (!disposed) options.onError?.(error);
		});
	} catch (error) {
		options.onError?.(error instanceof Error ? error : new Error(String(error)));
	}

	return {
		dispose() {
			disposed = true;
			clearPending();
			try {
				watcher?.close();
			} catch {
				// Ignore watcher shutdown races.
			}
			watcher = null;
		},
	};
}

export const __testing = {
	isIgnoredWatchPath,
};
