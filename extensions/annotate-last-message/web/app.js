/* global window, document */

// Markdown parsing helpers are provided by the md-renderer.js script that
// ui.ts inlines before this file.  Access them via globalThis.__tlhMdRenderer.

const messageData = JSON.parse(
  document.getElementById("annotate-last-message-data").textContent || "{}",
);
if (!Array.isArray(messageData.lines)) messageData.lines = [];
if (!Array.isArray(messageData.sections)) messageData.sections = [];

const state = {
  overallComment: "",
  inlineComments: new Map(),
  sectionComments: new Map(),
};

const elements = {
  messageLines: document.getElementById("message-lines"),
  overallComment: document.getElementById("overall-comment"),
  sectionComments: document.getElementById("section-comments"),
  status: document.getElementById("status"),
  submitButton: document.getElementById("submit-button"),
  cancelButton: document.getElementById("cancel-button"),
};

// Compute fence context once over the complete source message. Section cards
// reuse this source-line metadata so a section that starts after a blank line
// inside a fence remains a code preview instead of reopening markdown parsing.
const fullMessageFenceState = globalThis.__tlhMdRenderer.applyFenceState(
  messageData.lines.map((line) => line.text),
);

function feedbackCount() {
  let count = state.overallComment.trim().length > 0 ? 1 : 0;
  for (const value of state.inlineComments.values()) {
    if (value.trim().length > 0) count += 1;
  }
  for (const value of state.sectionComments.values()) {
    if (value.trim().length > 0) count += 1;
  }
  return count;
}

function setStatus(message, status = "idle") {
  elements.status.textContent = message;
  elements.status.dataset.state = status;
}

function updateSubmitState() {
  const count = feedbackCount();
  elements.submitButton.disabled = count === 0;
  if (count === 0) {
    setStatus("Add any feedback you want to send to the agent.");
    return;
  }
  const noun = count === 1 ? "item" : "items";
  setStatus(`Ready to submit ${count} feedback ${noun}.`, "ready");
}

function setInlineComment(lineNumber, value) {
  state.inlineComments.set(lineNumber, value);
  updateSubmitState();
}

function setSectionComment(sectionId, value) {
  state.sectionComments.set(sectionId, value);
  updateSubmitState();
}

function createInlineEditor(line) {
  const container = document.createElement("div");
  container.className = "inline-editor";
  container.hidden = true;

  const meta = document.createElement("p");
  meta.className = "line-meta";
  meta.textContent = `Inline note for line ${line.number}`;
  container.append(meta);

  const textarea = document.createElement("textarea");
  textarea.placeholder =
    "Explain what should change here, what is unclear, or what planning detail is missing.";
  textarea.value = state.inlineComments.get(line.number) || "";
  container.append(textarea);

  return { container, textarea };
}

// ---------------------------------------------------------------------------
// Markdown DOM rendering helpers
// ---------------------------------------------------------------------------

/**
 * Render an array of inline tokens into a parent element using
 * createElement/textContent only (no innerHTML).
 */
function renderInlineTokens(parent, tokens) {
  for (const token of tokens) {
    switch (token.type) {
      case "text":
        parent.append(document.createTextNode(token.text));
        break;
      case "code": {
        const code = document.createElement("code");
        code.textContent = token.text;
        parent.append(code);
        break;
      }
      case "bold": {
        const strong = document.createElement("strong");
        renderInlineTokens(strong, token.children);
        parent.append(strong);
        break;
      }
      case "italic": {
        const em = document.createElement("em");
        renderInlineTokens(em, token.children);
        parent.append(em);
        break;
      }
      case "boldItalic": {
        const strong = document.createElement("strong");
        const em = document.createElement("em");
        renderInlineTokens(em, token.children);
        strong.append(em);
        parent.append(strong);
        break;
      }
      case "strikethrough": {
        const s = document.createElement("s");
        renderInlineTokens(s, token.children);
        parent.append(s);
        break;
      }
      case "link": {
        // Render the link label text inside an <a> element.
        // href is intentionally not set to avoid javascript: URL XSS;
        // the URL is shown as muted text beside the link.
        const a = document.createElement("a");
        renderInlineTokens(a, token.labelTokens);
        const urlSpan = document.createElement("span");
        urlSpan.className = "md-link-url";
        urlSpan.textContent = ` (${token.url})`;
        parent.append(a);
        parent.append(urlSpan);
        break;
      }
      default:
        if (typeof token.text === "string") {
          parent.append(document.createTextNode(token.text));
        }
    }
  }
}

