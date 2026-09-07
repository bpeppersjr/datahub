import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { industryPlanFingerprint } from "./industry-segments.mjs";

test("industry plan fingerprint ignores run identity and object key order but pins executable content", () => {
  const plan = { runId: "one", tasks: [{ script: "one.mjs", prerequisites: ["first", "second"] }], maxConcurrency: 1 };
  assert.equal(industryPlanFingerprint(plan), industryPlanFingerprint({ maxConcurrency: 1, tasks: [{ prerequisites: ["first", "second"], script: "one.mjs" }], runId: "two" }));
  assert.notEqual(industryPlanFingerprint(plan), industryPlanFingerprint({ ...plan, maxConcurrency: 2 }));
  assert.notEqual(industryPlanFingerprint(plan), industryPlanFingerprint({ ...plan, tasks: [{ script: "changed.mjs", prerequisites: ["first", "second"] }] }));
});

test("industry child rejects malformed and plan-mode expected hash before acquisition", () => {
  for (const args of [["run", "--expected-plan-sha256", "bad"], ["plan", "--expected-plan-sha256", "0".repeat(64)]]) {
    const child = spawnSync(process.execPath, ["scripts/run-industry-segments.mjs", ...args], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true });
    assert.equal(child.status, 1); assert.match(child.stderr, /requires run mode and a 64-character/);
  }
});

test("industry child rejects changed config plan before creating a run or downloading", async (t) => {
  const temporaryBase = path.join(APP_ROOT, "data", "tmp"); await mkdir(temporaryBase, { recursive: true });
  const root = await mkdtemp(path.join(temporaryBase, "scheduled-plan-")); t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, "config.json");
  await writeFile(configPath, JSON.stringify({ version: 1, max_concurrency: 1, states: ["TX"], industries: { fixture: ["fixture"] }, sources: { fixture: { script: "scripts/run-industry-segments.mjs", scope: "national", states: "all", state_filter_supported: false, prerequisites: [] } } }));
  const runId = path.basename(root);
  const child = spawnSync(process.execPath, ["scripts/run-industry-segments.mjs", "run", "--config", configPath, "--run-id", runId, "--expected-plan-sha256", "0".repeat(64)], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(child.status, 1); assert.match(child.stderr, /plan changed; acquisition is blocked/);
  await assert.rejects(access(path.join(APP_ROOT, "data", "industry-segments", "runs", runId)), { code: "ENOENT" });
});
