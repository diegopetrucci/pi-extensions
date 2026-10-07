import assert from "node:assert/strict";
import test from "node:test";

import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

import {
  createModelSelectionContext,
  loadRoleTestUtils,
} from "./support/provider-policy-contract-support.mjs";

async function loadOracleTestUtils() {
  return loadRoleTestUtils("oracle");
}

for (const provider of ["openai", "openai-codex", "github-copilot"]) {
  test(`Oracle selects Astra on ${provider} and falls back when unavailable`, async () => {
    const { selectOracleModel } = await loadOracleTestUtils();
    const older = { provider, id: "gpt-5.6-sol", reasoning: true };
    const astra = {
      provider,
      id: "gpt-6-astra",
      reasoning: true,
      thinkingLevelMap: { xhigh: "xhigh", max: "max" },
    };
    for (const available of [[older, astra], [older]]) {
      const result = await selectOracleModel(
        createModelSelectionContext({ model: older, available }),
      );
      assert.equal(result.ok, true);
      assert.equal(
        result.selection.modelRef,
        `${provider}/${available.length === 2 ? astra.id : older.id}`,
      );
    }
  });
}

test("Oracle preserves Copilot Claude precedence before Astra and Sol fallbacks", async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const provider = "github-copilot";
  const sol = { provider, id: "gpt-5.6-sol", reasoning: true };
  const astra = { provider, id: "gpt-6-astra", reasoning: true };
  const claude = { provider, id: "claude-opus-5", reasoning: true };

  for (const [available, expected] of [
    [[sol, astra, claude], claude],
    [[sol, astra], astra],
    [[sol], sol],
  ]) {
    const result = await selectOracleModel(createModelSelectionContext({ model: sol, available }));
    assert.equal(result.ok, true);
    assert.equal(result.selection.modelRef, `${provider}/${expected.id}`);
  }
});

