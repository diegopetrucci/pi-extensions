import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const webDir = path.join(repoRoot, 'extensions', 'annotate-last-message', 'web');
const rendererSource = await readFile(path.join(webDir, 'md-renderer.js'), 'utf8');
const appSource = await readFile(path.join(webDir, 'app.js'), 'utf8');

function loadRenderer() {
  const context = vm.createContext({});
  vm.runInContext(rendererSource, context, { filename: 'md-renderer.js' });
  return context.__tlhMdRenderer;
}

function makeElement(tag) {
  return {
    _tag: tag,
    className: '',
    dataset: {},
    style: { cssText: '' },
    hidden: false,
    disabled: false,
    value: '',
    _text: '',
    _children: [],
    _listeners: new Map(),
    get textContent() {
      return this._text;
    },
    set textContent(value) {
      this._text = String(value);
      this._children = [];
    },
    append(...nodes) {
      this._children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this._children = [...nodes];
    },
    addEventListener(type, listener) {
      this._listeners.set(type, listener);
    },
    emit(type, event = {}) {
      this._listeners.get(type)?.(event);
    },
    focus() {},
  };
}

function runApp(data) {
  const elements = new Map();
  const dataElement = makeElement('script');
  dataElement.textContent = JSON.stringify(data);
  elements.set('annotate-last-message-data', dataElement);
  for (const id of ['message-lines', 'overall-comment', 'section-comments', 'status', 'submit-button', 'cancel-button']) {
    elements.set(id, makeElement('div'));
  }

  const document = {
    getElementById(id) {
      return elements.get(id) ?? makeElement('div');
    },
    createElement: (tag) => makeElement(tag),
    createTextNode: (text) => ({ _type: 'text', _text: String(text) }),
    addEventListener() {},
  };
  const sentPayloads = [];
  const window = {
    glimpse: {
      send(payload) {
        sentPayloads.push(payload);
      },
      close() {},
    },
  };
  const context = vm.createContext({ document, window });
  vm.runInContext(rendererSource, context, { filename: 'md-renderer.js' });
  vm.runInContext(appSource, context, { filename: 'app.js' });
  return { elements, renderer: context.__tlhMdRenderer, sentPayloads };
}

function jsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

test('markdown renderer classifies representative blocks and keeps unsafe content inert', () => {
  const { classifyLine, tokenizeLine } = loadRenderer();

  assert.deepEqual(jsonValue(classifyLine('# Heading')), { type: 'heading', level: 1, text: 'Heading' });
  assert.deepEqual(jsonValue(classifyLine('- item')), { type: 'ul', indent: '', bullet: '-', text: 'item' });
  assert.deepEqual(jsonValue(tokenizeLine('**bold** and *italic* with `code`')), [
    { type: 'bold', children: [{ type: 'text', text: 'bold' }] },
    { type: 'text', text: ' and ' },
    { type: 'italic', children: [{ type: 'text', text: 'italic' }] },
    { type: 'text', text: ' with ' },
    { type: 'code', text: 'code' },
  ]);

  const htmlTokens = jsonValue(tokenizeLine('<img src=x onerror=alert(1)>'));
  assert.deepEqual(htmlTokens, [{ type: 'text', text: '<img src=x onerror=alert(1)>' }]);
  const linkTokens = jsonValue(tokenizeLine('[unsafe](javascript:alert)'));
  assert.equal(linkTokens[0].type, 'link');
  assert.equal(linkTokens[0].url, 'javascript:alert');
});

