import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectOkRetainedPage as select, deriveOkRetainedCandidates as derive } from './ok-childcare-retained-contract.mjs';
const provenance = { observed_at: '2026-09-10T16:00:00.000Z', response_sha256: 'a'.repeat(64) };
const center = extra => ({ vendorId: '0001', name: 'Synthetic Center', officialDoingBusinessAs: '',
  facilityType: 'childcare-center', addressLines: ['10 Test Street', 'Test City, OK 73102-0007'],
  coordinates: { latitude: 35, longitude: -97 }, ...extra });
function html(rows, change = {}) {
  return Buffer.from(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: '/providers',
    query: { 'zip-code': '73102', 'facility-type': 'childcare-center' }, props: { pageProps: { childcareProviders: rows } }, ...change })}</script>`);
}
test('OK retained projection excludes contacts, preserves source ID collisions and separate ZIP4 without active/coverage claims', () => {
  const page = select(html([center({ privateContact: 'PRIVATE', hours: ['PRIVATE'] }), center(),
    center({ name: 'Other name', addressLines: ['Other street', 'Elsewhere, KS 66002'] }),
    center({ vendorId: '', addressLines: ['Unresolved'], coordinates: { latitude: '35', longitude: -97 } })]));
  assert.ok(!JSON.stringify(page).includes('PRIVATE'));
  const result = derive(page.selected, provenance);
  assert.equal(result.candidates.length, 4); assert.equal(result.candidates[0].address.zip_code, '73102');
  assert.equal(result.candidates[0].address.zip4, '0007'); assert.equal(result.candidates[2].address.state, 'KS');
  assert.equal(result.candidates[3].address.state, null); assert.equal(result.candidates[3].geocode.latitude, null);
  assert.equal(result.counts.query_zip_matches, 2); assert.equal(result.counts.query_zip_differs, 1);
  assert.equal(result.counts.query_zip_unresolved, 1); assert.equal(result.counts.blank_source_ids, 1);
  assert.equal(result.counts.duplicate_id_groups, 1); assert.equal(result.counts.repeated_id_rows, 2);
  assert.equal(result.counts.conflicting_id_groups, 1); assert.equal(result.counts.identical_repeated_id_rows, 1);
  assert.ok(result.candidates.every(r => r.operating_status === 'unknown' && r.identity_matching_eligible === false && !r.public_export_authorized));
  assert.equal(page.delivery.zip_coverage_completeness, 'unknown');
});
test('OK retained page rejects route/query/JSON/schema drift, mixed private home types and oversized source values', () => {
  for (const bytes of [html([center({ facilityType: 'childcare-home' })]), html([center()], { page: '/providers/private' }),
    html([center()], { query: { 'zip-code': '00000', 'facility-type': 'childcare-center' } }),
    html([center({ name: 'PRIVATE'.repeat(200) })]), Buffer.from('PRIVATE'), Buffer.concat([html([]), html([])]),
    Buffer.from([255]), Buffer.alloc(1000001), html(Array.from({ length: 101 }, () => center()))])
    assert.throws(() => select(bytes), error => error.message === 'Oklahoma retained-search contract rejected.');
  const page = select(html([center()])); page.selected[0].row_ordinal = 2;
  assert.throws(() => derive(page.selected, provenance));
});
test('OK empty and cap-sized observations remain incomplete and missing business fields remain unknown', () => {
  const empty = select(html([])); assert.equal(derive(empty.selected, provenance).counts.rows, 0);
  assert.equal(empty.delivery.selected_search_completeness, 'unknown');
  const full = select(html(Array.from({ length: 100 }, () => ({ facilityType: 'childcare-center' }))));
  const result = derive(full.selected, provenance); assert.equal(full.delivery.at_client_row_ceiling, true);
  assert.equal(result.counts.blank_source_ids, 100); assert.equal(result.counts.unavailable_points, 100);
  assert.equal(result.candidates[0].name, null); assert.equal(result.candidates[0].address.zip4, null);
});
