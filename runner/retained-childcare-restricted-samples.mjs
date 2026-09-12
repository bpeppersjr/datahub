import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { readOkRetainedSearch } from './ok-childcare-retained-bundle.mjs';
import { inspectNhVisibleNormalization } from './nh-childcare-visible-normalization.mjs';

export const RESTRICTED_SAMPLE_VERSION = 'retained-childcare-restricted-samples@1.0.0';
export const RESTRICTED_SAMPLE_INPUTS = Object.freeze({
  base_manifest: 'data/managed-operations/bafb683b-f4ae-4355-983a-d2a3c85e7d9b/output/jobs/ef5c1cef-a2c2-4854-9092-7e1e60e409ea/manifest.json',
  base_sha256: '194b20da203cb95c2d0aa3ebb794c7e817391fda8cb8785c09bb6d49f067cef4',
  ok_manifest: 'data/managed-operations/a5f5ca7d-89b7-450a-9278-3430b436aff6/output/jobs/4acdd407-ae61-43fb-ba66-6464f3a5a2a4/manifest.json',
  ok_sha256: 'bd26af2f1f0e83358188fea44cd553ac7d4ed55f022943c57527f6f332fe074b',
  ok_operation_id: 'a5f5ca7d-89b7-450a-9278-3430b436aff6',
  ok_receipt_sha256: '039da807177ea10983facb33e3d9f9c3a713a960a46e962da013fba63fa3d405',
  nh_manifest: 'data/business-sources/nh-childcare/visible-normalizations/f0a36862-cb37-445c-be1c-5c5fa526138d/manifest.json',
  nh_sha256: '938dca54e4c6dda0f47f368237855b7771aaa7d5d8db80f8fdc29bea51f6cb19',
});
const fail = () => { throw Error('Restricted retained childcare sample requires inspection.'); };
const claims = () => ({ export_policy: 'internal', source_requests: 0, national_reporting_integrated: false,
  public_export_authorized: false, identity_matching_eligible: false, physical_sites_verified: false,
  current_operations_verified: false, national_completeness_percent: null, statewide_completeness_percent: null,
  query_zip_assigns_address: false, polygon_membership_inferred: false, coordinate_accuracy_verified: false });
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function exact(value, fields) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || !same(Object.keys(value).sort(), [...fields].sort())) fail(); }
const nullableText = value => value === null || typeof value === 'string' && value.length <= 512 && !/[\u0000-\u001f]/u.test(value);

export function validateRestrictedChildcareSamples(value) {
  const saved = structuredClone(value);
  exact(saved, ['schema_version', 'inputs', 'claims', 'groups']);
  if (saved.schema_version !== RESTRICTED_SAMPLE_VERSION || !same(saved.inputs, RESTRICTED_SAMPLE_INPUTS) || !same(saved.claims, claims()) || !Array.isArray(saved.groups) || saved.groups.length !== 2) fail();
  for (const [index, group] of saved.groups.entries()) {
    exact(group, ['state', 'scope', 'query_zip5', 'observed_at', 'normalized_at', 'source_policy', 'count', 'points_available', 'rows']);
    if (group.state !== ['OK', 'NH'][index] || group.query_zip5 !== ['73102', '03755'][index]
      || group.scope !== 'retained-query-sample-not-statewide' || group.count !== [4, 6][index]
      || group.points_available !== [4, 0][index] || !instant(group.observed_at) || !instant(group.normalized_at)
      || group.normalized_at < group.observed_at || !Array.isArray(group.rows) || group.rows.length !== group.count) fail();
    if (typeof group.source_policy !== 'string' || !group.source_policy.length || group.source_policy.length > 256) fail();
    let points = 0;
    for (const [ordinal, row] of group.rows.entries()) {
      exact(row, ['row_ordinal','source_record_id','name','doing_business_as','address','query_zip5','query_zip_relation','source_url','source_detail_url','latitude','longitude','source_datum','accuracy','address_association_verified','first_seen','last_seen','publisher_updated_at','claims']);
      exact(row.address, ['source_lines','street','city','state','zip5','zip4','role']);
      if (row.row_ordinal !== ordinal + 1 || !nullableText(row.source_record_id) || typeof row.name !== 'string' || !row.name.length || !nullableText(row.name)
        || !nullableText(row.doing_business_as) || row.query_zip5 !== group.query_zip5 || !['matches','differs','unresolved'].includes(row.query_zip_relation)
        || !Array.isArray(row.address.source_lines) || row.address.source_lines.length > 5 || !row.address.source_lines.every(nullableText)
        || !['street','city','state','role'].every(key => nullableText(row.address[key]))
        || !(row.address.zip5 === null || /^\d{5}$/.test(row.address.zip5)) || !(row.address.zip4 === null || /^\d{4}$/.test(row.address.zip4))
        || !same(row.claims, claims()) || row.source_datum !== null || row.accuracy !== null || row.address_association_verified !== false
        || row.first_seen !== group.observed_at || row.last_seen !== group.observed_at || row.publisher_updated_at !== null) fail();
      const expectedRelation = row.address.zip5 === null ? 'unresolved' : row.address.zip5 === row.query_zip5 ? 'matches' : 'differs';
      if (row.query_zip_relation !== expectedRelation || !nullableText(row.source_url) || !nullableText(row.source_detail_url)) fail();
      if (row.latitude !== null || row.longitude !== null) {
        if (typeof row.latitude !== 'number' || !Number.isFinite(row.latitude) || Math.abs(row.latitude) > 90 || typeof row.longitude !== 'number' || !Number.isFinite(row.longitude) || Math.abs(row.longitude) > 180) fail();
        points++;
      }
    }
    if (points !== group.points_available) fail();
  }
  return saved;
}

