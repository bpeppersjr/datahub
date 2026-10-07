import test from "node:test";
import assert from "node:assert/strict";
import { readExactZipIndustryEvidenceV30 as matrix } from "./national-exact-zip-industry-evidence-matrix-v3-0-reader.mjs";
import { readExactZipIndustryEvidenceWithTemporalQualificationV30 as read } from "./exact-zip-industry-temporal-qualification-v3-0.mjs";
import { readExactZipIndustrySummaryV30 as summary } from "./exact-zip-industry-summary-v3-0.mjs";

test("bounded v3.0 reader exposes stale New York address evidence and recursive v2.9 lineage", async () => {
  const value = await matrix({ zip5: "10001" });
  assert.equal(value.schema_version, "national-exact-zip-industry-evidence-row@3.0.0");
  assert.equal(Object.keys(value.row.cells).length, 51);
  assert.equal(value.row.cells.ny_retail_food_license_address_evidence_count.count, 47);
  assert.equal(value.row.cells.ny_retail_food_license_address_evidence_count.temporal_status.status, "stale");
  assert.equal(value.recursive_lineage_verified, true);
  assert.equal(value.claims.nonadditive_with_ny_retail_food_location_profiles, true);
  assert.equal(value.claims.address_evidence_may_not_qualify_as_physical_site, true);
});

test("temporal v3.0 preserves non-active reporting without site or operation claims", async () => {
  const value = await read({ zip5: "10001" });
  const qualification = value.temporal_qualification.rows.at(-1);
  assert.equal(value.temporal_qualification.rows.length, 51);
  assert.equal(qualification.dimension_id, "ny_retail_food_license_address_evidence_count");
  assert.equal(qualification.semantic_class, "non-active-reporting");
  assert.equal(qualification.review_qualification, "stale");
  assert.equal(qualification.current_operations_verified, false);
  assert.equal(qualification.site_occupancy_verified, false);
  assert.equal(qualification.coordinates_are_verified_premises, false);
  assert.equal(qualification.address_evidence_may_not_qualify_as_physical_site, true);
});

test("national v3.0 summary conserves New York raw states without additive claims", async () => {
  const value = await summary();
  const dimension = value.dimensions.at(-1);
  assert.deepEqual([value.source_dimensions, value.industry_cells, value.dimensions.length], [51, 2457894, 51]);
  assert.deepEqual(dimension.raw_status_counts, { positive: 1500, "measured-zero": 36336, "outside-source-denominator": 10358 });
  assert.equal(Object.values(dimension.raw_status_counts).reduce((sum, item) => sum + item, 0), 48194);
  assert.equal(value.temporal_qualification.dimension_counts.stale, 2);
  assert.equal(value.temporal_qualification.semantic_dimension_counts["non-active-reporting"], 9);
  assert.equal(value.claims.current_operation_verified, false);
  assert.equal(value.claims.all_business_completeness, false);
});
