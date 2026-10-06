import assert from "node:assert/strict";
import test from "node:test";
import { createExtensionHarness, loadExtension } from "./extension-test-helpers.mjs";

const contextCapModuleUrl = new URL("../extensions/context-cap/index.ts", import.meta.url).href;

async function loadContextCapCopy(label) {
  return (await import(`${contextCapModuleUrl}?${label}`)).default;
}

function createUI() {
  const statuses = [];
  const notifications = [];
  return {
    statuses,
    notifications,
    ui: {
      setStatus(key, value) {
        statuses.push({ key, value });
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };
}

function createContextCapContext({ model, registryModels = [] }) {
  const uiState = createUI();
  return {
    ...uiState,
    ctx: {
      model,
      hasUI: true,
      ui: uiState.ui,
      modelRegistry: {
        getAll() {
          return registryModels;
        },
      },
    },
  };
}

function createContextCapHarness(settings) {
  return settings === undefined
    ? createExtensionHarness()
    : createExtensionHarness({ getSettings: () => settings });
}

function getCommand(harness, name) {
  const command = harness.commands.get(name);
  assert.ok(command, `expected ${name} command to be registered`);
  return command;
}

function getHandler(harness, name) {
  const handler = harness.handlers.get(name);
  assert.equal(typeof handler, "function", `expected ${name} handler to be registered`);
  return handler;
}

function completionValues(result) {
  return result?.map(({ value }) => value) ?? null;
}

test("context-cap caps only the active known physical model and restores it on shutdown", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const harness = createExtensionHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, "session_start");
  const sessionShutdown = getHandler(harness, "session_shutdown");

  const activeModel = { provider: "anthropic", id: "claude-opus-4-8", contextWindow: 500_000 };
  const largeRegistryModel = { provider: "openai", id: "gpt-5.5", contextWindow: 300_000 };
  const smallRegistryModel = { provider: "openai", id: "gpt-5.5-mini", contextWindow: 128_000 };
  const { ctx } = createContextCapContext({
    model: activeModel,
    registryModels: [largeRegistryModel, smallRegistryModel],
  });

  await sessionStart({}, ctx);
  assert.equal(activeModel.contextWindow, 200_000);
  assert.equal(
    largeRegistryModel.contextWindow,
    300_000,
    "registry inventory must not be pre-mutated",
  );
  assert.equal(smallRegistryModel.contextWindow, 128_000);

  await sessionShutdown({}, ctx);
  assert.equal(activeModel.contextWindow, 500_000);
  assert.equal(largeRegistryModel.contextWindow, 300_000);
  assert.equal(smallRegistryModel.contextWindow, 128_000);
});

test("context-cap skips virtual and incompatible windows without fabricating a routed limit", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const harness = createExtensionHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, "session_start");
  const command = getCommand(harness, "context-cap");
  const virtualModel = {
    provider: "pi",
    api: "pi-virtual",
    id: "router",
    contextWindow: 1_000_000,
  };
  const missingWindow = { provider: "anthropic", id: "missing-window" };
  const invalidWindow = { provider: "openai", id: "invalid-window", contextWindow: Number.NaN };

  for (const model of [virtualModel, missingWindow, invalidWindow]) {
    const { ctx, notifications } = createContextCapContext({ model, registryModels: [model] });
    await sessionStart({}, ctx);
    if (model === virtualModel) {
      assert.equal(model.contextWindow, 1_000_000);
    } else if (model === missingWindow) {
      assert.equal(Object.hasOwn(model, "contextWindow"), false);
    } else {
      assert.ok(Number.isNaN(model.contextWindow));
    }
    await command.handler("status", ctx);
    assert.match(
      notifications.at(-1).message,
      model === virtualModel ? /virtual selection/ : /unknown/,
    );
  }
});

test("context-cap restores the previous active model across selection and branch boundaries", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const harness = createExtensionHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, "session_start");
  const modelSelect = getHandler(harness, "model_select");
  const sessionTree = getHandler(harness, "session_tree");
  const sessionShutdown = getHandler(harness, "session_shutdown");
  const first = { provider: "anthropic", id: "first", contextWindow: 500_000 };
  const second = { provider: "openai", id: "second", contextWindow: 300_000 };
  const firstCtx = createContextCapContext({ model: first }).ctx;
  const secondCtx = createContextCapContext({ model: second }).ctx;

  await sessionStart({}, firstCtx);
  assert.equal(first.contextWindow, 200_000);
  await modelSelect({ model: second, previousModel: first }, secondCtx);
  assert.equal(first.contextWindow, 500_000);
  assert.equal(second.contextWindow, 200_000);

  await sessionTree({}, secondCtx);
  assert.equal(second.contextWindow, 200_000);
  await sessionShutdown({}, secondCtx);
  assert.equal(second.contextWindow, 300_000);
});

