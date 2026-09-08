import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { feature, evidence, rehash } from "./fixtures/wi-childcare-acquisition.mjs";
import { normalizeWiChildcareFeature, normalizeWiChildcareAcquisition, WI_NORMALIZATION_VERSION } from "./wi-childcare-normalization.mjs";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

const context = { runId: "wi-fixture-run", sourceReleaseId: "wi-fixture-release", observedAt: "2026-09-08T04:00:00.000Z", processedAt: "2026-09-08T05:00:00.000Z", outputWkid: 4326 };
const batchContext = { runId: context.runId, sourceReleaseId: context.sourceReleaseId, processedAt: context.processedAt };
test("WI normalization separates ZIP fields and preserves typed identifiers and source lineage", () => {
  const f = feature(1), r = normalizeWiChildcareFeature(f, context);
  assertNormalizedUsPostalFieldsDeep(r);
  assert.equal(r.business_name, "Synthetic Center");
  assert.equal(r.physical_address.city, "Fixture");
  assert.equal(r.physical_address.zip_code, "53703"); assert.equal(r.physical_address.postal_code, "53703"); assert.equal(r.physical_address.zip4, "1234");
  assert.deepEqual(r.external_identifiers.map((v) => v.value), ["0001", "01", "000101"]);
  assert.equal(r.geocode.longitude, -89.4); assert.equal(r.geocode.latitude, 43.1);
  assert.equal(r.provenance.observed_at, context.observedAt); assert.equal(r.provenance.processed_at, context.processedAt);
  assert.equal(r.provenance.transformation_version, WI_NORMALIZATION_VERSION);
  assert.equal(r.provenance.input_feature_sha256, createHash("sha256").update(JSON.stringify(f)).digest("hex"));
  assert.match(r.provenance.policy_sha256, /^[a-f0-9]{64}$/);
  assert.equal(r.provenance.field_lineage["physical_address.zip4"], "attributes.ZipCode");
  assert.equal(r.source_status.status_source, null); assert.equal(r.source_status.active_business_verified, false);
  assert.equal(r.source_status.valid_from, null); assert.equal(r.affiliation.parent_company, null);
  assert.equal(Object.hasOwn(r, "geometry"), false); assert.equal(JSON.stringify(r).includes("53703-1234"), false);
  assert.equal(f.attributes.FacilityName, "Synthetic Center ");
});
test("WI ZIP formats preserve leading zeroes, extensions, and reasoned unavailable values", () => {
  for (const [raw, zip, extension, reason] of [
    ["01234", "01234", null, null], ["01234-0567", "01234", "0567", null], ["012340567", "01234", "0567", null],
    [" 53703 ", "53703", null, null], [null, null, null, "missing-source-zip"], ["  ", null, null, "missing-source-zip"],
    ["0", null, null, "invalid-source-zip-placeholder"], ["00000-1234", null, null, "invalid-source-zip-placeholder"],
    ["N/A", null, null, "invalid-source-zip-format"], ["53703-12", null, null, "invalid-source-zip-format"],
  ]) {
    const f = feature(1); f.attributes.ZipCode = raw;
    const r = normalizeWiChildcareFeature(f, context);
    assert.equal(r.physical_address.zip_code, zip); assert.equal(r.physical_address.postal_code, zip); assert.equal(r.physical_address.zip4, extension); assert.equal(r.quality.zip_unavailable_reason, reason);
  }
});
test("WI missing identifiers, second address line, zero capacity and coordinate gaps stay explicit", () => {
  const f = feature(2); f.attributes.ProvderNumber = null; f.attributes.LocationNumber = " "; f.attributes.LocationLineAddress2 = " Suite 4 "; f.attributes.Capacity = 0;
  const r = normalizeWiChildcareFeature(f, context);
  assert.equal(r.physical_address.street2, "Suite 4"); assert.equal(r.industry.capacity_source, 0);
  assert.deepEqual(r.quality.missing_identifier_fields, ["ProvderNumber", "LocationNumber"]);
  assert.equal(r.geocode.latitude, null); assert.equal(r.geocode.longitude, null);
  assert.equal(r.quality.point_unavailable_reason, "source-geometry-missing");
  for (const g of [{ x: null }, { x: 0, y: 0 }, { x: -120, y: 43 }, { x: 999, y: 43 }]) {
    f.geometry = g; const result = normalizeWiChildcareFeature(f, context);
    assert.equal(result.geocode.latitude, null); assert.equal(result.geocode.longitude, null); assert.ok(result.quality.point_unavailable_reason);
  }
});
test("WI invalid record content is classified without exposing raw text in rejection messages", () => {
  for (const change of [
    (f) => { f.attributes.FacilityName = "SECRET\u0000"; },
    (f) => { f.attributes.City = " "; },
    (f) => { f.attributes.LocationLineAddress1 = "PO Box 123"; },
    (f) => { f.attributes.LocationLineAddress1 = "General Delivery"; },
    (f) => { f.attributes.Capacity = -1; }, (f) => { f.attributes.Capacity = 1.5; },
    (f) => { f.attributes.CategoryType = "LICENSED FAMILY"; }, (f) => { f.attributes.State = "MI"; },
    (f) => { f.attributes.ProvderNumber = 1; }, (f) => { f.attributes.ZipCode = 53703; },
    (f) => { f.attributes.LocationContactFullName = "SECRET"; },
    (f) => { f.geometry = { x: -89, y: null }; }, (f) => { f.geometry.spatialReference = { wkid: 3857 }; },
  ]) {
    const f = feature(1); change(f);
    assert.throws(() => normalizeWiChildcareFeature(f, context), (error) => error.code === "WI_CHILDCARE_RECORD_REJECTED" && !error.message.includes("SECRET"));
  }
});
test("WI normalization rejects unsupported/missing/unsafe context and altered processing chronology", () => {
  for (const change of [
    (c) => { delete c.runId; }, (c) => { c.runId = "../escape"; }, (c) => { c.sourceReleaseId = "x".repeat(129); },
    (c) => { c.outputWkid = 3857; }, (c) => { c.observedAt = "2026-09-08"; },
    (c) => { c.processedAt = "2020-01-01T00:00:00.000Z"; }, (c) => { c.secret = "bad"; },
  ]) { const c = { ...context }; change(c); assert.throws(() => normalizeWiChildcareFeature(feature(1), c)); }
});
test("WI batch replay conserves every source ID across accepted/quarantine sets and preserves duplicate business IDs", async () => {
  const e = await evidence();
  const original = normalizeWiChildcareAcquisition(e, batchContext);
  assert.equal(original.records.length, 2); assert.equal(original.records[0].external_identifiers[0].value, original.records[1].external_identifiers[0].value);
  e.observations[1].payload.features.find((v) => v.attributes.OBJECTID === 1).attributes.LocationLineAddress1 = "PO Box 1"; rehash(e);
  const r = normalizeWiChildcareAcquisition(e, batchContext);
  assert.equal(r.summary.source_records, 2); assert.equal(r.summary.accepted_records, 1); assert.equal(r.summary.quarantined_records, 1);
  assert.deepEqual([...r.records.map((v) => v.provenance.source_object_id), ...r.quarantine.map((v) => v.source_object_id)].sort(), [1, 2]);
  assert.equal(r.quarantine[0].reason, "nonphysical-address"); assert.equal(r.quarantine[0].export_policy, "internal");
  assert.equal(JSON.stringify(r.quarantine).includes("PO Box"), false);
  assert.equal(r.summary.zip_unavailable_reasons["missing-source-zip"], 1); assert.equal(r.summary.point_unavailable_reasons["source-geometry-missing"], 1);
  assert.equal(r.summary.identity_matching_applied, false); assert.equal(r.summary.release_published, false);
  assert.equal(r.records[0].provenance.observed_at, e.observations[1].observed_at);
});
test("WI invalid ZIPs remain gaps, repeated transformations are deterministic, and invalid evidence/cancellation stop processing", async () => {
  const e = await evidence(); e.observations[1].payload.features[0].attributes.ZipCode = "invalid"; rehash(e);
  const a = normalizeWiChildcareAcquisition(e, batchContext), b = normalizeWiChildcareAcquisition(e, batchContext);
  assert.deepEqual(a, b); assert.equal(a.records.length, 2); assert.equal(a.summary.zip_unavailable_reasons["invalid-source-zip-format"], 1);
  const reprocessed = normalizeWiChildcareAcquisition(e, { ...batchContext, runId: "second-run", processedAt: "2026-09-09T00:00:00.000Z" });
  assert.equal(reprocessed.records[0].provenance.observed_at, a.records[0].provenance.observed_at);
  assert.notEqual(reprocessed.records[0].provenance.processed_at, a.records[0].provenance.processed_at);
  assert.throws(() => normalizeWiChildcareAcquisition(e, batchContext, { signal: AbortSignal.abort() }), { name: "AbortError" });
  e.observations[1].payload_sha256 = "0".repeat(64); assert.throws(() => normalizeWiChildcareAcquisition(e, batchContext), /observation/);
});
test("WI batch processing must follow final acquisition completion, not merely the earlier page observation", async () => {
  const e = await evidence(), completed = "2026-09-08T04:01:00.000Z";
  e.preflight_after.started_at = completed; e.preflight_after.finished_at = completed;
  for (const o of e.preflight_after.observations) o.observed_at = completed;
  e.observed_at = completed;
  assert.throws(() => normalizeWiChildcareAcquisition(e, { ...batchContext, processedAt: "2026-09-08T04:00:30.000Z" }), /completed acquisition/);
  const r = normalizeWiChildcareAcquisition(e, { ...batchContext, processedAt: completed });
  assert.equal(r.records[0].provenance.observed_at, "2026-09-08T04:00:00.000Z");
  assert.equal(r.records[0].provenance.processed_at, completed);
});
