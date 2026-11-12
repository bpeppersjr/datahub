import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

const dimensions = ["childcare_pa_candidates", "childcare_ct_candidates", "childcare_md_candidates", "childcare_vt_candidates", "childcare_co_candidates", "childcare_ut_candidates", "childcare_ia_candidates"];
const staleRelease = "retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada";
const sha = (value) => createHash("sha256").update(value).digest("hex");

test("selected exact-ZIP matrix exposes the closed retained-childcare refresh gap", async () => {
  const matrixRegistration = JSON.parse(await readFile(path.join(APP_ROOT, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-2.json")));
  const childcareRegistration = JSON.parse(await readFile(path.join(APP_ROOT, "config/datasets/retained-childcare-zip-evidence.json")));
  const manifestPath = path.join(APP_ROOT, matrixRegistration.retained_release.manifest);
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes);
  assert.equal(sha(manifestBytes), matrixRegistration.retained_release.manifest_sha256);
  assert.equal(childcareRegistration.retained_release.release_id, "retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b");
  assert.notEqual(childcareRegistration.retained_release.release_id, staleRelease);
  let rows = 0, cells = 0, candidateRows = 0;
  const byDimension = Object.fromEntries(dimensions.map((dimension) => [dimension, 0]));
  for (const artifact of manifest.artifacts.filter(({ path: artifactPath }) => /^prefix=\d{2}\.json$/.test(artifactPath))) {
    const bytes = await readFile(path.join(path.dirname(manifestPath), artifact.path));
    assert.equal(bytes.length, artifact.bytes); assert.equal(sha(bytes), artifact.sha256);
    const prefixRows = JSON.parse(bytes); assert.equal(prefixRows.length, artifact.record_count); rows += prefixRows.length;
    for (const row of prefixRows) for (const dimension of dimensions) {
      const cell = row.cells[dimension]; cells += 1;
      assert.equal(cell.source_release_id, staleRelease);
      if (cell.status === "positive") { assert.ok(Number.isSafeInteger(cell.count) && cell.count > 0); candidateRows += cell.count; byDimension[dimension] += cell.count; }
      else { assert.equal(cell.status, "absent-from-retained-source-rows"); assert.equal(cell.count, null); }
    }
  }
  assert.equal(rows, 48_194); assert.equal(cells, 337_358); assert.equal(candidateRows, 12_204);
  assert.deepEqual(byDimension, { childcare_pa_candidates: 4995, childcare_ct_candidates: 1390, childcare_md_candidates: 1770, childcare_vt_candidates: 503, childcare_co_candidates: 1648, childcare_ut_candidates: 422, childcare_ia_candidates: 1476 });
  assert.equal(childcareRegistration.retained_release.summary.zip_present_candidate_rows, 12_208);
  assert.equal(childcareRegistration.retained_release.summary.zip_present_candidate_rows - candidateRows, 4);
});
