import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { loadIndustryConfig, buildIndustryPlan } from "./industry-segments.mjs";
import { verifyTnChildcareRelease } from "./tn-childcare-release.mjs";
import { TN_CHILDCARE_SCHEMA, TN_CHILDCARE_WHERE } from "./tn-childcare-preflight.mjs";

test("TN childcare enrollment separates retained reporting from fresh acquisition gaps and completeness", async () => {
  const config = await loadIndustryConfig(), plan = buildIndustryPlan(config, { industries: ["childcare"], states: ["TN", "MA", "NJ", "KY", "DC"] });
  assert.equal(plan.taskCount, 3); assert.deepEqual(plan.gaps.map((gap) => gap.state), ["KY", "DC"]);
  const task = plan.tasks.find((item) => item.sourceId === "state-tn-childcare");
  assert.equal(task.script, "scripts/build-tn-childcare.mjs"); assert.equal(task.state, "TN"); assert.deepEqual(task.prerequisites, []);
  const source = config.sources[task.sourceId]; assert.equal(source.state_filter_supported, false); assert.deepEqual(source.states, ["TN"]);
  for (const expression of [/Family homes/, /drop-in/, /TDOE/, /Scope differs from MA and NJ/, /no common denominator/, /retained recovered release contributes reporting-only/, /Fresh acquisition retains missing/, /not automatically promoted/, /does not enable scheduled/, /local-review-only/]) assert.ok(source.coverage_notes.some((note) => expression.test(note)));
  const contract = JSON.parse(await readFile(path.join(APP_ROOT, "config/connectors/tn-dhs-active-childcare-centers.json"), "utf8"));
  const policy = JSON.parse(await readFile(path.join(APP_ROOT, contract.source_policy), "utf8"));
  assert.equal(contract.version, "1.1.0"); assert.equal(contract.output_schema_contract.transformation_version, "tn-childcare-normalization@1.0.1"); assert.equal(contract.output_schema_contract.source_filter, TN_CHILDCARE_WHERE);
  assert.equal(policy.policy_id, "tn-childcare-local-review"); assert.equal(policy.version, "1.0.0"); assert.equal(policy.export_policy, "local-review-only");
  assert.equal(TN_CHILDCARE_SCHEMA.length, 12); assert.deepEqual(contract.named_secret_references, []);
});

for (const mode of ["valid", "invalid", "missing-ZIP"]) test(`TN app worker handles ${mode} records without AI or network`, { timeout: 60000 }, async (t) => {
  const invalid = mode === "invalid", missing = mode === "missing-ZIP";
  const runId = `tn-fixture-${randomUUID()}`, root = assertInsideApp(path.join(APP_ROOT, "data/industry-segments/runs", runId));
  await assert.rejects(access(root), { code: "ENOENT" }); t.after(() => rm(root, { recursive: true, force: true }));
  const preload = pathToFileURL(path.join(APP_ROOT, "runner/fixtures/tn-childcare-fetch.mjs")).href;
  const child = spawnSync(process.execPath, ["scripts/run-industry-segments.mjs", "run", "--industry", "childcare", "--state", "TN", "--run-id", runId], {
    cwd: APP_ROOT, env: { ...process.env, NODE_OPTIONS: `--import="${preload}"`, TN_CHILDCARE_FIXTURE_PRELOAD: "1", TN_CHILDCARE_FIXTURE_INVALID: invalid ? "1" : "0", TN_CHILDCARE_FIXTURE_MISSING_ZIP: missing ? "1" : "0" },
    encoding: "utf8", windowsHide: true, timeout: 55000,
  });
  assert.equal(child.error, undefined, child.stderr); assert.equal(child.status, invalid ? 1 : 0, child.stderr);
  const receipt = JSON.parse(await readFile(path.join(root, "receipt.json"), "utf8"));
  assert.equal(receipt.status, invalid ? "failed" : "succeeded"); assert.equal(receipt.tasks.length, 1);
  assert.equal(receipt.tasks[0].source_id, "state-tn-childcare"); assert.equal(receipt.tasks[0].status, receipt.status);
  assert.match(receipt.log_sha256["state-tn-childcare:TN"], /^[a-f0-9]{64}$/);
  const output = path.join(root, "state-tn-childcare-TN");
  await assert.rejects(access(path.join(output, ".publish.lock")), { code: "ENOENT" });
  if (invalid) await assert.rejects(access(path.join(output, "current.json")), { code: "ENOENT" });
  else {
    const pointer = JSON.parse(await readFile(path.join(output, "current.json"), "utf8")), manifestPath = path.join(output, pointer.manifest);
    const verified = await verifyTnChildcareRelease(manifestPath); assert.equal(verified.manifest_sha256, pointer.manifest_sha256);
    assert.deepEqual(verified.counts, { selected: missing ? 3 : 1, accepted: missing ? 3 : 1, quarantined: 0 }); assert.equal(verified.artifact_count, 5);
    const rows = (await readFile(path.join(path.dirname(manifestPath), "normalized.jsonl"), "utf8")).trim().split("\n").map(JSON.parse), record = rows.at(-1);
    if (missing) {
      assert.deepEqual(rows.slice(0, 2).map(r => [r.physical_address.zip_code, r.physical_address.zip4]), [[null, null], [null, null]]);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      assert.deepEqual(manifest.accepted_record_quality, { with_source_zip: 1, without_source_zip: 2, missing_zip_reasons: { "missing-source-zip": 1, "invalid-source-zip-placeholder": 1 }, missing_points: 1, zip_inferred: false });
    }
    assert.equal(record.physical_address.zip_code, "37201"); assert.equal(record.physical_address.zip4, "0123");
    assert.equal(record.source_status.active_business_verified, false); assert.equal(record.export_policy, "local-review-only");
    assert.equal(Object.hasOwn(record, "geometry"), false); assert.equal(record.provenance.policy_profile, "tn-childcare-local-review@1.0.0");
    assert.match(await readFile(path.join(path.dirname(manifestPath), "publisher-metadata.xml"), "utf8"), /Synthetic offline fixture/);
  }
});
