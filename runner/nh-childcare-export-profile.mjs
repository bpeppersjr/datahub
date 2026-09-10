import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';

export const NH_EXPORT_HEADERS = Object.freeze(['Program Name', 'Issued To', 'Provider Enrollment Status',
  'Program Phone', 'Program Email', 'Region', 'County', 'Shipping Street', 'Shipping City', 'Shipping State',
  'Shipping Zip', 'Billing Street', 'Billing City', 'Billing State', 'Billing Zip', 'Account Record Type',
  'GSQ Approved Step', 'Provider Number', 'License Issue Date', 'License Expiration Date', 'Capacity',
  'Age Weeks Low', 'Age Months Low', 'Age Years Low', 'Age Years High', 'Program Type']);
export const NH_EXPORT_LIMITS = Object.freeze({ bytes: 262144, rows: 20, fieldCharacters: 4096 });
const error = (reason = 'acceptance-limits') => Object.assign(new Error('New Hampshire search export does not satisfy the bounded CSV contract.'), { code: `NH_EXPORT_${reason}` });
const zip = value => !value ? 'missing' : value === 'Hidden' ? 'redacted'
  : /^\d{5}$/.test(value) ? 'zip5' : /^\d{5}-\d{4}$/.test(value) ? 'zip5_plus4' : 'unresolved';
const date = value => !value ? 'missing' : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value) ? 'slash_date_unresolved'
  : /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'iso_shaped_unvalidated' : 'unresolved';
const histogram = names => Object.fromEntries(names.map(name => [name, 0]));

// This profiles an exported document, not hidden portal records. No row values
// or per-record hashes leave this function. Address roles and dates stay unknown.
export function profileNhSearchExport(bytes, { displayedRows, signal } = {}) {
  signal?.throwIfAborted();
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > NH_EXPORT_LIMITS.bytes
    || !Number.isSafeInteger(displayedRows) || displayedRows < 1 || displayedRows > NH_EXPORT_LIMITS.rows) throw error();
  let rows;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw error();
    try { rows = parse(text, { bom: true, relax_quotes: false, relax_column_count: false,
      skip_empty_lines: false, max_record_size: 32768 }); } catch { throw error('csv-syntax'); }
    if (JSON.stringify(rows.shift()) !== JSON.stringify(NH_EXPORT_HEADERS) || rows.length !== displayedRows
      || rows.some(row => row.some(value => value.length > NH_EXPORT_LIMITS.fieldCharacters))) throw error('schema-or-row-count');
  } catch (cause) { throw error(cause?.code === 'NH_EXPORT_csv-syntax' ? 'csv-syntax'
    : cause?.code === 'NH_EXPORT_schema-or-row-count' ? 'schema-or-row-count' : 'encoding-or-content'); }
  const postal = () => histogram(['missing', 'redacted', 'zip5', 'zip5_plus4', 'unresolved']);
  const dates = () => histogram(['missing', 'slash_date_unresolved', 'iso_shaped_unvalidated', 'unresolved']);
  const result = { schema_version: 'nh-childcare-search-export-profile@1.0.0',
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), rows: rows.length,
    columns: NH_EXPORT_HEADERS.length, shipping_zip: postal(), billing_zip: postal(),
    shipping_query_zip: histogram(['matches', 'differs', 'unknown']),
    issue_date: dates(), expiration_date: dates(),
    provider_number: { missing: 0, present: 0, distinct_nonblank: 0, repeated_nonblank_rows: 0 },
    program_type: { missing: 0, present: 0 }, enrollment_status: { missing: 0, present: 0 },
    shipping_address: { fully_populated: 0, incomplete_or_redacted: 0 },
    exported_hidden_cells: 0, spreadsheet_formula_prefix_cells: 0,
    claims: { source_authenticity_verified: false, source_rows_retained: false, row_values_replayable: false,
      address_roles_verified: false, publisher_redaction_completeness_verified: false,
      source_identifier_lifecycle_verified: false, center_subtypes_verified: false,
      active_businesses_verified: false, statewide_completeness_verified: false,
      public_export_authorized: false, national_reporting_integrated: false }, export_policy: 'internal' };
  const identifiers = new Set();
  for (const row of rows) {
    signal?.throwIfAborted();
    const value = Object.fromEntries(NH_EXPORT_HEADERS.map((key, index) => [key, row[index].trim()]));
    for (const field of row) {
      if (field.trim() === 'Hidden') result.exported_hidden_cells++;
      if (/^[\s]*[=+@-]/u.test(field)) result.spreadsheet_formula_prefix_cells++;
    }
    result.shipping_zip[zip(value['Shipping Zip'])]++;
    result.billing_zip[zip(value['Billing Zip'])]++;
    const shippingZip = value['Shipping Zip'];
    result.shipping_query_zip[/^\d{5}(?:-\d{4})?$/.test(shippingZip)
      ? shippingZip.slice(0, 5) === '03755' ? 'matches' : 'differs' : 'unknown']++;
    result.issue_date[date(value['License Issue Date'])]++;
    result.expiration_date[date(value['License Expiration Date'])]++;
    const id = value['Provider Number'];
    if (!id || id === 'Hidden') result.provider_number.missing++;
    else { result.provider_number.present++; if (identifiers.has(id)) result.provider_number.repeated_nonblank_rows++;
      identifiers.add(id); }
    for (const [field, target] of [['Program Type', 'program_type'], ['Provider Enrollment Status', 'enrollment_status']])
      result[target][!value[field] || value[field] === 'Hidden' ? 'missing' : 'present']++;
    result.shipping_address[['Shipping Street', 'Shipping City', 'Shipping State', 'Shipping Zip']
      .every(key => value[key] && value[key] !== 'Hidden') ? 'fully_populated' : 'incomplete_or_redacted']++;
  }
  result.provider_number.distinct_nonblank = identifiers.size;
  return result;
}
