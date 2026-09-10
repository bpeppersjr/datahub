import { isDeepStrictEqual as same } from 'node:util';
import { parseOkChildcareAddressLines } from './ok-childcare-profile-fields.mjs';
import { NH_VISIBLE_SCOPE, NH_VISIBLE_LIMITS } from './nh-childcare-visible-results.mjs';

// Pure, separately versioned evaluation only. No browser, transport, CLI,
// enrollment or source-policy expansion is provided by this module.
export const NH_QUERY_CONTRACT_VERSION = 'nh-childcare-query-contract@1.0.0';
const fail = () => { throw Error('New Hampshire query snapshot requires inspection.'); };
const count = value => Number.isSafeInteger(value) && value >= 0;
function object(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || !same(Reflect.ownKeys(value).sort(), [...keys].sort())
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))) fail();
}
function array(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) fail();
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(index)) ?? {}, 'value')) fail();
  }
}
function string(value) {
  if (typeof value !== 'string' || value.length > 500 || /[\u0000-\u001f\u007f]/u.test(value)
    || Buffer.from(value).toString('utf8') !== value) fail();
}
function validateQuery(query) {
  object(query, ['programType', 'zip5']);
  if (query.programType !== NH_VISIBLE_SCOPE.programType || typeof query.zip5 !== 'string'
    || !/^\d{5}$/.test(query.zip5) || query.zip5 === '00000') fail();
  // Syntax is not a claim that this ZIP exists or belongs to New Hampshire.
}
function validateSnapshot(query, value) {
  object(value, ['programType', 'zip5', 'completed', 'displayedRows', 'visibleRows', 'rows']);
  if (value.programType !== query.programType || value.zip5 !== query.zip5 || typeof value.completed !== 'boolean'
    || value.displayedRows !== null && !count(value.displayedRows) || !count(value.visibleRows)) fail();
  array(value.rows, NH_VISIBLE_LIMITS.rows);
  // A too-large DOM must report its count without projecting arbitrary rows.
  if (value.rows.length !== (value.visibleRows > NH_VISIBLE_LIMITS.rows ? 0 : value.visibleRows)) fail();
  const ids = new Set();
  for (const row of value.rows) {
    object(row, ['name', 'detail_url', 'address_lines']); string(row.name); string(row.detail_url);
    if (!row.name.trim()) fail();
    const id = /^https:\/\/new-hampshire\.my\.site\.com\/nhccis\/NH_childcaresearchaccountdetail\?id=([A-Za-z0-9]{1,80})$/.exec(row.detail_url)?.[1];
    if (!id || ids.has(id)) fail(); ids.add(id);
    array(row.address_lines, 4); row.address_lines.forEach(string);
  }
  if (Buffer.byteLength(JSON.stringify(value)) > NH_VISIBLE_LIMITS.projection_bytes) fail();
}
function candidate(row, index, query) {
  const lines = [...row.address_lines];
  if (lines.length === 2) {
    lines[0] = lines[0].replace(/,\s*$/, '');
    lines[1] = lines[1].replace(/^([^,]+),\s*New Hampshire\s+(\d{5}(?:-\d{4})?)$/, '$1, NH $2');
  }
  const redacted = lines.some(line => /^(?:hidden|redacted|withheld|private|confidential|address\s+(?:hidden|redacted|withheld|not\s+(?:provided|listed|available)))[,.\s]*$/i.test(line.trim()));
  const parsed = parseOkChildcareAddressLines(redacted ? [] : lines);
  const address = { source_lines: [...row.address_lines], parsed: parsed.parsed, street: parsed.street,
    city: parsed.city, state: parsed.state, zip5: parsed.zip_code, zip4: parsed.zip4,
    address_role: 'source-rendered-shipping-address', address_role_verified: false };
  return { row_ordinal: index + 1, name: row.name, source_detail_url: row.detail_url,
    source_record_id: new URL(row.detail_url).searchParams.get('id'), source_url: NH_VISIBLE_SCOPE.url,
    query_zip5: query.zip5, query_zip_relation: !address.parsed ? 'unresolved' : address.zip5 === query.zip5 ? 'matches' : 'differs',
    address, latitude: null, longitude: null, physical_site_verified: false, current_operations_verified: false };
}

export function evaluateNhChildcareQuery(query, value) {
  validateQuery(query); validateSnapshot(query, value);
  let status;
  if (!value.completed || value.displayedRows === null) status = 'unsettled';
  else if (value.displayedRows > NH_VISIBLE_LIMITS.rows || value.visibleRows > NH_VISIBLE_LIMITS.rows) status = 'row-limit-exceeded';
  else if (value.displayedRows !== value.visibleRows) status = 'count-mismatch';
  else status = value.displayedRows === 0 ? 'settled-zero' : 'settled-visible-rows';
  const projectionComplete = status === 'settled-zero' || status === 'settled-visible-rows';
  const selected = structuredClone(value);
  const candidates = projectionComplete ? selected.rows.map((row, index) => candidate(row, index, query)) : [];
  return { contract_version: NH_QUERY_CONTRACT_VERSION, evidence_mode: 'caller-supplied-selected-snapshot',
    query: structuredClone(query), status, selected, candidates, accepted_source_rows: candidates.length,
    projection_complete: projectionComplete, search_completeness: 'unknown', statewide_completeness: 'unknown',
    native_acquisition_verified: false, collection_ready: false, public_export_authorized: false,
    national_reporting_integrated: false };
}

export function evaluateNhChildcareQueryPair(query, before, after) {
  const first = evaluateNhChildcareQuery(query, before), second = evaluateNhChildcareQuery(query, after);
  if (!same(first, second)) fail();
  return first;
}
