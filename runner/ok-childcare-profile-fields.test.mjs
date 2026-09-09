import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOkChildcareAddressLines as parse, interpretOkChildcareNoticeFlags as notice } from './ok-childcare-profile-fields.mjs';

test('observed grammar preserves raw lines and separates ZIP5 and ZIP4 without inference', () => {
  const source = [' 123 Example Street ', 'Example City, MA 01234-0056'];
  const result = parse(source);
  assert.equal(result.parsed, true); assert.equal(result.street, '123 Example Street'); assert.equal(result.city, 'Example City');
  assert.equal(result.state, 'MA'); assert.equal(result.zip_code, '01234'); assert.equal(result.postal_code, '01234'); assert.equal(result.zip4, '0056');
  assert.deepEqual(result.source_lines, source); assert.notEqual(result.source_lines, source); assert.equal(result.address_role_verified, false);
  assert.equal(parse(['123 Example Street', 'Example City, DC 20001']).zip4, null);
});
test('unrecognized present lines stay raw with unresolved reason and null parsed components', () => {
  for (const lines of [['123 Street','Town, ok 73102'],['123 Street','Town, XX 73102'],['123 Street','Town, PR 00901'],['123 Street','Town, OK 00000'],['123 Street','Town, OK 731020001'],['123 Street','Town OK 73102'],['123 Street','Town, OK 73102 extra'],['123 Street','Town, OK 73102','Unit 2'],['','Town, OK 73102']]) {
    const result = parse(lines); assert.equal(result.parsed, false); assert.equal(result.reason, 'address-parsing-unresolved'); assert.deepEqual(result.source_lines, lines); assert.equal(result.zip_code,null); assert.equal(result.state,null);
  }
});
test('malformed arrays, bounds, accessors and unsafe strings fail without executing or echoing input', () => {
  const accessor = []; Object.defineProperty(accessor,'0',{get(){assert.fail('getter executed');}});
  const extra = ['x','y']; extra.secret='PRIVATE';
  for (const value of [null,{},new Array(2),accessor,extra,Array(11).fill('PRIVATE'),['x'.repeat(1001)],['PRIVATE\n'],['\ud800']]) {
    const result = parse(value); assert.equal(result.reason,'invalid-address-lines-shape'); assert.equal(result.source_lines,null); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});
test('notice flags recognize exact strings only and never infer active or closed status', () => {
  const result = notice({denialSent:'True',revocationSent:'False',emergencyIssued:null,PRIVATE:'PRIVATE'});
  assert.deepEqual(result.flags,{denialSent:true,revocationSent:false,emergencyIssued:null}); assert.deepEqual(result.unknown_fields,['emergencyIssued']); assert.equal(result.active_business_verified,false);
  assert.equal(result.status_interpretation,'operating-status-not-provided-by-selected-source'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  for (const value of [true,false,'true','false','PRIVATE',0,{},[]]) assert.equal(notice({denialSent:value}).flags.denialSent,null);
  assert.equal(notice({get denialSent(){assert.fail('getter executed');}}).flags.denialSent,null);
  assert.equal(notice(Object.create({denialSent:'True'})).flags.denialSent,null);
});
