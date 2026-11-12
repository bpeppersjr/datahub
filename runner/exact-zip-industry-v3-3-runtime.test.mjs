import test from "node:test";
import assert from "node:assert/strict";
import { readExactZipIndustrySummaryV33 } from "./exact-zip-industry-summary-v3-3.mjs";
import { readExactZipIndustryEvidenceWithTemporalQualificationV33 } from "./exact-zip-industry-temporal-qualification-v3-3.mjs";

test("v3.3 summary binds all seven childcare dimensions to retained v1.2", async () => {
  const value = await readExactZipIndustrySummaryV33(), rows = value.dimensions.filter((row) => /^childcare_(pa|ct|md|vt|co|ut|ia)_candidates$/.test(row.id));
  assert.equal(value.schema_version, "national-exact-zip-industry-summary-view@3.3.0"); assert.equal(rows.length, 7); assert.ok(rows.every((row) => row.temporal_qualification.source_release_id.includes("b61acab3") && row.temporal_qualification.review_qualification === "unmeasured" && row.temporal_qualification.current_operations_verified === false)); assert.equal(value.retained_childcare_refresh.accepted_candidate_rows, 12210);
});
test("v3.3 exact ZIP temporal view uses current Vermont reference without an operation claim", async () => {
  const value = await readExactZipIndustryEvidenceWithTemporalQualificationV33({ zip5: "05001" }), row = value.temporal_qualification.rows.find((item) => item.dimension_id === "childcare_vt_candidates");
  assert.equal(value.schema_version, "national-exact-zip-industry-evidence-row@3.3.0"); assert.equal(row.source_release_id, "retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b"); assert.equal(row.source_reference_at, "2026-10-14T19:56:37.000Z"); assert.equal(row.current_operations_verified, false); assert.equal(row.review_qualification, "unmeasured");
});
