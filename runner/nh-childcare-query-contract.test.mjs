import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNhChildcareQuery, evaluateNhChildcareQueryPair } from './nh-childcare-query-contract.mjs';
import { NH_VISIBLE_SCOPE } from './nh-childcare-visible-results.mjs';
import { readNhRetainedVisible, normalizeNhVisibleResults } from './nh-childcare-visible-normalization.mjs';

const query = (zip5 = '03766') => ({ programType: NH_VISIBLE_SCOPE.programType, zip5 });
const sample = (zip5 = '03766') => ({ ...query(zip5), completed: true, displayedRows: 1, visibleRows: 1,
  rows: [{ name: 'Example Center', detail_url: 'https://new-hampshire.my.site.com/nhccis/NH_childcaresearchaccountdetail?id=example1',
    address_lines: ['1 Example Road,', 'Lebanon, New Hampshire 03766-0123'] }] });
const evaluate = (value, request = query()) => evaluateNhChildcareQuery(request, value);

test('NH parameterized evaluation binds requested ZIP and preserves source postal fields', () => {
  const value = sample(), original = structuredClone(value), result = evaluate(value);
  assert.equal(result.status, 'settled-visible-rows'); assert.equal(result.projection_complete, true);
  assert.equal(result.contract_version, 'nh-childcare-query-contract@1.0.0');
  assert.equal(result.evidence_mode, 'caller-supplied-selected-snapshot');
  assert.deepEqual(value, original); assert.deepEqual(result.selected, value);
  assert.equal(result.candidates[0].query_zip5, '03766'); assert.equal(result.candidates[0].query_zip_relation, 'matches');
  assert.equal(result.candidates[0].address.zip5, '03766'); assert.equal(result.candidates[0].address.zip4, '0123');
  assert.deepEqual(result.candidates[0].address.source_lines, value.rows[0].address_lines);
  assert.equal(result.candidates[0].latitude, null); assert.equal(result.candidates[0].longitude, null);
  assert.equal(result.search_completeness, 'unknown'); assert.equal(result.native_acquisition_verified, false);
  assert.equal(result.collection_ready, false); assert.equal(result.national_reporting_integrated, false);
  assert.equal(Object.hasOwn(result, 'observed_at'), false);
});

test('NH query mismatch, invalid ZIP and unobserved program are rejected before evaluation', () => {
  for (const zip of ['3766', 3766, '00000', '03766-0123', ' 03766', '03766 ', '999999', null]) {
    assert.throws(() => evaluate(sample(), query(zip)));
  }
  assert.throws(() => evaluate(sample('03755')));
  assert.throws(() => evaluate(sample(), { ...query(), programType: 'Unobserved Program' }));
  assert.throws(() => evaluate(sample(), { ...query(), zip4: '0123' }));
});

test('NH queried empty remains distinct from pending, missing counts and incomplete projection', () => {
  const zero = { ...sample(), displayedRows: 0, visibleRows: 0, rows: [] };
  assert.equal(evaluate(zero).status, 'settled-zero');
  for (const change of [{ completed: false }, { displayedRows: null }, { completed: false, displayedRows: null }]) {
    const result = evaluate({ ...zero, ...change });
    assert.equal(result.status, 'unsettled'); assert.equal(result.projection_complete, false); assert.equal(result.accepted_source_rows, 0);
  }
  const result = evaluate({ ...sample(), displayedRows: 2 });
  assert.equal(result.status, 'count-mismatch'); assert.equal(result.candidates.length, 0);
  assert.equal(result.search_completeness, 'unknown');
});

test('NH over-limit snapshots are explicit gaps and cannot publish truncated candidates', () => {
  for (const value of [{ ...sample(), displayedRows: 21 }, { ...sample(), displayedRows: 21, visibleRows: 21, rows: [] }]) {
    const result = evaluate(value); assert.equal(result.status, 'row-limit-exceeded');
    assert.equal(result.accepted_source_rows, 0); assert.deepEqual(result.candidates, []);
    assert.equal(result.projection_complete, false);
  }
  assert.throws(() => evaluate({ ...sample(), visibleRows: 21 }));
  assert.throws(() => evaluate({ ...sample(), displayedRows: -1 }));
  assert.throws(() => evaluate({ ...sample(), displayedRows: Infinity }));
  assert.throws(() => evaluate({ ...sample(), completed: 'true' }));
});

