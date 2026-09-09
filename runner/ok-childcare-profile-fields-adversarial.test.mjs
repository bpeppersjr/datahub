import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOkChildcareAddressLines as parse, interpretOkChildcareNoticeFlags as notice } from './ok-childcare-profile-fields.mjs';

test('Oklahoma notices remain tri-state and cannot assert operating or closed status', () => {
  for (const value of ['True', 'False', true, false, 'FALSE', 'TRUE', ' False', 'True ', '', null, undefined, 1, 0, new String('True')]) {
    const input = { denialSent: value, revocationSent: value, emergencyIssued: value, privateExtra: 'DO_NOT_PUBLISH' };
    const result = notice(input), expected = value === 'True' ? true : value === 'False' ? false : null;
    assert.deepEqual(result.flags, { denialSent: expected, revocationSent: expected, emergencyIssued: expected });
    assert.equal(result.active_business_verified, false);
    assert.equal(result.status_interpretation, 'operating-status-not-provided-by-selected-source');
    assert.deepEqual(result.unknown_fields, expected === null ? ['denialSent', 'revocationSent', 'emergencyIssued'] : []);
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_PUBLISH/);
    assert.deepEqual(Object.keys(result).sort(), ['active_business_verified', 'flags', 'status_interpretation', 'unknown_fields']);
  }
});

test('Oklahoma field interpreters do not evaluate getters or value conversion callbacks', () => {
  let calls = 0;
  const fail = () => { calls++; throw Error('Getter must not execute'); };
  const notices = {};
  for (const key of ['denialSent', 'revocationSent', 'emergencyIssued', 'privateExtra', 'toJSON']) {
    Object.defineProperty(notices, key, { get: fail, enumerable: true });
  }
  assert.deepEqual(notice(notices).unknown_fields, ['denialSent', 'revocationSent', 'emergencyIssued']);
  const conversion = { toString: fail, valueOf: fail, toJSON: fail };
  assert.equal(notice({ denialSent: conversion }).flags.denialSent, null);
  for (const index of ['0', '1']) {
    const lines = ['123 Example St', 'Example City, OK 73102'];
    Object.defineProperty(lines, index, { get: fail });
    assert.equal(parse(lines).source_lines, null);
  }
  const lines = ['123 Example St', 'Example City, OK 73102'];
  Object.defineProperty(lines, 'toJSON', { get: fail });
  assert.equal(parse(lines).source_lines, null);
  assert.equal(calls, 0);
});

test('Oklahoma raw address bounds preserve safe unresolved input without sharing mutable arrays', () => {
  for (const source of [[], ['line'], Array(10).fill('Unparsed but bounded'), ['x'.repeat(1000), 'unparsed']]) {
    const result = parse(source);
    assert.equal(result.parsed, false);
    assert.equal(result.reason, 'address-parsing-unresolved');
    assert.deepEqual(result.source_lines, source);
    assert.notEqual(result.source_lines, source);
    source.push('later caller change');
    assert.notDeepEqual(result.source_lines, source);
  }
  const symbolExtra = ['x', 'y']; symbolExtra[Symbol('private')] = 'DO_NOT_PUBLISH';
  const hiddenExtra = ['x', 'y']; Object.defineProperty(hiddenExtra, 'private', { value: 'DO_NOT_PUBLISH' });
  const sparse = ['x', 'y']; delete sparse[0];
  class CustomLines extends Array {}
  for (const source of [symbolExtra, hiddenExtra, sparse, new CustomLines('x', 'y'), ['\u0000'], ['\u007f'], ['\udfff'], [new String('text')]]) {
    const result = parse(source);
    assert.equal(result.source_lines, null);
    assert.equal(result.reason, 'invalid-address-lines-shape');
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_PUBLISH/);
  }
});

test('Oklahoma ZIP parsing never repairs malformed ZIPs or combines ZIP4 with ZIP5', () => {
  const good = parse([' 123 Example St ', 'Example City, MA 00100-0001']);
  assert.equal(good.parsed, true);
  assert.equal(good.zip_code, '00100'); assert.equal(good.postal_code, '00100'); assert.equal(good.zip4, '0001');
  assert.deepEqual(good.source_lines, [' 123 Example St ', 'Example City, MA 00100-0001']);
  assert.equal(good.address_role_verified, false);
  for (const tail of ['00100-001', '00100-00001', '001000001', '100', '00100 0001', '00100-', '00000-0001', '00100-0001 trailing']) {
    const raw = ['123 Example St', `Example City, MA ${tail}`], result = parse(raw);
    assert.equal(result.parsed, false, tail);
    assert.deepEqual(result.source_lines, raw);
    for (const field of ['street', 'city', 'state', 'zip_code', 'postal_code', 'zip4']) assert.equal(result[field], null);
  }
  for (const line of ['Example City MA 00100', 'Example City, Massachusetts 00100', 'Example City, ma 00100', 'Example City, ZZ 00100', 'Example, City, MA 00100']) {
    assert.equal(parse(['123 Example St', line]).parsed, false);
  }
});
