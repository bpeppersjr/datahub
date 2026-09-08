import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { execFile, fork } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./paths.mjs";
import { gatedTransport } from "./fixtures/oh-childcare-gated-transport.mjs";
import { runOhChildcareAppJob, runOhChildcareAppJobWithTransport as run, validateOhChildcareAppEnrollment, verifyOhChildcareAppJob as verify } from "./oh-childcare-app.mjs";
import { readOhChildcareAcquiredEvidence } from "./oh-childcare-acquired-release.mjs";
import { buildOhChildcareRelease, verifyOhChildcareRelease } from "./oh-childcare-release.mjs";
import { buildIndustryPlan, loadIndustryConfig, runIndustryPlan } from "./industry-segments.mjs";
import profile from "../config/oh-childcare-app-enrollment.json" with { type: "json" };

const exec = promisify(execFile), root = () => path.join(APP_ROOT, "data/tmp", `oh-app-${randomUUID()}`);
const parse = async (file) => JSON.parse(await readFile(file, "utf8"));
const encode = (value) => `${JSON.stringify(value)}\n`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function jobDir(outputRoot) { return path.join(outputRoot, "jobs", (await readdir(path.join(outputRoot, "jobs")))[0]); }

test("OH app job records its identity before any request and independently links acquisition and normalization", async () => {
  const outputRoot = root(), f = await gatedTransport(async ({ call }) => {
    if (call === 1) assert.equal((await parse(path.join(await jobDir(outputRoot), "start.json"))).execution_mode, "injected-test-transport");
  });
  const result = await run({ ...f.options, outputRoot, industryRunId: "fixture-industry" });
  assert.equal(f.calls.length, 31); assert.equal(result.status, "SUCCEEDED"); assert.equal(result.execution_mode, "injected-test-transport");
  assert.equal(result.acquisition.source_record_count, 3); assert.equal(result.normalized.counts.accepted, 3);
  assert.deepEqual(await verify(result.receipt_path), result);
  const verified = await exec(process.execPath, ["scripts/verify-oh-childcare-app.mjs", result.receipt_path], { cwd: APP_ROOT, windowsHide: true });
  assert.equal(JSON.parse(verified.stdout).receipt_sha256, result.receipt_sha256);
  await assert.rejects(readFile(path.join(outputRoot, ".app.lock")), { code: "ENOENT" });
});

test("OH native entry rejects overrides, pre-abort and drifted enrollment without requests", async () => {
  for (const options of [{ fetchImpl: fetch }, { now: () => new Date() }, { url: "SECRET" }, { sleep: () => {} }, { maximumBytes: 1 }, { execution_mode: "fixed-native-fetch" }]) {
    await assert.rejects(runOhChildcareAppJob(options), /unsupported options/);
  }
  await assert.rejects(runOhChildcareAppJob({ signal: AbortSignal.abort(), outputRoot: root() }), { name: "AbortError" });
  for (const change of [(v) => { v.runtime_enrolled = false; }, (v) => { v.network.allowed_hosts.push("example.com"); }, (v) => { v.source_use_policy_sha256 = "0".repeat(64); }]) {
    const value = structuredClone(profile); change(value); assert.throws(() => validateOhChildcareAppEnrollment(value), /enrollment drift/);
  }
  assert.equal(validateOhChildcareAppEnrollment(profile).runtime_enrolled, true);
  const f = await gatedTransport(); await assert.rejects(run({ ...f.options, outputRoot: root(), execution_mode: "fixed-native-fetch" }), /unsupported/); assert.equal(f.calls.length, 0);
  await assert.rejects(exec(process.execPath, ["scripts/build-oh-childcare.mjs", "--url", "SECRET"], { cwd: APP_ROOT, windowsHide: true }), (error) => !error.stderr.includes("SECRET"));
});

test("OH failed preflight/notice or before-row persistence cannot publish successful app receipts", async () => {
  for (const failAt of ["notice", "prerequisites-retained"]) {
    const outputRoot = root(), f = await gatedTransport(({ kind }) => failAt === "notice" && kind === "notice" ? new Response("changed terms", { status: 200 }) : undefined);
    await assert.rejects(run({ ...f.options, outputRoot, logger: (phase) => { if (phase === failAt) throw new Error("persistence unavailable"); } }));
    assert.equal(f.calls.length, 14);
    const receipt = path.join(await jobDir(outputRoot), "receipt.json"); assert.equal((await parse(receipt)).status, "FAILED"); await assert.rejects(verify(receipt));
    assert.deepEqual(await readdir(path.join(outputRoot, "acquired/releases")), []);
  }
});

