import assert from "node:assert/strict";
import test from "node:test";
import { createExtensionHarness, loadExtension } from "./extension-test-helpers.mjs";

const FAST_BETA = "fast-mode-2026-02-01";
const leftovers = [
  {
    path: "extensions/claude-fast/index.ts",
    statusKey: "claude-fast",
    notice: /claude-fast is deprecated and no longer changes provider requests/,
  },
  {
    path: "extensions/openai-fast/index.ts",
    statusKey: "openai-fast",
    notice: /openai-fast is deprecated and no longer changes provider requests/,
  },
];

for (const leftover of leftovers) {
  test(`${leftover.path} warns, clears its leftover status, and strips the Fast beta header`, async () => {
    const extension = await loadExtension(leftover.path);
    const harness = createExtensionHarness();
    extension(harness.pi);

    assert.equal(harness.commands.size, 0);
    assert.equal(harness.handlers.has("before_provider_request"), false);
    assert.equal(harness.handlers.has("model_select"), false);
    assert.deepEqual([...harness.handlers.keys()], ["session_start"]);

    const sessionStart = harness.handlers.get("session_start");
    const notifications = [];
    const statuses = [];
    const payload = {
      model: "gpt-5.5",
      input: "hello",
      service_tier: "default",
      speed: "standard",
    };
    const model = {
      provider: "anthropic",
      api: "anthropic-messages",
      id: "claude-opus-4-8",
      headers: {
        "Anthropic-Beta": `existing-beta, ${FAST_BETA}, oauth-2025-04-20`,
        "anthropic-beta": FAST_BETA,
      },
    };

    await sessionStart(
      {},
      {
        hasUI: true,
        model,
        ui: {
          notify(message, level) {
            notifications.push({ message, level });
          },
          setStatus(key, value) {
            statuses.push({ key, value });
          },
        },
      },
    );

    assert.deepEqual(statuses, [{ key: leftover.statusKey, value: undefined }]);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].message, leftover.notice);
    assert.match(notifications[0].message, /unified fast extension \(\/fast\)/);
    assert.equal(notifications[0].level, "warning");
    assert.deepEqual(payload, {
      model: "gpt-5.5",
      input: "hello",
      service_tier: "default",
      speed: "standard",
    });
    assert.deepEqual(model.headers, { "Anthropic-Beta": "existing-beta,oauth-2025-04-20" });

    const quiet = [];
    const quietStatuses = [];
    const headlessModel = {
      headers: { "anthropic-beta": `claude-code-20250219,${FAST_BETA}` },
    };
    await sessionStart(
      {},
      {
        hasUI: false,
        model: headlessModel,
        ui: {
          notify(message) {
            quiet.push(message);
          },
          setStatus(key, value) {
            quietStatuses.push({ key, value });
          },
        },
      },
    );
    assert.deepEqual(quiet, []);
    assert.deepEqual(quietStatuses, []);
    assert.deepEqual(headlessModel.headers, { "anthropic-beta": "claude-code-20250219" });

    const onlyFast = { headers: { "anthropic-beta": FAST_BETA } };
    await sessionStart(
      {},
      {
        hasUI: false,
        model: onlyFast,
        ui: { notify() {}, setStatus() {} },
      },
    );
    assert.deepEqual(onlyFast.headers, {});
  });
}
