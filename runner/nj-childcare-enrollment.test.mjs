import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { loadIndustryConfig, buildIndustryPlan } from "./industry-segments.mjs";
import { verifyNjChildcareRelease } from "./nj-childcare-release.mjs";
import { NJ_CHILDCARE_SCHEMA } from "./nj-childcare-preflight.mjs";

test("NJ childcare enrollment scopes independent state work and preserves unlike denominators", async () => {
  const config = await loadIndustryConfig();
  const plan = buildIndustryPlan(config, { industries: ["childcare"], states: ["NJ", "MA", "NY", "DC"] });
  assert.equal(plan.taskCount, 2);
  const task = plan.tasks.find((entry) => entry.sourceId === "state-nj-childcare");
  assert.equal(task.script, "scripts/build-nj-childcare.mjs"); assert.equal(task.state, "NJ"); assert.deepEqual(task.prerequisites, []);
  assert.deepEqual(plan.gaps.map((gap) => gap.state), ["NY", "DC"]);
  assert.equal(config.sources["state-nj-childcare"].state_filter_supported, false);
  for (const pattern of [/including facilities operating in public schools/, /not identical denominators/, /local-review-only/, /not independent proof/, /missing rows/, /no nationwide completeness/]) assert.ok(plan.warnings.some((warning) => pattern.test(warning)));
  assert.equal(NJ_CHILDCARE_SCHEMA.length, 21);
  for (const name of ["owner", "director", "center_phone", "center_email"]) assert.equal(NJ_CHILDCARE_SCHEMA.some(([field]) => field === name), false);
  const contract = JSON.parse(await readFile(path.join(APP_ROOT, "config/connectors/nj-licensed-childcare-centers.json"), "utf8"));
  const policy = JSON.parse(await readFile(path.join(APP_ROOT, contract.source_policy), "utf8"));
  assert.equal(policy.policy_id, "njdep-childcare-local-review"); assert.equal(policy.version, "1.0.0");
  assert.equal(policy.export_policy, "local-review-only"); assert.ok(contract.output_schema_contract.artifacts.includes("publisher-metadata.xml"));
});

for (const invalid of [false, true]) test(`NJ app worker ${invalid ? "rejects undeclared private fields" : "publishes a verified local release"} without AI or network`, { timeout: 45000 }, async (t) => {
  const runId = `nj-fixture-${randomUUID()}`;
  const root = assertInsideApp(path.join(APP_ROOT, "data/industry-segments/runs", runId));
  await assert.rejects(access(root), { code: "ENOENT" });
  t.after(() => rm(root, { recursive: true, force: true }));
  const preload = pathToFileURL(path.join(APP_ROOT, "runner/fixtures/nj-childcare-fetch.mjs")).href;
  const child = spawnSync(process.execPath, ["scripts/run-industry-segments.mjs", "run", "--industry", "childcare", "--state", "NJ", "--run-id", runId], {
    cwd: APP_ROOT, env: { ...process.env, NODE_OPTIONS: `--import="${preload}"`, NJ_FIXTURE_INVALID: invalid ? "1" : "0" },
    encoding: "utf8", windowsHide: true, timeout: 40000,
  });
  assert.equal(child.error, undefined, child.stderr); assert.equal(child.status, invalid ? 1 : 0, child.stderr);
  const receipt = JSON.parse(await readFile(path.join(root, "receipt.json"), "utf8"));
  assert.equal(receipt.status, invalid ? "failed" : "succeeded"); assert.equal(receipt.tasks.length, 1);
  assert.equal(receipt.tasks[0].source_id, "state-nj-childcare"); assert.equal(receipt.tasks[0].status, receipt.status);
  assert.match(receipt.log_sha256["state-nj-childcare:NJ"], /^[a-f0-9]{64}$/);
  const output = path.join(root, "state-nj-childcare-NJ");
  await assert.rejects(access(path.join(output, ".publish.lock")), { code: "ENOENT" });
  if (invalid) await assert.rejects(access(path.join(output, "current.json")), { code: "ENOENT" });
  else {
    const pointer = JSON.parse(await readFile(path.join(output, "current.json"), "utf8"));
    const verified = await verifyNjChildcareRelease(path.join(output, pointer.manifest));
    assert.equal(verified.manifest_sha256, pointer.manifest_sha256);
    assert.deepEqual(verified.counts, { selected: 1, accepted: 1, quarantined: 0 });
    const releaseRoot = path.join(output, path.dirname(pointer.manifest));
    const record = JSON.parse((await readFile(path.join(releaseRoot, "normalized.jsonl"), "utf8")).trim());
    assert.equal(record.physical_address.zip_code, "08625"); assert.equal(record.physical_address.zip4, "0123");
    assert.equal(record.license.active_business_verified, false); assert.equal(record.export_policy, "local-review-only");
    assert.equal(Object.hasOwn(record, "geometry"), false); assert.equal(record.industry.public_school_facility_source, "Y");
    assert.match(await readFile(path.join(releaseRoot, "publisher-metadata.xml"), "utf8"), /prescribed notices/);
    const manifest = JSON.parse(await readFile(path.join(output, pointer.manifest), "utf8"));
    assert.equal(manifest.policy.profile, "njdep-childcare-local-review@1.0.0");
  }
});