test('full-message fence metadata preserves rows, coordinates, and section context across blank lines', () => {
  const lines = [
    '# Heading **bold**',
    '```ts',
    "const value = '<script>';",
    '',
    'const other = 1;',
    '```',
    '',
    '- [unsafe](javascript:alert)',
    '<img src=x onerror=alert(1)>',
  ];
  const data = {
    text: lines.join('\n'),
    lines: lines.map((text, index) => ({ number: index + 1, text })),
    sections: [
      { id: 'section-1', index: 1, startLine: 1, endLine: 1, preview: '# Heading', text: '# Heading **bold**' },
      { id: 'section-2', index: 2, startLine: 2, endLine: 3, preview: '```ts', text: '```ts\nconst value = \'<script>\';' },
      { id: 'section-3', index: 3, startLine: 5, endLine: 6, preview: 'const other = 1;', text: 'const other = 1;\n```' },
      { id: 'section-4', index: 4, startLine: 8, endLine: 9, preview: '- unsafe', text: '- [unsafe](javascript:alert)\n<img src=x onerror=alert(1)>' },
    ],
  };

  const { elements, renderer } = runApp(data);
  const fenceState = jsonValue(renderer.applyFenceState(lines));
  assert.deepEqual(fenceState.map(({ lineType }) => lineType), [
    'plain', 'fence-open', 'fence-body', 'fence-body', 'fence-body', 'fence-close', 'plain', 'plain', 'plain',
  ]);

  const messageLines = elements.get('message-lines')._children.filter((element) => element.className === 'message-line');
  assert.equal(messageLines.length, lines.length, 'there is one rendered row for every source line');
  assert.deepEqual(
    messageLines.map((wrapper) => wrapper._children.find((child) => child.className === 'message-line-row')._children.find((child) => child.className === 'line-number').textContent),
    lines.map((_, index) => String(index + 1)),
    'rendering does not renumber or drop source lines',
  );

  const sectionCards = elements.get('section-comments')._children.filter((element) => element.className === 'section-card');
  assert.equal(sectionCards.length, data.sections.length);
  const sectionThreePreview = sectionCards[2]._children.find((element) => element.className === 'section-preview markdown-content');
  assert.match(sectionThreePreview._children[0].style.cssText, /border-left/, 'section body inherits the full-message fence state');
  assert.equal(sectionThreePreview._children[1]._children[0]._tag, 'span', 'section closer remains a fence delimiter');

  const unsafeRow = messageLines[8]._children.find((child) => child.className === 'message-line-row');
  const unsafeText = unsafeRow._children.find((child) => child.className === 'line-text markdown-content');
  assert.deepEqual(unsafeText._children, [{ _type: 'text', _text: '<img src=x onerror=alert(1)>' }]);

  const linkRow = messageLines[7]._children.find((child) => child.className === 'message-line-row');
  const linkText = linkRow._children.find((child) => child.className === 'line-text markdown-content');
  const link = linkText._children.find((child) => child._tag === 'a');
  assert.ok(link, 'link labels render as text-bearing anchors');
  assert.equal('href' in link, false, 'untrusted URLs remain inert and are never assigned to href');
  const url = linkText._children.find((child) => child.className === 'md-link-url');
  assert.equal(url.textContent, ' (javascript:alert)');
});

test('blank and whitespace-only rows retain inline controls, editors, and line coordinates', () => {
  const lines = [
    'before',
    '',
    ' \t',
    '```ts',
    'body',
    '',
    ' \t',
    '```',
    'after',
  ];
  const { elements, sentPayloads } = runApp({
    text: lines.join('\n'),
    lines: lines.map((text, index) => ({ number: index + 1, text })),
    sections: [],
  });

  const messageLines = elements.get('message-lines')._children.filter((element) => element.className === 'message-line');
  assert.equal(messageLines.length, lines.length);
  for (const [index, wrapper] of messageLines.entries()) {
    const row = wrapper._children.find((child) => child.className === 'message-line-row');
    const toggle = row._children.find((child) => child.className === 'inline-toggle');
    const editor = wrapper._children.find((child) => child.className === 'inline-editor');
    assert.ok(toggle, `line ${index + 1} retains an inline-note control`);
    assert.ok(editor, `line ${index + 1} retains an inline editor`);
    assert.equal(editor.hidden, true);
    const textarea = editor._children.find((child) => child._tag === 'textarea');
    assert.equal(textarea.placeholder, 'Explain what should change here, what is unclear, or what planning detail is missing.');
  }

  const blankFenceBody = messageLines[5];
  const blankFenceRow = blankFenceBody._children.find((child) => child.className === 'message-line-row');
  const blankFenceToggle = blankFenceRow._children.find((child) => child.className === 'inline-toggle');
  const blankFenceEditor = blankFenceBody._children.find((child) => child.className === 'inline-editor');
  const blankFenceTextarea = blankFenceEditor._children.find((child) => child._tag === 'textarea');
  blankFenceToggle.emit('click');
  assert.equal(blankFenceEditor.hidden, false);
  blankFenceTextarea.value = 'Review this blank fence-body line';
  blankFenceTextarea.emit('input');
  elements.get('submit-button').emit('click');

  assert.deepEqual(jsonValue(sentPayloads), [
    {
      type: 'submit',
      overallComment: '',
      inlineComments: [{ line: 6, body: 'Review this blank fence-body line' }],
      sectionComments: [],
    },
  ]);
});
