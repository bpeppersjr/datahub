import test from "node:test";
import assert from "node:assert/strict";
import { readExactZipIndustrySummaryV31 as summary } from "./exact-zip-industry-summary-v3-1.mjs";
import { readExactZipIndustryEvidenceWithTemporalQualificationV31 as read } from "./exact-zip-industry-temporal-qualification-v3-1.mjs";
import { TEMPORAL_MAPPINGS_V31 } from "./exact-zip-industry-temporal-mappings-v3-1.mjs";

test("v3.1 maps all retained temporal placeholders without changing matrix counts", async () => {
  const value = await summary();
  assert.equal(value.schema_version, "national-exact-zip-industry-summary-view@3.1.0");
  assert.deepEqual([value.source_dimensions, value.industry_cells, value.dimensions.length], [51, 2457894, 51]);
  assert.equal(value.temporal_qualification.dimension_counts.unmapped, 0);
  assert.equal(value.temporal_qualification.dimension_counts.unmeasured, 20);
  assert.equal(value.temporal_qualification.semantic_dimension_counts.unmapped, 0);
  assert.equal(value.temporal_qualification.semantic_dimension_counts["non-active-reporting"], 20);
  assert.equal(value.evidence_disposition_counts.by_lifecycle_status.unmapped, undefined);
  assert.equal(value.evidence_disposition_counts.by_lifecycle_status.unmeasured, 722910);
  assert.equal(value.evidence_disposition_counts.joined.reduce((sum, row) => sum + row.count, 0), value.industry_cells);
  for (const mapping of TEMPORAL_MAPPINGS_V31) {
    const dimension = value.dimensions.find((row) => row.id === mapping.dimension_id);
    assert.equal(dimension.temporal_qualification.source_key, mapping.source_key);
    assert.equal(dimension.temporal_qualification.semantic_class, "non-active-reporting");
    assert.equal(dimension.temporal_qualification.review_qualification, "unmeasured");
  }
  assert.equal(value.claims.current_operation_verified, false);
  assert.equal(value.claims.all_business_completeness, false);
});

test("v3.1 exact ZIP response exposes source release and conservative temporal semantics", async () => {
  const value = await read({ zip5: "10001" });
  assert.equal(value.temporal_qualification.schema_version, "exact-zip-industry-temporal-qualification-view@3.1.0");
  assert.equal(value.temporal_qualification.rows.length, 51);
  assert.equal(value.temporal_qualification.summary.unmapped_dimension_count, 0);
  for (const mapping of TEMPORAL_MAPPINGS_V31) {
    const row = value.temporal_qualification.rows.find((item) => item.dimension_id === mapping.dimension_id);
    assert.equal(row.source_key, mapping.source_key);
    assert.match(row.source_release_id, /\S/);
    assert.equal(row.semantic_class, "non-active-reporting");
    assert.equal(row.review_qualification, "unmeasured");
    assert.equal(row.current_operations_verified, false);
    assert.equal(row.evidence_disposition.lifecycle_status, "unmeasured");
  }
  assert.equal(value.row.cells.cms_hospital_directory.count, 0);
  assert.equal(value.row.cells.mn_residential_construction_credential_reported_address_rows.count, null);
});
