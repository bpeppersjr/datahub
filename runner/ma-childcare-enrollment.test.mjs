import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { loadIndustryConfig, buildIndustryPlan } from "./industry-segments.mjs";
import { verifyMaChildcareRelease } from "./ma-childcare-release.mjs";

test("MA childcare enrollment scopes one independent source and preserves coverage gaps", async () => {
  const config = await loadIndustryConfig();
  const plan = buildIndustryPlan(config, { industries: ["childcare"], states: ["MA", "NY", "DC"] });
  assert.equal(plan.taskCount, 1);
  assert.equal(plan.tasks[0].script, "scripts/build-ma-childcare.mjs");
  assert.equal(plan.tasks[0].sourceId, "state-ma-childcare");
  assert.equal(plan.tasks[0].state, "MA");
  assert.deepEqual(plan.tasks[0].prerequisites, []);
  assert.deepEqual(plan.gaps.map((gap) => gap.state), ["NY", "DC"]);
  assert.equal(config.sources["state-ma-childcare"].state_filter_supported, false);
  for (const pattern of [/family-based/, /local-review-only/, /not independent proof/, /missing rows/, /no nationwide completeness/]) {
    assert.ok(plan.warnings.some((warning) => pattern.test(warning)));
  }
});

for (const invalid of [false, true]) test(`MA app worker ${invalid ? "rejects source scope drift" : "publishes a verified release"} without AI or network`, { timeout: 30000 }, async (t) => {
  const runId = `ma-fixture-${randomUUID()}`;
  const root = assertInsideApp(path.join(APP_ROOT, "data/industry-segments/runs", runId));
  await assert.rejects(access(root), { code: "ENOENT" });
  t.after(() => rm(root, { recursive: true, force: true }));
  const preload = pathToFileURL(path.join(APP_ROOT, "runner/fixtures/ma-childcare-fetch.mjs")).href;
  const child = spawnSync(process.execPath, ["scripts/run-industry-segments.mjs", "run", "--industry", "childcare", "--state", "MA", "--run-id", runId], {
    cwd: APP_ROOT, env: { ...process.env, NODE_OPTIONS: `--import="${preload}"`, MA_FIXTURE_INVALID: invalid ? "1" : "0" },
    encoding: "utf8", windowsHide: true, timeout: 25000,
  });
  assert.equal(child.error, undefined, child.stderr);
  assert.equal(child.status, invalid ? 1 : 0, child.stderr);
  const receipt = JSON.parse(await readFile(path.join(root, "receipt.json"), "utf8"));
  assert.equal(receipt.status, invalid ? "failed" : "succeeded");
  assert.equal(receipt.tasks.length, 1);
  assert.equal(receipt.tasks[0].source_id, "state-ma-childcare");
  assert.equal(receipt.tasks[0].status, receipt.status);
  assert.match(receipt.log_sha256["state-ma-childcare:MA"], /^[a-f0-9]{64}$/);
  const output = path.join(root, "state-ma-childcare-MA");
  await assert.rejects(access(path.join(output, ".publish.lock")), { code: "ENOENT" });
  if (invalid) {
    await assert.rejects(access(path.join(output, "current.json")), { code: "ENOENT" });
  } else {
    const pointer = JSON.parse(await readFile(path.join(output, "current.json"), "utf8"));
    const verified = await verifyMaChildcareRelease(path.join(output, pointer.manifest));
    assert.equal(verified.manifest_sha256, pointer.manifest_sha256);
    assert.deepEqual(verified.counts, { selected: 1, accepted: 1, quarantined: 0 });
    const record = JSON.parse((await readFile(path.join(output, path.dirname(pointer.manifest), "normalized.jsonl"), "utf8")).trim());
    assert.equal(record.physical_address.zip_code, "02108");
    assert.equal(record.physical_address.zip4, "1234");
    assert.equal(record.license.active_business_verified, false);
    assert.equal(record.export_policy, "local-review-only");
    assert.equal(Object.hasOwn(record, "geometry"), false);
  }
});