test("context-cap restores on reload and can be enabled again without stale original metadata", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const harness = createExtensionHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, "session_start");
  const sessionShutdown = getHandler(harness, "session_shutdown");
  const command = getCommand(harness, "context-cap");
  const model = { provider: "anthropic", id: "reloadable", contextWindow: 500_000 };
  const { ctx } = createContextCapContext({ model });

  await sessionStart({}, ctx);
  assert.equal(model.contextWindow, 200_000);
  await sessionShutdown({ reason: "reload" }, ctx);
  assert.equal(model.contextWindow, 500_000);
  await sessionStart({ reason: "reload" }, ctx);
  assert.equal(model.contextWindow, 200_000);
  await command.handler("off", ctx);
  assert.equal(model.contextWindow, 500_000);
  await command.handler("on", ctx);
  assert.equal(model.contextWindow, 200_000);
});

test("context-cap coordinates separately loaded instances process-wide and restores after either shutdown order", async () => {
  for (const [firstShutdown, secondShutdown] of [
    [0, 1],
    [1, 0],
  ]) {
    const firstExtension = await loadContextCapCopy(
      `shutdown-${firstShutdown}-${secondShutdown}-a`,
    );
    const secondExtension = await loadContextCapCopy(
      `shutdown-${firstShutdown}-${secondShutdown}-b`,
    );
    const firstHarness = createContextCapHarness();
    const secondHarness = createContextCapHarness();
    firstExtension(firstHarness.pi);
    secondExtension(secondHarness.pi);

    const firstStart = getHandler(firstHarness, "session_start");
    const firstShutdownHandler = getHandler(firstHarness, "session_shutdown");
    const secondStart = getHandler(secondHarness, "session_start");
    const secondShutdownHandler = getHandler(secondHarness, "session_shutdown");
    const sharedPhysical = {
      provider: "anthropic",
      id: `shared-${firstShutdown}-${secondShutdown}`,
      contextWindow: 500_000,
    };
    const firstContext = createContextCapContext({ model: sharedPhysical }).ctx;
    const secondContext = createContextCapContext({ model: sharedPhysical }).ctx;

    await firstStart({}, firstContext);
    await secondStart({}, secondContext);
    assert.equal(sharedPhysical.contextWindow, 200_000);

    const shutdownHandlers = [firstShutdownHandler, secondShutdownHandler];
    const shutdownContexts = [firstContext, secondContext];
    await shutdownHandlers[firstShutdown]({}, shutdownContexts[firstShutdown]);
    assert.equal(
      sharedPhysical.contextWindow,
      200_000,
      "the remaining process-wide holder keeps the cap active",
    );
    await shutdownHandlers[secondShutdown]({}, shutdownContexts[secondShutdown]);
    assert.equal(
      sharedPhysical.contextWindow,
      500_000,
      "the final holder restores the first original window",
    );
  }
});

test("context-cap keeps the shared cap while one factory instance is disabled and reports other holders", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const firstHarness = createContextCapHarness();
  const secondHarness = createContextCapHarness();
  contextCapExtension(firstHarness.pi);
  contextCapExtension(secondHarness.pi);

  const firstStart = getHandler(firstHarness, "session_start");
  const secondStart = getHandler(secondHarness, "session_start");
  const firstShutdown = getHandler(firstHarness, "session_shutdown");
  const secondShutdown = getHandler(secondHarness, "session_shutdown");
  const firstCommand = getCommand(firstHarness, "context-cap");
  const sharedPhysical = { provider: "anthropic", id: "factory-shared", contextWindow: 500_000 };
  const firstContextState = createContextCapContext({ model: sharedPhysical });
  const secondContextState = createContextCapContext({ model: sharedPhysical });

  await firstStart({}, firstContextState.ctx);
  await secondStart({}, secondContextState.ctx);
  await firstCommand.handler("status", firstContextState.ctx);
  assert.match(firstContextState.notifications.at(-1).message, /200k\/500k effective\/original/);
  assert.match(
    firstContextState.notifications.at(-1).message,
    /1 other holder still holds the cap/,
  );

  await firstCommand.handler("off", firstContextState.ctx);
  assert.equal(sharedPhysical.contextWindow, 200_000);
  await firstShutdown({}, firstContextState.ctx);
  assert.equal(sharedPhysical.contextWindow, 200_000);
  await secondShutdown({}, secondContextState.ctx);
  assert.equal(sharedPhysical.contextWindow, 500_000);
});

