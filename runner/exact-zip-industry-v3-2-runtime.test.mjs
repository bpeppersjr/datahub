import test from "node:test";
import assert from "node:assert/strict";
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
    { "within-review-window": 30, stale: 1, unmeasured: 20, unmapped: 0 });
});

test("v3.2 temporal view preserves non-active reporting and refreshed provenance", async () => {
  const value = await readExactZipIndustryEvidenceWithTemporalQualificationV32({ zip5: "10001" });
  const row = value.temporal_qualification.rows.find((item) => item.dimension_id === "ny_retail_food_license_address_evidence_count");
  assert.equal(row.semantic_class, "non-active-reporting");
  assert.equal(row.review_qualification, "within-review-window");
  assert.equal(row.current_operations_verified, false);
  assert.equal(row.source_release_id, "ny-retail-food-stores-2026-10-14-7f9dc6f0449f76e0");
  assert.equal(value.temporal_qualification.provenance.matrix_release_id, value.release_id);
});
