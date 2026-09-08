import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { acquireTnChildcare } from "./tn-childcare-acquisition.mjs";
import { createTnChildcareFixture } from "./fixtures/tn-childcare-fetch.mjs";
import { recoverTnChildcareRelease } from "./tn-childcare-recovered-release.mjs";
import { loadTnChildcareReportingInput } from "./tn-childcare-reporting-input.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
async function fixture(t) {
  const runId = `tn-reporting-fixture-${randomUUID()}`, runRoot = path.join(APP_ROOT, "data/industry-segments/runs", runId);
  const stagingPath = path.join(runRoot, "state-tn-childcare-TN/.staging", randomUUID()), receiptPath = path.join(runRoot, "receipt.json");
  await mkdir(path.join(APP_ROOT, "data/tmp"), { recursive: true });
  const outputRoot = await mkdtemp(path.join(APP_ROOT, "data/tmp/tn-reporting-input-"));
  t.after(async () => { await rm(runRoot, { recursive: true, force: true }); await rm(outputRoot, { recursive: true, force: true }); });
  await mkdir(stagingPath, { recursive: true }); await mkdir(path.join(runRoot, "logs"));
  const acquired = await acquireTnChildcare({ fetchImpl: createTnChildcareFixture({ count: 20, mutate: (p, k) => {
    if (k === "features") { p.features[0].attributes.Zip = "0"; p.features[1].attributes.Zip = null; p.features[2].geometry = null; }
  } }).fetchImpl, sleep: async () => {}, now: () => new Date("2026-09-08T00:00:01.000Z") });
  const expectedHashes = {};
  for (const [key, name, bytes] of [["selectedFeatures", "selected-features.jsonl", Buffer.from(acquired.features.map(r => `${JSON.stringify(r)}\n`).join(""))],
    ["sourceObservation", "source-observation.json", Buffer.from(`${JSON.stringify(acquired.evidence)}\n`)], ["publisherMetadata", "publisher-metadata.xml", acquired.publisher_metadata.before.raw]]) {
    await writeFile(path.join(stagingPath, name), bytes); expectedHashes[key] = sha(bytes);
  }
  const logRelative = `data/industry-segments/runs/${runId}/logs/state-tn-childcare-TN.log`, log = Buffer.from("acquire\nnormalize\nTennessee childcare build failed: Tennessee childcare release rejected: quarantine exceeds 5% or no accepted records.\n");
  await writeFile(path.join(APP_ROOT, logRelative), log);
  const receipt = { run_id: runId, status: "failed", started_at: "2026-09-08T00:00:00.000Z", finished_at: "2026-09-08T00:00:02.000Z", plan: { industries: ["childcare"], states: ["TN"] },
    tasks: [{ task_id: "state-tn-childcare:TN", source_id: "state-tn-childcare", state: "TN", status: "failed", code: 1, signal: null,
      started_at: "2026-09-08T00:00:00.000Z", finished_at: "2026-09-08T00:00:02.000Z", log: logRelative }], log_sha256: { "state-tn-childcare:TN": sha(log) } };
  const bytes = Buffer.from(JSON.stringify(receipt)); await writeFile(receiptPath, bytes); expectedHashes.receipt = sha(bytes);
  const release = await recoverTnChildcareRelease({ receiptPath, stagingPath, expectedHashes, outputRoot, now: () => new Date("2026-09-09T00:00:00.000Z") });
  return { release, outputRoot };
}

test("TN reporting input preserves source ZIP gaps, points and original recovery provenance offline", async t => {
  const { release, outputRoot } = await fixture(t), before = await readFile(release.manifest_path), pointer = await readFile(path.join(outputRoot, "current.json"));
  const prior = globalThis.fetch; globalThis.fetch = () => { throw new Error("No network"); };
  let result; try { result = await loadTnChildcareReportingInput(release.manifest_path); } finally { globalThis.fetch = prior; }
  assert.equal(result.nationalReportingIntegrated, false); assert.equal(result.exportPolicy, "local-review-only");
  assert.deepEqual(result.counts, { selected: 20, accepted: 20, quarantined: 0 });
  assert.equal(result.reportingRows.length, 20); assert.equal(result.reportingRows.filter(r => r.zip_code === null).length, 2);
  assert.equal(new Set(result.reportingRows.map(r => r.names[0].raw)).size, 1); // Same names do not deduplicate distinct source rows.
  assert.equal(new Set(result.reportingRows.map(r => r.site_entity_id)).size, 20);
  assert.deepEqual(result.summary, { reportingRows: 20, availableZip: 18, missingZip: 2, missingZipReasons: { "missing-source-zip": 1, "invalid-source-zip-placeholder": 1 }, missingPoints: 1 });
  assert.equal(result.source.manifestSha256, release.manifest_sha256);
  assert.equal(result.source.observedAt, "2026-09-08T00:00:01.000Z");
  assert.equal(result.source.processedAt, "2026-09-09T00:00:00.000Z");
  for (const row of result.reportingRows) {
    assert.equal(row.observed_at, result.source.observedAt); assert.equal(row.evidence.processed_at, result.source.processedAt);
    assert.equal(row.evidence.recovery.failed_run_id, result.source.failedRunId);
    assert.equal(row.evidence.recovery.network_requests, 0);
    assert.equal(row.identity_matching_eligible, false); assert.equal(row.export_policy, "local-review-only");
  }
  for (const row of result.reportingRows.filter(r => r.zip_code === null)) { assert.equal(row.address.zip_code, null); assert.equal(row.address.zip4, null); }
  assert.deepEqual(await readFile(release.manifest_path), before); assert.deepEqual(await readFile(path.join(outputRoot, "current.json")), pointer);
});

test("TN reporting input rejects policy or membership tampering before emitting rows", async t => {
  const { release } = await fixture(t), bytes = await readFile(release.manifest_path), file = path.join(path.dirname(release.manifest_path), "normalized.jsonl"), rows = await readFile(file);
  for (const kind of ["policy", "membership", "recovery"]) {
    const manifest = JSON.parse(bytes);
    if (kind === "policy") manifest.policy.export_policy = "public";
    if (kind === "recovery") manifest.recovery.network_requests = 1;
    if (kind === "membership") {
      const lines = rows.toString().trim().split("\n"); lines[0] = lines[1];
      const altered = Buffer.from(lines.join("\n") + "\n"), artifact = manifest.artifacts.find(a => a.path === "normalized.jsonl");
      artifact.sha256 = sha(altered); artifact.bytes = altered.length; await writeFile(file, altered);
    }
    await writeFile(release.manifest_path, JSON.stringify(manifest));
    await assert.rejects(loadTnChildcareReportingInput(release.manifest_path));
    await writeFile(release.manifest_path, bytes); await writeFile(file, rows);
  }
});

test("TN reporting input rejects options and pointers and cooperatively cancels", async t => {
  const { release, outputRoot } = await fixture(t);
  for (const options of [null, [], { fetchImpl() {} }, { signal: {} }, { inferZip: true }]) await assert.rejects(loadTnChildcareReportingInput(release.manifest_path, options));
  await assert.rejects(loadTnChildcareReportingInput(path.join(outputRoot, "current.json")));
  await assert.rejects(loadTnChildcareReportingInput(release.manifest_path, { signal: AbortSignal.abort() }), { name: "AbortError" });
  const controller = new AbortController(), pending = loadTnChildcareReportingInput(release.manifest_path, { signal: controller.signal });
  setImmediate(() => controller.abort()); await assert.rejects(pending, { name: "AbortError" });
});
