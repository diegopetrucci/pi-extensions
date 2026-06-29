import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

function getTodoTool(tools) {
  const tool = tools.get('todo');
  assert.ok(tool);
  return tool;
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