test("context-cap switches one holder without releasing another instance or its model", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const firstHarness = createContextCapHarness();
  const secondHarness = createContextCapHarness();
  contextCapExtension(firstHarness.pi);
  contextCapExtension(secondHarness.pi);

  const firstStart = getHandler(firstHarness, "session_start");
  const firstModelSelect = getHandler(firstHarness, "model_select");
  const firstShutdown = getHandler(firstHarness, "session_shutdown");
  const secondStart = getHandler(secondHarness, "session_start");
  const secondShutdown = getHandler(secondHarness, "session_shutdown");
  const sharedPhysical = { provider: "anthropic", id: "switch-shared", contextWindow: 500_000 };
  const replacement = { provider: "openai", id: "replacement", contextWindow: 300_000 };
  const firstContext = createContextCapContext({ model: sharedPhysical }).ctx;
  const secondContext = createContextCapContext({ model: sharedPhysical }).ctx;
  const replacementContext = createContextCapContext({ model: replacement }).ctx;

  await secondStart({}, secondContext);
  await firstStart({}, firstContext);
  await firstModelSelect({ model: replacement, previousModel: sharedPhysical }, replacementContext);
  assert.equal(
    sharedPhysical.contextWindow,
    200_000,
    "the second instance still holds the shared model",
  );
  assert.equal(replacement.contextWindow, 200_000);

  await firstShutdown({}, replacementContext);
  assert.equal(replacement.contextWindow, 300_000);
  await secondShutdown({}, secondContext);
  assert.equal(sharedPhysical.contextWindow, 500_000);
});

test("context-cap leaves an outside write alone and duplicate releases are idempotent", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const harness = createContextCapHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, "session_start");
  const sessionShutdown = getHandler(harness, "session_shutdown");
  const model = { provider: "anthropic", id: "external-write", contextWindow: 500_000 };
  const { ctx } = createContextCapContext({ model });

  await sessionStart({}, ctx);
  assert.equal(model.contextWindow, 200_000);
  model.contextWindow = 175_000;
  await sessionShutdown({}, ctx);
  assert.equal(model.contextWindow, 175_000);
  await sessionShutdown({}, ctx);
  assert.equal(model.contextWindow, 175_000);

  const secondModel = { provider: "anthropic", id: "duplicate-release", contextWindow: 500_000 };
  const secondContext = createContextCapContext({ model: secondModel }).ctx;
  await sessionStart({}, secondContext);
  await sessionShutdown({}, secondContext);
  await sessionShutdown({}, secondContext);
  assert.equal(secondModel.contextWindow, 500_000);
});

test("context-cap branch restoration releases only this instance hold", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const firstHarness = createContextCapHarness();
  const secondHarness = createContextCapHarness();
  contextCapExtension(firstHarness.pi);
  contextCapExtension(secondHarness.pi);

  const firstStart = getHandler(firstHarness, "session_start");
  const firstTree = getHandler(firstHarness, "session_tree");
  const firstShutdown = getHandler(firstHarness, "session_shutdown");
  const secondStart = getHandler(secondHarness, "session_start");
  const secondShutdown = getHandler(secondHarness, "session_shutdown");
  const sharedPhysical = { provider: "anthropic", id: "tree-shared", contextWindow: 500_000 };
  const firstContext = createContextCapContext({ model: sharedPhysical }).ctx;
  const secondContext = createContextCapContext({ model: sharedPhysical }).ctx;

  await secondStart({}, secondContext);
  await firstStart({}, firstContext);
  await firstTree({}, firstContext);
  assert.equal(sharedPhysical.contextWindow, 200_000);
  await firstShutdown({}, firstContext);
  assert.equal(sharedPhysical.contextWindow, 200_000);
  await secondShutdown({}, secondContext);
  assert.equal(sharedPhysical.contextWindow, 500_000);
});

