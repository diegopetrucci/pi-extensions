import type {
	Theme,
	ThemeBg,
	ThemeColor,
} from "@earendil-works/pi-coding-agent";

/**
 * The small public part of Pi's active theme used by the native annotation UI.
 * The command passes ctx.ui.theme directly; no Pi theme singleton is imported.
 */
export type AnnotateTheme = Pick<Theme, "appearance" | "colors" | "fg" | "bg">;

const DARK_FALLBACK: Readonly<Record<string, string>> = {
	"--color-scheme": "dark",
	"--bg": "#0d1117",
	"--panel": "#151b23",
	"--panel-hover": "#1f242c",
	"--inset": "#0b1118",
	"--border": "#30363d",
	"--border-muted": "#21262d",
	"--text": "#f0f6fc",
	"--muted": "#8a8a8a",
	"--dim": "#585858",
	"--accent": "#f4c95d",
	"--success": "#7ee787",
	"--error": "#ffb3b3",
	"--warning": "#f4c95d",
	"--mdHeading": "#f4c95d",
	"--mdLink": "#7dd3fc",
	"--mdLinkUrl": "#8a8a8a",
	"--mdCode": "#9b7bff",
	"--mdCodeBlock": "inherit",
	"--mdCodeBlockBorder": "#6f42c1",
	"--mdQuote": "#8a8a8a",
	"--mdQuoteBorder": "#6f42c1",
	"--mdHr": "#585858",
	"--mdListBullet": "#f4c95d",
	"--mdBold": "inherit",
	"--mdItalic": "inherit",
};

const LIGHT_FALLBACK: Readonly<Record<string, string>> = {
	"--color-scheme": "light",
	"--bg": "#f6f8fa",
	"--panel": "#ffffff",
	"--panel-hover": "#f3f4f6",
	"--inset": "#f6f8fa",
	"--border": "#d0d7de",
	"--border-muted": "#afb8c1",
	"--text": "#1f2328",
	"--muted": "#57606a",
	"--dim": "#6e7781",
	"--accent": "#8250df",
	"--success": "#1a7f37",
	"--error": "#cf222e",
	"--warning": "#9a6700",
	"--mdHeading": "#9a6700",
	"--mdLink": "#0969da",
	"--mdLinkUrl": "#57606a",
	"--mdCode": "#8250df",
	"--mdCodeBlock": "#1a7f37",
	"--mdCodeBlockBorder": "#6e7781",
	"--mdQuote": "#57606a",
	"--mdQuoteBorder": "#6e7781",
	"--mdHr": "#8c959f",
	"--mdListBullet": "#8250df",
	"--mdBold": "inherit",
	"--mdItalic": "inherit",
};

const BASIC_ANSI_COLORS: Readonly<Record<number, string>> = {
	0: "#000000",
	1: "#800000",
	2: "#008000",
	3: "#808000",
	4: "#000080",
	5: "#800080",
	6: "#008080",
	7: "#c0c0c0",
	8: "#808080",
	9: "#ff0000",
	10: "#00ff00",
	11: "#ffff00",
	12: "#0000ff",
	13: "#ff00ff",
	14: "#00ffff",
	15: "#ffffff",
};

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;
const SENTINEL = "X";

const FOREGROUND_THEME_VARS: ReadonlyArray<{ token: ThemeColor; cssVar: string }> = [
	{ token: "text", cssVar: "--text" },
	{ token: "muted", cssVar: "--muted" },
	{ token: "dim", cssVar: "--dim" },
	{ token: "accent", cssVar: "--accent" },
	{ token: "success", cssVar: "--success" },
	{ token: "error", cssVar: "--error" },
	{ token: "warning", cssVar: "--warning" },
	{ token: "mdHeading", cssVar: "--mdHeading" },
	{ token: "mdLink", cssVar: "--mdLink" },
	{ token: "mdLinkUrl", cssVar: "--mdLinkUrl" },
	{ token: "mdCode", cssVar: "--mdCode" },
	{ token: "mdCodeBlock", cssVar: "--mdCodeBlock" },
	{ token: "mdCodeBlockBorder", cssVar: "--mdCodeBlockBorder" },
	{ token: "mdQuote", cssVar: "--mdQuote" },
	{ token: "mdQuoteBorder", cssVar: "--mdQuoteBorder" },
	{ token: "mdHr", cssVar: "--mdHr" },
	{ token: "mdListBullet", cssVar: "--mdListBullet" },
	{ token: "border", cssVar: "--border" },
	{ token: "borderMuted", cssVar: "--border-muted" },
];

const BACKGROUND_THEME_VARS: ReadonlyArray<{ token: ThemeBg; cssVar: string }> = [
	{ token: "customMessageBg", cssVar: "--panel" },
	{ token: "selectedBg", cssVar: "--panel-hover" },
	{ token: "toolPendingBg", cssVar: "--inset" },
];

