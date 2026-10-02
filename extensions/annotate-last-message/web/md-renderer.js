/* global globalThis */

/**
 * TLH annotate-last-message: pure markdown line parser.
 *
 * Single source of truth for the parsing logic.  ui.ts reads this file and
 * inlines it as a dedicated script before app.js, so globalThis.__tlhMdRenderer
 * is available when the app script runs.  Tests load this file directly in a
 * Node.js vm context (no DOM required).
 */
(function (global) {
  "use strict";

  // -------------------------------------------------------------------------
  // Fence-state machine
  //
  // Applied over the full ordered line list before per-line rendering begins.
  // Each line is tagged as: 'plain' | 'fence-open' | 'fence-body' | 'fence-close'
  //
  // Fence-delimiter lines (the ``` or ~~~ lines) are tagged 'fence-open' or
  // 'fence-close'; they are rendered visible but styled as block-edge markers
  // (--mdCodeBlockBorder colour) rather than suppressed. Fence-body lines skip
  // inline markdown processing and receive code-block styling instead.
  //
  // A fenced block that reaches end-of-input without a closing delimiter is
  // left open; all remaining lines are tagged 'fence-body'.
  // -------------------------------------------------------------------------

  function isFenceDelimiter(text) {
    // CommonMark §4.5: opening/closing fences allow at most 3 spaces of
    // indentation. A line with 4+ leading spaces is an indented code block
    // and must not be treated as a fence delimiter.
    const m = /^ {0,3}(```+|~~~+)/.exec(text);
    return m ? { char: m[1][0], len: m[1].length } : null;
  }

  /**
   * applyFenceState(lineTexts) → Array<{ text: string, lineType: string }>
   *
   * One output entry per input entry; the count is always preserved.
   */
  function applyFenceState(lineTexts) {
    const result = [];
    let inFence = false;
    let fenceChar = "";
    let fenceLen = 0;

    for (const text of lineTexts) {
      const fence = isFenceDelimiter(text);

      if (!inFence) {
        if (fence) {
          inFence = true;
          fenceChar = fence.char;
          fenceLen = fence.len;
          result.push({ text, lineType: "fence-open" });
        } else {
          result.push({ text, lineType: "plain" });
        }
      } else {
        // Close if same delimiter character, at least as many chars, and
        // nothing but optional whitespace after the delimiter (CommonMark
        // §4.5: a closing fence must not have trailing non-whitespace).
        const afterDelim = fence ? text.replace(/^ {0,3}(?:```+|~~~+)/, "") : "";
        if (
          fence &&
          fence.char === fenceChar &&
          fence.len >= fenceLen &&
          /^\s*$/.test(afterDelim)
        ) {
          inFence = false;
          fenceChar = "";
          fenceLen = 0;
          result.push({ text, lineType: "fence-close" });
        } else {
          result.push({ text, lineType: "fence-body" });
        }
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Line classifier (called only on 'plain'-typed lines)
  // -------------------------------------------------------------------------

  /**
   * classifyLine(text) → LineInfo
   *
   * Returned shapes:
   *   { type: 'blank' }
   *   { type: 'heading', level: 1-6, text: string }
   *   { type: 'hr' }
   *   { type: 'blockquote', text: string }
   *   { type: 'ul', indent: string, bullet: string, text: string }
   *   { type: 'ol', indent: string, bullet: string, text: string }
   *   { type: 'plain', text: string }
   */
  function classifyLine(text) {
    if (text.trim().length === 0) {
      return { type: "blank" };
    }

    const trimmed = text.trimStart();
    const indentLen = text.length - trimmed.length;

    // CommonMark block-indentation rule: constructs that HIDE or REPLACE
    // source characters (headings hide '#', thematic breaks replace the
    // whole line, blockquotes hide '>') must have at most 3 spaces of
    // leading indentation. At 4+ spaces the line is indented code and
    // must render literally. List markers are exempt: they preserve every
    // source character and only restyle the bullet, so nested-list
    // indentation stays lenient.
    const blockSafe = indentLen <= 3;

    // ATX heading: # … through ###### …
    // The heading content may optionally end with a closing # sequence.
    if (blockSafe) {
      const headingMatch = /^(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/.exec(trimmed);
      if (headingMatch) {
        return { type: "heading", level: headingMatch[1].length, text: headingMatch[2] };
      }
    }

    // Thematic break: 3+ dashes, stars, or underscores with optional spaces.
    if (blockSafe) {
      if (/^(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(trimmed)) {
        return { type: "hr" };
      }
    }

    // Blockquote: > text
    if (blockSafe) {
      const bqMatch = /^>[ \t]?(.*)/.exec(trimmed);
      if (bqMatch) {
        return { type: "blockquote", text: bqMatch[1] };
      }
    }

    // Unordered list item: optional indent + (- * +) + one or more spaces + text
    const ulMatch = /^(\s*)([-*+])[ \t]+(.*)/.exec(text);
    if (ulMatch) {
      return { type: "ul", indent: ulMatch[1], bullet: ulMatch[2], text: ulMatch[3] };
    }

    // Ordered list item: optional indent + number. + one or more spaces + text
    const olMatch = /^(\s*)(\d+\.)[ \t]+(.*)/.exec(text);
    if (olMatch) {
      return { type: "ol", indent: olMatch[1], bullet: olMatch[2], text: olMatch[3] };
    }

    return { type: "plain", text };
  }

  // -------------------------------------------------------------------------
  // Inline tokenizer
  // -------------------------------------------------------------------------

  function isMarkdownSpecial(ch) {
    return ch === "*" || ch === "_" || ch === "~" || ch === "`" || ch === "[" || ch === "\\";
  }

  /**
   * Try to parse an inline code span starting at position i.
   * Returns { codeText, end } on success, null on failure.
   */
  function tryParseCodeSpan(text, i) {
    // Count opening backtick run.
    let tickCount = 0;
    while (i + tickCount < text.length && text[i + tickCount] === "`") tickCount++;
    const contentStart = i + tickCount;

    // Find a closing run of exactly the same length.
    let j = contentStart;
    while (j < text.length) {
      if (text[j] !== "`") {
        j++;
        continue;
      }
      let runLen = 0;
      while (j + runLen < text.length && text[j + runLen] === "`") runLen++;
      if (runLen === tickCount) {
        return { codeText: text.slice(contentStart, j), end: j + tickCount };
      }
      j += runLen;
    }
    return null;
  }

  /**
   * Find the closing position of an emphasis/strikethrough marker.
   * Skips over backslash escapes and inline code spans.
   * For single-char markers (star or underscore) the closer must be an
   * isolated run of exactly 1; for 2- or 3-char markers the run must be
   * exactly that length. Returns -1 if not found.
   *
   * When checkIntraword is true (used for underscore-based delimiters),
   * a candidate closing run that is flanked by alphanumerics on both sides
   * is skipped — CommonMark's intraword-underscore rule.
   */
  function findEmphasisCloser(text, marker, from, checkIntraword = false) {
    const mLen = marker.length;
    const mChar = marker[0];
    let j = from;

    while (j < text.length) {
      // Backslash escape: skip the next character.
      if (text[j] === "\\" && j + 1 < text.length) {
        j += 2;
        continue;
      }

      // Inline code span: skip its entire content.
      if (text[j] === "`") {
        let tickCount = 0;
        while (j + tickCount < text.length && text[j + tickCount] === "`") tickCount++;
        const closeAt = text.indexOf("`".repeat(tickCount), j + tickCount);
        j = closeAt === -1 ? text.length : closeAt + tickCount;
        continue;
      }

      if (text[j] === mChar) {
        // Measure the run length at this position.
        let runLen = 0;
        while (j + runLen < text.length && text[j + runLen] === mChar) runLen++;

        if (runLen === mLen) {
          if (checkIntraword) {
            // Underscore-based closing delimiter flanked by alphanumerics
            // on both sides is intraword and cannot close emphasis.
            const charBefore = j > 0 ? text[j - 1] : "";
            const charAfter = j + mLen < text.length ? text[j + mLen] : "";
            if (/[a-zA-Z0-9]/.test(charBefore) && /[a-zA-Z0-9]/.test(charAfter)) {
              j += runLen;
              continue;
            }
          }
          return j;
        }
        // Wrong run length — skip the whole run and keep scanning.
        j += runLen;
        continue;
      }

      j++;
    }

    return -1;
  }

  /**
   * tokenizeLine(text) → Token[]
   *
   * Parses inline markdown and returns a token tree.  Falls back to a single
   * plain-text token if an error is thrown.
   *
   * Token shapes:
   *   { type: 'text', text: string }
   *   { type: 'code', text: string }
   *   { type: 'bold', children: Token[] }
   *   { type: 'italic', children: Token[] }
   *   { type: 'boldItalic', children: Token[] }
   *   { type: 'strikethrough', children: Token[] }
   *   { type: 'link', labelTokens: Token[], url: string }
   */
  function tokenizeLine(text) {
    try {
      return parseInlineSpans(text);
    } catch {
      return [{ type: "text", text }];
    }
  }

  function parseInlineSpans(text) {
    const tokens = [];
    let i = 0;
    let buf = "";

    function flush() {
      if (buf.length > 0) {
        tokens.push({ type: "text", text: buf });
        buf = "";
      }
    }

    while (i < text.length) {
      const ch = text[i];

      // Backslash escape: treat next markdown-special character as literal.
      if (ch === "\\" && i + 1 < text.length && isMarkdownSpecial(text[i + 1])) {
        buf += text[i + 1];
        i += 2;
        continue;
      }

      // Inline code span.
      if (ch === "`") {
        const result = tryParseCodeSpan(text, i);
        if (result) {
          flush();
          tokens.push({ type: "code", text: result.codeText });
          i = result.end;
          continue;
        }
        buf += ch;
        i++;
        continue;
      }

      // Link: [label](url)
      if (ch === "[") {
        let closeLabel = -1;
        let depth = 0;
        for (let k = i + 1; k < text.length; k++) {
          if (text[k] === "[") depth++;
          else if (text[k] === "]") {
            if (depth === 0) {
              closeLabel = k;
              break;
            }
            depth--;
          }
        }
        if (closeLabel !== -1 && text[closeLabel + 1] === "(") {
          const urlStart = closeLabel + 2;
          const closeUrl = text.indexOf(")", urlStart);
          if (closeUrl !== -1) {
            flush();
            const labelText = text.slice(i + 1, closeLabel);
            const url = text.slice(urlStart, closeUrl);
            tokens.push({ type: "link", labelTokens: parseInlineSpans(labelText), url });
            i = closeUrl + 1;
            continue;
          }
        }
        buf += ch;
        i++;
        continue;
      }

      // Bold+italic: ***text*** or ___text___
      if (
        (ch === "*" && text[i + 1] === "*" && text[i + 2] === "*") ||
        (ch === "_" && text[i + 1] === "_" && text[i + 2] === "_")
      ) {
        // Underscore-based opening: skip if flanked by alphanumerics
        // on both sides (CommonMark intraword-underscore rule).
        if (ch === "_") {
          const charBefore = i > 0 ? text[i - 1] : "";
          const charAfter = i + 3 < text.length ? text[i + 3] : "";
          if (/[a-zA-Z0-9]/.test(charBefore) && /[a-zA-Z0-9]/.test(charAfter)) {
            buf += ch.repeat(3);
            i += 3;
            continue;
          }
        }
        const marker = ch.repeat(3);
        const closeIdx = findEmphasisCloser(text, marker, i + 3, ch === "_");
        if (closeIdx !== -1) {
          const inner = text.slice(i + 3, closeIdx);
          if (inner.length > 0 && inner[0] !== " " && inner[inner.length - 1] !== " ") {
            flush();
            tokens.push({ type: "boldItalic", children: parseInlineSpans(inner) });
            i = closeIdx + 3;
            continue;
          }
        }
      }

      // Bold: **text** or __text__
      if (
        (ch === "*" && text[i + 1] === "*" && text[i + 2] !== "*") ||
        (ch === "_" && text[i + 1] === "_" && text[i + 2] !== "_")
      ) {
        // Underscore-based opening: skip if flanked by alphanumerics
        // on both sides (CommonMark intraword-underscore rule).
        if (ch === "_") {
          const charBefore = i > 0 ? text[i - 1] : "";
          const charAfter = i + 2 < text.length ? text[i + 2] : "";
          if (/[a-zA-Z0-9]/.test(charBefore) && /[a-zA-Z0-9]/.test(charAfter)) {
            buf += ch.repeat(2);
            i += 2;
            continue;
          }
        }
        const marker = ch.repeat(2);
        const closeIdx = findEmphasisCloser(text, marker, i + 2, ch === "_");
        if (closeIdx !== -1) {
          const inner = text.slice(i + 2, closeIdx);
          if (inner.length > 0 && inner[0] !== " " && inner[inner.length - 1] !== " ") {
            flush();
            tokens.push({ type: "bold", children: parseInlineSpans(inner) });
            i = closeIdx + 2;
            continue;
          }
        }
      }

      // Strikethrough: ~~text~~
      if (ch === "~" && text[i + 1] === "~") {
        const closeIdx = text.indexOf("~~", i + 2);
        if (closeIdx !== -1) {
          const inner = text.slice(i + 2, closeIdx);
          if (inner.length > 0) {
            flush();
            tokens.push({ type: "strikethrough", children: parseInlineSpans(inner) });
            i = closeIdx + 2;
            continue;
          }
        }
      }

      // Italic: *text* or _text_  (single marker, not start of ** or ***)
      if ((ch === "*" && text[i + 1] !== "*") || (ch === "_" && text[i + 1] !== "_")) {
        // Underscore-based opening: skip if flanked by alphanumerics
        // on both sides (CommonMark intraword-underscore rule).
        if (ch === "_") {
          const charBefore = i > 0 ? text[i - 1] : "";
          const charAfter = i + 1 < text.length ? text[i + 1] : "";
          if (/[a-zA-Z0-9]/.test(charBefore) && /[a-zA-Z0-9]/.test(charAfter)) {
            buf += ch;
            i += 1;
            continue;
          }
        }
        const closeIdx = findEmphasisCloser(text, ch, i + 1, ch === "_");
        if (closeIdx !== -1) {
          const inner = text.slice(i + 1, closeIdx);
          if (inner.length > 0 && inner[0] !== " " && inner[inner.length - 1] !== " ") {
            flush();
            tokens.push({ type: "italic", children: parseInlineSpans(inner) });
            i = closeIdx + 1;
            continue;
          }
        }
      }

      buf += ch;
      i++;
    }

    flush();
    return tokens;
  }

  global.__tlhMdRenderer = {
    applyFenceState,
    classifyLine,
    tokenizeLine,
  };
})(globalThis);
