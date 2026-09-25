/**
 * Pi Notify Extension
 *
 * Sends notifications when Pi agent is done and waiting for input, and
 * (optionally) when a permission prompt needs a human response.
 * Supports multiple channels:
 * - terminal notifications: OSC 777 and OSC 99, wrapped for tmux when needed
 * - desktop notifications: macOS Notification Center, Linux notify-send, Windows toast
 * - terminal bell
 * - sound playback
 *
 * Config files (project overrides global):
 * - ~/<pi-config-dir>/agent/extensions/notify.json
 * - <cwd>/<pi-config-dir>/notify.json, when the project is trusted
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

type TerminalBackend = "auto" | "osc777" | "osc99" | "none";
type TmuxPassthrough = "auto" | "always" | "never";
type DesktopBackend = "auto" | "macos" | "linux" | "windows-toast" | "none";
type SoundBackend = "auto" | "macos" | "linux" | "windows-beep" | "command" | "none";

type ProjectConfigContext = {
	cwd: string;
	isProjectTrusted?: () => boolean;
};

interface NotificationChannels {
	terminal: boolean;
	desktop: boolean;
	bell: boolean;
	sound: boolean;
}

interface PermissionPromptConfig {
	enabled: boolean;
	title: string;
	body: string;
	channels: NotificationChannels;
}

interface NotifyConfig {
	enabled: boolean;
	onlyWhenInteractive: boolean;
	title: string;
	body: string;
	channels: NotificationChannels;
	terminal: {
		backend: TerminalBackend;
		tmuxPassthrough: TmuxPassthrough;
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
	/**
	 * Notifications fired when a permission prompt is about to wait for a
	 * human response (the `permissions:ui_prompt` event broadcast by
	 * `@gotgenes/pi-permission-system`, when that extension is installed).
	 * Disabled by default: opt in explicitly since this fires mid-turn,
	 * unlike the settled-only `agent_settled` notification above.
	 */
	permissionPrompt: PermissionPromptConfig;
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
		tmuxPassthrough: "auto",
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
	permissionPrompt: {
		enabled: false,
		title: "Pi permission request",
		body: "{surface}: {value}",
		channels: {
			terminal: false,
			desktop: true,
			bell: false,
			sound: false,
		},
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
	const permissionPromptTitle =
		typeof overrides.permissionPrompt?.title === "string"
			? overrides.permissionPrompt.title
			: base.permissionPrompt.title;
	const permissionPromptBody =
		typeof overrides.permissionPrompt?.body === "string"
			? overrides.permissionPrompt.body
			: base.permissionPrompt.body;

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
		permissionPrompt: {
			...base.permissionPrompt,
			...overrides.permissionPrompt,
			title: permissionPromptTitle,
			body: permissionPromptBody,
			channels: {
				...base.permissionPrompt.channels,
				...overrides.permissionPrompt?.channels,
			},
		},
	};
}

function canReadProjectConfig(ctx: ProjectConfigContext): boolean {
	return typeof ctx.isProjectTrusted === "function" && ctx.isProjectTrusted();
}

