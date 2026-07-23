import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

function getHandler(handlers, eventName) {
  const handler = handlers.get(eventName);
  assert.equal(typeof handler, 'function');
  return handler;
}

function createMessageEntry(role) {
  return {
    type: 'message',
    message: { role },
  };
}

test('confirm-destructive confirms before clearing a session and can cancel the action', async () => {
  const confirmDestructive = await loadExtension('extensions/confirm-destructive/index.ts');
  const { pi, handlers } = createExtensionHarness();
  confirmDestructive(pi);

  const beforeSwitch = getHandler(handlers, 'session_before_switch');
  const notifications = [];
  const confirmations = [];
  const answers = [false, true];

  const ctx = {
    hasUI: true,
    ui: {
      async confirm(title, message) {
        confirmations.push({ title, message });
        return answers.shift();
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
    sessionManager: {
      getEntries() {
        return [];
      },
    },
  };

  assert.deepEqual(await beforeSwitch({ reason: 'new' }, ctx), { cancel: true });
  assert.equal(await beforeSwitch({ reason: 'new' }, ctx), undefined);
  assert.deepEqual(confirmations, [
    {
      title: 'Clear session?',
      message: 'This will delete all messages in the current session.',
    },
    {
      title: 'Clear session?',
      message: 'This will delete all messages in the current session.',
    },
  ]);
  assert.deepEqual(notifications, [{ message: 'Clear cancelled', level: 'info' }]);
});

test('confirm-destructive only prompts before switching when there is unsaved user work', async () => {
  const confirmDestructive = await loadExtension('extensions/confirm-destructive/index.ts');
  const { pi, handlers } = createExtensionHarness();
  confirmDestructive(pi);

  const beforeSwitch = getHandler(handlers, 'session_before_switch');
  const confirmations = [];
  const notifications = [];

  const blocked = await beforeSwitch(
    { reason: 'resume' },
    {
      hasUI: true,
      ui: {
        async confirm(title, message) {
          confirmations.push({ title, message });
          return false;
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
      sessionManager: {
        getEntries() {
          return [createMessageEntry('assistant'), createMessageEntry('user')];
        },
      },
    },
  );

  assert.deepEqual(blocked, { cancel: true });
  assert.deepEqual(confirmations, [
    {
      title: 'Switch session?',
      message: 'You have messages in the current session. Switch anyway?',
    },
  ]);
  assert.deepEqual(notifications, [{ message: 'Switch cancelled', level: 'info' }]);

  let promptCount = 0;
  const allowedWithoutPrompt = await beforeSwitch(
    { reason: 'resume' },
    {
      hasUI: true,
      ui: {
        async confirm() {
          promptCount += 1;
          return false;
        },
        notify() {},
      },
      sessionManager: {
        getEntries() {
          return [createMessageEntry('user'), createMessageEntry('assistant')];
        },
      },
    },
  );

  const assistantFreePrompt = await beforeSwitch(
    { reason: 'resume' },
    {
      hasUI: true,
      ui: {
        async confirm(title, message) {
          promptCount += 1;
          confirmations.push({ title, message });
          return true;
        },
        notify() {},
      },
      sessionManager: {
        getEntries() {
          return [createMessageEntry('user')];
        },
      },
    },
  );

  const emptyHistory = await beforeSwitch(
    { reason: 'resume' },
    {
      hasUI: true,
      ui: {
        async confirm() {
          promptCount += 1;
          return false;
        },
        notify() {},
      },
      sessionManager: {
        getEntries() {
          return [];
        },
      },
    },
  );

  assert.equal(allowedWithoutPrompt, undefined);
  assert.equal(assistantFreePrompt, undefined);
  assert.equal(emptyHistory, undefined);
  assert.equal(promptCount, 1);
  assert.deepEqual(confirmations, [
    {
      title: 'Switch session?',
      message: 'You have messages in the current session. Switch anyway?',
    },
    {
      title: 'Switch session?',
      message: 'You have messages in the current session. Switch anyway?',
    },
  ]);
});

test('confirm-destructive confirms before forking and respects the selected choice', async () => {
  const confirmDestructive = await loadExtension('extensions/confirm-destructive/index.ts');
  const { pi, handlers } = createExtensionHarness();
  confirmDestructive(pi);

  const beforeFork = getHandler(handlers, 'session_before_fork');
  const prompts = [];
  const notifications = [];
  const answers = ['No, stay in current session', 'Yes, create fork'];

  const ctx = {
    hasUI: true,
    ui: {
      async select(prompt, options) {
        prompts.push({ prompt, options });
        return answers.shift();
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };

  assert.deepEqual(await beforeFork({ entryId: 'abcdef1234567890' }, ctx), { cancel: true });
  assert.equal(await beforeFork({ entryId: 'abcdef1234567890' }, ctx), undefined);
  assert.deepEqual(prompts, [
    {
      prompt: 'Fork from entry abcdef12?',
      options: ['Yes, create fork', 'No, stay in current session'],
    },
    {
      prompt: 'Fork from entry abcdef12?',
      options: ['Yes, create fork', 'No, stay in current session'],
    },
  ]);
  assert.deepEqual(notifications, [{ message: 'Fork cancelled', level: 'info' }]);
});

test('confirm-destructive skips prompts without UI and cancels on unexpected fork selections', async () => {
  const confirmDestructive = await loadExtension('extensions/confirm-destructive/index.ts');
  const { pi, handlers } = createExtensionHarness();
  confirmDestructive(pi);

  const beforeSwitch = getHandler(handlers, 'session_before_switch');
  const beforeFork = getHandler(handlers, 'session_before_fork');

  assert.equal(await beforeSwitch({ reason: 'new' }, { hasUI: false }), undefined);
  assert.equal(await beforeFork({ entryId: 'abc' }, { hasUI: false }), undefined);

  const prompts = [];
  const notifications = [];
  const cancelled = await beforeFork(
    { entryId: 'abc' },
    {
      hasUI: true,
      ui: {
        async select(prompt, options) {
          prompts.push({ prompt, options });
          return undefined;
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(cancelled, { cancel: true });
  assert.deepEqual(prompts, [
    {
      prompt: 'Fork from entry abc?',
      options: ['Yes, create fork', 'No, stay in current session'],
    },
  ]);
  assert.deepEqual(notifications, [{ message: 'Fork cancelled', level: 'info' }]);
});
