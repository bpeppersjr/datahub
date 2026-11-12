import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import registration from "../config/datasets/national-exact-zip-industry-evidence-matrix-v3-3.json" with { type: "json" };
import { verifyRegisteredNationalExactZipIndustryEvidenceMatrixV33 } from "./national-exact-zip-industry-evidence-matrix-v3-3.mjs";
import { readExactZipIndustryEvidenceV33 } from "./national-exact-zip-industry-evidence-matrix-v3-3-reader.mjs";

test("registered v3.3 independently replays current childcare v1.2", async () => {
  const value = await verifyRegisteredNationalExactZipIndustryEvidenceMatrixV33();
  assert.equal(value.release_id, registration.retained_release.release_id); assert.equal(value.summary.accepted_candidate_rows, 12210); assert.equal(value.summary.represented_candidate_rows, 12207); assert.equal(value.summary.out_of_cohort_candidate_rows, 1); assert.equal(value.summary.missing_zip_candidate_rows, 1); assert.equal(value.summary.invalid_zip_candidate_rows, 1);
});
test("bounded reader serves v1.2 childcare cells and preserves the gap sidecar", async () => {
  const pa = await readExactZipIndustryEvidenceV33({ zip5: "19103" }); assert.equal(pa.row.cells.childcare_pa_candidates.count, 12); assert.match(pa.row.cells.childcare_pa_candidates.source_release_id, /b61acab3/);
  const vt = await readExactZipIndustryEvidenceV33({ zip5: "05001" }); assert.equal(vt.row.cells.childcare_vt_candidates.source_release_id, "retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b"); assert.equal(vt.gap_sidecars.retained_childcare_source_zip_gaps.record_count, 3);
});
test("registered manifest path stays inside the repository", () => assert.equal(path.isAbsolute(registration.retained_release.manifest), false));
