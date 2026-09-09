import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {verifyUtChildcareAppJob} from './ut-childcare-app.mjs';
import {mnSelectionReadJson as readJson, mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';

export const UT_CHILDCARE_REPORTING_VERSION = 'ut-childcare-reporting@1.0.0';
const check = value => { if (!value) throw Error('Utah retained candidate reporting rejected.'); };
const reasons = ['address', 'address_role', 'status', 'point'];
function add(map, key) {
  const token = JSON.stringify(key), row = map.get(token);
  if (row) row.candidate_rows++; else map.set(token, {...key, candidate_rows: 1});
}
const buckets = (map, total) => [...map.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([, row]) => ({...row, percent_of_accepted_cohort: 100 * row.candidate_rows / total}));
const matches = (meter, artifact) => meter.sha256 === artifact.sha256 && meter.bytes === artifact.bytes && meter.records === artifact.records;

/** Read-only selected-center cohort reporting, never an active-business denominator. */
export async function summarizeUtChildcareAppJob(receiptPath, options = {}) {
  check(options && [Object.prototype, null].includes(Object.getPrototypeOf(options))
    && Reflect.ownKeys(options).every(key => key === 'signal' && Object.hasOwn(Object.getOwnPropertyDescriptor(options, key), 'value')));
  const {signal} = options; check(signal === undefined || signal instanceof AbortSignal); signal?.throwIfAborted();
  try {
    // This verifier includes full local PDF/selection/normalization replay.
    const app = await verifyUtChildcareAppJob(receiptPath, {signal}), receipt = app.receipt, normalized = receipt.normalized;
    const manifestMeter = {}, manifest = await readJson(normalized.manifest_path, 100000, signal, manifestMeter);
    check(manifestMeter.sha256 === normalized.manifest_sha256 && same(manifest.summary, normalized.summary)
      && same(manifest.origin, normalized.source) && same(manifest.artifacts, normalized.artifacts));
    const directory = path.dirname(normalized.manifest_path), source = normalized.source;
    const quality = {with_zip5: 0, with_zip4: 0, with_points: 0, missing_points: 0, state_scope_conflicts: 0,
      ...Object.fromEntries(reasons.map(key => [`${key}_unavailable_reasons`, {}]))};
    const states = new Map(), zips = new Map(), keys = new Set(), ids = new Set(), locations = new Set(), meter = {};
    for await (const row of readLines(path.join(directory, 'normalized.jsonl'), 16000000, signal, meter)) {
      check(meter.records <= 422);
      const p = row.provenance, a = row.reported_address;
      check(row.dataset_id === 'ut-dlbc-childcare-centers' && row.publisher_scope === 'UT' && row.export_policy === 'internal'
        && p.ingest_run_id === normalized.run_id && p.source_release_id === manifest.source_release_id
        && p.source_sha256 === source.source_sha256 && p.source_url === source.source.source_url
        && p.observed_at === source.source.observed_at && p.processed_at === manifest.processed_at
        && p.origin_receipt_sha256 === source.origin_receipt_sha256 && p.prerequisite_receipt_sha256 === source.prerequisite_receipt_sha256);
      check(typeof p.source_unique_key === 'string' && /^F\d{2}-\d{1,32}$/.test(p.source_unique_key)
        && !keys.has(p.source_unique_key) && typeof row.source_record_id === 'string' && !ids.has(row.source_record_id));
      const location = `${p.source_page}:${p.source_row}`;
      check(Number.isInteger(p.source_page) && p.source_page > 0 && Number.isInteger(p.source_row) && p.source_row > 0 && !locations.has(location));
      keys.add(p.source_unique_key); ids.add(row.source_record_id); locations.add(location);
      check(a.state === 'UT' && a.state_source === 'UT' && a.country === null && a.address_role === null
        && typeof a.zip_code === 'string' && /^\d{5}$/.test(a.zip_code) && a.zip_code !== '00000'
        && a.postal_code === a.zip_code && (a.zip4 === null || typeof a.zip4 === 'string' && /^\d{4}$/.test(a.zip4)));
      check(same(row.geocode, {latitude: null, longitude: null, crs: null, status: 'not-provided-by-selected-source', inferred: false})
        && row.source_status.status_source === null && row.source_status.active_business_verified === false
        && row.claims.current_operations_verified === false && row.claims.physical_site_verified === false
        && row.claims.identity_matching_eligible === false && row.industry.childcare_type_source === 'Child Care Center');
      add(states, {state: a.state}); add(zips, {state: a.state, zip5: a.zip_code});
      quality.with_zip5++; if (a.zip4 !== null) quality.with_zip4++; quality.missing_points++;
      for (const prefix of reasons) {
        const reason = row.quality[`${prefix}_unavailable_reason`];
        if (reason !== null) { check(typeof reason === 'string' && reason.length <= 128); const group = quality[`${prefix}_unavailable_reasons`]; group[reason] = (group[reason] ?? 0) + 1; }
      }
    }
    const artifact = normalized.artifacts.find(row => row.path === 'normalized.jsonl'), summary = normalized.summary;
    check(matches(meter, artifact) && meter.records === 422 && summary.source_records === meter.records
      && summary.accepted_records === meter.records && summary.quarantined_records === 0
      && summary.accepted_with_zip5 === quality.with_zip5 && summary.accepted_with_zip4 === quality.with_zip4 && summary.accepted_with_points === 0);
    const byState = buckets(states, meter.records), byZip = buckets(zips, meter.records);
    for (const group of [byState, byZip]) check(group.reduce((n, row) => n + row.candidate_rows, 0) === meter.records);
    const result = {schema_version: UT_CHILDCARE_REPORTING_VERSION, source_id: 'ut-dlbc-childcare-centers', publisher_scope: 'UT',
      source_candidate_rows: meter.records, accepted_candidate_rows: meter.records, quarantined_candidate_rows: 0,
      by_reported_state: byState, by_reported_zip: byZip, quality,
      provenance: {app_receipt_sha256: app.receipt_sha256, app_run_id: receipt.run_id, industry_run_id: receipt.industry_run_id,
        execution_mode: receipt.execution_mode, normalized_manifest_sha256: normalized.manifest_sha256, normalized_run_id: normalized.run_id,
        source_sha256: source.source_sha256, source_url: source.source.source_url, report_edition: source.report_edition,
        origin_receipt_sha256: source.origin_receipt_sha256, prerequisite_receipt_sha256: source.prerequisite_receipt_sha256,
        observed_at: source.source.observed_at, normalization_processed_at: manifest.processed_at,
        adoption_started_at: receipt.started_at, adoption_finished_at: receipt.finished_at},
      claims: {denominator: 'accepted selected Child Care Center source-candidate rows in this retained Utah publisher cohort, not all mixed-program report rows or all United States businesses',
        row_unit: 'source-candidate-row', export_policy: 'internal', national_reporting_integrated: false, national_completeness_percent: null,
        unique_active_business_count: null, current_usps_assignment_verified: false, boundary_assignment_verified: false,
        physical_site_verified: false, current_operations_verified: false, identity_matching_applied: false,
        credential_deduplication_applied: false, public_export_authorized: false, source_authenticity_verified: false,
        historical_app_acquisition_verified: false, refetch_performed: false, normalization_rebuilt: false,
        address_role: null, state_assignment: 'source-state-label-not-publisher-inference', exact_address_geocodes_verified: false,
        observation_semantics: 'original retained PDF GET completion; normalization and app adoption timestamps are separate, not freshness evidence'}};
    // Revalidate the entire semantic chain and then rehash artifacts after replay;
    // timestamps alone cannot detect every same-size write on all filesystems.
    check(same(await verifyUtChildcareAppJob(receiptPath, {signal}), app));
    for (const entry of normalized.artifacts) {
      check(['normalized.jsonl', 'summary.json'].includes(entry.path)); const final = {};
      for await (const row of readLines(path.join(directory, entry.path), entry.path === 'normalized.jsonl' ? 16000000 : 100000, signal, final)) void row;
      check(matches(final, entry));
    }
    const finalManifest = {}; await readJson(normalized.manifest_path, 100000, signal, finalManifest);
    const finalReceipt = {}; await readJson(receiptPath, 100000, signal, finalReceipt);
    check(finalManifest.sha256 === manifestMeter.sha256 && finalReceipt.sha256 === app.receipt_sha256);
    signal?.throwIfAborted(); return result;
  } catch { signal?.throwIfAborted(); throw Error('Utah retained candidate reporting rejected.'); }
}
