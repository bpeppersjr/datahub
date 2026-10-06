import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { classifyExactZipEvidenceDisposition } from './exact-zip-industry-temporal-qualification.mjs';
import { readExactZipIndustryEvidenceV19 } from './national-exact-zip-industry-evidence-matrix-v1-9.mjs';

const TEMPORAL_REGISTRATION = 'config/datasets/exact-zip-industry-temporal-qualification.json';
const STATUSES = ['positive', 'measured-zero', 'outside-source-denominator', 'absent-from-retained-source-rows', 'unavailable'];
const LIFECYCLES = ['source-defined-current-positive-within-review-window', 'source-defined-current-without-positive-evidence',
  'non-active-reporting-positive', 'non-active-reporting-without-positive-evidence', 'stale', 'unmeasured', 'unmapped'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const check = (value, message = 'Exact-ZIP industry summary is unavailable.') => { if (!value) throw new Error(message); };

async function pinned(root, relative, maximum, expected) {
  const absolute = path.resolve(root, relative), rel = path.relative(root, absolute);
  check(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'Exact-ZIP summary path is invalid.');
  check(await realpath(absolute) === absolute, 'Exact-ZIP summary path is linked.');
  const stat = await lstat(absolute); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= maximum, 'Exact-ZIP summary file is unsafe.');
  const bytes = await readFile(absolute); if (expected) check(sha256(bytes) === expected, 'Exact-ZIP summary hash changed.');
  return JSON.parse(bytes);
}

