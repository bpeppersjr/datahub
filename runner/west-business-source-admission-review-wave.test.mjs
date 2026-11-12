import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { loadWestBusinessSourceAdmissionReviewWave, WEST_ADMISSION_REVIEW_SCHEMA, WEST_ADMISSION_REVIEW_STATES } from "./west-business-source-admission-review-wave.mjs";

test("western admission review binds four immutable HOLD assessments to current gaps", async () => {
  const wave = await loadWestBusinessSourceAdmissionReviewWave();
  assert.equal(wave.schema_version, WEST_ADMISSION_REVIEW_SCHEMA);
  assert.match(wave.wave_id, /^west-business-source-admission-review-[a-f0-9]{16}$/);
  assert.deepEqual(wave.scope, { states: [...WEST_ADMISSION_REVIEW_STATES], current_gap_count: 4 });
  assert.deepEqual(wave.controls, { network_requests: 0, source_actions: 0, acquisitions: 0, pointer_changes: 0, production_admissions: 0 });
  assert.deepEqual(wave.claims, { broad_business_coverage_added: false, active_business_claim_authorized: false, completeness_claimed: false });
  for (const row of wave.states) {
    assert.equal(row.decision, "hold");
    assert.equal(row.current_gap_status, "missing-retained-broad-organization-layer");
    assert.equal(row.action_class, "admission-review");
    assert.match(row.assessment_sha256, /^[a-f0-9]{64}$/);
    assert.ok(row.unresolved_gates.length >= 7);
    assert.deepEqual(new Set(Object.values(row.authority)), new Set([false]));
  }
});

test("western admission review is deterministic and does not mutate source evidence", async () => {
  const [first, second] = await Promise.all([loadWestBusinessSourceAdmissionReviewWave(), loadWestBusinessSourceAdmissionReviewWave()]);
  assert.deepEqual(first, second);
  assert.equal(first.states.some((row) => /authorized/i.test(row.strongest_next_action) && !/no |not |remain|separately gated/i.test(row.strongest_next_action)), false);
});

test("western admission review rejects a changed promoted gap ledger", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cot-west-review-"));
  await cp(path.join(APP_ROOT, "config"), path.join(root, "config"), { recursive: true });
  const contract = JSON.parse(await readFile(path.join(root, "config/national-status-contract.json"), "utf8"));
  const sourceRelease = path.dirname(path.join(APP_ROOT, contract.manifest));
  const targetRelease = path.dirname(path.join(root, contract.manifest));
  await cp(sourceRelease, targetRelease, { recursive: true });
  const gapPath = path.join(targetRelease, "gap-ledger.json");
  const gap = JSON.parse(await readFile(gapPath, "utf8"));
  gap.broad_business = gap.broad_business.filter(({ state }) => state !== "CA");
  await writeFile(gapPath, `${JSON.stringify(gap)}\n`);
  await assert.rejects(loadWestBusinessSourceAdmissionReviewWave({ root }), /gap ledger hash differs/);
});

