import { createHash } from 'node:crypto';
import { parseOkChildcareAddressLines } from './ok-childcare-profile-fields.mjs';
import { OK_CHILDCARE_SCHEMA_PROBE_CONTRACT as PRIOR } from './ok-childcare-schema-probe.mjs';

export const OK_RETAINED_VERSION = 'ok-childcare-retained-search@1.0.0';
export const OK_RETAINED_CONTRACT = Object.freeze({ ...PRIOR, query_zip5: '73102',
  policy_id: 'ok-public-center-lookup-internal-selected-business-fields@1.0.0' });
const FIELDS = ['vendorId', 'name', 'officialDoingBusinessAs', 'addressLines', 'facilityType', 'coordinates'];
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const safe = value => typeof value === 'string' && value.length <= 1000
  && !/[\u0000-\u001f\u007f]/u.test(value) && Buffer.from(value).toString('utf8') === value;
const fail = () => { throw Error('Oklahoma retained-search contract rejected.'); };
export const okRetainedHash = value => createHash('sha256').update(value).digest('hex');
export const okRetainedClaims = () => ({ identity_matching_eligible: false, physical_site_verified: false,
  current_operations_verified: false, public_export_authorized: false, national_reporting_integrated: false,
  remote_authenticity_independently_verified: false, discarded_html_replayable: false });

export function validateOkRetainedFields(fields) {
  if (!plain(fields) || Reflect.ownKeys(fields).some(key => !FIELDS.includes(key))
    || Object.values(Object.getOwnPropertyDescriptors(fields)).some(d => !Object.hasOwn(d, 'value'))
    || fields.facilityType !== 'childcare-center') fail();
  for (const key of ['vendorId', 'name', 'officialDoingBusinessAs'])
    if (Object.hasOwn(fields, key) && fields[key] !== null && !safe(fields[key])) fail();
  if (Object.hasOwn(fields, 'addressLines') && fields.addressLines !== null
    && parseOkChildcareAddressLines(fields.addressLines).source_lines === null) fail();
  if (Object.hasOwn(fields, 'coordinates') && fields.coordinates !== null) {
    const point = fields.coordinates;
    if (!plain(point) || Reflect.ownKeys(point).some(k => !['latitude', 'longitude'].includes(k))
      || Object.values(Object.getOwnPropertyDescriptors(point)).some(d => !Object.hasOwn(d, 'value'))) fail();
    for (const value of Object.values(point))
      if (value !== null && !(typeof value === 'number' && Number.isFinite(value)) && !safe(value)) fail();
  }
  return fields;
}

export function selectOkRetainedPage(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > PRIOR.html_max_bytes) fail();
    const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
      .filter(match => /(?:^|\s)id\s*=\s*(?:"__NEXT_DATA__"|'__NEXT_DATA__')/i.test(match[1]));
    if (scripts.length !== 1 || !/(?:^|\s)type\s*=\s*(?:"application\/json"|'application\/json')/i.test(scripts[0][1])) fail();
    const value = JSON.parse(scripts[0][2]), query = value.query;
    if (value.page !== '/providers' || !plain(query) || Object.keys(query).length !== 2
      || query['zip-code'] !== '73102' || query['facility-type'] !== 'childcare-center') fail();
    const page = value.props?.pageProps, rows = page?.childcareProviders;
    if (!plain(page) || Object.keys(page).length > 128 || !Array.isArray(rows) || rows.length > PRIOR.max_rows) fail();
    const selected = rows.map((row, index) => {
      if (!plain(row) || Object.keys(row).length > 128) fail();
      const fields = {};
      for (const key of FIELDS) if (Object.hasOwn(row, key)) {
        if (key === 'coordinates' && plain(row[key])) fields[key] = Object.fromEntries(
          ['latitude', 'longitude'].filter(k => Object.hasOwn(row[key], k)).map(k => [k, row[key][k]]));
        else fields[key] = row[key];
      }
      validateOkRetainedFields(fields);
      return { row_ordinal: index + 1, source_fields: fields };
    });
    return { selected, delivery: { response_array_rows: rows.length, selected_rows: selected.length,
      at_client_row_ceiling: rows.length === PRIOR.max_rows,
      unreviewed_page_field_count: Object.keys(page).filter(k => !['childcareProviders', 'mapCenter', 'route'].includes(k)).length,
      pagination_metadata_detected: Object.keys(page).some(k => /page|pagination|cursor|total|limit|hasMore/i.test(k)),
      selected_search_completeness: 'unknown', zip_coverage_completeness: 'unknown', state_coverage_completeness: 'unknown' } };
  } catch { fail(); }
}

export function deriveOkRetainedCandidates(selected, provenance) {
  if (!Array.isArray(selected) || selected.length > PRIOR.max_rows || !plain(provenance)
    || !/^[a-f0-9]{64}$/.test(provenance.response_sha256) || !Number.isFinite(Date.parse(provenance.observed_at))
    || new Date(provenance.observed_at).toISOString() !== provenance.observed_at) fail();
  const counts = { rows: selected.length, query_zip_matches: 0, query_zip_differs: 0, query_zip_unresolved: 0,
    valid_numeric_points: 0, unavailable_points: 0, blank_source_ids: 0, distinct_nonblank_source_ids: 0,
    duplicate_id_groups: 0, repeated_id_rows: 0, identical_repeated_id_rows: 0, conflicting_id_groups: 0 };
  const ids = new Map();
  const candidates = selected.map((row, index) => {
    if (!plain(row) || Object.keys(row).length !== 2 || row.row_ordinal !== index + 1 || !Object.hasOwn(row, 'source_fields')) fail();
    const fields = validateOkRetainedFields(row.source_fields), address = parseOkChildcareAddressLines(fields.addressLines);
    const point = fields.coordinates;
    const validPoint = Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
      && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
    counts[validPoint ? 'valid_numeric_points' : 'unavailable_points']++;
    const match = address.parsed ? address.zip_code === '73102' ? 'matches' : 'differs' : 'unresolved';
    counts[`query_zip_${match}`]++;
    const id = fields.vendorId;
    if (!id?.trim()) counts.blank_source_ids++;
    else {
      const fingerprint = JSON.stringify(FIELDS.filter(k => Object.hasOwn(fields, k)).map(k => [k, fields[k]]));
      if (!ids.has(id)) ids.set(id, []); ids.get(id).push(fingerprint);
    }
    return { row_ordinal: row.row_ordinal, source_id: 'ok-childcare-public-search', source_local_identifier: id ?? null,
      source_identifier_lifecycle: 'unknown', name: fields.name ?? null, doing_business_as: fields.officialDoingBusinessAs ?? null,
      address, geocode: { latitude: validPoint ? point.latitude : null, longitude: validPoint ? point.longitude : null,
        source_datum: null, accuracy: null, address_association_verified: false, numeric_range_valid: validPoint },
      query_zip_relation: match, first_seen: provenance.observed_at, last_seen: provenance.observed_at,
      publisher_updated_at: null, operating_status: 'unknown', source_url: PRIOR.results_url,
      source_response_sha256: provenance.response_sha256, ...okRetainedClaims(), export_policy: 'internal' };
  });
  counts.distinct_nonblank_source_ids = ids.size;
  for (const values of ids.values()) if (values.length > 1) {
    counts.duplicate_id_groups++; counts.repeated_id_rows += values.length - 1;
    counts.identical_repeated_id_rows += values.length - new Set(values).size;
    if (new Set(values).size > 1) counts.conflicting_id_groups++;
  }
  return { candidates, counts };
}
