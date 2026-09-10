import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NH_VISIBLE_SCOPE as S, profileNhVisibleResults as profile, inspectNhVisibleResults as inspect } from './nh-childcare-visible-results.mjs';

function sample() {
  return { programType: S.programType, zip5: S.zip5, completed: true, displayedRows: 1, visibleRows: 1,
    rows: [{ name: 'Example Learning Center', detail_url: 'https://new-hampshire.my.site.com/nhccis/NH_childcaresearchaccountdetail?id=fixture1',
      address_lines: ['1 Example Street,', 'Hanover, NH 03755-0123'] }] };
}
test('NH visible projection preserves evidence and separates ZIP5 and ZIP4 with unknown points/status', () => {
  const input = sample(), result = profile(input);
  assert.deepEqual(result.selected, input); assert.notEqual(result.selected, input);
  assert.equal(result.candidates[0].address.zip5, '03755'); assert.equal(result.candidates[0].address.zip4, '0123');
  assert.equal(result.candidates[0].address.street, '1 Example Street');
  assert.equal(result.candidates[0].latitude, null); assert.equal(result.candidates[0].longitude, null);
  assert.equal(result.candidates[0].current_operations_verified, false);
  assert.equal(result.candidates[0].physical_site_verified, false);
  assert.equal(result.candidates[0].query_zip_relation, 'matches');
});
test('NH visible unknown/redacted address is preserved without query ZIP substitution', () => {
  for (const lines of [[], ['Address withheld'], ['1 Example St,', 'Unknown'], ['1 Example St,', 'Hanover, NH 00000']]) {
    const input = sample(); input.rows[0].address_lines = lines;
    const row = profile(input).candidates[0]; assert.equal(row.address.zip5, null);
    assert.equal(row.query_zip_relation, 'unresolved'); assert.deepEqual(row.address.source_lines, lines);
  }
});
test('NH visible different address ZIP is retained, not forced to the query', () => {
  const input = sample(); input.rows[0].address_lines[1] = 'Lebanon, NH 03766';
  const row = profile(input).candidates[0]; assert.equal(row.address.zip5, '03766'); assert.equal(row.address.zip4, null);
  assert.equal(row.query_zip_relation, 'differs');
});
test('NH visible partially redacted street with populated city ZIP remains unresolved', () => {
  for (const street of ['Hidden,', 'Address withheld,', 'CONFIDENTIAL,']) {
    const input = sample(); input.rows[0].address_lines[0] = street;
    const address = profile(input).candidates[0].address;
    assert.equal(address.parsed, false); assert.equal(address.street, null); assert.equal(address.zip5, null);
    assert.deepEqual(address.source_lines, input.rows[0].address_lines);
  }
});
test('NH settled zero is not an unqueried search', () => {
  const input = { ...sample(), displayedRows: 0, visibleRows: 0, rows: [] };
  assert.equal(profile(input).candidates.length, 0);
  assert.throws(() => profile({ ...input, completed: false }));
});
test('NH visible rejects scope, count, extra fields, duplicate IDs and malformed links', () => {
  for (const change of [{ zip5: '3755' }, { programType: 'Residential' }, { completed: false }, { displayedRows: 2 },
    { visibleRows: 0 }, { displayedRows: 21 }, { displayedRows: NaN }, { hidden: 'PRIVATE' }]) {
    assert.throws(() => profile({ ...sample(), ...change }));
  }
  for (const url of ['https://evil.example/?id=x', 'javascript:alert(1)', S.url,
    'https://new-hampshire.my.site.com/nhccis/NH_childcaresearchaccountdetail?id=x&id=y',
    'https://new-hampshire.my.site.com/nhccis/NH_childcaresearchaccountdetail?id=x#fragment']) {
    const input = sample(); input.rows[0].detail_url = url; assert.throws(() => profile(input));
  }
  const duplicate = sample(); duplicate.rows.push(structuredClone(duplicate.rows[0]));
  duplicate.displayedRows = duplicate.visibleRows = 2; assert.throws(() => profile(duplicate));
  const extra = sample(); extra.rows[0].phone = 'PRIVATE'; assert.throws(() => profile(extra));
});
test('NH visible bounds fields, rejects sparse/accessor objects and does not evaluate getters', () => {
  for (const name of ['', 'x'.repeat(501), 'bad\u0000value', '\ud800']) {
    const input = sample(); input.rows[0].name = name; assert.throws(() => profile(input));
  }
  const sparse = sample(); sparse.rows = new Array(1); assert.throws(() => profile(sparse));
  const input = sample(); let touched = false;
  Object.defineProperty(input.rows[0], 'name', { get() { touched = true; return 'PRIVATE'; }, enumerable: true });
  assert.throws(() => profile(input)); assert.equal(touched, false);
});
test('NH visible workflow selects exact query once, never invokes export, and requires unchanged result', async () => {
  let searches = 0, reads = 0;
  const ui = { open: async url => assert.equal(url, S.url), select: async (type, zip) => {
    assert.equal(type, S.programType); assert.equal(zip, S.zip5);
  }, search: async () => { searches++; }, state: async () => { reads++; return sample(); },
  download: async () => assert.fail('No export allowed') };
  assert.equal((await inspect(ui)).candidates.length, 1); assert.equal(searches, 1); assert.equal(reads, 2);
  reads = 0; ui.state = async () => { const value = sample(); if (reads++) value.rows[0].name = 'Changed'; return value; };
  await assert.rejects(inspect(ui));
});
test('NH visible workflow cancellation and source errors are bounded and redacted', async () => {
  let opened = false; const abort = new AbortController(); abort.abort();
  await assert.rejects(inspect({ open: async () => { opened = true; } }, { signal: abort.signal }));
  assert.equal(opened, false);
  await assert.rejects(inspect({ open: async () => { throw Error('PRIVATE_SOURCE_TEXT'); } }), error => !error.message.includes('PRIVATE'));
});
