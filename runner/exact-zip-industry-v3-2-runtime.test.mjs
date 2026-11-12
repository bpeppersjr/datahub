import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readExactZipIndustryEvidenceV32 } from "./national-exact-zip-industry-evidence-matrix-v3-2-reader.mjs";
import { readExactZipIndustrySummaryV32 } from "./exact-zip-industry-summary-v3-2.mjs";
import { readExactZipIndustryEvidenceWithTemporalQualificationV32 } from "./exact-zip-industry-temporal-qualification-v3-2.mjs";

test("v3.2 replaces New York evidence without adding a dimension", async () => {
  const value = await readExactZipIndustryEvidenceV32({ zip5: "10001" });
  assert.equal(value.schema_version, "national-exact-zip-industry-evidence-row@3.2.0");
  assert.equal(Object.keys(value.row.cells).length, 51);
  const cell = value.row.cells.ny_retail_food_license_address_evidence_count;
  assert.equal(cell.source_release_id, "ny-retail-food-stores-2026-10-14-7f9dc6f0449f76e0");
  assert.equal(cell.temporal_status.status, "within-review-window");
  assert.equal(cell.temporal_status.current_operations_verified, false);
});

test("v3.2 summary conserves the 51-dimension matrix and refreshed New York counts", async () => {
  const value = await readExactZipIndustrySummaryV32();
  assert.equal(value.source_dimensions, 51);
  assert.equal(value.industry_cells, 2457894);
  assert.equal(Object.values(value.status_counts).reduce((sum, count) => sum + count, 0), 2457894);
  const dimension = value.dimensions.find((row) => row.id === "ny_retail_food_license_address_evidence_count");
  assert.deepEqual(dimension.status_counts, { positive: 1497, "measured-zero": 36339,
    "outside-source-denominator": 10358, "absent-from-retained-source-rows": 0, unavailable: 0 });
  assert.equal(dimension.temporal_qualification.review_qualification, "within-review-window");
  assert.deepEqual(value.temporal_qualification.dimension_counts,
    { "within-review-window": 30, stale: 0, unmeasured: 21, unmapped: 0 });
  const { projection_sha256, ...projection } = value.temporal_qualification;
  assert.equal(projection.schema_version, "exact-zip-industry-temporal-summary-projection@3.2.0");
  assert.equal(projection.source_dimensions, value.dimensions.length);
  assert.equal(projection.matrix_release_id, value.release_id);
  assert.equal(projection.matrix_manifest_sha256, value.manifest_sha256);
  assert.deepEqual(projection.retained_assessment_dimension_counts,
    { "2026-10-02T16:30:00.000Z": 49, "2026-11-11T23:21:47.684Z": 2 });
  const dimensions = value.dimensions.map(({ id, temporal_qualification }) => ({ dimension_id: id, ...temporal_qualification }));
  assert.equal(projection_sha256, createHash("sha256").update(JSON.stringify({ ...projection, dimensions })).digest("hex"));
  const profile = value.dimensions.find(row => row.id === "ny_retail_food_location_profiles");
  assert.equal(profile.temporal_qualification.source_release_id, dimension.temporal_qualification.source_release_id);
  assert.equal(profile.temporal_qualification.review_qualification, "unmeasured");
  assert.equal(profile.temporal_qualification.assessment_as_of, "2026-11-11T23:21:47.684Z");
  assert.equal(dimension.temporal_qualification.assessment_as_of, profile.temporal_qualification.assessment_as_of);
  assert.equal(profile.status_counts.positive, 1498);
  assert.equal(profile.status_counts["absent-from-retained-source-rows"], 46696);
});

test("v3.2 temporal view preserves non-active reporting and refreshed provenance", async () => {
  const value = await readExactZipIndustryEvidenceWithTemporalQualificationV32({ zip5: "10001" });
  const row = value.temporal_qualification.rows.find((item) => item.dimension_id === "ny_retail_food_license_address_evidence_count");
  assert.equal(row.semantic_class, "non-active-reporting");
  assert.equal(row.review_qualification, "within-review-window");
  assert.equal(row.current_operations_verified, false);
  assert.equal(row.source_release_id, "ny-retail-food-stores-2026-10-14-7f9dc6f0449f76e0");
  assert.equal(row.source_reference_at, "2026-10-14T19:08:34.000Z");
  assert.equal(row.review_due_at, "2027-02-11T19:08:34.000Z");
  assert.equal(row.evidence_disposition.additive, false);
  assert.equal(value.temporal_qualification.provenance.matrix_release_id, value.release_id);
});
