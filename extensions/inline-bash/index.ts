import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const PATTERN = /!\{([^}]+)\}/g;
  const TIMEOUT_MS = 30000;
  const MAX_OUTPUT_CHARS = 50000;

  const trimAndLimit = (output: string) => {
    const trimmed = output.trim();
    if (trimmed.length <= MAX_OUTPUT_CHARS) return trimmed;
    return `${trimmed.slice(0, MAX_OUTPUT_CHARS)}\n[inline-bash output truncated after ${MAX_OUTPUT_CHARS} characters]`;
  };

  pi.on("input", async (event, ctx) => {
    const text = event.text;

    // Only expand prompts supplied by the user/client. Extension-injected follow-ups
    // should not get an implicit path to local shell execution.
    if (event.source === "extension") {
      return { action: "continue" };
    }

    if (text.trimStart().startsWith("!") && !text.trimStart().startsWith("!{")) {
      return { action: "continue" };
    }

    PATTERN.lastIndex = 0;
    const matches: Array<{ start: number; end: number; command: string }> = [];
    let match = PATTERN.exec(text);
    while (match) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        command: match[1],
      });
      match = PATTERN.exec(text);
    }
    if (matches.length === 0) {
      return { action: "continue" };
    }

    const parts: string[] = [];
    let cursor = 0;
    const expansions: Array<{ command: string; output: string; error?: string }> = [];

    for (const { start, end, command } of matches) {
      parts.push(text.slice(cursor, start));
      cursor = end;
      try {
        const bashResult = await pi.exec("bash", ["-c", command], {
          timeout: TIMEOUT_MS,
        });

        const output = bashResult.stdout || bashResult.stderr || "";
        const trimmed = trimAndLimit(output);

        if (bashResult.code !== 0 && bashResult.stderr) {
          expansions.push({
            command,
            output: trimmed,
            error: `exit code ${bashResult.code}`,
          });
        } else {
          expansions.push({ command, output: trimmed });
        }

        parts.push(trimmed);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        expansions.push({ command, output: "", error: errorMsg });
        parts.push(`[error: ${errorMsg}]`);
      }
    }
    parts.push(text.slice(cursor));
    const result = parts.join("");

    if (ctx.hasUI && expansions.length > 0) {
      const summary = expansions
        .map((e) => {
          const status = e.error ? ` (${e.error})` : "";
          const preview = e.output.length > 50 ? `${e.output.slice(0, 50)}...` : e.output;
          return `!{${e.command}}${status} -> "${preview}"`;
        })
        .join("\n");

      ctx.ui.notify(`Expanded ${expansions.length} inline command(s):\n${summary}`, "info");
    }

    return { action: "transform", text: result, images: event.images };
  });
}
