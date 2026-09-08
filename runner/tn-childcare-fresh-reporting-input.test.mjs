import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { createTnChildcareFixture } from "./fixtures/tn-childcare-fetch.mjs";
import { createTnChildcareReportingFixture } from "./fixtures/tn-childcare-reporting.mjs";
import { buildTnChildcareRelease } from "./tn-childcare-release.mjs";
import { loadFreshTnChildcareRegistryInput } from "./tn-childcare-fresh-registry-input.mjs";
import { loadFreshTnChildcareReportingInput } from "./tn-childcare-fresh-reporting-input.mjs";
import { reconcileTnChildcareCenter } from "./tn-childcare-registry-adapter.mjs";
import { createFreshTnChildcareGeographicEvidence, validateFreshTnChildcareGeographicEvidence, createTnChildcareGeographicEvidence, validateTnChildcareGeographicEvidence } from "./tn-childcare-geographic-evidence.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/tn-fresh-reporting-")); t.after(() => rm(root, { recursive: true, force: true }));
  const transport = createTnChildcareFixture({ count: 3, mutate: (p, kind) => { if (kind === "features") { p.features[0].attributes.Zip = null; p.features[0].geometry = null; p.features[1].attributes.Zip = "0"; } } });
  const release = await buildTnChildcareRelease({ outputRoot: root, fetchImpl: transport.fetchImpl, sleep: async () => {}, now: () => new Date("2026-09-08T00:00:00.000Z") });
  return { root, release, input: await loadFreshTnChildcareRegistryInput(release.manifest_path) };
}
test("fresh reporting conserves verified ZIP/point quality and keeps recovery validators closed", async t => {
  const f = await fixture(t), before = await readFile(f.release.manifest_path), pointer = await readFile(path.join(f.root, "current.json"));
  const priorFetch = globalThis.fetch; globalThis.fetch = () => { throw Error("No network"); }; let result;
  try { result = await loadFreshTnChildcareReportingInput(f.release.manifest_path); } finally { globalThis.fetch = priorFetch; }
  assert.deepEqual(result.summary, { reportingRows: 3, availableZip: 1, missingZip: 2, missingZipReasons: { "missing-source-zip": 1, "invalid-source-zip-placeholder": 1 }, missingPoints: 1 });
  assert.equal(result.nationalReportingIntegrated, false); assert.equal(result.exportPolicy, "local-review-only");
  assert.equal(new Set(result.reportingRows.map(r => r.site_entity_id)).size, 3);
  for (const row of result.reportingRows) {
    assert.equal(row.schema_version, "1.1.0"); assert.equal(validateFreshTnChildcareGeographicEvidence(row), row);
    assert.throws(() => validateTnChildcareGeographicEvidence(row));
    assert.equal(row.evidence.processed_at, null); assert.equal(row.evidence.recovery, null); assert.equal(row.identity_matching_eligible, false);
    assert.equal(Object.hasOwn(row, "geometry"), false); assert.equal(row.source.source_release_id, result.source.sourceReleaseId);
  }
  assert.equal(result.reportingRows[2].address.zip4, "0123");
  assert.deepEqual(await readFile(f.release.manifest_path), before); assert.deepEqual(await readFile(path.join(f.root, "current.json")), pointer);
  const legacy = createTnChildcareReportingFixture(), contribution = reconcileTnChildcareCenter(legacy.record, legacy.context);
  assert.throws(() => createFreshTnChildcareGeographicEvidence(contribution)); assert.throws(() => validateFreshTnChildcareGeographicEvidence(createTnChildcareGeographicEvidence(contribution)));
});
test("fresh geography rejects cross-version, private data, ZIP invention and fabricated recovery", async t => {
  const f = await fixture(t), row = createFreshTnChildcareGeographicEvidence(f.input.contributions[0]);
  for (const mutate of [r => { r.schema_version = "1.0.0"; }, r => { r.source.transformation_version = r.source.transformation_version.replace("adapter@1.1.0", "adapter@1.0.0"); },
    r => { r.evidence.release_id = r.evidence.release_id.replace("tn-childcare-", "tn-childcare-recovered-"); }, r => { r.evidence.processed_at = r.observed_at; },
    r => { r.evidence.recovery = {}; }, r => { delete r.evidence.acquisition_kind; }, r => { r.evidence.processing_time_status = "verified"; },
    r => { r.evidence.normalized_provenance.owner = "private"; }, r => { r.location.latitude = 36; }, r => { r.zip_code = "37201"; },
    r => { r.address.zip4 = "0123"; }, r => { r.evidence.zip_unavailable_reason = null; }, r => { r.identity_matching_eligible = true; }, r => { r.export_policy = "public"; }]) {
    const copy = structuredClone(row); mutate(copy); assert.throws(() => validateFreshTnChildcareGeographicEvidence(copy));
  }
});
test("fresh creator reconstructs assertions and relationships rather than trusting hashes", async t => {
  const f = await fixture(t);
  for (const mutate of [c => { c.assertions[0].subject_entity_id = c.entities[1].entity_id; }, c => { c.assertions[0].source.source_field = "owner"; },
    c => { c.assertions[0].value.street = "Invented street"; }, c => { c.relationships[0].status = "inactive"; }, c => { c.entities[0].identity_status = "verified"; },
    c => { c.assertions.push(c.assertions[0]); }, c => { c.evidence.assertions_sha256 = "a".repeat(64); }]) {
    const c = structuredClone(f.input.contributions[0]); mutate(c); assert.throws(() => createFreshTnChildcareGeographicEvidence(c));
  }
});
test("fresh reporting rejects rehashed source-quality tampering, unsupported options and cancellation", async t => {
  const f = await fixture(t);
  for (const options of [{ signal: {} }, { inferZip: true }, { fetchImpl() {} }, null]) await assert.rejects(loadFreshTnChildcareReportingInput(f.release.manifest_path, options));
  await assert.rejects(loadFreshTnChildcareReportingInput(f.release.manifest_path, { signal: AbortSignal.abort() }));
  const manifest = JSON.parse(await readFile(f.release.manifest_path)); manifest.accepted_record_quality.without_source_zip--;
  await writeFile(f.release.manifest_path, JSON.stringify(manifest));
  const pointerPath = path.join(f.root, "current.json"), pointer = JSON.parse(await readFile(pointerPath));
  pointer.manifest_sha256 = createHash("sha256").update(await readFile(f.release.manifest_path)).digest("hex"); await writeFile(pointerPath, JSON.stringify(pointer));
  await assert.rejects(loadFreshTnChildcareReportingInput(f.release.manifest_path));
});
