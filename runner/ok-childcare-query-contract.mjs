import { OK_RETAINED_CONTRACT as C, validateOkRetainedFields, deriveOkRetainedCandidates } from './ok-childcare-retained-contract.mjs';

export const OK_QUERY_VERSION = 'ok-childcare-zip-query@1.0.0';
export function okQueryUrl(zip5) {
  if (typeof zip5 !== 'string' || !/^[0-9]{5}$/.test(zip5)) throw Error('Invalid Oklahoma query ZIP5.');
  return `https://childcarefind.okdhs.org/providers?zip-code=${zip5}&facility-type=childcare-center`;
}
const fail = () => { throw Error('Oklahoma ZIP query contract rejected.'); };
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const FIELDS = ['vendorId', 'name', 'officialDoingBusinessAs', 'addressLines', 'facilityType', 'coordinates'];

export function selectOkQueryPage(bytes, zip5) {
  okQueryUrl(zip5);
  try {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > C.html_max_bytes) fail();
    const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
      .filter(match => /(?:^|\s)id\s*=\s*(?:"__NEXT_DATA__"|'__NEXT_DATA__')/i.test(match[1]));
    if (scripts.length !== 1 || !/(?:^|\s)type\s*=\s*(?:"application\/json"|'application\/json')/i.test(scripts[0][1])) fail();
    const value = JSON.parse(scripts[0][2]), query = value.query;
    if (value.page !== '/providers' || !plain(query) || Object.keys(query).length !== 2
      || query['zip-code'] !== zip5 || query['facility-type'] !== 'childcare-center') fail();
    const page = value.props?.pageProps, rows = page?.childcareProviders;
    if (!plain(page) || Object.keys(page).length > 128 || !Array.isArray(rows) || rows.length > C.max_rows) fail();
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
      at_client_row_ceiling: rows.length === C.max_rows,
      unreviewed_page_field_count: Object.keys(page).filter(k => !['childcareProviders', 'mapCenter', 'route'].includes(k)).length,
      pagination_metadata_detected: Object.keys(page).some(k => /page|pagination|cursor|total|limit|hasMore/i.test(k)),
      selected_search_completeness: 'unknown', zip_coverage_completeness: 'unknown', state_coverage_completeness: 'unknown' } };
  } catch { fail(); }
}

export function deriveOkQueryCandidates(selected, provenance, zip5) {
  const sourceUrl = okQueryUrl(zip5);
  // Reuse the reviewed field/address/point normalization, then replace every
  // query-dependent value before emitting the successor contract's output.
  const result = deriveOkRetainedCandidates(selected, provenance);
  result.counts.query_zip_matches = result.counts.query_zip_differs = result.counts.query_zip_unresolved = 0;
  for (const row of result.candidates) {
    row.query_zip5 = zip5;
    row.query_zip_relation = row.address.parsed ? row.address.zip_code === zip5 ? 'matches' : 'differs' : 'unresolved';
    row.source_url = sourceUrl;
    result.counts[`query_zip_${row.query_zip_relation}`]++;
  }
  return result;
}
