import { createHash } from 'node:crypto';
import { MN_CONSTRUCTION_COLUMNS, MN_CONSTRUCTION_EXPORTS } from './mn-construction-preflight.mjs';
import { assertNormalizedUsPostalFieldsDeep } from './normalized-us-postal-code.mjs';

export const MN_CONSTRUCTION_TRANSFORMATION = 'mn-construction-normalization@1.0.0';
const classes = { IR: ['registration', 'construction-contractor-registration'], BC: ['license', 'residential-building-contractor'], CR: ['license', 'residential-remodeler'], RR: ['license', 'residential-roofer'], MI: ['license', 'manufactured-home-installer'] };
const states = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC AS GU MP PR VI AA AE AP'.split(' '));
const fields = ['Bus_Pers','Lic_Number','Status','Name','DBA_Name','Addr1','Addr2','City','St','Zip','Orig_Date','Exp_Date'];
const reject = reason => { throw Object.assign(new Error(`Minnesota construction record rejected: ${reason}.`), { code: 'MN_CONSTRUCTION_RECORD_REJECTED', reason }); };
function text(value, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) reject('invalid-selected-text');
  const result = value.trim(); if (required && !result) reject('missing-required-text'); return result || null;
}
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Pure privacy-selected normalization. No fetches, geocoding, publication or
 * cross-record deduplication. Callers must conserve rejected row dispositions.
 */
export function normalizeMnConstructionRecord(row, context = {}) {
  const keys = ['runId','sourceReleaseId','observedAt','cohort','sourceFileSha256','rowNumber'];
  if (!context || Object.keys(context).length !== keys.length || keys.some(k => !Object.hasOwn(context,k))
    || !['registrations','residential'].includes(context.cohort)
    || !['runId','sourceReleaseId'].every(k => typeof context[k] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(context[k]))
    || typeof context.observedAt !== 'string' || !Number.isFinite(Date.parse(context.observedAt)) || new Date(context.observedAt).toISOString() !== context.observedAt
    || typeof context.sourceFileSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(context.sourceFileSha256) || !Number.isSafeInteger(context.rowNumber) || context.rowNumber < 1) reject('invalid-provenance');
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== MN_CONSTRUCTION_COLUMNS.length
    || MN_CONSTRUCTION_COLUMNS.some(k => !Object.hasOwn(row,k))) reject('column-drift');
  // Reject excluded people/statuses before reading names, addresses or contacts.
  if (row.Bus_Pers !== 'Business') reject('not-literal-business-marker');
  if (row.Status !== 'Issued') reject('not-issued-credential');
  const id = text(row.Lic_Number, 8, true), prefix = id.slice(0,2);
  if (!/^[A-Z]{2}\d{6}$/.test(id) || !Object.hasOwn(classes,prefix)) reject('unsupported-business-credential');
  if ((context.cohort === 'registrations') !== (prefix === 'IR')) reject('credential-cohort-mismatch');
  const selected = {};
  for (const key of fields) selected[key] = text(row[key], ['Name','DBA_Name','Addr1','Addr2'].includes(key) ? 500 : 100, key === 'Name');
  const postal = /^(\d{5})(?:-?(\d{4}))?$/.exec(selected.Zip ?? '');
  const validPostal = postal !== null && postal[1] !== '00000';
  const recognizedState = states.has(selected.St);
  const zip5 = recognizedState && validPostal ? postal[1] : null;
  const address = { street: selected.Addr1, street2: selected.Addr2, city: selected.City, state: selected.St,
    country: recognizedState ? 'US' : null, country_basis: recognizedState ? 'recognized-source-state-code-not-boundary-validation' : 'unresolved',
    zip_code: zip5, postal_code: zip5, zip4: zip5 === null ? null : postal[2] ?? null,
    address_role: 'publisher-reported-role-unresolved', physical_location_verified: false };
  const record = {
    schema_version: '1.0.0', dataset_id: 'mn-dli-construction-business-credentials',
    source_record_id: `${context.sourceReleaseId}:${context.cohort}:row:${context.rowNumber}`,
    business_name: selected.Name, dba_name: selected.DBA_Name,
    external_identifiers: [{ type: 'minnesota_dli_construction_credential', value: id }],
    credential: { kind: classes[prefix][0], category: classes[prefix][1], status_source: 'Issued',
      active_credential_basis: 'publisher-status-at-observation', active_business_verified: false,
      original_date_source: selected.Orig_Date, expiration_date_source: selected.Exp_Date, date_semantics: 'unparsed-publisher-values-not-business-lifecycle' },
    reported_address: address,
    geocode: { latitude: null, longitude: null, status: 'not-provided-by-source', address_role: 'unresolved' },
    industry: { category: 'construction', naics_code: null, basis: 'credential-program-not-verified-establishment-classification' },
    affiliation: { parent_company: null, ownership_verified: false },
    provenance: { source_url: MN_CONSTRUCTION_EXPORTS[context.cohort === 'registrations' ? 0 : 1], source_release_id: context.sourceReleaseId,
      source_file_sha256: context.sourceFileSha256, source_row_number: context.rowNumber, selected_fields_sha256: sha(selected),
      ingest_run_id: context.runId, observed_at: context.observedAt, transformation_version: MN_CONSTRUCTION_TRANSFORMATION,
      attribution: 'Minnesota Department of Labor and Industry, Construction Codes and Licensing Division' },
    quality: { unique_business_identity_verified: false, current_usps_validity: 'unverified', geographic_boundary_verified: false,
      postal_status: zip5 !== null ? 'format-only' : selected.Zip === null ? 'missing' : 'unresolved-or-invalid',
      physical_site_eligible: false, matching_eligible: false },
    export_policy: 'local-review-only',
  };
  return assertNormalizedUsPostalFieldsDeep(record);
}