function toHex(value: number): string {
	const clamped = Math.min(255, Math.max(0, Math.round(value)));
	return clamped.toString(16).padStart(2, "0");
}

function xterm256ToHex(index: number): string | null {
	if (!Number.isInteger(index) || index < 0 || index > 255) return null;
	if (index < 16) return BASIC_ANSI_COLORS[index] ?? null;
	if (index >= 232) {
		const value = 8 + (index - 232) * 10;
		const hex = toHex(value);
		return `#${hex}${hex}${hex}`;
	}
	const cubeIndex = index - 16;
	const blue = cubeIndex % 6;
	const green = Math.floor(cubeIndex / 6) % 6;
	const red = Math.floor(cubeIndex / 36) % 6;
	return `#${toHex(CUBE_LEVELS[red])}${toHex(CUBE_LEVELS[green])}${toHex(CUBE_LEVELS[blue])}`;
}

function colorValueToHex(value: unknown): string | null {
	if (typeof value !== "object" || value == null) return null;
	const color = value as { kind?: unknown; r?: unknown; g?: unknown; b?: unknown; index?: unknown };
	if (color.kind === "rgb") {
		const channels = [color.r, color.g, color.b];
		if (!channels.every((channel) => typeof channel === "number" && Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
			return null;
		}
		return `#${toHex(color.r as number)}${toHex(color.g as number)}${toHex(color.b as number)}`;
	}
	if (color.kind === "indexed" && typeof color.index === "number") {
		return xterm256ToHex(color.index);
	}
	// OKLCH values are intentionally handled through theme.fg/theme.bg below.
	// Those public helpers account for Pi's configured terminal color mode.
	return null;
}

function ansiColorToHex(value: unknown, background: boolean): string | null {
	if (typeof value !== "string") return null;
	const match = new RegExp(`^\\u001b\\[([0-9;]+)m`).exec(value);
	if (!match) return null;
	const params = match[1].split(";").map(Number);
	const [mode, kind, first, second, third] = params;
	const expectedMode = background ? 48 : 38;
	if (mode !== expectedMode) {
		if (!background && ((mode >= 30 && mode <= 37) || (mode >= 90 && mode <= 97))) {
			return xterm256ToHex(mode >= 90 ? mode - 82 : mode - 30);
		}
		if (background && ((mode >= 40 && mode <= 47) || (mode >= 100 && mode <= 107))) {
			return xterm256ToHex(mode >= 100 ? mode - 92 : mode - 40);
		}
		return null;
	}
	if (kind === 2 && params.length >= 5) {
		const channels = [first, second, third];
		if (!channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) return null;
		return `#${toHex(first)}${toHex(second)}${toHex(third)}`;
	}
	if (kind === 5 && params.length >= 3) return xterm256ToHex(first);
	return null;
}

function readThemeColor(theme: AnnotateTheme, token: ThemeColor | ThemeBg, background: boolean): string | null {
	let colors: Readonly<Record<string, unknown>> | undefined;
	try {
		colors = theme.colors as Readonly<Record<string, unknown>>;
	} catch {
		colors = undefined;
	}

	let colorValue: unknown;
	try {
		colorValue = colors?.[token];
	} catch {
		colorValue = undefined;
	}
	const fromColors = colorValueToHex(colorValue);
	if (fromColors != null) return fromColors;

	try {
		const styled = background
			? theme.bg(token as ThemeBg, SENTINEL)
			: theme.fg(token as ThemeColor, SENTINEL);
		return ansiColorToHex(styled, background);
	} catch {
		return null;
	}
}

function readAppearance(theme: AnnotateTheme | null | undefined): "dark" | "light" {
	try {
		return theme?.appearance === "light" ? "light" : "dark";
	} catch {
		return "dark";
	}
}

/**
 * Build safe CSS custom properties from the active Pi theme.
 *
 * Every value is either a local fallback or a validated hex color. Theme
 * getters are isolated per token so one broken custom theme cannot make the
 * native annotation window unreadable or prevent it from opening.
 */
export function getThemeCssVars(theme?: AnnotateTheme | null): Record<string, string> {
	const vars: Record<string, string> = {
		...(readAppearance(theme) === "light" ? LIGHT_FALLBACK : DARK_FALLBACK),
	};
	if (theme == null) return vars;

	for (const { token, cssVar } of FOREGROUND_THEME_VARS) {
		const color = readThemeColor(theme, token, false);
		if (color != null) vars[cssVar] = color;
	}
	for (const { token, cssVar } of BACKGROUND_THEME_VARS) {
		const color = readThemeColor(theme, token, true);
		if (color != null) vars[cssVar] = color;
	}
	return vars;
}

export const __testing = {
	ansiColorToHex,
	colorValueToHex,
	xterm256ToHex,
};