test("OH normalization failure or post-acquisition cancellation preserves reusable completed acquisition", async () => {
  for (const cancel of [false, true]) {
    const outputRoot = root(), f = await gatedTransport(), controller = new AbortController();
    await assert.rejects(run({ ...f.options, outputRoot, signal: controller.signal, logger: (phase) => {
      if (phase === "acquisition-published") { if (cancel) controller.abort(); else throw new Error("normalizer unavailable"); }
    } }));
    const directory = await jobDir(outputRoot), checkpoint = await parse(path.join(directory, "acquisition-receipt.json"));
    assert.equal((await parse(path.join(directory, "receipt.json"))).status, cancel ? "CANCELLED" : "FAILED");
    const retained = await readOhChildcareAcquiredEvidence(path.join(outputRoot, checkpoint.acquisition.manifest));
    assert.equal(retained.verification.manifest_sha256, checkpoint.acquisition.sha256);
    const normalized = await buildOhChildcareRelease({ evidence: retained.evidence, outputRoot: root(), now: f.options.now });
    assert.equal((await verifyOhChildcareRelease(normalized.manifest_path)).counts.accepted, 3); assert.equal(f.calls.length, 31);
    await assert.rejects(readFile(path.join(outputRoot, ".app.lock")), { code: "ENOENT" });
  }
});

test("OH app verification rejects rehashed lineage substitutions, chronology and terminal claim drift", async () => {
  for (const mutate of [
    (_start, receipt) => { receipt.acquisition.sha256 = "0".repeat(64); },
    (_start, receipt) => { receipt.normalized.counts.selected++; },
    (_start, receipt) => { receipt.finished_at = "2026-09-08T07:04:00.000Z"; },
    (_start, receipt) => { receipt.public_export_authorized = true; },
    (_start, receipt) => { receipt.normalized.manifest = "../SECRET"; },
    (start, receipt) => { start.started_at = "2026-09-08T07:06:00.000Z"; receipt.started_at = start.started_at; receipt.start_sha256 = hash(encode(start)); },
  ]) {
    const result = await run({ ...(await gatedTransport()).options, outputRoot: root() }), directory = path.dirname(result.receipt_path);
    const start = await parse(path.join(directory, "start.json")), receipt = await parse(result.receipt_path); mutate(start, receipt);
    await writeFile(path.join(directory, "start.json"), encode(start)); await writeFile(result.receipt_path, encode(receipt));
    await assert.rejects(verify(result.receipt_path));
  }
});

test("OH app job excludes parallel same-root writers and preserves replaced lock evidence", async () => {
  const outputRoot = root(), f = await gatedTransport(); let entered, release;
  const ready = new Promise((resolve) => { entered = resolve; }), wait = new Promise((resolve) => { release = resolve; });
  const pending = run({ ...f.options, outputRoot, logger: async (phase) => { if (phase === "job-started") { entered(); await wait; } } });
  await ready; const second = await gatedTransport(); await assert.rejects(run({ ...second.options, outputRoot }), { code: "EEXIST" }); assert.equal(second.calls.length, 0); release(); await pending;
  const foreignRoot = root(), foreign = await gatedTransport();
  await assert.rejects(run({ ...foreign.options, outputRoot: foreignRoot, logger: async (phase) => {
    if (phase === "job-started") { await rename(path.join(foreignRoot, ".app.lock"), path.join(foreignRoot, "owned-lock.json")); await writeFile(path.join(foreignRoot, ".app.lock"), "foreign"); }
  } }), /ownership/); assert.equal(foreign.calls.length, 0); assert.equal(await readFile(path.join(foreignRoot, ".app.lock"), "utf8"), "foreign");
});

test("OH childcare enrollment plans one Ohio task and executes its verified app job through the industry contract", async () => {
  const config = await loadIndustryConfig(), runId = `oh-app-test-${randomUUID()}`;
  const plan = buildIndustryPlan(config, { industries: ["childcare"], states: ["OH", "KY"], runId });
  assert.equal(plan.tasks.length, 1); assert.equal(plan.tasks[0].sourceId, "state-oh-childcare");
  assert.equal(plan.tasks[0].script, "scripts/build-oh-childcare.mjs"); assert.equal(plan.gaps[0].state, "KY");
  const result = await runIndustryPlan(config, plan, { outputRoot: root(), executor: async (task) => {
    assert.equal(task.sourceId, "state-oh-childcare"); const built = await run({ ...(await gatedTransport()).options, outputRoot: root(), industryRunId: runId });
    await verify(built.receipt_path); return { code: 0, app_receipt: built.receipt_path, app_receipt_sha256: built.receipt_sha256 };
  } });
  assert.equal(result.receipt.status, "succeeded"); assert.equal(result.receipt.tasks[0].status, "succeeded");
});

