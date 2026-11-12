import test from "node:test";
import assert from "node:assert/strict";
import { readExactZipIndustrySummaryV34 } from "./exact-zip-industry-summary-v3-4.mjs";
import { readExactZipIndustryEvidenceWithTemporalQualificationV34 } from "./exact-zip-industry-temporal-qualification-v3-4.mjs";

test("v3.4 successor summary binds all childcare dimensions without operation claims", async () => {
  const value = await readExactZipIndustrySummaryV34(), rows = value.dimensions.filter((row) => /^childcare_(pa|ct|md|vt|co|ut|ia)_candidates$/.test(row.id));
  assert.equal(value.schema_version, "national-exact-zip-industry-summary-view@3.4.0"); assert.equal(rows.length, 7); assert.ok(rows.every((row) => row.temporal_qualification.source_release_id.includes("fff67989") && row.temporal_qualification.review_qualification === "unmeasured" && row.temporal_qualification.current_operations_verified === false)); assert.equal(value.retained_childcare_refresh.accepted_candidate_rows, 12234);
});
test("v3.4 successor exact-ZIP temporal view carries refreshed Pennsylvania evidence", async () => {
  const value = await readExactZipIndustryEvidenceWithTemporalQualificationV34({ zip5: "19103" }), row = value.temporal_qualification.rows.find((item) => item.dimension_id === "childcare_pa_candidates");
  assert.equal(value.schema_version, "national-exact-zip-industry-evidence-row@3.4.0"); assert.equal(value.row.cells.childcare_pa_candidates.count, 12); assert.equal(row.source_release_id, "retained-childcare-zip-evidence-fff67989bf590fe4c4c878c6fd5dffdbaeb612a10deeed8ac049997716da2e0e"); assert.equal(row.current_operations_verified, false); assert.equal(row.review_qualification, "unmeasured");
});
