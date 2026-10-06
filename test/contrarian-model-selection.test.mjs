import assert from "node:assert/strict";
import test from "node:test";

import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

import {
  createModelSelectionContext,
  loadRoleTestUtils,
} from "./support/provider-policy-contract-support.mjs";

async function loadContrarianTestUtils() {
  return loadRoleTestUtils("contrarian");
}

test("contrarian auto-selection prefers Claude Sonnet 5 over Claude Sonnet 4 across providers when Opus and Fable are unavailable", async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();
  const result = await selectContrarianModel(
    createModelSelectionContext({
      model: { provider: "openai", id: "gpt-5.5", reasoning: true },
      available: [
        { provider: "amazon-bedrock", id: "claude-sonnet-4-6", reasoning: true },
        { provider: "vercel-ai-gateway", id: "anthropic/claude-sonnet-5.0", reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, "vercel-ai-gateway/anthropic/claude-sonnet-5.0");
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    ["vercel-ai-gateway/anthropic/claude-sonnet-5.0", "amazon-bedrock/claude-sonnet-4-6"],
  );
  assert.match(
    result.selection.selectionReason,
    /hardcoded preference lists while preferring an opposite provider\/model family/i,
  );
});

test("contrarian auto-selection keeps the gpt-5.6 sol/terra/luna ordering across openai fallback paths", async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();
  const result = await selectContrarianModel(
    createModelSelectionContext({
      model: { provider: "anthropic", id: "claude-opus-4.8", reasoning: true },
      available: [
        { provider: "openai-codex", id: "gpt-5.6-luna", reasoning: true },
        { provider: "openai", id: "gpt-5.5-pro", reasoning: true },
        { provider: "openai-codex", id: "gpt-5.6-terra", reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, "openai-codex/gpt-5.6-terra");
  assert.deepEqual(
    result.ordered.map((candidate) => candidate.modelRef),
    ["openai-codex/gpt-5.6-terra", "openai-codex/gpt-5.6-luna", "openai/gpt-5.5-pro"],
  );
  assert.match(
    result.selection.selectionReason,
    /hardcoded preference lists while preferring an opposite provider\/model family/i,
  );
});

test("contrarian auto-selection falls back to the current provider when no opposite provider or family exists", async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();
  const result = await selectContrarianModel(
    createModelSelectionContext({
      model: { provider: "custom", id: "solver-1", reasoning: true },
      available: [
        { provider: "custom", id: "solver-1", reasoning: true },
        { provider: "custom", id: "solver-2", reasoning: true },
      ],
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.modelRef, "custom/solver-2");
  assert.match(
    result.selection.selectionReason,
    /No opposite provider\/model family was available, so the top-ranked reasoning model on the current provider was used\./i,
  );
});

const WEAKER_SIBLING_CASES = [
  ["google", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
  ["meta", "muse-spark-1.3", "muse-spark-1.3-contributor"],
  ["meta", "muse-spark-1.2", "muse-spark-1.2-contributor"],
  ["baseten", "thinkingmachines/inkling", "thinkingmachines/inkling-small"],
  ["baseten", "zai-org/GLM-5.2", "zai-org/GLM-5.2-Fast"],
  ["kimi-coding", "kimi-for-coding", "kimi-for-coding-highspeed"],
  ["moonshotai", "kimi-k2.7-code", "kimi-k2.7-code-highspeed"],
  ["vercel-ai-gateway", "moonshotai/kimi-k2.7-code", "moonshotai/kimi-k2.7-code-highspeed"],
  ["openai", "gpt-5.4", "gpt-5.4-mini"],
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

test("contrarian anchored preferences keep stronger ids ahead of weaker siblings", async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();
  for (const [provider, strongId, weakId] of WEAKER_SIBLING_CASES) {
    const strong = catalogModel(provider, strongId);
    const weak = catalogModel(provider, weakId);
    const both = await selectContrarianModel(
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

    const onlyWeak = await selectContrarianModel(
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

test("contrarian cross-provider anchors do not let an earlier stem steal a weaker sibling", async () => {
  const { selectContrarianModel } = await loadContrarianTestUtils();
  const current = { provider: "custom", id: "local-solver", reasoning: true };
  const strong = catalogModel("opencode-go", "glm-5.3");
  const weak = catalogModel("zai-coding-cn", "glm-5.3-flash");

  const both = await selectContrarianModel(
    createModelSelectionContext({
      model: current,
      available: [weak, strong],
    }),
  );
  assert.equal(both.ok, true);
  assert.equal(both.selection.modelRef, "opencode-go/glm-5.3");

  const onlyWeak = await selectContrarianModel(
    createModelSelectionContext({
      model: current,
      available: [weak],
    }),
  );
  assert.equal(onlyWeak.ok, true);
  assert.equal(onlyWeak.selection.modelRef, "zai-coding-cn/glm-5.3-flash");
});
