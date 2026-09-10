import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NH_EXPORT_HEADERS as H, profileNhSearchExport as profile } from './nh-childcare-export-profile.mjs';
const csv = rows => Buffer.from(`${H.join(',')}\r\n${rows.map(values => H.map(h => `"${String(values[h] ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')}\r\n`);

test('NH export profile preserves unknowns, ZIP4 separation and selected-row denominator without leaking values', () => {
  const rows = [{ 'Program Name': 'PRIVATE "quoted", name\ncontinued', 'Shipping Zip': '03755-0123',
    'Billing Zip': '03755', 'Provider Number': '0007', 'License Issue Date': '1/2/2026', 'Program Type': 'PRIVATE TYPE',
    'Program Phone': 'Hidden' }, { 'Provider Number': '0007', 'Shipping Zip': 'Hidden', 'Billing Zip': '90210',
    'License Expiration Date': '2026-99-88', 'Program Name': '=PRIVATE_FORMULA' },
  { 'Shipping Zip': '03801', 'Billing Zip': '3755' }];
  const result = profile(csv(rows), { displayedRows: 3 });
  assert.equal(result.rows, 3); assert.equal(result.shipping_zip.zip5_plus4, 1);
  assert.deepEqual(result.shipping_query_zip, { matches: 1, differs: 1, unknown: 1 });
  assert.deepEqual(result.provider_number, { missing: 1, present: 2, distinct_nonblank: 1, repeated_nonblank_rows: 1 });
  assert.equal(result.issue_date.slash_date_unresolved, 1);
  assert.equal(result.expiration_date.iso_shaped_unvalidated, 1);
  assert.equal(result.exported_hidden_cells, 2); assert.equal(result.spreadsheet_formula_prefix_cells, 1);
  assert.equal(result.shipping_address.fully_populated, 0);
  assert.ok(Object.values(result.claims).every(value => value === false));
  assert.ok(!/PRIVATE|0007|03755|90210/.test(JSON.stringify(result)));
});

test('NH strict CSV rejects malformed publisher quoting, schema/row drift, encoding and budget violations with redacted errors', () => {
  const valid = csv([{ 'Program Name': 'PRIVATE "name"' }]);
  for (const [bytes, displayedRows] of [[valid, 2], [valid, 0], [valid, 21],
    [Buffer.from(valid.toString().replace('""name""', '"name"')), 1],
    [Buffer.from(valid.toString().replace('Shipping Zip', 'PRIVATE')), 1],
    [Buffer.concat([valid, Buffer.from([255])]), 1], [Buffer.from('PRIVATE\0'), 1],
    [Buffer.alloc(262145), 1], [csv([{ 'Program Name': 'x'.repeat(4097) }]), 1]]) {
    assert.throws(() => profile(bytes, { displayedRows }), error => !error.message.includes('PRIVATE')
      && error.message === 'New Hampshire search export does not satisfy the bounded CSV contract.');
  }
  assert.throws(() => profile(valid, { displayedRows: 1, signal: AbortSignal.abort() }));
});