/** Uses already normalized records; verification replays source contracts offline only. */
export async function loadRestrictedChildcareSamples({ signal } = {}) {
  signal?.throwIfAborted();
  const p = RESTRICTED_SAMPLE_INPUTS, meter = {};
  const receipt = await readJson(path.join(APP_ROOT, 'data/managed-operations', p.ok_operation_id, 'receipt.json'), 100000, signal, meter);
  if (meter.sha256 !== p.ok_receipt_sha256 || receipt.id !== p.ok_operation_id || receipt.kind !== 'source-acquisition' || receipt.status !== 'SUCCEEDED' || receipt.error !== null) fail();
  const accepted=receipt.result;
  if(accepted?.retained?.manifest!==path.join(APP_ROOT,p.ok_manifest)||accepted.retained.sha256!==p.ok_sha256||accepted.retained.operation_id!==p.ok_operation_id||accepted.receiptIntegrityVerified!==true||accepted.inspectionRequired!==false||accepted.snapshotReady!==true||accepted.exportPolicy!=='internal')fail();
  const ok = await readOkRetainedSearch(path.join(APP_ROOT, p.ok_manifest), p.ok_sha256, { operationId: p.ok_operation_id, operationRoot: path.join(APP_ROOT, 'data/managed-operations', p.ok_operation_id, 'output'), requireNative: true, signal });
  if (ok.manifest.status !== 'accepted-internal-source-candidates' || ok.candidates.length !== 4) fail();
  await inspectNhVisibleNormalization(path.join(APP_ROOT, p.nh_manifest), { expectedSha256: p.nh_sha256, signal });
  const nhMeter = {}, nh = await readJson(path.join(APP_ROOT, p.nh_manifest), 262144, signal, nhMeter);
  if (nhMeter.sha256 !== p.nh_sha256 || nh.observation.candidates.length !== 6) fail();
  const groups = [
    { state: 'OK', query_zip5: '73102', observed_at: ok.manifest.observed_at, normalized_at: ok.manifest.finished_at,
      source_policy: 'ok-public-center-lookup-internal-selected-business-fields@1.0.0', count: 4, points_available: 4, candidates: ok.candidates },
    { state: 'NH', query_zip5: '03755', observed_at: nh.source.observed_at, normalized_at: nh.created_at,
      source_policy: nh.source.policy.id, count: 6, points_available: 0, candidates: nh.observation.candidates },
  ].map(group => {
    const { candidates, ...metadata } = group;
    return { ...metadata, scope: 'retained-query-sample-not-statewide', rows: candidates.map(row => ({
      row_ordinal: row.row_ordinal, source_record_id: row.source_local_identifier ?? row.source_record_id,
      name: row.name, doing_business_as: row.doing_business_as??null, address: { source_lines: row.address.source_lines, street: row.address.street, city: row.address.city,
        state: row.address.state, zip5: row.address.zip5 ?? row.address.zip_code ?? null, zip4: row.address.zip4, role: row.address.address_role },
      query_zip5: group.query_zip5, query_zip_relation: row.query_zip_relation, source_url: row.source_url, source_detail_url: row.source_detail_url ?? null,
      latitude: row.geocode?.latitude ?? row.latitude ?? null, longitude: row.geocode?.longitude ?? row.longitude ?? null,
      source_datum: null, accuracy: null, address_association_verified: false, first_seen: group.observed_at, last_seen: group.observed_at,
      publisher_updated_at: null, claims: claims(),
    })) };
  });
  const after = {}; await readJson(path.join(APP_ROOT, 'data/managed-operations', p.ok_operation_id, 'receipt.json'), 100000, signal, after);
  if (after.sha256 !== p.ok_receipt_sha256) fail();
  return validateRestrictedChildcareSamples({ schema_version: RESTRICTED_SAMPLE_VERSION, inputs: p, claims: claims(), groups });
}
