import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, link, unlink } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { createTnChildcareFixture } from "./fixtures/tn-childcare-fetch.mjs";
import { buildTnChildcareRelease } from "./tn-childcare-release.mjs";
import { loadFreshTnChildcareRegistryInput } from "./tn-childcare-fresh-registry-input.mjs";
import { loadTnChildcareRegistryInput } from "./tn-childcare-registry-input.mjs";
import { reconcileFreshTnChildcareCenter, reconcileTnChildcareCenter } from "./tn-childcare-registry-adapter.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/tn-fresh-input-")); t.after(() => rm(root, { recursive: true, force: true }));
  const f = createTnChildcareFixture({ count: 3, mutate: (p, kind) => { if (kind === "features") { p.features[0].attributes.Zip = null; p.features[0].geometry = null; p.features[1].attributes.Zip = "0"; } } });
  const release = await buildTnChildcareRelease({ outputRoot: root, fetchImpl: f.fetchImpl, sleep: async () => {}, now: () => new Date("2026-09-08T00:00:00.000Z") });
  const manifest = JSON.parse(await readFile(release.manifest_path, "utf8"));
  const normalizedPath = path.join(path.dirname(release.manifest_path), "normalized.jsonl"), rows = (await readFile(normalizedPath, "utf8")).trim().split("\n").map(JSON.parse);
  return { root, release, manifest, normalizedPath, rows };
}
test("fresh TN input verifies all membership offline without invented recovery or matching", async t => {
  const f = await fixture(t), pointer = await readFile(path.join(f.root, "current.json")), before = await readFile(f.release.manifest_path);
  const fetchBefore = globalThis.fetch; globalThis.fetch = () => { throw Error("Network prohibited"); }; let result;
  try { result = await loadFreshTnChildcareRegistryInput(f.release.manifest_path); } finally { globalThis.fetch = fetchBefore; }
  assert.deepEqual(result.counts, { selected: 3, accepted: 3, quarantined: 0 }); assert.equal(result.contributions.length, 3);
  assert.equal(result.nationalReportingIntegrated, false); assert.equal(result.exportPolicy, "local-review-only");
  assert.equal(result.source.processedAt, null); assert.equal(result.source.recoveryVersion, null); assert.equal(result.source.failedRunId, null);
  assert.equal(result.source.observedAt, f.manifest.observed_at);
  assert.deepEqual(result.contributions.map(c => c.zipCode), [null, null, "37201"]);
  for (const c of result.contributions) {
    assert.deepEqual(c.matchProfiles, []); assert.equal(c.evidence.recovery, null); assert.equal(c.evidence.processed_at, null);
    assert.equal(c.evidence.acquisition_kind, "ordinary-verified-local-release"); assert.equal(c.evidence.legal_approval, false);
    assert.ok(c.assertions.every(a => a.source.transformation_version.endsWith("tn-childcare-registry-adapter@1.1.0")));
    assert.ok(c.assertions.every(a => a.valid_from === null && a.valid_to === null && a.observed_at === f.manifest.observed_at));
  }
  assert.equal(result.contributions[2].assertions.find(a => a.predicate === "site.address").value.zip4, "0123");
  assert.deepEqual(await readFile(path.join(f.root, "current.json")), pointer); assert.deepEqual(await readFile(f.release.manifest_path), before);
  await assert.rejects(loadTnChildcareRegistryInput(f.release.manifest_path));
});
test("fresh TN adapter rejects recovery impersonation and altered policy, quality, records or versions", async t => {
  const f = await fixture(t), context = { manifest: f.manifest, manifestSha256: f.release.manifest_sha256 };
  assert.throws(() => reconcileTnChildcareCenter(f.rows[0], context));
  for (const mutate of [m => { m.connector_version = "1.0.1"; }, m => { m.recovery = {}; }, m => { m.processed_at = m.observed_at; },
    m => { m.claims.export_authorized = true; }, m => { m.policy.allowed_use.push("public export"); }, m => { m.accepted_record_quality.zip_inferred = true; },
    m => { m.accepted_record_quality.missing_zip_reasons["missing-source-zip"] = 0; }, m => { m.counts.accepted++; }]) {
    const manifest = structuredClone(f.manifest); mutate(manifest); assert.throws(() => reconcileFreshTnChildcareCenter(f.rows[0], { ...context, manifest }));
  }
  for (const mutate of [r => { r.physical_address.zip_code = "37201"; }, r => { r.quality.zip_unavailable_reason = null; },
    r => { r.provenance.observed_at = "2026-09-09T00:00:00.000Z"; }, r => { r.owner = "unselected"; }, r => { r.geocode.longitude = -87; }]) {
    const row = structuredClone(f.rows[0]); mutate(row); assert.throws(() => reconcileFreshTnChildcareCenter(row, context));
  }
});
test("fresh TN loader rejects altered normalized membership, aliases, pointer inputs and pre-cancellation", async t => {
  const f = await fixture(t), raw = await readFile(f.normalizedPath), alias = path.join(f.root, "alias");
  await assert.rejects(loadFreshTnChildcareRegistryInput(path.join(f.root, "current.json")), /immutable/);
  await link(f.normalizedPath, alias); await assert.rejects(loadFreshTnChildcareRegistryInput(f.release.manifest_path), /hard/); await unlink(alias);
  await writeFile(f.normalizedPath, raw.toString().replace("Offline Fixture Center", "Altered Facility"));
  await assert.rejects(loadFreshTnChildcareRegistryInput(f.release.manifest_path), /replay/); await writeFile(f.normalizedPath, raw);
  const controller = new AbortController(); controller.abort(); await assert.rejects(loadFreshTnChildcareRegistryInput(f.release.manifest_path, { signal: controller.signal }));
  await assert.rejects(loadFreshTnChildcareRegistryInput(f.release.manifest_path, { skipVerification: true }));
});
