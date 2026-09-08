import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { feature, evidence, rehash } from "./fixtures/oh-childcare-acquisition.mjs";
import { normalizeOhChildcareFeature, normalizeOhChildcareAcquisition, OH_NORMALIZATION_VERSION } from "./oh-childcare-normalization.mjs";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";
const context = { runId: "oh-fixture-run", sourceReleaseId: "oh-fixture-source", observedAt: "2026-09-08T05:00:00.000Z", processedAt: "2026-09-09T00:00:00.000Z", outputWkid: 4326 };
const batchContext = { runId: context.runId, sourceReleaseId: context.sourceReleaseId, processedAt: context.processedAt };
test("OH normalized business evidence splits postal fields and preserves source provenance without business polygons", () => {
  const f = feature(1), original = structuredClone(f), r = normalizeOhChildcareFeature(f, context);
  assertNormalizedUsPostalFieldsDeep(r); assert.equal(r.business_name, "Synthetic center 1");
  assert.deepEqual([r.physical_address.zip_code, r.physical_address.postal_code, r.physical_address.zip4], ["43215", "43215", "0123"]);
  assert.equal(r.physical_address.county_source, "Synthetic county"); assert.equal(r.physical_address.street2, null);
  assert.deepEqual(r.external_identifiers, [{ type: "ohio_dcy_program_number", value: "1001", source_field: "program_number", identity_verified: false }]);
  assert.equal(r.source_status.status_source, "Open"); assert.equal(r.source_status.valid_from, null); assert.equal(r.source_status.valid_to, null); assert.equal(r.source_status.active_business_verified, false);
  assert.equal(r.provenance.observed_at, context.observedAt); assert.equal(r.provenance.processed_at, context.processedAt); assert.equal(r.provenance.transformation_version, OH_NORMALIZATION_VERSION);
  assert.equal(r.provenance.input_feature_sha256, createHash("sha256").update(JSON.stringify(f)).digest("hex"));
  assert.equal(r.provenance.field_lineage.county_source, "attributes.county"); assert.equal(r.quality.geographic_boundary_verified, false);
  assert.equal(r.geocode.latitude, 40); assert.equal(r.geocode.longitude, -83); assert.equal(Object.hasOwn(r, "geometry"), false); assert.equal(JSON.stringify(r).includes("43215-0123"), false);
  assert.deepEqual(f, original); assert.equal(r.export_policy, "local-review-only");
});
test("OH missing, malformed and placeholder ZIPs remain explicit gaps without dropping physical centers", () => {
  for (const [value, zip, zip4, reason] of [["01234-0567", "01234", "0567", null], ["012340567", "01234", "0567", null], [" 43215 ", "43215", null, null], [null, null, null, "missing-source-zip"], [" ", null, null, "missing-source-zip"], ["0", null, null, "invalid-source-zip-placeholder"], ["00000-0123", null, null, "invalid-source-zip-placeholder"], ["N/A", null, null, "invalid-source-zip-format"], ["43215-12", null, null, "invalid-source-zip-format"]]) {
    const f = feature(1); f.attributes.zip_code = value; const r = normalizeOhChildcareFeature(f, context);
    assert.equal(r.physical_address.zip_code, zip); assert.equal(r.physical_address.postal_code, zip); assert.equal(r.physical_address.zip4, zip4); assert.equal(r.quality.zip_unavailable_reason, reason);
  }
});
test("OH missing identifiers and point quality remain explicit; program numbers never gain leading zeroes", () => {
  const f = feature(2); f.attributes.program_number = null; f.attributes.county = null;
  const r = normalizeOhChildcareFeature(f, context); assert.deepEqual(r.external_identifiers, []); assert.deepEqual(r.quality.missing_identifier_fields, ["program_number"]);
  assert.equal(r.physical_address.county_source, null); assert.equal(r.geocode.latitude, null); assert.equal(r.quality.point_unavailable_reason, "source-geometry-missing");
  f.attributes.program_number = 1; assert.equal(normalizeOhChildcareFeature(f, context).external_identifiers[0].value, "1");
  for (const geometry of [{ x: null }, { x: 0, y: 0 }, { x: -120, y: 40 }, { x: 999, y: 40 }]) { f.geometry = geometry; const r = normalizeOhChildcareFeature(f, context); assert.equal(r.geocode.latitude, null); assert.ok(r.quality.point_unavailable_reason); }
});
test("OH invalid identifiers, text, scope and nonphysical addresses produce redacted record rejections", () => {
  for (const change of [
    (f) => { f.attributes.program_number = 1.5; }, (f) => { f.attributes.program_number = Number.MAX_SAFE_INTEGER + 1; }, (f) => { f.attributes.program_number = -1; }, (f) => { f.attributes.program_number = 0; },
    (f) => { f.attributes.program_name = "SECRET\u0000"; }, (f) => { f.attributes.city = " "; }, (f) => { f.attributes.street_address = "PO Box 1"; }, (f) => { f.attributes.street_address = "General Delivery"; },
    (f) => { f.attributes.program_type = "Other"; }, (f) => { f.attributes.program_status = "Enforcement"; }, (f) => { f.attributes.state = "PA"; }, (f) => { f.attributes.phone_number = "SECRET"; },
    (f) => { f.geometry = { x: -83, y: null }; }, (f) => { f.geometry.spatialReference = { wkid: 3857 }; },
  ]) { const f = feature(1); change(f); assert.throws(() => normalizeOhChildcareFeature(f, context), (e) => e.code === "OH_CHILDCARE_RECORD_REJECTED" && !e.message.includes("SECRET")); }
});
test("OH batch conserves accepted and quarantined records, preserves duplicate program IDs and reprocessing times", async () => {
  const e = await evidence(); for (const f of e.observations[1].payload.features) f.attributes.program_number = 1001; rehash(e);
  const original = normalizeOhChildcareAcquisition(e, batchContext); assert.equal(original.records.length, 3); assert.equal(new Set(original.records.map((r) => r.external_identifiers[0].value)).size, 1);
  e.observations[1].payload.features.find((f) => f.attributes.objectid === 1).attributes.program_number = 1.5; rehash(e);
  const r = normalizeOhChildcareAcquisition(e, batchContext); assert.equal(r.summary.accepted_records, 2); assert.equal(r.summary.quarantined_records, 1);
  assert.deepEqual([...r.records.map((r) => r.provenance.source_object_id), ...r.quarantine.map((r) => r.source_object_id)].sort(), [1, 2, 3]);
  assert.equal(r.quarantine[0].reason, "invalid-program-number"); assert.equal(r.quarantine[0].export_policy, "internal");
  assert.equal(r.summary.zip_unavailable_reasons["missing-source-zip"], 2); assert.equal(r.summary.identity_matching_applied, false); assert.equal(r.summary.release_published, false);
  assert.deepEqual(r, normalizeOhChildcareAcquisition(e, batchContext));
  const next = normalizeOhChildcareAcquisition(e, { ...batchContext, runId: "next", processedAt: "2026-09-10T00:00:00.000Z" });
  assert.equal(next.records[0].provenance.observed_at, r.records[0].provenance.observed_at); assert.notEqual(next.records[0].provenance.processed_at, r.records[0].provenance.processed_at);
});
test("OH rejects unsafe context, incomplete evidence and processing before acquisition completion", async () => {
  for (const change of [(c) => { delete c.runId; }, (c) => { c.runId = "../escape"; }, (c) => { c.outputWkid = 3857; }, (c) => { c.observedAt = "2026-09-08"; }, (c) => { c.processedAt = "2000-01-01T00:00:00.000Z"; }, (c) => { c.secret = "x"; }]) { const c = { ...context }; change(c); assert.throws(() => normalizeOhChildcareFeature(feature(1), c)); }
  const e = await evidence(); assert.throws(() => normalizeOhChildcareAcquisition(e, batchContext, { signal: AbortSignal.abort() }), { name: "AbortError" });
  const finished = "2026-09-08T06:00:00.000Z"; e.preflight_after.started_at = finished; e.preflight_after.finished_at = finished; e.observed_at = finished;
  for (const o of e.preflight_after.observations) o.observed_at = finished;
  assert.throws(() => normalizeOhChildcareAcquisition(e, { ...batchContext, processedAt: "2026-09-08T05:30:00.000Z" }), /completed acquisition/);
  e.observations[1].payload_sha256 = "0".repeat(64); assert.throws(() => normalizeOhChildcareAcquisition(e, batchContext), /observation/);
});
