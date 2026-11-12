import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import registration from "../config/datasets/national-exact-zip-industry-evidence-matrix-v3-3.json" with { type: "json" };
import { buildNationalExactZipIndustryEvidenceMatrixV34, verifyNationalExactZipIndustryEvidenceMatrixV34, verifyRegisteredNationalExactZipIndustryEvidenceMatrixV33 } from "./national-exact-zip-industry-evidence-matrix-v3-3.mjs";
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
test("pointer-free v3.4 successor replays all refreshed childcare rows and reuses its content identity", async () => {
  const built = await buildNationalExactZipIndustryEvidenceMatrixV34(), verified = await verifyNationalExactZipIndustryEvidenceMatrixV34(built.manifest);
  assert.equal(built.reused_existing_release, true); assert.equal(verified.release_id, "national-exact-zip-industry-evidence-matrix-384004fd1ea98f4c938194fdb425c747f9c7b5d9c1c1e0b3e051f3fffc21cdb1"); assert.equal(verified.manifest_sha256, "684696094db7e73753ef73f6301543306fbd0c130e7300ab5600268bde1352b3");
  assert.equal(verified.summary.zip5_rows, 48194); assert.equal(verified.summary.dimension_count, 51); assert.equal(verified.summary.industry_cells, 2457894); assert.equal(verified.summary.accepted_candidate_rows, 12234); assert.equal(verified.summary.represented_candidate_rows, 12231); assert.deepEqual(verified.summary.dimensions.childcare_pa_candidates, { positive_zip5_rows: 816, absent_zip5_rows: 47378, candidate_rows: 5019 });
  assert.notEqual(registration.retained_release.release_id, verified.release_id);
});
