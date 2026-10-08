import { isDeepStrictEqual as same } from 'node:util';
import registration from '../config/datasets/restricted-childcare-exact-zip-sidecar.json' with { type: 'json' };
import { loadRetainedChildcareSnapshotEnrollment } from './retained-childcare-snapshot-enrollment.mjs';

export const RESTRICTED_CHILDCARE_EXACT_ZIP_SIDECAR_VERSION = 'restricted-childcare-exact-zip-sidecar@1.0.0';
const fail = () => { throw Error('Restricted childcare exact-ZIP sidecar is unavailable or incompatible.'); };
const zip = value => typeof value === 'string' && /^\d{5}$/.test(value);
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype && same(Object.keys(value).sort(), [...keys].sort());
const retainedClaims = Object.freeze({ export_policy: 'internal', source_requests: 0, national_reporting_integrated: false,
  public_export_authorized: false, identity_matching_eligible: false, physical_sites_verified: false,
  current_operations_verified: false, national_completeness_percent: null, statewide_completeness_percent: null,
  query_zip_assigns_address: false, polygon_membership_inferred: false, coordinate_accuracy_verified: false });

function validateRegistration() {
  if (!exact(registration, ['schema_version','dataset_id','status','source_enrollment','samples','claims','documentation'])
    || registration.schema_version !== 'restricted-childcare-exact-zip-sidecar-registration@1.0.0'
    || registration.dataset_id !== 'restricted-childcare-exact-zip-sidecar'
    || registration.status !== 'registered-runtime-projection-internal-only'
    || !exact(registration.source_enrollment, ['path','operation_id','operation_receipt_sha256','snapshot_manifest_sha256'])
    || registration.source_enrollment.path !== 'config/retained-childcare-snapshot-enrollment.json'
    || !Array.isArray(registration.samples) || registration.samples.length !== 2
    || !same(registration.samples.map(value => [value.state,value.query_zip5,value.reported_zip5,value.rows,value.rows_with_coordinates]), [['NH','03755','03755',6,0],['OK','73102','73102',4,4]])) fail();
  const claims = registration.claims;
  if (!exact(claims, ['exact_zip_sidecar_only','included_in_exact_zip_matrix','included_in_completeness_denominators','measured_zero_supported','statewide_coverage','national_reporting_integrated','current_operations_verified','physical_sites_verified','coordinate_datum_verified','coordinate_accuracy_verified','address_association_verified','zip4_separate_from_zip5','network_requests','production_enrollment','export_policy'])
    || claims.exact_zip_sidecar_only !== true || claims.zip4_separate_from_zip5 !== true || claims.network_requests !== 0 || claims.export_policy !== 'internal'
    || Object.entries(claims).some(([key,value]) => !['exact_zip_sidecar_only','zip4_separate_from_zip5','network_requests','export_policy'].includes(key) && value !== false)) fail();
  return registration;
}

