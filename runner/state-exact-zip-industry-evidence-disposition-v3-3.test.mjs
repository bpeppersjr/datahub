import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { verifyRegisteredStateExactZipIndustryEvidenceDispositionV33 } from "./state-exact-zip-industry-evidence-disposition-v3-3.mjs";

test("registered state v3.3 conserves all governed scopes and childcare gaps", async () => {
  const verified = await verifyRegisteredStateExactZipIndustryEvidenceDispositionV33(); assert.equal(verified.scope_rows, 60); assert.equal(verified.dimension_count, 51);
  const registration = JSON.parse(await readFile(path.join(APP_ROOT, "config/datasets/state-exact-zip-industry-evidence-disposition-v3-3.json"))), manifest = JSON.parse(await readFile(path.join(APP_ROOT, registration.retained_release.manifest))), rows = JSON.parse(await readFile(path.join(path.dirname(path.join(APP_ROOT, registration.retained_release.manifest)), manifest.artifacts[0].path)));
  assert.equal(manifest.summary.represented_childcare_candidate_rows, 12207); assert.equal(manifest.summary.out_of_cohort_childcare_candidate_rows, 1); assert.equal(manifest.summary.missing_zip_childcare_candidate_rows, 1); assert.equal(manifest.summary.invalid_zip_childcare_candidate_rows, 1);
  const dimensions = ["childcare_pa_candidates", "childcare_ct_candidates", "childcare_md_candidates", "childcare_vt_candidates", "childcare_co_candidates", "childcare_ut_candidates", "childcare_ia_candidates"];
  for (const dimension of dimensions) assert.equal(rows.reduce((n, row) => n + row.dimensions[dimension].lifecycle_status_counts.unmeasured, 0), 48194);
});