export async function readExactZipIndustrySummary({ root = APP_ROOT } = {}) {
  root = await realpath(path.resolve(root));
  const matrix = await readExactZipIndustryEvidenceV19({ root, zip5: '00000' });
  const temporalRegistration = await pinned(root, TEMPORAL_REGISTRATION, 64_000), retained = temporalRegistration.retained_release;
  check(temporalRegistration.schema_version === '1.0.0' && temporalRegistration.runtime_pointer === null
    && temporalRegistration.production_enrollment === false && retained?.summary?.dimension_count === 40, 'Temporal successor registration is incompatible.');
  const temporalManifest = await pinned(root, retained.manifest, 64_000, retained.manifest_sha256);
  check(temporalManifest.schema_version === 'exact-zip-industry-temporal-qualification-release@1.1.0'
    && temporalManifest.release_id === retained.release_id && temporalManifest.artifact?.record_count === 40
    && temporalManifest.bindings?.matrix?.release_id === matrix.release_id
    && temporalManifest.bindings?.matrix?.manifest_sha256 === matrix.manifest_sha256, 'Temporal successor manifest is incompatible.');
  const temporal = await pinned(root, path.join(path.dirname(retained.manifest), temporalManifest.artifact.path), 128_000, retained.artifact_sha256);
  check(temporal.schema_version === 'exact-zip-industry-temporal-qualification@1.1.0'
    && Array.isArray(temporal.rows) && temporal.rows.length === 40 && new Set(temporal.rows.map(row => row.dimension_id)).size === 40,
  'Temporal successor artifact is incompatible.');
  const byTemporal = new Map(temporal.rows.map(row => [row.dimension_id, row])), joinedMap = new Map();
  const byLifecycle = Object.fromEntries(LIFECYCLES.map(status => [status, 0]));
  const dimensions = Object.entries(matrix.cell_status_counts_by_dimension).map(([id, status_counts]) => {
    check(STATUSES.every(status => Number.isSafeInteger(status_counts[status]) && status_counts[status] >= 0)
      && STATUSES.reduce((sum, status) => sum + status_counts[status], 0) === 48194, 'Dimension conservation failed.');
    const qualification = byTemporal.get(id); check(qualification, 'Temporal dimension is missing.');
    const joined = STATUSES.map(cell_status => {
      const disposition = classifyExactZipEvidenceDisposition({ cell_status, semantic_class: qualification.semantic_class,
        review_qualification: qualification.review_qualification }), count = status_counts[cell_status], key = `${cell_status}|${disposition.lifecycle_status}`;
      byLifecycle[disposition.lifecycle_status] += count;
      joinedMap.set(key, { ...disposition, count: (joinedMap.get(key)?.count ?? 0) + count });
      return { ...disposition, count };
    });
    return { id, status_counts, positive_zip_percent: Number((status_counts.positive / 48194 * 100).toFixed(1)),
      measured_status_percent: Number(((status_counts.positive + status_counts['measured-zero']) / 48194 * 100).toFixed(1)),
      evidence_disposition_counts: { total_cells: 48194, joined }, temporal_qualification: {
        source_key: qualification.source_key, source_release_id: qualification.source_release_id,
        review_qualification: qualification.review_qualification, semantic_class: qualification.semantic_class,
        source_reference_at: qualification.source_reference_at, review_due_at: qualification.review_due_at,
        source_status_term: qualification.source_status_term, assessment_as_of: qualification.assessment_as_of,
      } };
  });
  check(dimensions.length === 40, 'Dimension roster is incompatible.');
  const aggregate = Object.fromEntries(STATUSES.map(status => [status, dimensions.reduce((sum, row) => sum + row.status_counts[status], 0)]));
  const joined = [...joinedMap.values()].sort((a, b) => `${a.cell_status}|${a.lifecycle_status}`.localeCompare(`${b.cell_status}|${b.lifecycle_status}`));
  const temporalStatusCounts = {
    'source-referenced-current-operation-unverified': temporal.rows.filter(row => row.source_reference_at !== null).length * 48194,
    'source-reference-unresolved': temporal.rows.filter(row => row.source_reference_at === null).length * 48194,
  };
  check(Object.values(aggregate).reduce((sum, value) => sum + value, 0) === 1927760
    && Object.values(byLifecycle).reduce((sum, value) => sum + value, 0) === 1927760
    && joined.reduce((sum, value) => sum + value.count, 0) === 1927760, 'National successor conservation failed.');
  return { schema_version: 'national-exact-zip-industry-summary-view@2.0.0', available: true,
    release_id: matrix.release_id, manifest_sha256: matrix.manifest_sha256, created_at: null, zip5_rows: 48194,
    source_dimensions: 40, industry_cells: 1927760, status_counts: aggregate,
    evidence_disposition_counts: { total_cells: 1927760, by_cell_status: aggregate, by_lifecycle_status: byLifecycle, joined },
    temporal_status_counts: temporalStatusCounts,
    temporal_qualification: { release_id: retained.release_id, manifest_sha256: retained.manifest_sha256,
      assessment_as_of: temporal.assessment_as_of, dimension_counts: temporal.summary.qualification_dimension_counts,
      semantic_dimension_counts: temporal.summary.semantic_dimension_counts }, omitted_industries_status: 'unavailable-not-materialized',
    coverage_gaps: { out_of_cohort_source_records: 3, out_of_cohort_zip_count: 3, source_quality_gap_records: 3,
      address_gap_dimensions: 9, address_rows_without_eligible_zip5: 4399806,
      meaning: 'Historical retained v1.8 source-row quality and ZIP-assignment gaps; WA successor missing/ineligible rows are separately conserved as 111. Neither is a missing-business count.' },
    geography_cohort: { same_code_census_zcta: 33791, source_contributed_without_same_code_zcta: 14361,
      denominator_only_without_same_code_zcta: 41, explicit_placeholder: 1, without_same_code_zcta_total: 14403,
      cohort_release_id: 'zip-denominator-gap-cohort-20261003072243230-9f1be37aa2eb',
      cohort_manifest_sha256: '792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea', created_at: '2026-10-03T07:22:43.230Z' },
    entity_resolution: { evidence_zip_count: 26919, no_decision_zip_count: 21275, evidence_zip_percent: 55.9,
      no_decision_zip_percent: 44.1, site_alias_groups: 0, establishment_alias_groups: 0, unapplied_review_candidates: 0,
      release_id: 'zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564',
      manifest_sha256: '742ffc2d35cc3f4e5541cc2325879b2da563ae7565a9d86829e9ec20560277ba',
      created_at: '2026-10-03T15:24:28.426Z', benchmark_gate_passed: false, entity_resolution_applied: false },
    dimensions, verification_scope: 'Hash-pinned v1.9 summary derivation reads one bounded matrix prefix plus registered aggregate contracts; full_matrix_replay_performed=false. Source dimensions overlap and are nonadditive evidence, not business counts, geocode completeness, or verified current operation.',
    claims: { authoritative_current_usps_zip_denominator: null, current_operation_verified: false,
      all_business_completeness: false, additive_cross_industry_total: false, non_zcta_means_invalid_zip: false,
      omitted_industries_measured: false, network_requests: 0 } };
}
