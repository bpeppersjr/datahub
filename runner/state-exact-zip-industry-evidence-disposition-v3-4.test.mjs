import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { buildStateExactZipIndustryEvidenceDispositionV34 } from "./state-exact-zip-industry-evidence-disposition-v3-4.mjs";

test("state v3.4 successor conserves refreshed childcare without allocating ZIP gaps", async () => {
  const verified = await buildStateExactZipIndustryEvidenceDispositionV34();
  assert.equal(verified.scope_rows, 60); assert.equal(verified.dimension_count, 51); assert.equal(verified.summary.represented_childcare_candidate_rows, 12231); assert.equal(verified.summary.out_of_cohort_childcare_candidate_rows, 1); assert.equal(verified.summary.missing_zip_childcare_candidate_rows, 1); assert.equal(verified.summary.invalid_zip_childcare_candidate_rows, 1);
  const manifestPath = path.join(APP_ROOT, "data/state-exact-zip-industry-evidence-disposition-v3-4/releases", verified.release_id, "manifest.json"), manifest = JSON.parse(await readFile(manifestPath)), rows = JSON.parse(await readFile(path.join(path.dirname(manifestPath), manifest.artifacts[0].path)));
  const dimensions = ["childcare_pa_candidates", "childcare_ct_candidates", "childcare_md_candidates", "childcare_vt_candidates", "childcare_co_candidates", "childcare_ut_candidates", "childcare_ia_candidates"];
  for (const dimension of dimensions) assert.equal(rows.reduce((n, row) => n + row.dimensions[dimension].lifecycle_status_counts.unmeasured, 0), 48194);
  assert.equal(manifest.claims.current_operations_verified, false); assert.equal(manifest.claims.complete_all_businesses, false); assert.equal(manifest.claims.production_enrollment, false);
});
