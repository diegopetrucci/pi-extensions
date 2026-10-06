import assert from 'node:assert/strict';
import test from 'node:test';
import { isExactNotFound } from '../scripts/release-workspace.mjs';

test('isExactNotFound accepts exact 404 and ETARGET on stdout or stderr and rejects mixed failures', () => {
  const notFound = 'npm error code E404\nnpm error 404 Not Found';
  const target = 'npm error code ETARGET\nnpm error notarget No matching version found for example@1.0.0.';

  assert.equal(isExactNotFound({ code: 1, stdout: '', stderr: notFound }), true);
  assert.equal(isExactNotFound({ code: 1, stdout: notFound, stderr: '' }), true);
  assert.equal(isExactNotFound({ code: 1, stdout: '', stderr: target }), true);
  assert.equal(isExactNotFound({ code: 1, stdout: target, stderr: '' }), true);
  assert.equal(isExactNotFound({ code: 0, stdout: '', stderr: notFound }), false);
  assert.equal(isExactNotFound({ code: 1, stdout: 'npm error code E500', stderr: notFound }), false);
  assert.equal(isExactNotFound({ code: 1, stdout: notFound, stderr: 'npm error code E500' }), false);
  assert.equal(isExactNotFound({ code: 1, stdout: '', stderr: 'npm error code ETARGET\nnpm error something else' }), false);
});
