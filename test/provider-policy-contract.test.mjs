import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_POLICY_CONTRACT,
  createModelSelectionContext,
  loadRoleTestUtils,
} from './support/provider-policy-contract-support.mjs';

for (const fixture of PROVIDER_POLICY_CONTRACT.orderingAndFallbackCases) {
  test(`${fixture.role} contract: ${fixture.description}`, async () => {
    const utils = await loadRoleTestUtils(fixture.role);
    const result = await utils[fixture.method](createModelSelectionContext(fixture.ctx), ...(fixture.args ?? []));

    if (fixture.role === 'librarian') {
      assert.deepEqual(
        result.map((candidate) => candidate.details.modelRef),
        fixture.expected.orderedModelRefs,
      );
      assert.deepEqual(
        result.map((candidate) => candidate.details.thinkingLevel),
        fixture.expected.thinkingLevels,
      );
      if (fixture.expected.firstCandidateProperties) {
        for (const [property, expected] of Object.entries(fixture.expected.firstCandidateProperties)) {
          assert.deepEqual(result[0].details[property], expected);
        }
      }
      fixture.expected.selectionReasons?.forEach((pattern, index) => {
        assert.match(result[index].details.selectionReason, pattern);
      });
      return;
    }

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const selectedModelRef = result.selection.modelRef ?? `${result.selection.provider}/${result.selection.id}`;
    assert.equal(selectedModelRef, fixture.expected.selectionModelRef);
    assert.deepEqual(
      result.ordered.map((candidate) => candidate.modelRef ?? `${candidate.provider}/${candidate.id}`),
      fixture.expected.orderedModelRefs,
    );
    for (const [property, expected] of Object.entries(fixture.expected.selectionProperties ?? {})) {
      assert.deepEqual(result.selection[property], expected);
    }
    if (fixture.expected.selectionReason) {
      assert.match(result.selection.selectionReason, fixture.expected.selectionReason);
    }
  });
}

for (const fixture of PROVIDER_POLICY_CONTRACT.parseModelPreferenceCases) {
  for (const role of fixture.roles) {
    test(`${role} contract: shared model preference parsing preserves model refs and thinking suffixes`, async () => {
      const utils = await loadRoleTestUtils(role);
      for (const assertion of fixture.assertions) {
        assert.deepEqual(utils.parseModelPreference(assertion.input), assertion.expected);
      }
    });
  }
}

for (const fixture of PROVIDER_POLICY_CONTRACT.exactProviderQualifiedMatchingCases) {
  test(`${fixture.role} contract: exact provider-qualified model references beat fuzzy substring matches`, async () => {
    const utils = await loadRoleTestUtils(fixture.role);
    const match = await utils.findAvailableModel(createModelSelectionContext(fixture.ctx), fixture.requestedModelRef);
    assert.ok(match, 'expected a matched model');
    assert.equal(`${match.provider}/${match.id}`, fixture.expectedModelRef);
  });
}

for (const fixture of PROVIDER_POLICY_CONTRACT.noAuthenticatedModelCases) {
  test(`${fixture.role} contract: reports when no authenticated models are available`, async () => {
    const utils = await loadRoleTestUtils(fixture.role);
    const invoke = () => utils[fixture.method](createModelSelectionContext(fixture.ctx), ...(fixture.args ?? []));

    if (fixture.type === 'throws') {
      await assert.rejects(invoke, new Error(fixture.expectedMessage));
      return;
    }

    assert.deepEqual(await invoke(), fixture.expected);
  });
}

for (const fixture of PROVIDER_POLICY_CONTRACT.thinkingLevelCases) {
  test(`${fixture.role} contract: ${fixture.description}`, async () => {
    const utils = await loadRoleTestUtils(fixture.role);
    for (const assertion of fixture.assertions) {
      assert.deepEqual(utils[assertion.method ?? fixture.method](...assertion.args), assertion.expected);
    }
  });
}

for (const fixture of PROVIDER_POLICY_CONTRACT.availabilityErrorCases) {
  test(`${fixture.role} contract: model availability detection stays distinct from transient failures`, async () => {
    const utils = await loadRoleTestUtils(fixture.role);
    for (const entry of fixture.messages) {
      assert.equal(utils[fixture.method](entry.message), entry.expected, `${fixture.role} misclassified ${entry.message ?? 'undefined'}`);
    }
  });
}