function loadConfig(ctx: ProjectConfigContext): NotifyConfig {
	const globalConfig = readConfigFile(join(getAgentDir(), "extensions", "notify.json"));
	const projectConfig = canReadProjectConfig(ctx)
		? readConfigFile(join(ctx.cwd, CONFIG_DIR_NAME, "notify.json"))
		: {};
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

/**
 * Inside tmux, terminal notifications are written to tmux, not to the terminal
 * that can act on them: tmux is the pane's emulator and parses the sequence
 * itself. tmux has no OSC 777 or OSC 99 handler (checked in 3.7b, whose OSC
 * dispatch covers 4/7/8/9;4/10/11/12/52/104/133) and does not forward OSC codes
 * it does not recognise, so both backends are silently dropped.
 *
 * tmux's DCS passthrough asks it to write a payload to the outer terminal
 * verbatim. Every ESC inside the payload must be doubled.
 *
 * Users must also allow passthrough in tmux.conf:
 *
 *   set -g allow-passthrough all
 *
 * `all` rather than `on`, because `on` only honours passthrough from panes that
 * are currently visible - which drops exactly the notification that matters,
 * the one fired while the user is looking at a different window. When
 * passthrough is disabled entirely, the wrapped sequence is dropped just like
 * the bare one, so wrapping is never a regression.
 */
function wrapForTmux(sequence: string): string {
	return `\x1bPtmux;${sequence.replaceAll("\x1b", "\x1b\x1b")}\x1b\\`;
}

function shouldWrapForTmux(config: NotifyConfig): boolean {
	if (config.terminal.tmuxPassthrough === "never") return false;
	if (config.terminal.tmuxPassthrough === "always") return true;
	return Boolean(process.env.TMUX);
}

function writeTerminalSequence(sequence: string, wrap: boolean): void {
	process.stdout.write(wrap ? wrapForTmux(sequence) : sequence);
}

function notifyOSC777(title: string, body: string, wrap: boolean): void {
	writeTerminalSequence(`\x1b]777;notify;${title};${body}\x07`, wrap);
}

function notifyOSC99(title: string, body: string, wrap: boolean): void {
	writeTerminalSequence(`\x1b]99;i=1:d=0;${title}\x1b\\`, wrap);
	writeTerminalSequence(`\x1b]99;i=1:p=body;${body}\x1b\\`, wrap);
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

function sendTerminalNotification(
	title: string,
	body: string,
	backend: Exclude<TerminalBackend, "auto">,
	wrap: boolean,
): void {
	const safeTitle = sanitizeTerminalText(title);
	const safeBody = sanitizeTerminalText(body);

	if (backend === "osc99") {
		notifyOSC99(safeTitle, safeBody, wrap);
		return;
	}
	if (backend === "osc777") {
		notifyOSC777(safeTitle, safeBody, wrap);
	}
}

/** Strip C0/C1 controls that could terminate OSC or inject terminal commands. */
function sanitizeTerminalText(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
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
	let currentCtx: ExtensionContext | undefined;

	const captureCtx = async (_event: unknown, ctx: ExtensionContext) => {
		currentCtx = ctx;
	};

	pi.on("session_start", captureCtx);
	pi.on("before_agent_start", captureCtx);

	pi.on("agent_settled", async (_event, ctx) => {
		currentCtx = ctx;
		const config = loadConfig(ctx);
		if (!config.enabled) return;
		if (config.onlyWhenInteractive && !ctx.hasUI) return;

		await deliverNotification(config, config.title, config.body, config.channels);
	});

	// Fired by `@gotgenes/pi-permission-system` (when installed) immediately
	// before it shows an interactive permission prompt to the user. See:
	// https://github.com/gotgenes/pi-packages/blob/main/packages/pi-permission-system/docs/cross-extension-api.md#ui-prompt-broadcasts
	// No hard dependency on that package: the payload is read defensively,
	// and the channel simply never fires when the package isn't loaded.
	pi.events.on("permissions:ui_prompt", (raw) => {
		void handlePermissionUiPrompt(raw, currentCtx);
	});
}

async function handlePermissionUiPrompt(raw: unknown, ctx: ExtensionContext | undefined): Promise<void> {
	if (!ctx) return;

	const config = loadConfig(ctx);
	if (!config.enabled) return;
	if (!config.permissionPrompt.enabled) return;
	if (config.onlyWhenInteractive && !ctx.hasUI) return;

	const vars = extractPermissionPromptVars(raw);
	const title = renderTemplate(config.permissionPrompt.title, vars);
	const body = renderTemplate(config.permissionPrompt.body, vars);

	await deliverNotification(config, title, body, config.permissionPrompt.channels);
}

/**
 * Best-effort extraction of the `PermissionUiPromptEvent` display fields
 * (`surface`, `value`, `request.matchedPattern`). Read defensively per the
 * cross-extension API's stability guarantee: broadcast payloads carry no
 * `protocolVersion`, and fields may be added without a major bump.
 */
function extractPermissionPromptVars(raw: unknown): Record<string, string> {
	const event = (raw ?? {}) as {
		surface?: unknown;
		value?: unknown;
		request?: { matchedPattern?: unknown } | null;
	};

	const surface = typeof event.surface === "string" ? event.surface : "";
	const value = typeof event.value === "string" ? event.value : "";
	const pattern =
		event.request && typeof event.request === "object" && typeof event.request.matchedPattern === "string"
			? event.request.matchedPattern
			: "";

	return { surface, value, pattern };
}

function renderTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

async function deliverNotification(
	config: NotifyConfig,
	title: string,
	body: string,
	channels: NotificationChannels,
): Promise<void> {
	const tasks: Array<Promise<unknown>> = [];

	if (channels.terminal) {
		sendTerminalNotification(title, body, detectTerminalBackend(config), shouldWrapForTmux(config));
	}

	if (channels.desktop) {
		tasks.push(sendDesktopNotification(title, body, detectDesktopBackend(config)));
	}

	if (channels.bell) {
		ringBell();
	}

	if (channels.sound) {
		tasks.push(playSound(config, detectSoundBackend(config)));
	}

	if (tasks.length > 0) {
		await Promise.allSettled(tasks);
	}
}