test("context-cap exposes the process-wide limitation to a context without the extension", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const harness = createContextCapHarness();
  contextCapExtension(harness.pi);
  const sessionStart = getHandler(harness, "session_start");
  const sessionShutdown = getHandler(harness, "session_shutdown");
  const sharedPhysical = {
    provider: "anthropic",
    id: "no-extension-child",
    contextWindow: 500_000,
  };
  const { ctx } = createContextCapContext({ model: sharedPhysical });
  const childWithoutExtension = { model: sharedPhysical };

  await sessionStart({}, ctx);
  assert.equal(childWithoutExtension.model.contextWindow, 200_000);
  await sessionShutdown({}, ctx);
  assert.equal(childWithoutExtension.model.contextWindow, 500_000);
});

test("context-cap guards a non-positive compaction threshold and explicit model overrides", async () => {
  const guardedModel = { provider: "anthropic", id: "reserve-guard", contextWindow: 500_000 };
  const reserveHarness = createContextCapHarness({ compaction: { reserveTokens: 200_000 } });
  const reserveExtension = await loadExtension("extensions/context-cap/index.ts");
  reserveExtension(reserveHarness.pi);
  const reserveStart = getHandler(reserveHarness, "session_start");
  const reserveCommand = getCommand(reserveHarness, "context-cap");
  const reserveContextState = createContextCapContext({ model: guardedModel });
  await reserveStart({}, reserveContextState.ctx);
  assert.equal(guardedModel.contextWindow, 500_000);
  await reserveCommand.handler("status", reserveContextState.ctx);
  assert.match(reserveContextState.notifications.at(-1).message, /reserveTokens.*zero or negative/);

  const overriddenModel = { provider: "anthropic", id: "override-guard", contextWindow: 500_000 };
  const overrideHarness = createContextCapHarness({
    compaction: {
      reserveTokens: 16_384,
      modelOverrides: { "anthropic/override-guard": { keepRecentTokens: 20_000 } },
    },
  });
  const overrideExtension = await loadExtension("extensions/context-cap/index.ts");
  overrideExtension(overrideHarness.pi);
  const overrideStart = getHandler(overrideHarness, "session_start");
  const overrideCommand = getCommand(overrideHarness, "context-cap");
  const overrideContextState = createContextCapContext({ model: overriddenModel });
  await overrideStart({}, overrideContextState.ctx);
  assert.equal(overriddenModel.contextWindow, 500_000);
  await overrideCommand.handler("status", overrideContextState.ctx);
  assert.match(overrideContextState.notifications.at(-1).message, /modelOverrides/);

  const boundaryModel = { provider: "anthropic", id: "reserve-boundary", contextWindow: 500_000 };
  const boundaryHarness = createContextCapHarness({ compaction: { reserveTokens: 199_999 } });
  const boundaryExtension = await loadExtension("extensions/context-cap/index.ts");
  boundaryExtension(boundaryHarness.pi);
  await getHandler(boundaryHarness, "session_start")(
    {},
    createContextCapContext({ model: boundaryModel }).ctx,
  );
  assert.equal(
    boundaryModel.contextWindow,
    200_000,
    "reserveTokens below the cap still permits the cap",
  );
  await getHandler(boundaryHarness, "session_shutdown")(
    {},
    createContextCapContext({ model: boundaryModel }).ctx,
  );
  assert.equal(boundaryModel.contextWindow, 500_000);
});

test("context-cap status, off, on, and toggle commands report and mutate the session model window", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const harness = createExtensionHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, "session_start");
  const command = getCommand(harness, "context-cap");
  const model = { provider: "anthropic", id: "claude-opus-4-8", contextWindow: 400_000 };
  const { ctx, notifications, statuses } = createContextCapContext({
    model,
    registryModels: [model],
  });

  await sessionStart({}, ctx);
  await command.handler("status", ctx);
  assert.match(notifications.at(-1).message, /Context cap is enabled\./);
  assert.match(notifications.at(-1).message, /anthropic\/claude-opus-4-8/);
  assert.match(notifications.at(-1).message, /200k\/400k effective\/original/);

  await command.handler("off", ctx);
  assert.equal(model.contextWindow, 400_000);
  assert.deepEqual(statuses.at(-1), { key: "context-cap", value: undefined });
  assert.match(
    notifications.at(-1).message,
    /Context cap disabled for this extension session \(1 active model window\(s\) restored\)\./,
  );

  await command.handler("on", ctx);
  assert.equal(model.contextWindow, 200_000);
  assert.deepEqual(statuses.at(-1), { key: "context-cap", value: "ctx cap 200k" });
  assert.match(
    notifications.at(-1).message,
    /Context cap enabled \(1 active model window\(s\) capped\/restored\)\./,
  );

  await command.handler("toggle", ctx);
  assert.equal(model.contextWindow, 400_000);
  assert.deepEqual(statuses.at(-1), { key: "context-cap", value: undefined });
  assert.match(
    notifications.at(-1).message,
    /Context cap disabled for this extension session \(1 active model window\(s\) restored\)\./,
  );
});

