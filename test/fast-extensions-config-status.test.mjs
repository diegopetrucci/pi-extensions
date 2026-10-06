import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

const leftovers = [
  {
    path: 'extensions/claude-fast/index.ts',
    notice: /claude-fast is deprecated and no longer changes provider requests/,
  },
  {
    path: 'extensions/openai-fast/index.ts',
    notice: /openai-fast is deprecated and no longer changes provider requests/,
  },
];

for (const leftover of leftovers) {
  test(`${leftover.path} only warns that the standalone Fast stack is deprecated`, async () => {
    const extension = await loadExtension(leftover.path);
    const harness = createExtensionHarness();
    extension(harness.pi);

    assert.equal(harness.commands.size, 0);
    assert.equal(harness.handlers.has('before_provider_request'), false);
    assert.equal(harness.handlers.has('model_select'), false);
    assert.deepEqual([...harness.handlers.keys()], ['session_start']);

    const sessionStart = harness.handlers.get('session_start');
    const notifications = [];
    const payload = { model: 'gpt-5.5', input: 'hello', service_tier: 'default', speed: 'standard' };
    const model = {
      provider: 'anthropic',
      api: 'anthropic-messages',
      id: 'claude-opus-4-8',
      headers: { 'anthropic-beta': 'existing-beta' },
    };

    await sessionStart({}, {
      hasUI: true,
      model,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        setStatus() {
          throw new Error('deprecated fast leftovers must not set status');
        },
      },
    });

    assert.equal(notifications.length, 1);
    assert.match(notifications[0].message, leftover.notice);
    assert.match(notifications[0].message, /unified fast extension \(\/fast\)/);
    assert.equal(notifications[0].level, 'warning');
    assert.deepEqual(payload, { model: 'gpt-5.5', input: 'hello', service_tier: 'default', speed: 'standard' });
    assert.deepEqual(model.headers, { 'anthropic-beta': 'existing-beta' });

    const quiet = [];
    await sessionStart({}, {
      hasUI: false,
      ui: {
        notify(message) {
          quiet.push(message);
        },
      },
    });
    assert.deepEqual(quiet, []);
  });
}