test('NH exact twenty-row boundary accepts distinct records without changing normalization semantics', () => {
  const value = sample('03755'); value.rows = Array.from({ length: 20 }, (_, index) => ({ ...sample().rows[0],
    detail_url: `https://new-hampshire.my.site.com/nhccis/NH_childcaresearchaccountdetail?id=example${index}` }));
  value.visibleRows = value.displayedRows = 20;
  const result = evaluate(value, query('03755'));
  assert.equal(result.accepted_source_rows, 20);
  assert.deepEqual(result.candidates, normalizeNhVisibleResults(value).candidates);
  value.rows[0].name = 'x'.repeat(501); assert.throws(() => evaluate(value, query('03755')));
});

test('NH query normalization preserves off-query ZIP, redaction and unresolved addresses', () => {
  const value = sample(); value.rows[0].address_lines[1] = 'Hanover, NH 03755';
  const row = evaluate(value).candidates[0]; assert.equal(row.query_zip5, '03766');
  assert.equal(row.address.zip5, '03755'); assert.equal(row.address.zip4, null); assert.equal(row.query_zip_relation, 'differs');
  for (const lines of [['Address withheld,', 'Lebanon, New Hampshire 03766'], ['1 Example Road,', 'Lebanon, New Hampshire'],
    ['1 Example Road,', 'Lebanon, New Hampshire 00000'], ['Private']]) {
    const input = sample(); input.rows[0].address_lines = lines;
    const unresolved = evaluate(input).candidates[0]; assert.equal(unresolved.address.parsed, false);
    assert.equal(unresolved.address.zip5, null); assert.equal(unresolved.query_zip_relation, 'unresolved');
  }
});

test('NH selected-field contract rejects private extras, duplicate IDs, malformed URLs and accessors', () => {
  const extra = sample(); extra.rows[0].phone = 'PRIVATE'; assert.throws(() => evaluate(extra));
  const duplicate = sample(); duplicate.rows.push(structuredClone(duplicate.rows[0]));
  duplicate.visibleRows = duplicate.displayedRows = 2; assert.throws(() => evaluate(duplicate));
  const invalid = sample(); invalid.rows[0].detail_url = 'https://other.example/?token=PRIVATE'; assert.throws(() => evaluate(invalid));
  const sparse = sample(); sparse.rows = new Array(1); assert.throws(() => evaluate(sparse));
  let touched = false; const accessor = sample(); Object.defineProperty(accessor, 'zip5', { get() { touched = true; return '03766'; } });
  assert.throws(() => evaluate(accessor), error => !error.message.includes('PRIVATE')); assert.equal(touched, false);
  const rowGetter = sample(); Object.defineProperty(rowGetter.rows[0], 'name', { get() { touched = true; return 'PRIVATE'; } });
  assert.throws(() => evaluate(rowGetter)); assert.equal(touched, false);
});

test('NH paired snapshots require stability without treating stable incomplete evidence as success', () => {
  const first = sample(); assert.equal(evaluateNhChildcareQueryPair(query(), first, structuredClone(first)).status, 'settled-visible-rows');
  const changed = sample(); changed.rows[0].name = 'Changed'; assert.throws(() => evaluateNhChildcareQueryPair(query(), first, changed));
  const pending = { ...sample(), completed: false };
  assert.equal(evaluateNhChildcareQueryPair(query(), pending, structuredClone(pending)).status, 'unsettled');
  assert.throws(() => evaluateNhChildcareQueryPair(query(), first, sample('03755')));
});

test('NH fixed native evidence replays with original query without claiming new acquisition', {
  skip: process.env.DATAHUB_TEST_NH_RETAINED !== '1',
}, async () => {
  const source = await readNhRetainedVisible(), original = structuredClone(source);
  const result = evaluateNhChildcareQueryPair(query('03755'), source.observation.selected, source.observation.selected);
  assert.equal(result.accepted_source_rows, 6); assert.equal(result.candidates.filter(row => row.address.parsed).length, 6);
  assert.deepEqual(result.candidates, normalizeNhVisibleResults(source.observation.selected).candidates);
  assert.equal(result.native_acquisition_verified, false); assert.deepEqual(source, original);
  assert.ok(result.candidates.every(row => row.query_zip5 === '03755' && row.address.zip4 === null));
});
