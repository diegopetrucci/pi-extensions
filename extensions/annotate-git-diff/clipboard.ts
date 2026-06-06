import { spawnSync } from "node:child_process";

const MAX_CLIPBOARD_BYTES = 16 * 1024 * 1024;

type ClipboardPlatform = NodeJS.Platform;

interface ClipboardCommand {
	command: string;
	args: string[];
}

export interface ClipboardCommandResult {
	status: number | null;
	signal?: NodeJS.Signals | null;
	stdout?: string | Buffer;
	stderr?: string | Buffer;
	error?: Error;
}

export type ClipboardCommandRunner = (
	command: string,
	args: string[],
	options: { encoding: "utf8"; maxBuffer: number; input?: string },
) => ClipboardCommandResult;

interface ClipboardOptions {
	platform?: ClipboardPlatform;
	runner?: ClipboardCommandRunner;
}

const defaultRunner: ClipboardCommandRunner = (command, args, options) => spawnSync(command, args, options);

function clipboardReadCommands(platform: ClipboardPlatform): ClipboardCommand[] {
	switch (platform) {
		case "darwin":
			return [{ command: "pbpaste", args: [] }];
		case "win32":
			return [
				{
					command: "powershell.exe",
					args: [
						"-NoProfile",
						"-NonInteractive",
						"-Command",
						"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw",
					],
				},
			];
		case "linux":
			return [
				{ command: "wl-paste", args: ["--type", "text/plain"] },
				{ command: "xclip", args: ["-selection", "clipboard", "-out"] },
				{ command: "xsel", args: ["--clipboard", "--output"] },
			];
		default:
			return [];
	}
}

function clipboardWriteCommands(platform: ClipboardPlatform): ClipboardCommand[] {
	switch (platform) {
		case "darwin":
			return [{ command: "pbcopy", args: [] }];
		case "win32":
			return [
				{
					command: "powershell.exe",
					args: [
						"-NoProfile",
						"-NonInteractive",
						"-Command",
						"[Console]::InputEncoding = [System.Text.Encoding]::UTF8; $text = [Console]::In.ReadToEnd(); Set-Clipboard -Value $text",
					],
				},
			];
		case "linux":
			return [
				{ command: "wl-copy", args: ["--type", "text/plain"] },
				{ command: "xclip", args: ["-selection", "clipboard", "-in"] },
				{ command: "xsel", args: ["--clipboard", "--input"] },
			];
		default:
			return [];
	}
}

function commandLabel(command: ClipboardCommand): string {
	return [command.command, ...command.args].join(" ");
}

function outputToString(value: string | Buffer | undefined): string {
	if (value == null) return "";
	return typeof value === "string" ? value : value.toString("utf8");
}

function runClipboardCommand(command: ClipboardCommand, runner: ClipboardCommandRunner, input?: string): string {
	const result = runner(command.command, command.args, {
		encoding: "utf8",
		maxBuffer: MAX_CLIPBOARD_BYTES,
		...(input == null ? {} : { input }),
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const stderr = outputToString(result.stderr).trim();
		const status = result.status == null ? result.signal || "unknown" : result.status;
		throw new Error(`${commandLabel(command)} exited with ${status}${stderr ? `: ${stderr}` : ""}`);
	}
	return outputToString(result.stdout);
}

function runFirstAvailable(commands: ClipboardCommand[], runner: ClipboardCommandRunner, input?: string): string {
	if (commands.length === 0) {
		throw new Error(`System clipboard is unsupported on ${process.platform}.`);
	}

	const errors: string[] = [];
	for (const command of commands) {
		try {
			return runClipboardCommand(command, runner, input);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${commandLabel(command)}: ${message}`);
		}
	}
	throw new Error(`No system clipboard command succeeded. ${errors.join("; ")}`);
}

export function readSystemClipboard(options: ClipboardOptions = {}): string {
	const platform = options.platform ?? process.platform;
	const runner = options.runner ?? defaultRunner;
	return runFirstAvailable(clipboardReadCommands(platform), runner);
}

export function writeSystemClipboard(text: string, options: ClipboardOptions = {}): void {
	const platform = options.platform ?? process.platform;
	const runner = options.runner ?? defaultRunner;
	runFirstAvailable(clipboardWriteCommands(platform), runner, text);
}

export const __testing = {
	clipboardReadCommands,
	clipboardWriteCommands,
};
