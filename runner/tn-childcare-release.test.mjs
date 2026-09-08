import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, readdir, rm, symlink, link, unlink, lstat, truncate, mkdir } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { buildTnChildcareRelease, verifyTnChildcareRelease } from "./tn-childcare-release.mjs";
import { createTnChildcareFixture } from "./fixtures/tn-childcare-fetch.mjs";
const clock = () => new Date("2026-09-08T00:00:00.000Z"), noSleep = async () => {}, hash = (v) => createHash("sha256").update(v).digest("hex");
async function temporary(t) { const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/tn-release-")); t.after(() => rm(root, { recursive: true, force: true })); return root; }
const build = (root, fixture = createTnChildcareFixture(), options = {}) => buildTnChildcareRelease({ outputRoot: root, fetchImpl: fixture.fetchImpl, sleep: noSleep, now: clock, ...options });

test("TN fresh release retains missing ZIPs and points without recovery or relaxed malformed-ZIP quarantine", async (t) => {
  const root = await temporary(t), fixture = createTnChildcareFixture({ count: 5, mutate: (payload, kind) => {
    if (kind === "features") { for (const [i, zip] of [null, "", "  ", "0", "37201-0123"].entries()) payload.features[i].attributes.Zip = zip; payload.features[0].geometry = null; }
  } });
  const result = await build(root, fixture); assert.deepEqual(result.counts, { selected: 5, accepted: 5, quarantined: 0 });
  const manifest = JSON.parse(await readFile(result.manifest_path, "utf8"));
  assert.equal(manifest.connector_version, "1.1.0"); assert.equal(manifest.transformation_version, "tn-childcare-normalization@1.0.1");
  assert.equal(Object.hasOwn(manifest, "recovery_version"), false);
  assert.deepEqual(manifest.accepted_record_quality, { with_source_zip: 1, without_source_zip: 4, missing_zip_reasons: { "missing-source-zip": 3, "invalid-source-zip-placeholder": 1 }, missing_points: 1, zip_inferred: false });
  const rows = (await readFile(path.join(path.dirname(result.manifest_path), "normalized.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  for (const row of rows.slice(0, 4)) assert.deepEqual([row.physical_address.zip_code, row.physical_address.postal_code, row.physical_address.zip4], [null, null, null]);
  assert.equal(rows[4].physical_address.zip4, "0123");
  await verifyTnChildcareRelease(result.manifest_path);
  for (const mutate of [m => { m.accepted_record_quality.without_source_zip = 0; }, m => { m.accepted_record_quality.missing_zip_reasons["missing-source-zip"]--; }, m => { m.accepted_record_quality.zip_inferred = true; }, m => { m.transformation_version = "tn-childcare-normalization@1.0.0"; }, m => { m.connector_version = "1.0.1"; }, m => { m.connector_version = "2.0.0"; }]) {
    const copy = structuredClone(manifest); mutate(copy); await writeFile(result.manifest_path, JSON.stringify(copy)); await assert.rejects(verifyTnChildcareRelease(result.manifest_path));
  }
});

test("TN new verifier retains genuine legacy byte contract and can publish beside it", async (t) => {
  const fixture = JSON.parse(await readFile(path.join(APP_ROOT, "runner/fixtures/tn-childcare-legacy-release.json"), "utf8"));
  const root = await temporary(t), directory = path.join(root, "releases", fixture.release_id); await mkdir(directory, { recursive: true });
  for (const [name, base64] of Object.entries(fixture.artifacts)) await writeFile(path.join(directory, name), Buffer.from(base64, "base64"));
  const manifestPath = path.join(directory, "manifest.json"), prior = await readFile(manifestPath);
  assert.equal(hash(prior), fixture.manifest_sha256); const legacy = JSON.parse(prior);
  assert.equal(legacy.connector_version, "1.0.0"); assert.equal(Object.hasOwn(legacy, "accepted_record_quality"), false);
  await verifyTnChildcareRelease(manifestPath);
  await writeFile(path.join(root, "current.json"), JSON.stringify({ dataset_id: legacy.dataset_id, release_id: legacy.release_id, manifest: `releases/${legacy.release_id}/manifest.json`, manifest_sha256: fixture.manifest_sha256 }));
  const current = await build(root); assert.notEqual(current.manifest_path, manifestPath); await verifyTnChildcareRelease(current.manifest_path);
  assert.deepEqual(await readFile(manifestPath), prior); await verifyTnChildcareRelease(manifestPath);
});
test("TN release publishes five immutable artifacts and reproduces all evidence offline", async (t) => {
  const root = await temporary(t), fixture = createTnChildcareFixture(), result = await build(root, fixture), directory = path.dirname(result.manifest_path);
  assert.deepEqual(result.counts, { selected: 1, accepted: 1, quarantined: 0 });
  const manifest = JSON.parse(await readFile(result.manifest_path, "utf8"));
  assert.equal(manifest.policy.profile, "tn-childcare-local-review@1.0.0"); assert.equal(manifest.claims.active_business_verified, false); assert.equal(manifest.claims.export_authorized, false);
  assert.equal(manifest.artifacts.length, 5); assert.equal((await readdir(directory)).length, 6);
  const source = JSON.parse(await readFile(path.join(directory, "source-observation.json"), "utf8"));
  const xml = await readFile(path.join(directory, "publisher-metadata.xml")); assert.deepEqual(xml, Buffer.from(source.preflight_before.observations[3].payload.base64, "base64")); assert.equal(xml[0], 0xef);
  const prior = globalThis.fetch; globalThis.fetch = async () => { throw new Error("No network"); };
  try { const verification = await verifyTnChildcareRelease(result.manifest_path); assert.equal(verification.artifact_count, 5); assert.equal(verification.manifest_sha256, result.manifest_sha256); }
  finally { globalThis.fetch = prior; }
  const next = await build(root); assert.notEqual(next.release_id, result.release_id); await verifyTnChildcareRelease(result.manifest_path);
  assert.equal((await lstat(result.manifest_path, { bigint: true })).nlink, 1n);
  await assert.rejects(verifyTnChildcareRelease(path.join(root, "current.json"))); await assert.rejects(readFile(path.join(root, ".publish.lock")), { code: "ENOENT" });
});
test("TN verifier rejects self-consistently rehashed normalization policy private fields and missing XML", async (t) => {
  const root = await temporary(t), result = await build(root), directory = path.dirname(result.manifest_path), originalManifest = await readFile(result.manifest_path);
  const clean = JSON.parse(originalManifest), originals = new Map(await Promise.all(clean.artifacts.map(async (a) => [a.path, await readFile(path.join(directory, a.path))])));
  for (const mutation of ["normalized", "private-row", "home", "terms", "XML", "policy", "extra-artifact"]) {
    const manifest = structuredClone(clean), changes = new Map();
    if (mutation === "normalized") { const row = JSON.parse(originals.get("normalized.jsonl")); row.geocode.latitude = 35; changes.set("normalized.jsonl", Buffer.from(`${JSON.stringify(row)}\n`)); }
    if (["private-row", "home", "terms"].includes(mutation)) {
      const evidence = JSON.parse(originals.get("source-observation.json"));
      if (mutation === "terms") for (const receipt of [evidence.preflight_before, evidence.preflight_after]) for (const observation of receipt.observations) {
        if (observation.kind === "item") { observation.payload.licenseInfo = "Unrestricted"; observation.payload_sha256 = hash(JSON.stringify(observation.payload)); }
      }
      else { const observation = evidence.observations.find((o) => o.kind === "features");
        if (mutation === "private-row") observation.payload.features[0].attributes.owner = { contact: "private" }; else observation.payload.features[0].attributes.Child_Care_Type = "Family Child Care Home";
        observation.payload_sha256 = hash(JSON.stringify(observation.payload));
        changes.set("selected-features.jsonl", Buffer.from(`${JSON.stringify(observation.payload.features[0])}\n`)); }
      changes.set("source-observation.json", Buffer.from(`${JSON.stringify(evidence)}\n`));
    }
    if (mutation === "XML") changes.set("publisher-metadata.xml", Buffer.from("<metadata>Active_ChildCare_Locations changed</metadata>"));
    if (mutation === "policy") manifest.policy.export_policy = "public";
    if (mutation === "extra-artifact") await writeFile(path.join(directory, "extra.json"), "{}");
    for (const [filename, bytes] of changes) { await writeFile(path.join(directory, filename), bytes); const artifact = manifest.artifacts.find((a) => a.path === filename); artifact.sha256 = hash(bytes); artifact.bytes = bytes.length; }
    await writeFile(result.manifest_path, JSON.stringify(manifest)); await assert.rejects(verifyTnChildcareRelease(result.manifest_path), undefined, mutation);
    for (const [filename, bytes] of originals) await writeFile(path.join(directory, filename), bytes);
    await writeFile(result.manifest_path, originalManifest); if (mutation === "extra-artifact") await unlink(path.join(directory, "extra.json"));
  }
  await unlink(path.join(directory, "publisher-metadata.xml")); await assert.rejects(verifyTnChildcareRelease(result.manifest_path));
});
test("TN quarantine gate retains failed source evidence and accepts at most five percent", async (t) => {
  const root = await temporary(t), invalid = (count) => createTnChildcareFixture({ count, mutate: (p, k) => { if (k === "features") p.features[0].attributes.Zip = "invalid"; } });
  await assert.rejects(build(path.join(root, "failed"), invalid(1)), /quarantine/);
  const staged = await readdir(path.join(root, "failed/.staging")); assert.equal(staged.length, 1);
  assert.deepEqual((await readdir(path.join(root, "failed/.staging", staged[0]))).sort(), ["publisher-metadata.xml", "selected-features.jsonl", "source-observation.json"]);
  await assert.rejects(readFile(path.join(root, "failed/current.json")), { code: "ENOENT" });
  const result = await build(path.join(root, "threshold"), invalid(20)); assert.deepEqual(result.counts, { selected: 20, accepted: 19, quarantined: 1 }); await verifyTnChildcareRelease(result.manifest_path);
});
test("TN cancellation preserves prior release/pointer and removes only owned staging and lock", async (t) => {
  const root = await temporary(t), prior = await build(root), pointer = await readFile(path.join(root, "current.json")), controller = new AbortController();
  await assert.rejects(build(root, createTnChildcareFixture(), { signal: controller.signal, logger: (phase) => { if (phase === "before-commit") controller.abort(new Error("cancelled")); } }), /cancelled/);
  assert.deepEqual(await readFile(path.join(root, "current.json")), pointer); assert.deepEqual(await readdir(path.join(root, ".staging")), []);
  await assert.rejects(readFile(path.join(root, ".publish.lock")), { code: "ENOENT" }); await verifyTnChildcareRelease(prior.manifest_path);
});
test("TN concurrency foreign locks junctions hardlinks and escaped roots are rejected", async (t) => {
  const root = await temporary(t), result = await build(root), directory = path.dirname(result.manifest_path);
  await writeFile(path.join(root, ".publish.lock"), "foreign"); await assert.rejects(build(root)); assert.equal(await readFile(path.join(root, ".publish.lock"), "utf8"), "foreign"); await unlink(path.join(root, ".publish.lock"));
  const file = path.join(directory, "normalized.jsonl"), alias = path.join(root, "file-alias"); await link(file, alias);
  await assert.rejects(verifyTnChildcareRelease(result.manifest_path), /hard-linked/); await unlink(alias);
  const redirected = path.join(root, "redirected"); await symlink(directory, redirected, "junction"); await assert.rejects(verifyTnChildcareRelease(path.join(redirected, "manifest.json")));
  await assert.rejects(build(path.dirname(APP_ROOT))); await assert.rejects(build(APP_ROOT));
  const controller = new AbortController(); let nestedRejected = false;
  await assert.rejects(build(root, createTnChildcareFixture(), { signal: controller.signal, logger: async (phase) => { if (phase === "acquire") { await assert.rejects(build(root)); nestedRejected = true; controller.abort(new Error("cancelled")); } } }), /cancelled/);
  assert.equal(nestedRejected, true); await verifyTnChildcareRelease(result.manifest_path);
});
test("TN never removes replaced foreign ownership during cleanup", async (t) => {
  const root = await temporary(t);
  await assert.rejects(build(root, createTnChildcareFixture(), { logger: async (phase) => {
    if (phase === "before-commit") { const lock = path.join(root, ".publish.lock"); await unlink(lock); await writeFile(lock, '{"foreign":true}'); }
  } }), /ownership changed/);
  assert.equal(await readFile(path.join(root, ".publish.lock"), "utf8"), '{"foreign":true}');
  await assert.rejects(readFile(path.join(root, "current.json")), { code: "ENOENT" });
});
test("TN final verification rejects hook mutation and malformed or missing-reference prior pointers", async (t) => {
  const root = await temporary(t), prior = await build(root), pointerPath = path.join(root, "current.json"), pointer = await readFile(pointerPath);
  await assert.rejects(build(root, createTnChildcareFixture(), { logger: async (phase) => {
    if (phase === "before-commit") {
      const [run] = await readdir(path.join(root, ".staging")); const file = path.join(root, ".staging", run, "normalized.jsonl");
      const row = JSON.parse(await readFile(file, "utf8")); row.business_name = "Changed after verification"; await writeFile(file, `${JSON.stringify(row)}\n`);
    }
  } }), /replay/);
  assert.deepEqual(await readFile(pointerPath), pointer); assert.equal((await readdir(path.join(root, "releases"))).length, 1);
  for (const mutation of [(p) => { p.manifest = "../outside"; }, (p) => { p.manifest_sha256 = "0".repeat(64); }, (p) => { p.extra = true; },
    (p) => { p.release_id = "tn-childcare-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; p.manifest = `releases/${p.release_id}/manifest.json`; }]) {
    const changed = JSON.parse(pointer); mutation(changed); await writeFile(pointerPath, JSON.stringify(changed));
    await assert.rejects(build(root)); assert.equal(await readFile(pointerPath, "utf8"), JSON.stringify(changed));
  }
  await writeFile(pointerPath, pointer); await verifyTnChildcareRelease(prior.manifest_path);
});
test("TN verifier rejects sparse oversized artifacts before reading contents", async (t) => {
  const root = await temporary(t), result = await build(root), xml = path.join(path.dirname(result.manifest_path), "publisher-metadata.xml");
  await truncate(xml, 1_000_001); await assert.rejects(verifyTnChildcareRelease(result.manifest_path), /byte ceiling/);
});
