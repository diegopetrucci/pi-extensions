import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { openQuietGlimpse, type QuietGlimpseWindow } from "./quiet-glimpse.js";
import { composeAnnotateLastMessagePrompt, hasAnnotateLastMessageFeedback } from "./prompt.js";
import { findLastAssistantMessage } from "./session.js";
import type { AnnotateLastMessageCancelPayload, AnnotateLastMessageSubmitPayload, AnnotateLastMessageWindowMessage, LastAssistantMessageData } from "./types.js";
import { buildAnnotateLastMessageHtml } from "./ui.js";

function isSubmitPayload(value: unknown): value is AnnotateLastMessageSubmitPayload {
	return typeof value === "object" && value != null && "type" in value && value.type === "submit";
}

function isCancelPayload(value: unknown): value is AnnotateLastMessageCancelPayload {
	return typeof value === "object" && value != null && "type" in value && value.type === "cancel";
}

function appendPrompt(ctx: ExtensionCommandContext, prompt: string): void {
	const prefix = ctx.ui.getEditorText().trim().length > 0 ? "\n\n" : "";
	ctx.ui.pasteToEditor(`${prefix}${prompt}`);
}

export function registerAnnotateLastMessageCommand(pi: ExtensionAPI): void {
	let activeWindow: QuietGlimpseWindow | null = null;
	let annotationOpening = false;
	let annotationAttempt = 0;
	const suppressedWindows = new WeakSet<QuietGlimpseWindow>();

	function closeActiveWindow(options: { suppressResults?: boolean } = {}): void {
		annotationAttempt += 1;
		const windowToClose = activeWindow;
		activeWindow = null;
		if (windowToClose == null) return;
		if (options.suppressResults) {
			suppressedWindows.add(windowToClose);
		}
		try {
			windowToClose.close();
		} catch {
			// Ignore races when the native window is already closing.
		}
	}

	async function openAnnotationWindow(ctx: ExtensionCommandContext): Promise<void> {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("annotate-last-message requires interactive mode.", "error");
			return;
		}
		if (annotationOpening || activeWindow != null) {
			ctx.ui.notify("A last-message annotation window is already open.", "warning");
			return;
		}

		const messageResult = findLastAssistantMessage(ctx.sessionManager.getBranch());
		if (!messageResult.ok) {
			ctx.ui.notify(messageResult.message, "error");
			return;
		}

		const messageData = messageResult.data;
		annotationOpening = true;
		const attempt = ++annotationAttempt;

		try {
			const html = buildAnnotateLastMessageHtml(messageData);
			const window = await openQuietGlimpse(html, {
				width: 1440,
				height: 980,
				title: "annotate last message",
			});
			if (attempt !== annotationAttempt) {
				suppressedWindows.add(window);
				window.close();
				return;
			}
			activeWindow = window;
			if (window.failure != null) throw window.failure;
			if (window.closed) throw new Error("Glimpse closed while the annotation window was starting.");

			const terminalMessagePromise = new Promise<AnnotateLastMessageSubmitPayload | AnnotateLastMessageCancelPayload | null>(
				(resolve, reject) => {
					let settled = false;
					let closeTimer: ReturnType<typeof setTimeout> | null = null;

					const requestWindowClose = (): void => {
						try {
							window.close();
						} catch {
							// Ignore races when the native process has already exited.
						}
					};

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
						}
					};

					const settle = (value: AnnotateLastMessageWindowMessage | null): void => {
						if (settled) return;
						settled = true;
						cleanup();
						resolve(value);
					};

					const onMessage = (data: unknown): void => {
						if (isSubmitPayload(data) || isCancelPayload(data)) {
							requestWindowClose();
							settle(data);
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
						requestWindowClose();
						cleanup();
						reject(error);
					};

					window.on("message", onMessage);
					window.on("closed", onClosed);
					window.on("error", onError);
					if (window.failure != null) onError(window.failure);
					else if (window.closed) onClosed();
				},
			);

			void (async (windowMessageSource: QuietGlimpseWindow, sourceData: LastAssistantMessageData) => {
				try {
					const result = await terminalMessagePromise;
					if (suppressedWindows.has(windowMessageSource)) return;
					if (result == null) return;
					if (result.type === "cancel") {
						ctx.ui.notify("Annotation cancelled.", "info");
						return;
					}
					if (!hasAnnotateLastMessageFeedback(result)) {
						ctx.ui.notify("No annotation feedback submitted.", "info");
						return;
					}

					const prompt = composeAnnotateLastMessagePrompt(sourceData, result);
					appendPrompt(ctx, prompt);
					ctx.ui.notify("Appended annotation feedback to the editor.", "info");
				} catch (error) {
					if (suppressedWindows.has(windowMessageSource)) return;
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Annotation failed: ${message}`, "error");
				}
			})(window, messageData);

			ctx.ui.notify("Opened native annotation window.", "info");
		} catch (error) {
			closeActiveWindow({ suppressResults: true });
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Annotation failed: ${message}`, "error");
		} finally {
			annotationOpening = false;
		}
	}

	pi.registerCommand("annotate-last-message", {
		description: "Open a native annotation window for the latest assistant message",
		handler: async (_args, ctx) => {
			await openAnnotationWindow(ctx);
		},
	});

	pi.on("session_shutdown", async () => {
		closeActiveWindow({ suppressResults: true });
	});
}

export default function (pi: ExtensionAPI): void {
	registerAnnotateLastMessageCommand(pi);
}
