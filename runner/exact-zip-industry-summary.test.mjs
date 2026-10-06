import assert from 'node:assert/strict';
import test from 'node:test';
import { readExactZipIndustrySummary } from './exact-zip-industry-summary.mjs';

test('v1.9 national successor conserves 40 dimensions without completeness uplift', async () => {
  const view = await readExactZipIndustrySummary();
  assert.equal(view.schema_version, 'national-exact-zip-industry-summary-view@2.0.0');
  assert.equal(view.created_at, null);
  assert.equal(view.zip5_rows, 48194);
  assert.equal(view.source_dimensions, 40);
  assert.equal(view.industry_cells, 1927760);
  assert.equal(Object.values(view.status_counts).reduce((sum, value) => sum + value, 0), view.industry_cells);
  assert.equal(Object.values(view.temporal_status_counts).reduce((sum, value) => sum + value, 0), view.industry_cells);
  assert.deepEqual(view.temporal_qualification.dimension_counts, { 'within-review-window': 26, stale: 1, unmeasured: 4, unmapped: 9 });
  assert.deepEqual(view.temporal_qualification.semantic_dimension_counts, { 'source-defined-current': 23, 'non-active-reporting': 8, unmapped: 9 });
  const wa = view.dimensions.find(row => row.id === 'wa_lni_active_contractor_organization_mailing_addresses');
  assert.equal(wa.status_counts.positive, 3113);
  assert.equal(wa.status_counts['absent-from-retained-source-rows'], 45081);
  assert.equal(wa.temporal_qualification.source_key, 'wa_lni_active_contractor_organizations');
  assert.equal(wa.temporal_qualification.semantic_class, 'source-defined-current');
  assert.equal(view.evidence_disposition_counts.total_cells, view.industry_cells);
  assert.deepEqual(view.evidence_disposition_counts.by_cell_status, view.status_counts);
  assert.equal(Object.values(view.evidence_disposition_counts.by_lifecycle_status).reduce((sum, value) => sum + value, 0), view.industry_cells);
  assert.equal(view.evidence_disposition_counts.joined.reduce((sum, row) => sum + row.count, 0), view.industry_cells);
  assert.ok(view.dimensions.every(row => row.evidence_disposition_counts.total_cells === view.zip5_rows
    && row.evidence_disposition_counts.joined.length === 5
    && row.evidence_disposition_counts.joined.reduce((sum, item) => sum + item.count, 0) === view.zip5_rows));
  assert.equal(view.geography_cohort.same_code_census_zcta + view.geography_cohort.without_same_code_zcta_total, view.zip5_rows);
  assert.equal(view.entity_resolution.evidence_zip_count + view.entity_resolution.no_decision_zip_count, view.zip5_rows);
  assert.deepEqual(view.claims, { authoritative_current_usps_zip_denominator: null, current_operation_verified: false,
    all_business_completeness: false, additive_cross_industry_total: false, non_zcta_means_invalid_zip: false,
    omitted_industries_measured: false, network_requests: 0 });
});
