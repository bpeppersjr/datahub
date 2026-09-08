import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile, readFile, readdir, rm, link, unlink, symlink, truncate, rename } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { acquireTnChildcare } from "./tn-childcare-acquisition.mjs";
import { createTnChildcareFixture } from "./fixtures/tn-childcare-fetch.mjs";
import { recoverTnChildcareRelease, verifyTnChildcareRecoveredRelease } from "./tn-childcare-recovered-release.mjs";
const sha = (v) => createHash("sha256").update(v).digest("hex"), clock = () => new Date("2026-09-09T00:00:00.000Z");
async function fixture(t, zip = "0", secondZip = "") {
  const runId = `tn-recovery-fixture-${randomUUID()}`, runRoot = path.join(APP_ROOT, "data/industry-segments/runs", runId);
  const stagingPath = path.join(runRoot, "state-tn-childcare-TN/.staging", randomUUID()), receiptPath = path.join(runRoot, "receipt.json");
  const outputRoot = await mkdtemp(path.join(APP_ROOT, "data/tmp/tn-recovered-"));
  t.after(async () => { await rm(runRoot, { recursive: true, force: true }); await rm(outputRoot, { recursive: true, force: true }); });
  await mkdir(stagingPath, { recursive: true }); await mkdir(path.join(runRoot, "logs"));
  const acquired = await acquireTnChildcare({ fetchImpl: createTnChildcareFixture({ count: 20, mutate: (p, k) => { if (k === "features") { p.features[0].attributes.Zip = zip; p.features[1].attributes.Zip = secondZip; } } }).fetchImpl,
    sleep: async () => {}, now: () => new Date("2026-09-08T00:00:01.000Z") });
  const expectedHashes = {}, originals = new Map();
  for (const [key, name, bytes] of [["selectedFeatures", "selected-features.jsonl", Buffer.from(acquired.features.map((r) => `${JSON.stringify(r)}\n`).join(""))],
    ["sourceObservation", "source-observation.json", Buffer.from(`${JSON.stringify(acquired.evidence)}\n`)], ["publisherMetadata", "publisher-metadata.xml", acquired.publisher_metadata.before.raw]]) {
    const file = path.join(stagingPath, name); await writeFile(file, bytes); expectedHashes[key] = sha(bytes); originals.set(file, bytes);
  }
  const logRelative = `data/industry-segments/runs/${runId}/logs/state-tn-childcare-TN.log`, log = Buffer.from("acquire\nnormalize\nTennessee childcare build failed: Tennessee childcare release rejected: quarantine exceeds 5% or no accepted records.\n");
  const logPath = path.join(APP_ROOT, logRelative); await writeFile(logPath, log); originals.set(logPath, log);
  const receipt = { run_id: runId, status: "failed", started_at: "2026-09-08T00:00:00.000Z", finished_at: "2026-09-08T00:00:02.000Z", plan: { industries: ["childcare"], states: ["TN"] },
    tasks: [{ task_id: "state-tn-childcare:TN", source_id: "state-tn-childcare", state: "TN", status: "failed", code: 1, signal: null,
      started_at: "2026-09-08T00:00:00.000Z", finished_at: "2026-09-08T00:00:02.000Z", log: logRelative }], log_sha256: { "state-tn-childcare:TN": sha(log) } };
  const bytes = Buffer.from(JSON.stringify(receipt)); await writeFile(receiptPath, bytes); expectedHashes.receipt = sha(bytes); originals.set(receiptPath, bytes);
  return { receiptPath, stagingPath, expectedHashes, outputRoot, originals, runRoot };
}
const recover = (f, extra = {}) => recoverTnChildcareRelease({ receiptPath: f.receiptPath, stagingPath: f.stagingPath, expectedHashes: f.expectedHashes, outputRoot: f.outputRoot, now: clock, ...extra });
test("TN recovery preserves five pinned parent files and verifies seven-artifact release without original staging", async (t) => {
  const f = await fixture(t), priorFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("No network"); };
  try {
    const result = await recover(f), directory = path.dirname(result.manifest_path), manifest = JSON.parse(await readFile(result.manifest_path, "utf8"));
    assert.deepEqual(result.counts, { selected: 20, accepted: 20, quarantined: 0 }); assert.equal(manifest.connector_version, "1.0.1");
    assert.equal(manifest.transformation_version, "tn-childcare-normalization@1.0.1"); assert.equal(manifest.observed_at, "2026-09-08T00:00:01.000Z"); assert.equal(manifest.processed_at, clock().toISOString());
    assert.equal(manifest.recovery.legacy_normalization.accepted, 18); assert.equal(manifest.recovery.legacy_normalization.quarantined, 2); assert.equal(manifest.quarantine_max_fraction, 0.05);
    assert.deepEqual(manifest.postal_coverage, { available: 18, missing_source_zip: 1, invalid_source_zip_placeholder: 1 });
    assert.equal(manifest.recovery.network_requests, 0); assert.equal(Object.hasOwn(manifest.recovery, "parent_release_id"), false);
    for (const [file, bytes] of f.originals) {
      assert.deepEqual(await readFile(file), bytes);
      const name = file === f.receiptPath ? "failed-run-receipt.json" : file.endsWith(".log") ? "failed-task.log" : path.basename(file);
      assert.deepEqual(await readFile(path.join(directory, name)), bytes);
    }
    const expectedSourceId = `tn-childcare-${sha(JSON.stringify({ layer_url: acquiredSource(manifest).layer_url, where: manifest.source_filter,
      editing_info: JSON.parse(await readFile(path.join(directory, "source-observation.json"))).preflight_after.source.editing_info,
      item_modified_epoch_ms: JSON.parse(await readFile(path.join(directory, "source-observation.json"))).preflight_after.source.item_modified_epoch_ms,
      publisher_xml_sha256: sha(await readFile(path.join(directory, "publisher-metadata.xml"))),
      features: (await readFile(path.join(directory, "selected-features.jsonl"), "utf8")).trim().split("\n").map((row) => sha(row)) }))}`;
    assert.equal(manifest.source_release_id, expectedSourceId);
    await rename(f.runRoot, `${f.runRoot}-temporarily-unavailable`);
    try { const verified = await verifyTnChildcareRecoveredRelease(result.manifest_path); assert.equal(verified.artifact_count, 7); }
    finally { await rename(`${f.runRoot}-temporarily-unavailable`, f.runRoot); }
  } finally { globalThis.fetch = priorFetch; }
});
function acquiredSource(manifest) { return { layer_url: manifest.source_url }; }
test("TN recovered verifier rejects self-consistently rehashed data lineage policy and timestamps", async (t) => {
  const f = await fixture(t), result = await recover(f), directory = path.dirname(result.manifest_path), manifestBytes = await readFile(result.manifest_path), clean = JSON.parse(manifestBytes);
  const backups = new Map(await Promise.all(clean.artifacts.map(async (a) => [a.path, await readFile(path.join(directory, a.path))])));
  for (const mutation of ["normalized", "private", "parent-success", "legacy-count", "processed", "policy", "xml"]) {
    const manifest = structuredClone(clean), changes = new Map();
    if (mutation === "normalized") { const rows = backups.get("normalized.jsonl").toString().trim().split("\n").map(JSON.parse); rows[0].physical_address.zip_code = "37201"; rows[0].physical_address.postal_code = "37201"; changes.set("normalized.jsonl", Buffer.from(rows.map(JSON.stringify).join("\n") + "\n")); }
    if (mutation === "private") { const evidence = JSON.parse(backups.get("source-observation.json")), observation = evidence.observations.find((o) => o.kind === "features"); observation.payload.features[0].attributes.owner = "private"; observation.payload_sha256 = sha(JSON.stringify(observation.payload)); changes.set("source-observation.json", Buffer.from(JSON.stringify(evidence) + "\n")); }
    if (mutation === "parent-success") { const receipt = JSON.parse(backups.get("failed-run-receipt.json")); receipt.status = "succeeded"; changes.set("failed-run-receipt.json", Buffer.from(JSON.stringify(receipt))); }
    if (mutation === "legacy-count") manifest.recovery.legacy_normalization.accepted++;
    if (mutation === "processed") manifest.processed_at = "2020-01-01T00:00:00.000Z";
    if (mutation === "policy") manifest.policy.export_policy = "public";
    if (mutation === "xml") changes.set("publisher-metadata.xml", Buffer.from("<metadata>Active_ChildCare changed</metadata>"));
    for (const [name, bytes] of changes) {
      await writeFile(path.join(directory, name), bytes); const a = manifest.artifacts.find((entry) => entry.path === name); a.bytes = bytes.length; a.sha256 = sha(bytes);
      const pinKey = { "source-observation.json": "sourceObservation", "failed-run-receipt.json": "receipt", "publisher-metadata.xml": "publisherMetadata" }[name];
      if (pinKey) Object.assign(manifest.recovery.original_pins[pinKey], { bytes: bytes.length, sha256: sha(bytes) });
    }
    await writeFile(result.manifest_path, JSON.stringify(manifest)); await assert.rejects(verifyTnChildcareRecoveredRelease(result.manifest_path), undefined, mutation);
    for (const [name, bytes] of backups) await writeFile(path.join(directory, name), bytes); await writeFile(result.manifest_path, manifestBytes);
  }
  const sameId = structuredClone(clean); sameId.run_id = sameId.recovery.failed_staging_id; sameId.release_id = `tn-childcare-recovered-${sameId.run_id}`;
  const moved = path.join(path.dirname(directory), sameId.release_id); await rename(directory, moved); await writeFile(path.join(moved, "manifest.json"), JSON.stringify(sameId));
  await assert.rejects(verifyTnChildcareRecoveredRelease(path.join(moved, "manifest.json")), /must differ/);
  await rename(moved, directory); await writeFile(result.manifest_path, manifestBytes);
});
test("TN recovery rejects overlap wrong pins and explicit malformed ZIPs without changing originals", async (t) => {
  const f = await fixture(t);
  for (const outputRoot of [f.stagingPath, f.runRoot, path.dirname(f.runRoot)]) await assert.rejects(recover(f, { outputRoot }));
  const cwd = process.cwd();
  try { process.chdir(path.dirname(APP_ROOT)); await assert.rejects(recover(f, { receiptPath: path.relative(APP_ROOT, f.receiptPath), stagingPath: path.relative(APP_ROOT, f.stagingPath), outputRoot: f.runRoot }), /disjoint/); }
  finally { process.chdir(cwd); }
  await assert.rejects(recover(f, { expectedHashes: { ...f.expectedHashes, receipt: "0".repeat(64) } }));
  await assert.rejects(recover(f, { now: () => new Date("2020-01-01T00:00:00.000Z") }));
  const malformed = await fixture(t, "372010123"); const result = await recover(malformed); // One malformed row remains at exactly5%.
  assert.deepEqual(result.counts, { selected: 20, accepted: 19, quarantined: 1 });
  const overGate = await fixture(t, "372010123", "invalid"); await assert.rejects(recover(overGate), /quarantine exceeds 5%/);
  assert.deepEqual(await readdir(overGate.outputRoot), []);
  for (const [file, bytes] of overGate.originals) assert.deepEqual(await readFile(file), bytes);
  for (const [file, bytes] of f.originals) assert.deepEqual(await readFile(file), bytes);
});
test("TN recovery cancellation locks aliases oversized artifacts and post-verification mutation fail closed", async (t) => {
  const f = await fixture(t), first = await recover(f), pointer = await readFile(path.join(f.outputRoot, "current.json"));
  const controller = new AbortController(); await assert.rejects(recover(f, { signal: controller.signal, logger: (phase) => { if (phase === "before-commit") controller.abort(); } }));
  assert.deepEqual(await readFile(path.join(f.outputRoot, "current.json")), pointer); assert.deepEqual(await readdir(path.join(f.outputRoot, ".staging")), []);
  for (const value of [null, false, 0, ""]) {
    await writeFile(path.join(f.outputRoot, "current.json"), JSON.stringify(value)); await assert.rejects(recover(f), /invalid prior recovered pointer/);
    assert.equal(await readFile(path.join(f.outputRoot, "current.json"), "utf8"), JSON.stringify(value));
  }
  await writeFile(path.join(f.outputRoot, "current.json"), pointer);
  await assert.rejects(readFile(path.join(f.outputRoot, ".publish.lock")), { code: "ENOENT" });
  await writeFile(path.join(f.outputRoot, ".publish.lock"), "foreign"); await assert.rejects(recover(f)); assert.equal(await readFile(path.join(f.outputRoot, ".publish.lock"), "utf8"), "foreign"); await unlink(path.join(f.outputRoot, ".publish.lock"));
  const alias = path.join(f.outputRoot, "alias"); await symlink(path.dirname(first.manifest_path), alias, "junction"); await assert.rejects(verifyTnChildcareRecoveredRelease(path.join(alias, "manifest.json")));
  const hardlink = path.join(f.outputRoot, "hardlink"); await link(first.manifest_path, hardlink); await assert.rejects(verifyTnChildcareRecoveredRelease(first.manifest_path)); await unlink(hardlink);
  const previousStages = await readdir(path.join(f.outputRoot, ".staging"));
  await assert.rejects(recover(f, { logger: async (phase) => { if (phase === "before-commit") { const id = (await readdir(path.join(f.outputRoot, ".staging"))).find((id) => !previousStages.includes(id)); await writeFile(path.join(f.outputRoot, ".staging", id, "normalized.jsonl"), "{}\n"); } } }));
  assert.deepEqual(await readFile(path.join(f.outputRoot, "current.json")), pointer);
  const xml = path.join(path.dirname(first.manifest_path), "publisher-metadata.xml"); await truncate(xml, 1_000_001); await assert.rejects(verifyTnChildcareRecoveredRelease(first.manifest_path), /byte ceiling/);
});
