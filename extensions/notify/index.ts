/**
 * Pi Notify Extension
 *
 * Sends notifications when Pi agent is done and waiting for input.
 * Supports multiple channels:
 * - terminal notifications: OSC 777 and OSC 99
 * - desktop notifications: macOS Notification Center, Linux notify-send, Windows toast
 * - terminal bell
 * - sound playback
 *
 * Config files (project overrides global):
 * - ~/.pi/agent/extensions/notify.json
 * - <cwd>/.pi/notify.json
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

type TerminalBackend = "auto" | "osc777" | "osc99" | "none";
type DesktopBackend = "auto" | "macos" | "linux" | "windows-toast" | "none";
type SoundBackend = "auto" | "macos" | "linux" | "windows-beep" | "command" | "none";

interface NotifyConfig {
	enabled: boolean;
	onlyWhenInteractive: boolean;
	title: string;
	body: string;
	channels: {
		terminal: boolean;
		desktop: boolean;
		bell: boolean;
		sound: boolean;
	};
	terminal: {
		backend: TerminalBackend;
	};
	desktop: {
		backend: DesktopBackend;
	};
	sound: {
		backend: SoundBackend;
		name: string;
		linuxSoundId: string;
		frequencyHz: number;
		durationMs: number;
		command: string;
	};
}

const DEFAULT_CONFIG: NotifyConfig = {
	enabled: true,
	onlyWhenInteractive: true,
	title: "Pi",
	body: "Ready for input",
	channels: {
		terminal: true,
		desktop: true,
		bell: true,
		sound: false,
	},
	terminal: {
		backend: "auto",
	},
	desktop: {
		backend: "auto",
	},
	sound: {
		backend: "auto",
		name: "Glass",
		linuxSoundId: "complete",
		frequencyHz: 1000,
		durationMs: 250,
		command: "",
	},
};

function readConfigFile(path: string): Partial<NotifyConfig> {
	if (!existsSync(path)) return {};

	try {
		return JSON.parse(readFileSync(path, "utf-8")) as Partial<NotifyConfig>;
	} catch (error) {
		console.error(`Warning: Could not parse ${path}: ${error}`);
		return {};
	}
}

function mergeConfig(base: NotifyConfig, overrides: Partial<NotifyConfig>): NotifyConfig {
	return {
		...base,
		...overrides,
		channels: {
			...base.channels,
			...overrides.channels,
		},
		terminal: {
			...base.terminal,
			...overrides.terminal,
		},
		desktop: {
			...base.desktop,
			...overrides.desktop,
		},
		sound: {
			...base.sound,
			...overrides.sound,
		},
	};
}

function loadConfig(cwd: string): NotifyConfig {
	const globalConfig = readConfigFile(join(getAgentDir(), "extensions", "notify.json"));
	const projectConfig = readConfigFile(join(cwd, ".pi", "notify.json"));
	return mergeConfig(mergeConfig(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function powershellString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function windowsToastScript(title: string, body: string): string {
	const type = "Windows.UI.Notifications";
	const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
	const template = `[${type}.ToastTemplateType]::ToastText01`;
	const toast = `[${type}.ToastNotification]::new($xml)`;
	return [
		`${mgr} > $null`,
		`$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
		`$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode(${powershellString(body)})) > $null`,
		`[${type}.ToastNotificationManager]::CreateToastNotifier(${powershellString(title)}).Show(${toast})`,
	].join("; ");
}

function notifyOSC777(title: string, body: string): void {
	process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

function notifyOSC99(title: string, body: string): void {
	process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
	process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
}

function ringBell(): void {
	process.stdout.write("\x07");
}

function runCommand(command: string, args: string[]): Promise<boolean> {
	return new Promise((resolve) => {
		execFile(command, args, (error) => resolve(!error));
	});
}

function runShellCommand(command: string): Promise<boolean> {
	if (process.platform === "win32") {
		return runCommand("cmd.exe", ["/d", "/s", "/c", command]);
	}

	return runCommand(process.env.SHELL || "/bin/sh", ["-lc", command]);
}

function detectTerminalBackend(config: NotifyConfig): Exclude<TerminalBackend, "auto"> {
	if (config.terminal.backend !== "auto") return config.terminal.backend;
	if (process.env.KITTY_WINDOW_ID) return "osc99";
	return "osc777";
}

function detectDesktopBackend(config: NotifyConfig): Exclude<DesktopBackend, "auto"> {
	if (config.desktop.backend !== "auto") return config.desktop.backend;
	if (process.env.WT_SESSION || process.env.WSL_DISTRO_NAME) return "windows-toast";
	if (process.platform === "darwin") return "macos";
	if (process.platform === "linux") return "linux";
	if (process.platform === "win32") return "windows-toast";
	return "none";
}

function detectSoundBackend(config: NotifyConfig): Exclude<SoundBackend, "auto"> {
	if (config.sound.backend !== "auto") return config.sound.backend;
	if (process.env.WT_SESSION || process.platform === "win32" || process.env.WSL_DISTRO_NAME) return "windows-beep";
	if (process.platform === "darwin") return "macos";
	if (process.platform === "linux") return "linux";
	return "none";
}

function sendTerminalNotification(title: string, body: string, backend: Exclude<TerminalBackend, "auto">): void {
	if (backend === "osc99") {
		notifyOSC99(title, body);
		return;
	}
	if (backend === "osc777") {
		notifyOSC777(title, body);
	}
}

function appleScriptString(value: string): string {
	return JSON.stringify(value);
}

function sendDesktopNotification(
	title: string,
	body: string,
	backend: Exclude<DesktopBackend, "auto">,
): Promise<boolean> {
	if (backend === "windows-toast") {
		return runCommand("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)]);
	}
	if (backend === "macos") {
		return runCommand("osascript", ["-e", `display notification ${appleScriptString(body)} with title ${appleScriptString(title)}`]);
	}
	if (backend === "linux") {
		return runCommand("notify-send", [title, body]);
	}
	return Promise.resolve(false);
}

async function playSound(config: NotifyConfig, backend: Exclude<SoundBackend, "auto">): Promise<boolean> {
	if (backend === "command") {
		if (!config.sound.command.trim()) return false;
		return runShellCommand(config.sound.command);
	}

	if (backend === "windows-beep") {
		return runCommand("powershell.exe", [
			"-NoProfile",
			"-Command",
			`[console]::beep(${config.sound.frequencyHz}, ${config.sound.durationMs})`,
		]);
	}

	if (backend === "macos") {
		return runCommand("afplay", [`/System/Library/Sounds/${config.sound.name}.aiff`]);
	}

	if (backend === "linux") {
		const soundId = config.sound.linuxSoundId;
		const viaCanberra = await runCommand("canberra-gtk-play", ["-i", soundId]);
		if (viaCanberra) return true;
		return runCommand("paplay", [`/usr/share/sounds/freedesktop/stereo/${soundId}.oga`]);
	}

	return false;
}

export default function notifyExtension(pi: ExtensionAPI) {
	pi.on("agent_end", async (_event, ctx) => {
		const config = loadConfig(ctx.cwd);
		if (!config.enabled) return;
		if (config.onlyWhenInteractive && !ctx.hasUI) return;

		const tasks: Array<Promise<unknown>> = [];

		if (config.channels.terminal) {
			sendTerminalNotification(config.title, config.body, detectTerminalBackend(config));
		}

		if (config.channels.desktop) {
			tasks.push(sendDesktopNotification(config.title, config.body, detectDesktopBackend(config)));
		}

		if (config.channels.bell) {
			ringBell();
		}

		if (config.channels.sound) {
			tasks.push(playSound(config, detectSoundBackend(config)));
		}

		if (tasks.length > 0) {
			await Promise.allSettled(tasks);
		}
	});
}