test("OH real child IPC cancellation reaches the lifecycle and leaves a durable cancelled job", async () => {
  const outputRoot = root();
  const child = fork(path.join(APP_ROOT, "runner/fixtures/oh-childcare-app-cancel-child.mjs"), [outputRoot], { cwd: APP_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const done = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code) => resolve(code)); });
  const timeout = setTimeout(() => child.kill(), 10_000);
  try { child.on("message", (message) => { if (message === "ready") child.send({ type: "cancel" }, () => {}); }); assert.equal(await done, 0); }
  finally { clearTimeout(timeout); }
  assert.equal((await parse(path.join(await jobDir(outputRoot), "receipt.json"))).status, "CANCELLED");
  assert.deepEqual(await readdir(path.join(outputRoot, "acquired/.staging")), []);
});

test("OH publishes no success receipt on final verification mutation or cancellation", async () => {
  for (const kind of ["start", "normalized-manifest", "acquired-journal", "cancel"]) {
    const outputRoot = root(), controller = new AbortController();
    await assert.rejects(run({ ...(await gatedTransport()).options, outputRoot, signal: controller.signal, logger: async (phase) => {
      if (kind === "start" && phase === "before-complete") await writeFile(path.join(await jobDir(outputRoot), "start.json"), "{}");
      if (phase === "dependencies-verified") {
        if (kind === "cancel") controller.abort();
        if (kind === "normalized-manifest") {
          const directory = path.join(outputRoot, "normalized/releases", (await readdir(path.join(outputRoot, "normalized/releases")))[0]);
          await writeFile(path.join(directory, "manifest.json"), "{}");
        }
        if (kind === "acquired-journal") {
          const checkpoint = await parse(path.join(await jobDir(outputRoot), "acquisition-receipt.json"));
          await writeFile(path.join(path.dirname(path.join(outputRoot, checkpoint.acquisition.manifest)), "observation-0001.json"), "{}");
        }
      }
    } }));
    const directory = await jobDir(outputRoot); assert.equal((await parse(path.join(directory, "receipt.json"))).status, kind === "cancel" ? "CANCELLED" : "FAILED");
    await assert.rejects(readFile(path.join(directory, ".receipt-candidate.json")), { code: "ENOENT" });
    await assert.rejects(verify(path.join(directory, "receipt.json")));
  }
});

test("OH native wrapper reaches only the fixed transport and records native wrapper provenance before cancellation", async (t) => {
  const outputRoot = root(), f = await gatedTransport(), controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal((await parse(path.join(await jobDir(outputRoot), "start.json"))).execution_mode, "fixed-native-fetch");
    const response = await f.options.fetchImpl(url, options); controller.abort(); return response;
  });
  await assert.rejects(runOhChildcareAppJob({ outputRoot, signal: controller.signal }), { name: "AbortError" });
  assert.equal(f.calls.length, 1); assert.equal(new URL(f.calls[0]).hostname, "maps.ohio.gov");
  assert.equal((await parse(path.join(await jobDir(outputRoot), "receipt.json"))).status, "CANCELLED");
});

test("OH real industry worker completes the fixed app CLI without AI or publisher requests", { timeout: 60000 }, async () => {
  const runId = `oh-native-fixture-${randomUUID()}`, preload = pathToFileURL(path.join(APP_ROOT, "runner/fixtures/oh-childcare-native-preload.mjs")).href;
  const result = await exec(process.execPath, ["scripts/run-industry-segments.mjs", "run", "--industry", "childcare", "--state", "OH", "--run-id", runId], {
    cwd: APP_ROOT, windowsHide: true, timeout: 55000,
    env: { ...process.env, NODE_OPTIONS: `--import="${preload}"`, OH_CHILDCARE_FIXTURE_PRELOAD: "1" },
  });
  assert.equal(JSON.parse(result.stdout).status, "succeeded");
  const runRoot = path.join(APP_ROOT, "data/industry-segments/runs", runId), industry = await parse(path.join(runRoot, "receipt.json"));
  assert.equal(industry.tasks[0].source_id, "state-oh-childcare"); assert.equal(industry.tasks[0].status, "succeeded");
  assert.match(industry.log_sha256["state-oh-childcare:OH"], /^[a-f0-9]{64}$/);
  const outputRoot = path.join(runRoot, "state-oh-childcare-OH"), app = await verify(path.join(await jobDir(outputRoot), "receipt.json"));
  assert.equal(app.execution_mode, "fixed-native-fetch"); assert.equal(app.acquisition.source_record_count, 3);
  assert.equal((await parse(app.receipt_path)).native_execution_independently_verified, false);
  assert.equal((await parse(path.join(path.dirname(app.receipt_path), "start.json"))).industry_run_id, runId);
});