test("oracle auto-selection keeps the gpt-5.6 sol/terra/luna ordering before older openai-codex fallbacks", async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const result = await selectOracleModel(
    createModelSelectionContext({
      model: { provider: "openai-codex", id: "gpt-5.4", reasoning: true },
      available: [
        {
          provider: "openai-codex",
          id: "gpt-5.6-luna",
          reasoning: true,
          thinkingLevelMap: { high: {}, xhigh: {} },
        },
        {
          provider: "openai-codex",
          id: "gpt-5.4",
          reasoning: true,
          thinkingLevelMap: { high: {}, xhigh: {} },
        },
        {
          provider: "openai-codex",
          id: "gpt-5.6-terra",
          reasoning: true,
          thinkingLevelMap: { high: {}, xhigh: {} },
        },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, "openai-codex/gpt-5.6-terra");
  assert.equal(result.selection.thinkingLevel, "xhigh");
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    ["openai-codex/gpt-5.6-terra", "openai-codex/gpt-5.6-luna", "openai-codex/gpt-5.4"],
  );
});

test("oracle auto-selection prefers Claude Sonnet 5 over Claude Sonnet 4 when Fable and Opus are unavailable", async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const result = await selectOracleModel(
    createModelSelectionContext({
      model: { provider: "anthropic", id: "claude-3-7-sonnet", reasoning: true },
      available: [
        { provider: "anthropic", id: "claude-sonnet-4.6", reasoning: true },
        { provider: "anthropic", id: "claude-sonnet-5.0", reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, "anthropic/claude-sonnet-5.0");
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    ["anthropic/claude-sonnet-5.0", "anthropic/claude-sonnet-4.6"],
  );
  assert.match(result.selection.selectionReason, /hardcoded preference list for anthropic/i);
});

test("oracle auto-selection stays on the current provider when it has no reasoning models", async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  const result = await selectOracleModel(
    createModelSelectionContext({
      model: { provider: "google", id: "gemini-2.5-flash-lite", reasoning: false },
      available: [
        { provider: "google", id: "project-random-lite", reasoning: false },
        { provider: "anthropic", id: "claude-opus-4.8", reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, "google/project-random-lite");
  assert.match(
    result.selection.selectionReason,
    /current provider has no reasoning models available, so the top-ranked model on that provider was used\./i,
  );
});

test("Oracle maps actual Pi 0.87.1 GPT-6 Sol to high while Astra and Opus 5.5 remain xhigh", async () => {
  const { resolveThinkingLevel } = await loadOracleTestUtils();
  const sol = getBuiltinModels("openai").find((model) => model.id === "gpt-6-sol");
  const astra = getBuiltinModels("openai").find((model) => model.id === "gpt-6-astra");
  const opus = getBuiltinModels("anthropic").find((model) => model.id === "claude-opus-5-5");
  assert.ok(sol && astra && opus, "expected Pi 0.87.1 frontier models in the pinned catalog");

  assert.equal(resolveThinkingLevel(sol, undefined).effective, "high");
  assert.equal(resolveThinkingLevel(astra, undefined).effective, "xhigh");
  assert.equal(resolveThinkingLevel(opus, undefined).effective, "xhigh");
});

test("Oracle maps published Pi 1.0 GPT-6.1 Sol to high without requesting unsupported off reasoning", async () => {
  const { resolveThinkingLevel } = await loadOracleTestUtils();
  for (const provider of ["openai", "azure", "openai-codex"]) {
    const sol = getBuiltinModels(provider).find((model) => model.id === "gpt-6.1-sol");
    assert.ok(sol, `expected Pi 1.0 GPT-6.1 Sol in the pinned ${provider} catalog`);
    assert.equal(sol.thinkingLevelMap?.off, null);
    if (provider === "openai-codex") assert.equal(sol.thinkingLevelMap?.minimal, "low");

    const automatic = resolveThinkingLevel(sol, undefined);
    assert.deepEqual(automatic, { requested: "high", effective: "high", clamped: false });
    assert.notEqual(automatic.effective, "off");
    assert.equal(
      resolveThinkingLevel(sol, "high").effective,
      "high",
      "explicit high must remain authoritative",
    );
    assert.equal(
      resolveThinkingLevel(sol, "off").effective,
      provider === "openai-codex" ? "minimal" : "low",
    );
  }
});

test("Oracle does not apply the GPT-6.1 Sol high-thinking exception to Pro/Fast variants", async () => {
  const { resolveThinkingLevel } = await loadOracleTestUtils();
  const pro = getBuiltinModels("openrouter").find((model) => model.id === "openai/gpt-6.1-sol-pro");
  const fast = getBuiltinModels("vercel-ai-gateway").find(
    (model) => model.id === "openai/gpt-6.1-sol-fast",
  );
  assert.ok(pro && fast, "expected Pi 1.0 GPT-6.1 Sol Pro/Fast variants in the pinned catalog");

  assert.equal(resolveThinkingLevel(pro, undefined).requested, "xhigh");
  assert.equal(resolveThinkingLevel(fast, undefined).requested, "xhigh");
});

test("oracle thinking-level resolution clamps unsupported levels for matched models", async () => {
  const { findAvailableModel, resolveThinkingLevel } = await loadOracleTestUtils();
  const matchedModel = {
    provider: "openai",
    id: "gpt-5.5-pro",
    reasoning: true,
    thinkingLevelMap: {
      off: {},
      minimal: {},
      low: {},
      medium: null,
      high: null,
      xhigh: null,
    },
  };
  const ctx = createModelSelectionContext({
    available: [matchedModel],
  });

  const matched = await findAvailableModel(ctx, "openai/gpt-5.5-pro");
  assert.equal(matched, matchedModel);
  assert.deepEqual(resolveThinkingLevel(matched, "xhigh"), {
    requested: "xhigh",
    effective: "low",
    clamped: true,
  });

  const maxModel = {
    ...matchedModel,
    thinkingLevelMap: { ...matchedModel.thinkingLevelMap, xhigh: {}, max: {} },
  };
  assert.deepEqual(resolveThinkingLevel(maxModel, "max"), {
    requested: "max",
    effective: "max",
    clamped: false,
  });
  assert.deepEqual(
    resolveThinkingLevel(
      { ...maxModel, thinkingLevelMap: { ...maxModel.thinkingLevelMap, max: null } },
      "max",
    ),
    {
      requested: "max",
      effective: "xhigh",
      clamped: true,
    },
  );
});

const WEAKER_SIBLING_CASES = [
  ["google", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
  ["google-vertex", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
  ["meta", "muse-spark-1.3", "muse-spark-1.3-contributor"],
  ["meta", "muse-spark-1.2", "muse-spark-1.2-contributor"],
  ["baseten", "thinkingmachines/inkling", "thinkingmachines/inkling-small"],
  ["baseten", "zai-org/GLM-5.2", "zai-org/GLM-5.2-Fast"],
  ["kimi-coding", "kimi-for-coding", "kimi-for-coding-highspeed"],
  ["moonshotai", "kimi-k2.7-code", "kimi-k2.7-code-highspeed"],
  ["moonshotai-cn", "kimi-k2.7-code", "kimi-k2.7-code-highspeed"],
  ["vercel-ai-gateway", "moonshotai/kimi-k2.7-code", "moonshotai/kimi-k2.7-code-highspeed"],
  ["openai", "gpt-5.4", "gpt-5.4-mini"],
  ["azure", "gpt-5.4", "gpt-5.4-mini"],
  ["radius", "gpt-5.4", "gpt-5.4-mini"],
  ["radius", "glm-5.3", "glm-5.3-flash"],
  ["zai-coding-cn", "glm-5.3", "glm-5.3-flash"],
  ["zai-coding-cn", "glm-5.3", "glm-5.3-highspeed"],
];

function catalogModel(provider, id) {
  const model = getBuiltinModels(provider).find((entry) => entry.id === id);
  assert.ok(model, `expected ${provider}/${id} in the pinned catalog`);
  return model;
}

test("oracle anchored preferences keep stronger ids ahead of weaker siblings", async () => {
  const { selectOracleModel } = await loadOracleTestUtils();
  for (const [provider, strongId, weakId] of WEAKER_SIBLING_CASES) {
    const strong = catalogModel(provider, strongId);
    const weak = catalogModel(provider, weakId);
    const both = await selectOracleModel(
      createModelSelectionContext({
        model: weak,
        available: [weak, strong],
      }),
    );
    assert.equal(both.ok, true);
    assert.equal(
      both.selection.modelRef,
      `${provider}/${strongId}`,
      `${provider} selected ${weakId} ahead of ${strongId}`,
    );

    const onlyWeak = await selectOracleModel(
      createModelSelectionContext({
        model: weak,
        available: [weak],
      }),
    );
    assert.equal(onlyWeak.ok, true);
    assert.equal(
      onlyWeak.selection.modelRef,
      `${provider}/${weakId}`,
      `${provider} did not fall back to ${weakId}`,
    );
  }
});
