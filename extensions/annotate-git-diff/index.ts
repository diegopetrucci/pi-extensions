// Standalone /annotate-git-diff extension.
// Adapted from @ryan_nookpi/pi-extension-diff-review (MIT), itself inspired by
// badlogic/pi-diff-review. See ./README.md for attribution details.
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readSystemClipboard, writeSystemClipboard } from "./clipboard.js";
import { getCommitFiles, getReviewWindowData, isWorkingTreeCommitSha, loadReviewFileContents } from "./git.js";
import { composeReviewPrompt } from "./prompt.js";
import { openQuietGlimpse, type QuietGlimpseWindow } from "./quiet-glimpse.js";
import type {
	ReviewCancelPayload,
	ReviewClipboardReadPayload,
	ReviewClipboardWritePayload,
	ReviewFile,
	ReviewFileContents,
	ReviewHostMessage,
	ReviewRequestCommitPayload,
	ReviewRequestFilePayload,
	ReviewRequestReviewDataPayload,
	ReviewSubmitPayload,
	ReviewWindowMessage,
} from "./types.js";
import { buildReviewHtml } from "./ui.js";
import { createRepoChangeWatcher, type RepoChangeWatcher } from "./watch.js";

function hasMessageType(value: unknown, type: ReviewWindowMessage["type"]): boolean {
	return typeof value === "object" && value != null && "type" in value && value.type === type;
}

function isSubmitPayload(value: unknown): value is ReviewSubmitPayload {
	return hasMessageType(value, "submit");
}

function isCancelPayload(value: unknown): value is ReviewCancelPayload {
	return hasMessageType(value, "cancel");
}

function isRequestFilePayload(value: unknown): value is ReviewRequestFilePayload {
	return hasMessageType(value, "request-file");
}

function isRequestCommitPayload(value: unknown): value is ReviewRequestCommitPayload {
	return hasMessageType(value, "request-commit");
}

function isRequestReviewDataPayload(value: unknown): value is ReviewRequestReviewDataPayload {
	return hasMessageType(value, "request-review-data");
}

function isClipboardReadPayload(value: unknown): value is ReviewClipboardReadPayload {
	return hasMessageType(value, "clipboard-read");
}

function isClipboardWritePayload(value: unknown): value is ReviewClipboardWritePayload {
	return hasMessageType(value, "clipboard-write");
}

