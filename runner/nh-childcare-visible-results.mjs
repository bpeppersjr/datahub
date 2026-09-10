import { isDeepStrictEqual as same } from 'node:util';
import { parseOkChildcareAddressLines } from './ok-childcare-profile-fields.mjs';

export const NH_VISIBLE_SCOPE = Object.freeze({ url: 'https://new-hampshire.my.site.com/nhccis/NH_ChildCareSearch',
  programType: 'Licensed Group Child Care Program', zip5: '03755' });
export const NH_VISIBLE_LIMITS = Object.freeze({ rows: 20, projection_bytes: 65536, manifest_bytes: 262144 });
const failure = () => Error('New Hampshire visible-result contract was not satisfied.');
const fail = () => { throw failure(); };
function object(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || !same(Reflect.ownKeys(value).sort(), [...keys].sort())) fail();
  if (Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))) fail();
}
function array(value, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max
    || Reflect.ownKeys(value).length !== value.length + 1) fail();
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value')) fail();
}
function string(value) {
  if (typeof value !== 'string' || value.length > 500 || /[\u0000-\u001f\u007f]/u.test(value)
    || Buffer.from(value).toString('utf8') !== value) fail();
}
export function profileNhVisibleResults(value) {
  object(value, ['programType', 'zip5', 'completed', 'displayedRows', 'visibleRows', 'rows']);
  if (value.programType !== NH_VISIBLE_SCOPE.programType || value.zip5 !== NH_VISIBLE_SCOPE.zip5 || value.completed !== true
    || !Number.isSafeInteger(value.displayedRows) || value.displayedRows < 0 || value.displayedRows > NH_VISIBLE_LIMITS.rows
    || value.visibleRows !== value.displayedRows) fail();
  array(value.rows, NH_VISIBLE_LIMITS.rows); if (value.rows.length !== value.displayedRows) fail();
  const ids = new Set();
  for (const row of value.rows) {
    object(row, ['name', 'detail_url', 'address_lines']); string(row.name); string(row.detail_url);
    if (!row.name.trim()) fail();
    const match = /^https:\/\/new-hampshire\.my\.site\.com\/nhccis\/NH_childcaresearchaccountdetail\?id=([A-Za-z0-9]{1,80})$/.exec(row.detail_url);
    if (!match || ids.has(match[1])) fail(); ids.add(match[1]);
    array(row.address_lines, 4); row.address_lines.forEach(string);
  }
  if (Buffer.byteLength(JSON.stringify(value)) > NH_VISIBLE_LIMITS.projection_bytes) fail();
  const selected = structuredClone(value);
  const candidates = selected.rows.map((row, index) => {
    // Renderer appends one street separator comma. Keep the original visible
    // lines independently; never substitute billing, query ZIP or map data.
    const lines = [...row.address_lines]; if (lines.length === 2) lines[0] = lines[0].replace(/,\s*$/, '');
    const redacted = lines.some(line => /^(?:hidden|redacted|withheld|private|confidential|address\s+(?:hidden|redacted|withheld|not\s+(?:provided|listed|available)))[,.\s]*$/i.test(line.trim()));
    const parsed = parseOkChildcareAddressLines(redacted ? [] : lines);
    const address = { source_lines: [...row.address_lines], parsed: parsed.parsed, street: parsed.street,
      city: parsed.city, state: parsed.state, zip5: parsed.zip_code, zip4: parsed.zip4,
      address_role: 'source-rendered-shipping-address', address_role_verified: false };
    return { row_ordinal: index + 1, name: row.name, source_detail_url: row.detail_url,
      source_record_id: new URL(row.detail_url).searchParams.get('id'), source_url: NH_VISIBLE_SCOPE.url,
      query_zip5: NH_VISIBLE_SCOPE.zip5, query_zip_relation: !address.parsed ? 'unresolved' : address.zip5 === NH_VISIBLE_SCOPE.zip5 ? 'matches' : 'differs',
      address, latitude: null, longitude: null, physical_site_verified: false, current_operations_verified: false };
  });
  return { schema_version: 'nh-visible-results@1.0.0', selected, candidates,
    source_rows: candidates.length, search_completeness: 'unknown', statewide_completeness: 'unknown',
    public_export_authorized: false, national_reporting_integrated: false };
}

export async function inspectNhVisibleResults(ui, { signal } = {}) {
  try {
    const check = () => signal?.throwIfAborted();
    check(); await ui.open(NH_VISIBLE_SCOPE.url);
    check(); await ui.select(NH_VISIBLE_SCOPE.programType, NH_VISIBLE_SCOPE.zip5);
    check(); await ui.search();
    check(); const result = profileNhVisibleResults(await ui.state());
    check(); const after = profileNhVisibleResults(await ui.state());
    check(); if (!same(result, after)) fail();
    return result;
  } catch { throw failure(); }
}
