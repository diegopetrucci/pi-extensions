import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

function getTodoTool(tools) {
  const tool = tools.get('todo');
  assert.ok(tool);
  return tool;
}

function getTodosCommand(commands) {
  const command = commands.get('todos');
  assert.ok(command);
  return command;
}

const plainTheme = {
  fg(_kind, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

function renderLines(component, width = 120) {
  return component.render(width).map((line) => line.trimEnd());
}

function createToolResultEntry(details) {
  return {
    type: 'message',
    message: {
      role: 'toolResult',
      toolName: 'todo',
      details,
    },
  };
}

test('todo supports list, add, toggle, and clear with snapshot details', async () => {
  const todoExtension = await loadExtension('extensions/todo/index.ts');
  const { pi, tools } = createExtensionHarness();
  todoExtension(pi);

  const tool = getTodoTool(tools);

  const initial = await tool.execute('todo-1', { action: 'list' }, undefined, undefined, {});
  assert.equal(initial.content[0].text, 'No todos');
  assert.deepEqual(initial.details, { action: 'list', todos: [], nextId: 1 });

  const addedFirst = await tool.execute('todo-2', { action: 'add', text: 'Write tests' }, undefined, undefined, {});
  assert.equal(addedFirst.content[0].text, 'Added todo #1: Write tests');
  assert.deepEqual(addedFirst.details, {
    action: 'add',
    todos: [{ id: 1, text: 'Write tests', done: false }],
    nextId: 2,
  });

  const addedSecond = await tool.execute('todo-3', { action: 'add', text: 'Ship change' }, undefined, undefined, {});
  assert.equal(addedSecond.content[0].text, 'Added todo #2: Ship change');
  assert.deepEqual(addedSecond.details, {
    action: 'add',
    todos: [
      { id: 1, text: 'Write tests', done: false },
      { id: 2, text: 'Ship change', done: false },
    ],
    nextId: 3,
  });

  const toggled = await tool.execute('todo-4', { action: 'toggle', id: 1 }, undefined, undefined, {});
  assert.equal(toggled.content[0].text, 'Todo #1 completed');
  assert.deepEqual(toggled.details, {
    action: 'toggle',
    todos: [
      { id: 1, text: 'Write tests', done: true },
      { id: 2, text: 'Ship change', done: false },
    ],
    nextId: 3,
  });

  const listed = await tool.execute('todo-5', { action: 'list' }, undefined, undefined, {});
  assert.equal(listed.content[0].text, '[x] #1: Write tests\n[ ] #2: Ship change');
  assert.deepEqual(listed.details, {
    action: 'list',
    todos: [
      { id: 1, text: 'Write tests', done: true },
      { id: 2, text: 'Ship change', done: false },
    ],
    nextId: 3,
  });

  const cleared = await tool.execute('todo-6', { action: 'clear' }, undefined, undefined, {});
  assert.equal(cleared.content[0].text, 'Cleared 2 todos');
  assert.deepEqual(cleared.details, { action: 'clear', todos: [], nextId: 1 });

  const addedAfterClear = await tool.execute('todo-7', { action: 'add', text: 'Start over' }, undefined, undefined, {});
  assert.equal(addedAfterClear.content[0].text, 'Added todo #1: Start over');
  assert.deepEqual(addedAfterClear.details, {
    action: 'add',
    todos: [{ id: 1, text: 'Start over', done: false }],
    nextId: 2,
  });
});

test('todo reconstructs branch-local state from tool result snapshots on session events', async () => {
  const todoExtension = await loadExtension('extensions/todo/index.ts');
  const branchMain = [
    createToolResultEntry({
      action: 'add',
      todos: [{ id: 1, text: 'Write tests', done: false }],
      nextId: 2,
    }),
    createToolResultEntry({
      action: 'toggle',
      todos: [{ id: 1, text: 'Write tests', done: true }],
      nextId: 2,
    }),
  ];
  const branchFork = [
    createToolResultEntry({
      action: 'clear',
      todos: [],
      nextId: 1,
    }),
    createToolResultEntry({
      action: 'add',
      todos: [{ id: 1, text: 'Only on fork', done: false }],
      nextId: 2,
    }),
  ];

  let currentBranch = branchMain;
  const ctx = {
    sessionManager: {
      getBranch() {
        return currentBranch;
      },
    },
  };

  const { pi, tools, handlers } = createExtensionHarness();
  todoExtension(pi);

  const tool = getTodoTool(tools);
  const startHandler = handlers.get('session_start');
  const treeHandler = handlers.get('session_tree');
  assert.equal(typeof startHandler, 'function');
  assert.equal(typeof treeHandler, 'function');

  await startHandler({}, ctx);
  const reconstructedMain = await tool.execute('todo-8', { action: 'list' }, undefined, undefined, ctx);
  assert.equal(reconstructedMain.content[0].text, '[x] #1: Write tests');
  assert.deepEqual(reconstructedMain.details, {
    action: 'list',
    todos: [{ id: 1, text: 'Write tests', done: true }],
    nextId: 2,
  });

  currentBranch = branchFork;
  await treeHandler({}, ctx);
  const reconstructedFork = await tool.execute('todo-9', { action: 'list' }, undefined, undefined, ctx);
  assert.equal(reconstructedFork.content[0].text, '[ ] #1: Only on fork');
  assert.deepEqual(reconstructedFork.details, {
    action: 'list',
    todos: [{ id: 1, text: 'Only on fork', done: false }],
    nextId: 2,
  });

  const addedOnFork = await tool.execute('todo-10', { action: 'add', text: 'Second on fork' }, undefined, undefined, ctx);
  assert.equal(addedOnFork.content[0].text, 'Added todo #2: Second on fork');
  assert.deepEqual(addedOnFork.details, {
    action: 'add',
    todos: [
      { id: 1, text: 'Only on fork', done: false },
      { id: 2, text: 'Second on fork', done: false },
    ],
    nextId: 3,
  });
});

test('todos command requires TUI mode and closes custom UI on escape or ctrl+c', async () => {
  const todoExtension = await loadExtension('extensions/todo/index.ts');
  const { pi, tools, commands } = createExtensionHarness();
  todoExtension(pi);

  const tool = getTodoTool(tools);
  const command = getTodosCommand(commands);
  await tool.execute('todo-11', { action: 'add', text: 'Write tests' }, undefined, undefined, {});
  await tool.execute('todo-12', { action: 'add', text: 'Ship change' }, undefined, undefined, {});
  await tool.execute('todo-13', { action: 'toggle', id: 1 }, undefined, undefined, {});

  const notifications = [];
  await command.handler('', {
    hasUI: false,
    mode: 'rpc',
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  });
  await command.handler('', {
    hasUI: true,
    mode: 'rpc',
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
      async custom() {
        throw new Error('RPC mode should not open custom todo UI');
      },
    },
  });
  assert.deepEqual(notifications, [
    { message: '/todos requires interactive mode', level: 'error' },
    { message: '/todos requires interactive mode', level: 'error' },
  ]);

  let customCalls = 0;
  for (const closeKey of ['\x1b', '\x03']) {
    let closeCalls = 0;
    await command.handler('', {
      hasUI: true,
      mode: 'tui',
      ui: {
        async custom(factory) {
          customCalls += 1;
          const component = await factory(undefined, plainTheme, undefined, () => {
            closeCalls += 1;
          });
          const lines = component.render(80);
          assert.ok(lines.some((line) => line.includes('1/2 completed')));
          assert.ok(lines.some((line) => line.includes('✓ #1 Write tests')));
          assert.ok(lines.some((line) => line.includes('○ #2 Ship change')));
          assert.ok(lines.some((line) => line.includes('Press Escape to close')));
          component.handleInput?.('x');
          assert.equal(closeCalls, 0);
          component.handleInput?.(closeKey);
          assert.equal(closeCalls, 1);
          return undefined;
        },
      },
    });
  }
  assert.equal(customCalls, 2);
});

test('todo returns focused error details without mutating state', async () => {
  const todoExtension = await loadExtension('extensions/todo/index.ts');
  const { pi, tools } = createExtensionHarness();
  todoExtension(pi);

  const tool = getTodoTool(tools);

  const missingText = await tool.execute('todo-14', { action: 'add' }, undefined, undefined, {});
  assert.equal(missingText.content[0].text, 'Error: text required for add');
  assert.deepEqual(missingText.details, {
    action: 'add',
    todos: [],
    nextId: 1,
    error: 'text required',
  });

  const missingId = await tool.execute('todo-15', { action: 'toggle' }, undefined, undefined, {});
  assert.equal(missingId.content[0].text, 'Error: id required for toggle');
  assert.deepEqual(missingId.details, {
    action: 'toggle',
    todos: [],
    nextId: 1,
    error: 'id required',
  });

  await tool.execute('todo-16', { action: 'add', text: 'Keep state' }, undefined, undefined, {});
  const missingTodo = await tool.execute('todo-17', { action: 'toggle', id: 99 }, undefined, undefined, {});
  assert.equal(missingTodo.content[0].text, 'Todo #99 not found');
  assert.deepEqual(missingTodo.details, {
    action: 'toggle',
    todos: [{ id: 1, text: 'Keep state', done: false }],
    nextId: 2,
    error: '#99 not found',
  });

  const listed = await tool.execute('todo-18', { action: 'list' }, undefined, undefined, {});
  assert.equal(listed.content[0].text, '[ ] #1: Keep state');
  assert.deepEqual(listed.details, {
    action: 'list',
    todos: [{ id: 1, text: 'Keep state', done: false }],
    nextId: 2,
  });
});

test('todo renderCall and renderResult cover focused text branches without snapshots', async () => {
  const todoExtension = await loadExtension('extensions/todo/index.ts');
  const { pi, tools } = createExtensionHarness();
  todoExtension(pi);

  const tool = getTodoTool(tools);

  assert.deepEqual(renderLines(tool.renderCall({ action: 'list' }, plainTheme, {})), ['todo list']);
  assert.deepEqual(renderLines(tool.renderCall({ action: 'add', text: 'Write tests' }, plainTheme, {})), ['todo add "Write tests"']);
  assert.deepEqual(renderLines(tool.renderCall({ action: 'toggle', id: 42 }, plainTheme, {})), ['todo toggle #42']);

  assert.deepEqual(
    renderLines(tool.renderResult({ content: [{ type: 'text', text: 'raw fallback' }] }, { expanded: false }, plainTheme, {})),
    ['raw fallback'],
  );
  assert.deepEqual(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: 'Error: text required for add' }],
          details: { action: 'add', todos: [], nextId: 1, error: 'text required' },
        },
        { expanded: false },
        plainTheme,
        {},
      ),
    ),
    ['Error: text required'],
  );
  assert.deepEqual(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: 'No todos' }],
          details: { action: 'list', todos: [], nextId: 1 },
        },
        { expanded: false },
        plainTheme,
        {},
      ),
    ),
    ['No todos'],
  );

  const todoList = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    text: `Todo ${index + 1}`,
    done: index % 2 === 1,
  }));
  assert.deepEqual(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: '' }],
          details: { action: 'list', todos: todoList, nextId: 8 },
        },
        { expanded: false },
        plainTheme,
        {},
      ),
    ),
    ['7 todo(s):', '○ #1 Todo 1', '✓ #2 Todo 2', '○ #3 Todo 3', '✓ #4 Todo 4', '○ #5 Todo 5', '... 2 more'],
  );
  assert.deepEqual(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: '' }],
          details: { action: 'list', todos: todoList, nextId: 8 },
        },
        { expanded: true },
        plainTheme,
        {},
      ),
    ),
    ['7 todo(s):', '○ #1 Todo 1', '✓ #2 Todo 2', '○ #3 Todo 3', '✓ #4 Todo 4', '○ #5 Todo 5', '✓ #6 Todo 6', '○ #7 Todo 7'],
  );
  assert.deepEqual(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: 'Added todo #1: Write tests' }],
          details: { action: 'add', todos: [{ id: 1, text: 'Write tests', done: false }], nextId: 2 },
        },
        { expanded: false },
        plainTheme,
        {},
      ),
    ),
    ['✓ Added #1 Write tests'],
  );
  assert.deepEqual(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: 'Todo #1 completed' }],
          details: { action: 'toggle', todos: [{ id: 1, text: 'Write tests', done: true }], nextId: 2 },
        },
        { expanded: false },
        plainTheme,
        {},
      ),
    ),
    ['✓ Todo #1 completed'],
  );
  assert.deepEqual(
    renderLines(
      tool.renderResult(
        {
          content: [{ type: 'text', text: 'Cleared 1 todos' }],
          details: { action: 'clear', todos: [], nextId: 1 },
        },
        { expanded: false },
        plainTheme,
        {},
      ),
    ),
    ['✓ Cleared all todos'],
  );
});
