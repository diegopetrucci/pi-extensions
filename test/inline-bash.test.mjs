import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtensionHarness, loadExtension } from './extension-test-helpers.mjs';

function getInputHandler(harness) {
  const handler = harness.handlers.get('input');
  assert.equal(typeof handler, 'function', 'expected input handler');
  return handler;
}

async function loadInputHandler(execImpl) {
  const inlineBash = await loadExtension('extensions/inline-bash/index.ts');
  const harness = createExtensionHarness({ execImpl });
  inlineBash(harness.pi);
  return { handler: getInputHandler(harness), harness };
}

test('inline-bash expands RPC steer and follow-up input as user-origin text', async () => {
  const { handler, harness } = await loadInputHandler(async (command, args, options) => {
    assert.equal(command, 'bash');
    assert.equal(options.timeout, 30000);
    return { stdout: `${args[1]} output\n`, stderr: '', code: 0 };
  });

  const steerEvent = {
    type: 'input',
    text: 'Steer with !{printf steer}',
    source: 'rpc',
    streamingBehavior: 'steer',
  };
  const followUpEvent = {
    type: 'input',
    text: 'Follow up with !{printf follow-up}',
    source: 'rpc',
    streamingBehavior: 'followUp',
  };

  assert.deepEqual(await handler(steerEvent, { hasUI: false }), {
    action: 'transform',
    text: 'Steer with printf steer output',
    images: undefined,
  });
  assert.deepEqual(await handler(followUpEvent, { hasUI: false }), {
    action: 'transform',
    text: 'Follow up with printf follow-up output',
    images: undefined,
  });
  assert.deepEqual(harness.execCalls, [
    ['bash', ['-c', 'printf steer'], { timeout: 30000 }],
    ['bash', ['-c', 'printf follow-up'], { timeout: 30000 }],
  ]);
});

test('inline-bash skips extension-origin input even for follow-ups', async () => {
  const { handler, harness } = await loadInputHandler(async () => {
    throw new Error('extension-origin input must not execute bash');
  });

  assert.deepEqual(
    await handler(
      {
        type: 'input',
        text: 'Extension follow-up !{printf should-not-run}',
        source: 'extension',
        streamingBehavior: 'followUp',
      },
      { hasUI: false },
    ),
    { action: 'continue' },
  );
  assert.deepEqual(harness.execCalls, []);
});

test('inline-bash leaves whole-line bash syntax untouched for RPC input', async () => {
  const { handler, harness } = await loadInputHandler(async () => {
    throw new Error('whole-line bash input must not execute inline expansion');
  });

  assert.deepEqual(
    await handler(
      {
        type: 'input',
        text: '!echo whole-line !{printf should-not-run}',
        source: 'rpc',
        streamingBehavior: 'steer',
      },
      { hasUI: false },
    ),
    { action: 'continue' },
  );
  assert.deepEqual(harness.execCalls, []);
});