/**
 * Populate a container element with DOM nodes for a classified (non-fence) line.
 * Leading indentation is preserved via text nodes where relevant.
 */
function renderClassifiedLine(container, classification) {
  switch (classification.type) {
    case "blank":
      container.textContent = " ";
      break;
    case "heading": {
      const h = document.createElement(`h${classification.level}`);
      renderInlineTokens(h, globalThis.__tlhMdRenderer.tokenizeLine(classification.text));
      container.append(h);
      break;
    }
    case "hr":
      container.append(document.createElement("hr"));
      break;
    case "blockquote": {
      const bq = document.createElement("blockquote");
      renderInlineTokens(bq, globalThis.__tlhMdRenderer.tokenizeLine(classification.text));
      container.append(bq);
      break;
    }
    case "ul":
    case "ol": {
      // Preserve leading indentation as a text node.
      if (classification.indent) {
        container.append(document.createTextNode(classification.indent));
      }
      const bullet = document.createElement("span");
      bullet.style.cssText = "color: var(--mdListBullet)";
      bullet.textContent = classification.bullet;
      container.append(bullet);
      container.append(document.createTextNode(" "));
      renderInlineTokens(container, globalThis.__tlhMdRenderer.tokenizeLine(classification.text));
      break;
    }
    default: {
      // 'plain' and any unrecognised types
      const lineText = typeof classification.text === "string" ? classification.text : "";
      renderInlineTokens(container, globalThis.__tlhMdRenderer.tokenizeLine(lineText));
      break;
    }
  }
}

/**
 * Build the content of a markdown line-text container element.
 * lineType is one of: 'plain' | 'fence-open' | 'fence-body' | 'fence-close'
 */
function renderLineContent(container, rawText, lineType) {
  if (lineType === "fence-body") {
    // Code-block body: raw text, no inline markdown, code-block styling.
    container.style.cssText = "border-left: 3px solid var(--mdCodeBlockBorder); padding-left: 8px;";
    const code = document.createElement("code");
    code.style.cssText = "display: block; color: var(--mdCodeBlock, var(--text))";
    code.textContent = rawText.length > 0 ? rawText : " ";
    container.append(code);
    return;
  }

  if (lineType === "fence-open" || lineType === "fence-close") {
    // Fence delimiter: visible, styled as block-edge marker.
    const span = document.createElement("span");
    span.style.cssText = "color: var(--mdCodeBlockBorder)";
    span.textContent = rawText;
    container.append(span);
    return;
  }

  // Plain line: classify and render inline markdown.
  if (rawText.trim().length === 0) {
    container.textContent = " ";
    return;
  }

  renderClassifiedLine(container, globalThis.__tlhMdRenderer.classifyLine(rawText));
}

// ---------------------------------------------------------------------------
// Line row and section card builders
// ---------------------------------------------------------------------------

function createLineRow(line, lineType) {
  const wrapper = document.createElement("div");
  wrapper.className = "message-line";
  const row = document.createElement("div");
  row.className = "message-line-row";

  const lineNumber = document.createElement("div");
  lineNumber.className = "line-number";
  lineNumber.textContent = String(line.number);
  row.append(lineNumber);

  // Use a <div> with markdown-content class so heading/blockquote/hr/etc.
  // CSS rules inside .markdown-content apply correctly.
  const lineText = document.createElement("div");
  lineText.className = "line-text markdown-content";
  renderLineContent(lineText, line.text, lineType);
  row.append(lineText);
  wrapper.append(row);

  const toggle = document.createElement("button");
  toggle.className = "inline-toggle";
  toggle.type = "button";
  toggle.textContent = "Add inline note";
  row.append(toggle);

  const editor = createInlineEditor(line);
  const syncToggle = () => {
    const hasValue = (state.inlineComments.get(line.number) || "").trim().length > 0;
    toggle.dataset.active = hasValue || !editor.container.hidden ? "true" : "false";
    toggle.textContent = hasValue ? "Edit inline note" : "Add inline note";
  };

  editor.textarea.addEventListener("input", () => {
    setInlineComment(line.number, editor.textarea.value);
    syncToggle();
  });

  toggle.addEventListener("click", () => {
    editor.container.hidden = !editor.container.hidden;
    syncToggle();
    if (!editor.container.hidden) {
      editor.textarea.focus();
    }
  });

  wrapper.append(editor.container);
  syncToggle();
  return wrapper;
}