function escapeForInlineScript(value: string): string {
	return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function hasReviewFeedback(payload: ReviewSubmitPayload): boolean {
	return payload.overallComment.trim().length > 0 || payload.comments.some((comment) => comment.body.trim().length > 0);
}

function appendReviewPrompt(ctx: ExtensionCommandContext, prompt: string): void {
	const prefix = ctx.ui.getEditorText().trim().length > 0 ? "\n\n" : "";
	ctx.ui.pasteToEditor(`${prefix}${prompt}`);
}

export default function (pi: ExtensionAPI) {
	let activeWindow: QuietGlimpseWindow | null = null;
	let activeWatcher: RepoChangeWatcher | null = null;
	const suppressedWindows = new WeakSet<QuietGlimpseWindow>();

	function stopActiveWatcher(): void {
		if (activeWatcher == null) return;
		activeWatcher.dispose();
		activeWatcher = null;
	}

	function closeActiveWindow(options: { suppressResults?: boolean } = {}): void {
		if (activeWindow == null) return;
		const windowToClose = activeWindow;
		activeWindow = null;
		stopActiveWatcher();
		if (options.suppressResults) {
			suppressedWindows.add(windowToClose);
		}
		try {
			windowToClose.close();
		} catch {
			// Window is already closing; ignore shutdown races.
		}
	}

	async function reviewRepository(ctx: ExtensionCommandContext): Promise<void> {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("annotate-git-diff requires interactive mode.", "error");
			return;
		}

		if (activeWindow != null) {
			ctx.ui.notify("A review window is already open.", "warning");
			return;
		}

		try {
			let reviewData = await getReviewWindowData(pi, ctx.cwd);
			const { repoRoot } = reviewData;
			if (reviewData.files.length === 0 && reviewData.commits.length === 0) {
				ctx.ui.notify("No reviewable files found.", "info");
				return;
			}

			const html = buildReviewHtml(reviewData);
			const window = await openQuietGlimpse(html, {
				width: 1680,
				height: 1020,
				title: "annotate-git-diff",
			});
			activeWindow = window;

			const fileMap = new Map(reviewData.files.map((file) => [file.id, file]));
			const commitFileCache = new Map<string, Promise<ReviewFile[]>>();
			const contentCache = new Map<string, Promise<ReviewFileContents>>();

			const clearRefreshableCaches = (): void => {
				contentCache.clear();
				for (const sha of commitFileCache.keys()) {
					if (isWorkingTreeCommitSha(sha)) {
						commitFileCache.delete(sha);
					}
				}
			};

			const sendWindowMessage = (message: ReviewHostMessage): void => {
				if (activeWindow !== window) return;
				const payload = escapeForInlineScript(JSON.stringify(message));
				window.send(`window.__reviewReceive(${payload});`);
			};

			let watcherWarningShown = false;
			activeWatcher = createRepoChangeWatcher(
				repoRoot,
				() => {
					sendWindowMessage({ type: "working-tree-changed", changedAt: Date.now() });
				},
				{
					onError: (error) => {
						if (watcherWarningShown || activeWindow !== window) return;
						watcherWarningShown = true;
						ctx.ui.notify(`Review change watcher failed: ${error.message}`, "warning");
					},
				},
			);

			const loadCommitFiles = (sha: string): Promise<ReviewFile[]> => {
				const cached = commitFileCache.get(sha);
				if (cached != null) return cached;
				const pending = getCommitFiles(pi, repoRoot, sha);
				commitFileCache.set(sha, pending);
				pending
					.then((commitFiles) => {
						for (const cf of commitFiles) fileMap.set(cf.id, cf);
					})
					.catch(() => {});
				return pending;
			};

			const loadContents = (
				file: ReviewFile,
				scope: ReviewRequestFilePayload["scope"],
				commitSha: string | null,
			): Promise<ReviewFileContents> => {
				const cacheKey = `${scope}:${commitSha ?? ""}:${file.id}`;
				const cached = contentCache.get(cacheKey);
				if (cached != null) return cached;

				const pending = loadReviewFileContents(pi, repoRoot, file, scope, commitSha, reviewData.branchMergeBaseSha);
				contentCache.set(cacheKey, pending);
				return pending;
			};

			const terminalMessagePromise = new Promise<ReviewSubmitPayload | ReviewCancelPayload | null>(
				(resolve, reject) => {
					let settled = false;
					let closeTimer: ReturnType<typeof setTimeout> | null = null;

					const cleanup = (): void => {
						if (closeTimer != null) {
							clearTimeout(closeTimer);
							closeTimer = null;
						}
						window.removeListener("message", onMessage);
						window.removeListener("closed", onClosed);
						window.removeListener("error", onError);
						if (activeWindow === window) {
							activeWindow = null;
							stopActiveWatcher();
						}
					};

					const settle = (value: ReviewSubmitPayload | ReviewCancelPayload | null): void => {
						if (settled) return;
						settled = true;
						cleanup();
						resolve(value);
					};

					const handleRequestFile = async (message: ReviewRequestFilePayload): Promise<void> => {
						const file = fileMap.get(message.fileId);
						if (file == null) {
							sendWindowMessage({
								type: "file-error",
								requestId: message.requestId,
								fileId: message.fileId,
								scope: message.scope,
								commitSha: message.commitSha ?? null,
								message: "Unknown file requested.",
							});
							return;
						}

						try {
							const contents = await loadContents(file, message.scope, message.commitSha ?? null);
							sendWindowMessage({
								type: "file-data",
								requestId: message.requestId,
								fileId: message.fileId,
								scope: message.scope,
								commitSha: message.commitSha ?? null,
								originalContent: contents.originalContent,
								modifiedContent: contents.modifiedContent,
								kind: contents.kind,
								mimeType: contents.mimeType,
								originalExists: contents.originalExists,
								modifiedExists: contents.modifiedExists,
								originalPreviewUrl: contents.originalPreviewUrl,
								modifiedPreviewUrl: contents.modifiedPreviewUrl,
							});
						} catch (error) {
							const messageText = error instanceof Error ? error.message : String(error);
							sendWindowMessage({
								type: "file-error",
								requestId: message.requestId,
								fileId: message.fileId,
								scope: message.scope,
								commitSha: message.commitSha ?? null,
								message: messageText,
							});
						}
					};

					const handleRequestCommit = async (message: ReviewRequestCommitPayload): Promise<void> => {
						try {
							const commitFiles = await loadCommitFiles(message.sha);
							sendWindowMessage({
								type: "commit-data",
								requestId: message.requestId,
								sha: message.sha,
								files: commitFiles,
							});
						} catch (error) {
							const messageText = error instanceof Error ? error.message : String(error);
							sendWindowMessage({
								type: "commit-error",
								requestId: message.requestId,
								sha: message.sha,
								message: messageText,
							});
						}
					};

					const handleRequestReviewData = async (message: ReviewRequestReviewDataPayload): Promise<void> => {
						try {
							const nextReviewData = await getReviewWindowData(pi, repoRoot);
							clearRefreshableCaches();
							reviewData = nextReviewData;
							for (const file of reviewData.files) fileMap.set(file.id, file);
							sendWindowMessage({
								type: "review-data",
								requestId: message.requestId,
								files: reviewData.files,
								commits: reviewData.commits,
								branchBaseRef: reviewData.branchBaseRef,
								branchMergeBaseSha: reviewData.branchMergeBaseSha,
								repositoryHasHead: reviewData.repositoryHasHead,
							});
						} catch (error) {
							const messageText = error instanceof Error ? error.message : String(error);
							sendWindowMessage({
								type: "review-data-error",
								requestId: message.requestId,
								message: messageText,
							});
						}
					};

					const handleClipboardRead = (message: ReviewClipboardReadPayload): void => {
						try {
							sendWindowMessage({
								type: "clipboard-data",
								requestId: message.requestId,
								text: readSystemClipboard(),
							});
						} catch (error) {
							const messageText = error instanceof Error ? error.message : String(error);
							sendWindowMessage({
								type: "clipboard-data",
								requestId: message.requestId,
								text: "",
								message: messageText,
							});
						}
					};

					const handleClipboardWrite = (message: ReviewClipboardWritePayload): void => {
						try {
							writeSystemClipboard(message.text);
						} catch (error) {
							const messageText = error instanceof Error ? error.message : String(error);
							ctx.ui.notify(`Failed to copy from review window: ${messageText}`, "warning");
						}
					};

					const onMessage = (message: unknown): void => {
						if (isRequestFilePayload(message)) {
							void handleRequestFile(message);
							return;
						}
						if (isRequestCommitPayload(message)) {
							void handleRequestCommit(message);
							return;
						}
						if (isRequestReviewDataPayload(message)) {
							void handleRequestReviewData(message);
							return;
						}
						if (isClipboardReadPayload(message)) {
							handleClipboardRead(message);
							return;
						}
						if (isClipboardWritePayload(message)) {
							handleClipboardWrite(message);
							return;
						}
						if (isSubmitPayload(message) || isCancelPayload(message)) {
							settle(message);
						}
					};

					const onClosed = (): void => {
						if (settled || closeTimer != null) return;
						closeTimer = setTimeout(() => {
							closeTimer = null;
							settle(null);
						}, 250);
					};

					const onError = (error: Error): void => {
						if (settled) return;
						settled = true;
						cleanup();
						reject(error);
					};

					window.on("message", onMessage);
					window.on("closed", onClosed);
					window.on("error", onError);
				},
			);

			void (async () => {
				try {
					const message = await terminalMessagePromise;
					if (suppressedWindows.has(window)) return;
					if (message == null) return;
					if (message.type === "cancel") {
						ctx.ui.notify("Review cancelled.", "info");
						return;
					}
					if (!hasReviewFeedback(message)) return;

					const prompt = composeReviewPrompt([...fileMap.values()], message);
					appendReviewPrompt(ctx, prompt);
					ctx.ui.notify("Appended review feedback to the editor.", "info");
				} catch (error) {
					if (suppressedWindows.has(window)) return;
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Review failed: ${message}`, "error");
				}
			})();

			ctx.ui.notify("Opened native review window.", "info");
		} catch (error) {
			closeActiveWindow({ suppressResults: true });
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Review failed: ${message}`, "error");
		}
	}

	pi.registerCommand("annotate-git-diff", {
		description: "Open a native review window with branch, per-commit, and all-files scopes",
		handler: async (_args, ctx) => {
			await reviewRepository(ctx);
		},
	});

	pi.on("session_shutdown", async () => {
		closeActiveWindow({ suppressResults: true });
	});
}