test("context-cap offers completions, supports aliases, and warns on invalid usage", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const harness = createExtensionHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, "session_start");
  const command = getCommand(harness, "context-cap");
  const model = { provider: "anthropic", id: "claude-opus-4-8", contextWindow: 400_000 };
  const { ctx, notifications, statuses } = createContextCapContext({
    model,
    registryModels: [model],
  });

  assert.deepEqual(completionValues(command.getArgumentCompletions("")), [
    "on",
    "off",
    "toggle",
    "status",
  ]);
  assert.deepEqual(completionValues(command.getArgumentCompletions("  o")), ["on", "off"]);
  assert.deepEqual(completionValues(command.getArgumentCompletions("t")), ["toggle"]);

  await sessionStart({}, ctx);
  await command.handler("disable", ctx);
  assert.equal(model.contextWindow, 400_000);
  assert.deepEqual(statuses.at(-1), { key: "context-cap", value: undefined });
  assert.match(
    notifications.at(-1).message,
    /Context cap disabled for this extension session \(1 active model window\(s\) restored\)\./,
  );

  await command.handler("enable", ctx);
  assert.equal(model.contextWindow, 200_000);
  assert.deepEqual(statuses.at(-1), { key: "context-cap", value: "ctx cap 200k" });
  assert.match(
    notifications.at(-1).message,
    /Context cap enabled \(1 active model window\(s\) capped\/restored\)\./,
  );

  await command.handler("bogus", ctx);
  assert.deepEqual(notifications.at(-1), {
    message: "Usage: /context-cap on | off | toggle | status",
    level: "warning",
  });
});

test("context-cap tolerates registry failures, reports no-model status, and skips UI updates for silent model selection", async () => {
  const contextCapExtension = await loadExtension("extensions/context-cap/index.ts");
  const harness = createExtensionHarness();
  contextCapExtension(harness.pi);

  const sessionStart = getHandler(harness, "session_start");
  const modelSelect = getHandler(harness, "model_select");
  const command = getCommand(harness, "context-cap");

  const activeModel = { provider: "openai", id: "gpt-5.5", contextWindow: 300_000 };
  const registryFailureNotifications = [];
  await sessionStart(
    {},
    {
      model: activeModel,
      hasUI: true,
      ui: {
        setStatus() {},
        notify(message, level) {
          registryFailureNotifications.push({ message, level });
        },
      },
      modelRegistry: {
        getAll() {
          throw new Error("registry unavailable");
        },
      },
    },
  );
  assert.equal(activeModel.contextWindow, 200_000);
  assert.deepEqual(registryFailureNotifications, []);

  const noModelNotifications = [];
  await command.handler("status", {
    model: undefined,
    hasUI: true,
    ui: {
      setStatus() {},
      notify(message, level) {
        noModelNotifications.push({ message, level });
      },
    },
    modelRegistry: {
      getAll() {
        throw new Error("registry unavailable");
      },
    },
  });
  assert.deepEqual(noModelNotifications, [
    { message: "Context cap is enabled. No model selected.", level: "info" },
  ]);

  const selectedModel = { provider: "anthropic", id: "claude-opus-4-8", contextWindow: 500_000 };
  const modelSelectStatuses = [];
  await modelSelect(
    { model: selectedModel },
    {
      model: selectedModel,
      hasUI: false,
      ui: {
        setStatus(key, value) {
          modelSelectStatuses.push({ key, value });
        },
        notify() {},
      },
      modelRegistry: {
        getAll() {
          return [];
        },
      },
    },
  );
  assert.equal(selectedModel.contextWindow, 200_000);
  assert.deepEqual(modelSelectStatuses, []);
});