function createSectionCard(section) {
  const card = document.createElement("div");
  card.className = "section-card";

  const title = document.createElement("h3");
  const lineRange =
    section.startLine === section.endLine
      ? `line ${section.startLine}`
      : `lines ${section.startLine}-${section.endLine}`;
  title.textContent = `Section ${section.index}`;
  card.append(title);

  const meta = document.createElement("p");
  meta.className = "section-meta";
  meta.textContent = lineRange;
  card.append(meta);

  // Render the exact source lines in this section. Do not parse section.text
  // independently: its opening fence may be in an earlier section separated
  // by a blank line.
  const preview = document.createElement("div");
  preview.className = "section-preview markdown-content";

  const startIndex = Number.isInteger(section.startLine) ? section.startLine - 1 : -1;
  const endIndex = Number.isInteger(section.endLine) ? section.endLine : -1;
  const sourceLines =
    startIndex >= 0 && endIndex >= startIndex && endIndex <= messageData.lines.length
      ? messageData.lines.slice(startIndex, endIndex).map((line) => line.text)
      : typeof section.text === "string"
        ? section.text.split("\n")
        : [];
  for (let idx = 0; idx < sourceLines.length; idx++) {
    const lineDiv = document.createElement("div");
    const sourceIndex = startIndex >= 0 ? startIndex + idx : -1;
    const lineType = fullMessageFenceState[sourceIndex]?.lineType ?? "plain";
    renderLineContent(lineDiv, sourceLines[idx], lineType);
    preview.append(lineDiv);
  }
  card.append(preview);
  const textarea = document.createElement("textarea");
  textarea.placeholder =
    "Describe what should change across this section or what larger concern should be addressed.";
  textarea.value = state.sectionComments.get(section.id) || "";
  textarea.addEventListener("input", () => {
    setSectionComment(section.id, textarea.value);
  });
  card.append(textarea);

  return card;
}

function renderMessageLines() {
  elements.messageLines.replaceChildren();
  for (let i = 0; i < messageData.lines.length; i++) {
    elements.messageLines.append(createLineRow(messageData.lines[i], fullMessageFenceState[i].lineType));
  }
}

function renderSectionComments() {
  elements.sectionComments.replaceChildren();
  if (messageData.sections.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "This message does not have any non-empty sections to annotate.";
    elements.sectionComments.append(empty);
    return;
  }
  for (const section of messageData.sections) {
    elements.sectionComments.append(createSectionCard(section));
  }
}

function collectPayload() {
  return {
    type: "submit",
    overallComment: state.overallComment,
    inlineComments: Array.from(state.inlineComments.entries()).map(([line, body]) => ({
      line,
      body,
    })),
    sectionComments: Array.from(state.sectionComments.entries()).map(([sectionId, body]) => ({
      sectionId,
      body,
    })),
  };
}

function sendPayload(payload) {
  window.glimpse?.send?.(payload);
  window.glimpse?.close?.();
}

function submit() {
  if (feedbackCount() === 0) {
    setStatus("Add at least one comment before submitting.", "error");
    return;
  }
  sendPayload(collectPayload());
}

function cancel() {
  sendPayload({ type: "cancel" });
}

elements.overallComment.addEventListener("input", () => {
  state.overallComment = elements.overallComment.value;
  updateSubmitState();
});

elements.submitButton.addEventListener("click", submit);

elements.cancelButton.addEventListener("click", cancel);

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    submit();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
  }
});

renderMessageLines();
renderSectionComments();
updateSubmitState();
