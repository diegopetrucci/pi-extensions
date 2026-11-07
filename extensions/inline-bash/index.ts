import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const TIMEOUT_MS = 30000;
  const MAX_OUTPUT_CHARS = 50000;

  const trimAndLimit = (output: string) => {
    const trimmed = output.trim();
    if (trimmed.length <= MAX_OUTPUT_CHARS) return trimmed;
    return `${trimmed.slice(0, MAX_OUTPUT_CHARS)}\n[inline-bash output truncated after ${MAX_OUTPUT_CHARS} characters]`;
  };

  const scanUntil = (text: string, from: number, close: string): number => {
    let i = from;
    while (i < text.length) {
      const c = text[i];
      if (c === "\\") {
        i += 2;
      } else if (c === "'") {
        const end = text.indexOf("'", i + 1);
        if (end === -1) return -1;
        i = end + 1;
      } else if (c === '"') {
        i = scanDoubleQuoted(text, i + 1);
        if (i === -1) return -1;
      } else if (c === close) {
        return i;
      } else if (c === "$" && (text[i + 1] === "{" || text[i + 1] === "(")) {
        const end = scanUntil(text, i + 2, text[i + 1] === "{" ? "}" : ")");
        if (end === -1) return -1;
        i = end + 1;
      } else if (c === "{" || c === "(") {
        const end = scanUntil(text, i + 1, c === "{" ? "}" : ")");
        if (end === -1) return -1;
        i = end + 1;
      } else {
        i++;
      }
    }
    return -1;
  };

  const scanDoubleQuoted = (text: string, from: number): number => {
    let i = from;
    while (i < text.length) {
      const c = text[i];
      if (c === "\\") {
        i += 2;
      } else if (c === '"') {
        return i + 1;
      } else if (c === "$" && (text[i + 1] === "{" || text[i + 1] === "(")) {
        const end = scanUntil(text, i + 2, text[i + 1] === "{" ? "}" : ")");
        if (end === -1) return -1;
        i = end + 1;
      } else {
        i++;
      }
    }
    return -1;
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

    const matches: Array<{ start: number; end: number; command: string }> = [];
    let unmatched = false;
    let searchFrom = 0;
    for (let start = text.indexOf("!{"); start !== -1; start = text.indexOf("!{", searchFrom)) {
      const close = scanUntil(text, start + 2, "}");
      searchFrom = start + 2;
      if (close === -1) {
        unmatched = true;
        break;
      }
      if (close === start + 2) continue;
      matches.push({
        start,
        end: close + 1,
        command: text.slice(start + 2, close),
      });
      searchFrom = close + 1;
    }
    if (unmatched && ctx.hasUI) {
      ctx.ui.notify("inline-bash: found !{ without a matching }; left as literal text.", "warning");
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
          signal: ctx.signal,
        });

        const output = bashResult.stdout || bashResult.stderr || "";
        const trimmed = trimAndLimit(output);

        const truncated = (bashResult as { truncated?: boolean }).truncated === true;
        let error: string | undefined;
        if (truncated) {
          error = `output exceeded limit; command terminated (exit code ${bashResult.code})`;
        } else if (bashResult.killed) {
          error = `command killed or timed out (exit code ${bashResult.code})`;
        } else if (bashResult.code !== 0) {
          error = `exit code ${bashResult.code}`;
        }
        expansions.push(error ? { command, output: trimmed, error } : { command, output: trimmed });

        parts.push(truncated ? `${trimmed}\n[inline-bash: ${error}]` : trimmed);
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
