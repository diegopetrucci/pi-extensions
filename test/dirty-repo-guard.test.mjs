import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

function getHandler(handlers, eventName) {
  const handler = handlers.get(eventName);
  assert.equal(typeof handler, 'function');
  return handler;
}

test('dirty-repo-guard allows session changes for clean and non-git repositories', async () => {
  const dirtyRepoGuard = await loadExtension('extensions/dirty-repo-guard/index.ts');
  const responses = [
    { stdout: '', code: 0 },
    { stdout: 'fatal: not a git repository\n', code: 128 },
  ];
  const { pi, handlers, execCalls } = createExtensionHarness({
    async execImpl(command, args) {
      assert.equal(command, 'git');
      assert.deepEqual(args, ['status', '--porcelain']);
      const next = responses.shift();
      assert.ok(next);
      return next;
    },
  });

  dirtyRepoGuard(pi);
  const beforeSwitch = getHandler(handlers, 'session_before_switch');
  const beforeFork = getHandler(handlers, 'session_before_fork');

  assert.equal(await beforeSwitch({ reason: 'new' }, { hasUI: false }), undefined);
  assert.equal(await beforeFork({}, { hasUI: false }), undefined);
  assert.deepEqual(execCalls, [
    ['git', ['status', '--porcelain']],
    ['git', ['status', '--porcelain']],
  ]);
});

test('dirty-repo-guard blocks dirty repo session changes when no UI is available', async () => {
  const dirtyRepoGuard = await loadExtension('extensions/dirty-repo-guard/index.ts');
  const { pi, handlers } = createExtensionHarness({
    async execImpl() {
      return { stdout: ' M src/index.ts\n?? test/new.test.mjs\n', code: 0 };
    },
  });

  dirtyRepoGuard(pi);
  const beforeSwitch = getHandler(handlers, 'session_before_switch');

  assert.deepEqual(await beforeSwitch({ reason: 'resume' }, { hasUI: false }), { cancel: true });
});

test('dirty-repo-guard prompts for dirty repo actions and respects the user choice', async () => {
  const dirtyRepoGuard = await loadExtension('extensions/dirty-repo-guard/index.ts');
  const prompts = [];
  const notifications = [];

  const denyHarness = createExtensionHarness({
    async execImpl() {
      return { stdout: ' M src/index.ts\n?? test/new.test.mjs\n', code: 0 };
    },
  });
  dirtyRepoGuard(denyHarness.pi);
  const denySwitch = getHandler(denyHarness.handlers, 'session_before_switch');

  const denied = await denySwitch(
    { reason: 'new' },
    {
      hasUI: true,
      ui: {
        async select(prompt, options) {
          prompts.push({ prompt, options });
          return 'No, let me commit first';
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(denied, { cancel: true });
  assert.deepEqual(prompts[0], {
    prompt: 'You have 2 uncommitted file(s). new session anyway?',
    options: ['Yes, proceed anyway', 'No, let me commit first'],
  });
  assert.deepEqual(notifications, [{ message: 'Commit your changes first', level: 'warning' }]);

  const allowPrompts = [];
  const allowHarness = createExtensionHarness({
    async execImpl() {
      return { stdout: ' M src/index.ts\n?? test/new.test.mjs\n', code: 0 };
    },
  });
  dirtyRepoGuard(allowHarness.pi);
  const allowSwitch = getHandler(allowHarness.handlers, 'session_before_switch');
  const allowFork = getHandler(allowHarness.handlers, 'session_before_fork');

  assert.equal(
    await allowSwitch(
      { reason: 'resume' },
      {
        hasUI: true,
        ui: {
          async select(prompt, options) {
            allowPrompts.push({ prompt, options });
            return 'Yes, proceed anyway';
          },
          notify() {},
        },
      },
    ),
    undefined,
  );

  assert.equal(
    await allowFork(
      {},
      {
        hasUI: true,
        ui: {
          async select(prompt, options) {
            allowPrompts.push({ prompt, options });
            return 'Yes, proceed anyway';
          },
          notify() {},
        },
      },
    ),
    undefined,
  );

  assert.deepEqual(allowPrompts, [
    {
      prompt: 'You have 2 uncommitted file(s). switch session anyway?',
      options: ['Yes, proceed anyway', 'No, let me commit first'],
    },
    {
      prompt: 'You have 2 uncommitted file(s). fork anyway?',
      options: ['Yes, proceed anyway', 'No, let me commit first'],
    },
  ]);
});

test('dirty-repo-guard ignores whitespace-only status output and treats dismissed prompts as cancellations', async () => {
  const dirtyRepoGuard = await loadExtension('extensions/dirty-repo-guard/index.ts');

  let whitespacePrompted = false;
  const cleanHarness = createExtensionHarness({
    async execImpl() {
      return { stdout: '\n\n', code: 0 };
    },
  });
  dirtyRepoGuard(cleanHarness.pi);
  const cleanSwitch = getHandler(cleanHarness.handlers, 'session_before_switch');

  assert.equal(
    await cleanSwitch(
      { reason: 'resume' },
      {
        hasUI: true,
        ui: {
          async select() {
            whitespacePrompted = true;
            return 'Yes, proceed anyway';
          },
          notify() {},
        },
      },
    ),
    undefined,
  );
  assert.equal(whitespacePrompted, false);

  const prompts = [];
  const notifications = [];
  const dismissedHarness = createExtensionHarness({
    async execImpl() {
      return { stdout: '\n M src/index.ts\n\n?? test/new.test.mjs\n', code: 0 };
    },
  });
  dirtyRepoGuard(dismissedHarness.pi);
  const dismissedFork = getHandler(dismissedHarness.handlers, 'session_before_fork');

  assert.deepEqual(
    await dismissedFork(
      {},
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
    ),
    { cancel: true },
  );
  assert.deepEqual(prompts, [
    {
      prompt: 'You have 2 uncommitted file(s). fork anyway?',
      options: ['Yes, proceed anyway', 'No, let me commit first'],
    },
  ]);
  assert.deepEqual(notifications, [{ message: 'Commit your changes first', level: 'warning' }]);
});
