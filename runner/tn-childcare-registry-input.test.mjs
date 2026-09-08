import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile, readFile, rm, link, unlink, rename, symlink } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { acquireTnChildcare } from "./tn-childcare-acquisition.mjs";
import { createTnChildcareFixture } from "./fixtures/tn-childcare-fetch.mjs";
import { recoverTnChildcareRelease } from "./tn-childcare-recovered-release.mjs";
import { loadTnChildcareRegistryInput } from "./tn-childcare-registry-input.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
async function fixture(t) {
  const runId = `tn-registry-fixture-${randomUUID()}`, runRoot = path.join(APP_ROOT, "data/industry-segments/runs", runId);
  const stagingPath = path.join(runRoot, "state-tn-childcare-TN/.staging", randomUUID()), receiptPath = path.join(runRoot, "receipt.json");
  await mkdir(path.join(APP_ROOT, "data/tmp"), { recursive: true });
  const outputRoot = await mkdtemp(path.join(APP_ROOT, "data/tmp/tn-registry-input-"));
  t.after(async () => { await rm(runRoot, { recursive: true, force: true }); await rm(outputRoot, { recursive: true, force: true }); });
  await mkdir(stagingPath, { recursive: true }); await mkdir(path.join(runRoot, "logs"));
  const acquired = await acquireTnChildcare({ fetchImpl: createTnChildcareFixture({ count: 20, mutate: (p, k) => {
    if (k === "features") { p.features[0].attributes.Zip = "0"; p.features[1].attributes.Zip = null; }
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

test("TN verified registry input preserves null ZIP and recovered provenance without network or publication", async t => {
  const { release, outputRoot } = await fixture(t), manifestBefore = await readFile(release.manifest_path), pointer = await readFile(path.join(outputRoot, "current.json"));
  const priorFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error("Network forbidden"); };
  let result;
  try { result = await loadTnChildcareRegistryInput(release.manifest_path); } finally { globalThis.fetch = priorFetch; }
  assert.equal(result.exportPolicy, "local-review-only"); assert.equal(result.nationalReportingIntegrated, false);
  assert.deepEqual(result.counts, { selected: 20, accepted: 20, quarantined: 0 }); assert.equal(result.contributions.length, 20);
  assert.equal(result.contributions.filter(c => c.zipCode === null).length, 2);
  assert.ok(result.contributions.every(c => c.matchProfiles.length === 0 && c.entities.length === 2));
  assert.equal(result.source.manifestSha256, release.manifest_sha256); assert.equal(result.source.transformationVersion, "tn-childcare-normalization@1.0.1");
  assert.equal(result.source.observedAt, "2026-09-08T00:00:01.000Z"); assert.equal(result.source.processedAt, "2026-09-09T00:00:00.000Z");
  assert.equal(result.source.parentManifestSha256, null);
  assert.deepEqual(await readFile(release.manifest_path), manifestBefore); assert.deepEqual(await readFile(path.join(outputRoot, "current.json")), pointer);
});

test("TN input rejects rehashed membership policy and invalid UTF8 mutation", async t => {
  const { release } = await fixture(t), original = await readFile(release.manifest_path), file = path.join(path.dirname(release.manifest_path), "normalized.jsonl"), normalized = await readFile(file);
  for (const kind of ["membership", "policy", "utf8", "version"]) {
    const manifest = JSON.parse(original), descriptor = manifest.artifacts.find(a => a.path === "normalized.jsonl");
    if (kind === "policy") descriptor.export_policy = "public";
    if (kind === "version") manifest.transformation_version = "tn-childcare-normalization@1.0.0";
    if (kind === "membership" || kind === "utf8") {
      const rows = normalized.toString().trim().split("\n"); rows[0] = rows[1];
      const changed = kind === "utf8" ? Buffer.from([0xff, 0x0a]) : Buffer.from(rows.join("\n") + "\n");
      await writeFile(file, changed); descriptor.bytes = changed.length; descriptor.sha256 = sha(changed);
    }
    await writeFile(release.manifest_path, JSON.stringify(manifest)); await assert.rejects(loadTnChildcareRegistryInput(release.manifest_path));
    await writeFile(file, normalized); await writeFile(release.manifest_path, original);
  }
});

test("TN input rejects pointers staging aliases hard links and unsupported options; supports cancellation", async t => {
  const { release, outputRoot } = await fixture(t);
  for (const options of [null, [], { fetchImpl() {} }, { signal: {} }]) await assert.rejects(loadTnChildcareRegistryInput(release.manifest_path, options));
  await assert.rejects(loadTnChildcareRegistryInput(release.manifest_path, { signal: AbortSignal.abort() }), { name: "AbortError" });
  const controller = new AbortController(), pending = loadTnChildcareRegistryInput(release.manifest_path, { signal: controller.signal });
  setImmediate(() => controller.abort()); await assert.rejects(pending, { name: "AbortError" });
  for (const file of [path.join(outputRoot, "current.json"), path.relative(APP_ROOT, release.manifest_path), path.join(path.dirname(APP_ROOT), "manifest.json")]) await assert.rejects(loadTnChildcareRegistryInput(file));
  const hardLink = path.join(outputRoot, "manifest-copy.json"); await link(release.manifest_path, hardLink);
  await assert.rejects(loadTnChildcareRegistryInput(release.manifest_path)); await unlink(hardLink);
  const directory = path.dirname(release.manifest_path), staged = path.join(outputRoot, ".staging", release.run_id);
  await rename(directory, staged); await assert.rejects(loadTnChildcareRegistryInput(path.join(staged, "manifest.json")), /immutable released/); await rename(staged, directory);
  const alias = path.join(outputRoot, "alias"); await symlink(path.dirname(directory), alias, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(loadTnChildcareRegistryInput(path.join(alias, release.release_id, "manifest.json"))); await unlink(alias);
});
