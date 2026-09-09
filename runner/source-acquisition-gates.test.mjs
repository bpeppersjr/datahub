import test from 'node:test';
import assert from 'node:assert/strict';
import {getSourcePrerequisiteGates, assertSourcePrerequisiteAllowed} from './source-acquisition-gates.mjs';

test('source gate is a policy prerequisite, not a ready capture or acquired dataset', () => {
  const [gate] = getSourcePrerequisiteGates();
  assert.equal(gate.sourceId, 'ne-childcare-pdf');
  assert.equal(gate.status, 'BLOCKED_SOURCE_POLICY');
  for (const key of ['captureImplemented', 'sourceBodyAcquired', 'publicExportAuthorized', 'currentOperationsVerified']) assert.equal(gate[key], false);
  gate.status = 'READY'; gate.evidence.length = 0;
  assert.equal(getSourcePrerequisiteGates()[0].status, 'BLOCKED_SOURCE_POLICY');
  assert.equal(getSourcePrerequisiteGates()[0].evidence.length, 3);
  assert.throws(() => assertSourcePrerequisiteAllowed({sourceId: 'ne-childcare-pdf'}), error => error.statusCode === 409 && error.code === 'SOURCE_POLICY_UNRESOLVED');
});

test('source gate rejects malformed inputs and cannot execute caller getters or overrides', () => {
  const getter = {}; Object.defineProperty(getter, 'sourceId', {enumerable: true, get() { assert.fail('must not evaluate caller getter'); }});
  for (const input of [undefined, null, [], {}, 'ne-childcare-pdf', getter, Object.assign(Object.create(null), {sourceId: 'ne-childcare-pdf'}),
    {sourceId: 'unknown'}, {sourceId: 'ne-childcare-pdf', approved: true}, {sourceId: 'ne-childcare-pdf', url: 'https://private.invalid'},
    {sourceId: 'ne-childcare-pdf', [Symbol('approval')]: true}]) {
    assert.throws(() => assertSourcePrerequisiteAllowed(input), error => error.statusCode === 400 && error.code === 'INVALID_SOURCE_PREREQUISITE' && !error.message.includes('private.invalid'));
  }
});