export function validateRestrictedChildcareExactZipSidecar(value, expectedZip) {
  validateRegistration();
  if (!exact(value, ['schema_version','dataset_id','available','zip5','status','groups','lineage','claims','semantics'])
    || value.schema_version !== RESTRICTED_CHILDCARE_EXACT_ZIP_SIDECAR_VERSION || value.dataset_id !== registration.dataset_id
    || value.available !== true || value.zip5 !== expectedZip || !zip(value.zip5) || !same(value.claims, registration.claims)
    || !['restricted-sample-evidence-present','absent-from-restricted-samples'].includes(value.status)
    || !Array.isArray(value.groups) || (value.status === 'absent-from-restricted-samples') !== (value.groups.length === 0)
    || !exact(value.lineage, ['enrollment_path','enrollment_sha256','operation_id','operation_receipt_sha256','operation_finished_at','snapshot_manifest_sha256','source_replay_performed_this_read'])
    || value.lineage.enrollment_path !== registration.source_enrollment.path || value.lineage.operation_id !== registration.source_enrollment.operation_id
    || value.lineage.operation_receipt_sha256 !== registration.source_enrollment.operation_receipt_sha256
    || value.lineage.snapshot_manifest_sha256 !== registration.source_enrollment.snapshot_manifest_sha256
    || value.lineage.source_replay_performed_this_read !== false || !instant(value.lineage.operation_finished_at)) fail();
  for (const group of value.groups) {
    if (!exact(group, ['state','scope','query_zip5','reported_zip5','observed_at','normalized_at','source_policy','retained_sample_rows','rows_with_coordinates','temporal_status','coordinate_status','rows'])
      || !['NH','OK'].includes(group.state) || group.scope !== 'retained-query-sample-not-statewide' || group.reported_zip5 !== value.zip5
      || !zip(group.query_zip5) || !instant(group.observed_at) || !instant(group.normalized_at) || group.normalized_at < group.observed_at
      || group.temporal_status !== 'observed-once-current-operation-unverified'
      || group.coordinate_status !== (group.state === 'OK' ? 'coordinates-retained-datum-accuracy-and-address-association-unverified' : 'coordinates-not-provided')
      || !Array.isArray(group.rows) || group.rows.length !== group.retained_sample_rows
      || group.rows.filter(row => row.latitude !== null && row.longitude !== null).length !== group.rows_with_coordinates) fail();
    for (const row of group.rows) {
      if (!exact(row, ['row_ordinal','source_record_id','name','doing_business_as','address','query_zip5','query_zip_relation','source_url','source_detail_url','latitude','longitude','source_datum','accuracy','address_association_verified','first_seen','last_seen','publisher_updated_at','claims'])
        || !exact(row.address, ['source_lines','street','city','state','zip5','zip4','role']) || row.address.zip5 !== value.zip5
        || !(row.address.zip4 === null || /^\d{4}$/.test(row.address.zip4)) || row.source_datum !== null || row.accuracy !== null
        || row.address_association_verified !== false || !same(row.claims, retainedClaims)) fail();
    }
  }
  return value;
}

export async function readRestrictedChildcareExactZipSidecar({ zip5, signal } = {}) {
  validateRegistration();
  if (!zip(zip5)) throw Error('Restricted childcare exact-ZIP sidecar requires one five-digit ZIP.');
  signal?.throwIfAborted();
  const enrolled = await loadRetainedChildcareSnapshotEnrollment({ signal });
  if (enrolled.status !== 'available' || enrolled.operation_id !== registration.source_enrollment.operation_id
    || enrolled.operation_receipt_sha256 !== registration.source_enrollment.operation_receipt_sha256
    || enrolled.verification?.manifest_sha256 !== registration.source_enrollment.snapshot_manifest_sha256
    || enrolled.verification?.source_replay_performed_this_read !== false) fail();
  const source = enrolled.view?.restricted_samples;
  if (source?.schema_version !== 'retained-childcare-restricted-samples@1.0.0' || !same(source.claims, retainedClaims)) fail();
  const groups = source.groups.map(group => {
    const rows = group.rows.filter(row => row.address.zip5 === zip5);
    if (!rows.length) return null;
    return { state: group.state, scope: group.scope, query_zip5: group.query_zip5, reported_zip5: zip5,
      observed_at: group.observed_at, normalized_at: group.normalized_at, source_policy: group.source_policy,
      retained_sample_rows: rows.length, rows_with_coordinates: rows.filter(row => row.latitude !== null && row.longitude !== null).length,
      temporal_status: 'observed-once-current-operation-unverified',
      coordinate_status: group.state === 'OK' ? 'coordinates-retained-datum-accuracy-and-address-association-unverified' : 'coordinates-not-provided',
      rows: structuredClone(rows) };
  }).filter(Boolean);
  const value = { schema_version: RESTRICTED_CHILDCARE_EXACT_ZIP_SIDECAR_VERSION, dataset_id: registration.dataset_id, available: true, zip5,
    status: groups.length ? 'restricted-sample-evidence-present' : 'absent-from-restricted-samples', groups,
    lineage: { enrollment_path: registration.source_enrollment.path, enrollment_sha256: enrolled.enrollment_sha256,
      operation_id: enrolled.operation_id, operation_receipt_sha256: enrolled.operation_receipt_sha256,
      operation_finished_at: enrolled.operation_finished_at, snapshot_manifest_sha256: enrolled.verification.manifest_sha256,
      source_replay_performed_this_read: false }, claims: structuredClone(registration.claims),
    semantics: groups.length ? 'Retained query-sample rows reporting this ZIP; not measured statewide or national coverage and not part of exact-ZIP matrix or completeness denominators.'
      : 'No retained restricted-sample row reports this ZIP. This is not measured zero and does not imply zero childcare businesses.' };
  return validateRestrictedChildcareExactZipSidecar(value, zip5);
}
