/// <reference path="./glimpseui.d.ts" />

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import type { GlimpseOpenOptions } from "glimpseui";

interface NativeHostInfo {
	path: string;
	extraArgs?: string[];
	buildHint?: string;
}

interface GlimpseProtocolMessage {
	type?: string;
	data?: unknown;
	screen?: unknown;
	screens?: unknown;
	appearance?: unknown;
	cursor?: unknown;
	cursorTip?: unknown;
}

export interface QuietGlimpseWindow {
	on(event: "message", listener: (data: unknown) => void): this;
	on(event: "closed", listener: () => void): this;
	on(event: "error", listener: (error: Error) => void): this;
	removeListener(event: "message", listener: (data: unknown) => void): this;
	removeListener(event: "closed", listener: () => void): this;
	removeListener(event: "error", listener: (error: Error) => void): this;
	send(js: string): void;
	close(): void;
}

class QuietGlimpseWindowImpl extends EventEmitter implements QuietGlimpseWindow {
	#proc: ChildProcessWithoutNullStreams;
	#closed = false;
	#pendingHTML: string | null;
	#stderr = "";

	constructor(proc: ChildProcessWithoutNullStreams, initialHTML: string) {
		super();
		this.#proc = proc;
		this.#pendingHTML = initialHTML;

		proc.stdin.on("error", () => {});
		proc.stderr.on("data", (chunk) => {
			this.#stderr += chunk.toString();
		});

		const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
		rl.on("line", (line) => {
			let message: GlimpseProtocolMessage;
			try {
				message = JSON.parse(line) as GlimpseProtocolMessage;
			} catch {
				this.emit("error", new Error(`Malformed glimpse protocol line: ${line}`));
				return;
			}

			switch (message.type) {
				case "ready":
					if (this.#pendingHTML != null) {
						this.setHTML(this.#pendingHTML);
						this.#pendingHTML = null;
					}
					break;
				case "message":
					this.emit("message", message.data);
					break;
				case "closed":
					this.#markClosed();
					break;
				default:
					break;
			}
		});

		proc.on("error", (error) => this.emit("error", error));
		proc.on("exit", (code, signal) => {
			const stderr = this.#stderr.trim();
			const failed = signal != null || (code != null && code !== 0);
			if (!this.#closed && failed) {
				const message = stderr || `Glimpse process exited abnormally (code: ${code}, signal: ${signal}).`;
				this.emit("error", new Error(message));
			}
			this.#markClosed();
		});
	}

	send(js: string): void {
		this.#write({ type: "eval", js });
	}

	close(): void {
		this.#write({ type: "close" });
	}

	#markClosed(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.emit("closed");
	}

	#write(obj: Record<string, unknown>): void {
		if (this.#closed) return;
		this.#proc.stdin.write(`${JSON.stringify(obj)}\n`);
	}

	setHTML(html: string): void {
		this.#write({ type: "html", html: Buffer.from(html).toString("base64") });
	}
}

async function getNativeHostInfo(): Promise<NativeHostInfo> {
	const glimpseModule = (await import("glimpseui")) as unknown as { getNativeHostInfo: () => NativeHostInfo };
	return glimpseModule.getNativeHostInfo();
}

export async function openQuietGlimpse(html: string, options: GlimpseOpenOptions = {}): Promise<QuietGlimpseWindow> {
	const host = await getNativeHostInfo();
	if (!existsSync(host.path)) {
		const hint = host.buildHint ? ` ${host.buildHint}` : "";
		throw new Error(`Glimpse host not found at '${host.path}'.${hint}`);
	}
	const args: string[] = [];

	if (options.width != null) args.push("--width", String(options.width));
	if (options.height != null) args.push("--height", String(options.height));
	if (options.title != null) args.push("--title", options.title);
	if (options.frameless) args.push("--frameless");
	if (options.floating) args.push("--floating");
	if (options.transparent) args.push("--transparent");
	if (options.clickThrough) args.push("--click-through");
	if (options.hidden) args.push("--hidden");
	if (options.autoClose) args.push("--auto-close");
	if (options.x != null) args.push(`--x=${options.x}`);
	if (options.y != null) args.push(`--y=${options.y}`);
	if (options.cursorOffset?.x != null) args.push(`--cursor-offset-x=${options.cursorOffset.x}`);
	if (options.cursorOffset?.y != null) args.push(`--cursor-offset-y=${options.cursorOffset.y}`);
	if (options.cursorAnchor != null) args.push("--cursor-anchor", options.cursorAnchor);
	if (options.followMode != null) args.push("--follow-mode", options.followMode);
	if (options.followCursor) args.push("--follow-cursor");

	const proc = spawn(host.path, [...(host.extraArgs ?? []), ...args], {
		stdio: ["pipe", "pipe", "pipe"],
		windowsHide: process.platform === "win32",
		env: {
			...process.env,
			OS_ACTIVITY_MODE: process.env.OS_ACTIVITY_MODE ?? "disable",
		},
	});

	return new QuietGlimpseWindowImpl(proc, html);
}
