import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { normalizeMiChildcareFeature, MI_CHILDCARE_TRANSFORMATION } from "./mi-childcare-normalization.mjs";

// Invented conformance fixture, not an observed Michigan publisher record.
const feature = () => ({ attributes: { OBJECTID: 7, LicenseNumber: "001234", FacilityName: "Synthetic Center", StreetAddress: "1 Synthetic Street",
  City: "Synthetic City", State: "MI", ZIPCode: "49901-0023", CountyCode: "SOURCE-ONLY", FacilityTypeCode: "DC", FacilityType: "Center", Capacity: 0,
  Latitude: 47.2, Longitude: -88.4 } });
const context = () => ({ runId: "synthetic-run-1", sourceReleaseId: "mi-childcare-synthetic-release", observedAt: "2026-09-08T00:00:00.000Z", itemModifiedEpochMs: 1775844000000 });
const normalize = f => normalizeMiChildcareFeature(f, context());

test("MI synthetic center preserves license zeros, separate postal fields and unverified UP coordinates", () => {
  const f = feature(), before = structuredClone(f), ctx = context(), row = normalizeMiChildcareFeature(f, ctx);
  assert.deepEqual(row.external_identifiers, [{ type: "michigan_mileap_childcare_license_number", value: "001234" }]);
  assert.equal(row.physical_address.zip_code, "49901"); assert.equal(row.physical_address.postal_code, "49901"); assert.equal(row.physical_address.zip4, "0023");
  assert.equal(row.geocode.latitude, 47.2); assert.equal(row.geocode.crs, null); assert.equal(row.geocode.governed_geographic_assignment_eligible, false);
  assert.equal(row.physical_address.county_code_source, "SOURCE-ONLY"); assert.equal(row.source_status.capacity_source, 0);
  assert.equal(row.source_status.status_source, null); assert.equal(row.source_status.active_business_verified, false);
  assert.equal(row.provenance.transformation_version, MI_CHILDCARE_TRANSFORMATION); assert.equal(row.provenance.observed_at, ctx.observedAt);
  assert.equal(row.provenance.input_feature_sha256, createHash("sha256").update(JSON.stringify(f)).digest("hex"));
  assert.equal(row.provenance.policy_status, "proposed-not-approved"); assert.equal(row.provenance.legal_approval, false); assert.equal(row.provenance.export_authorized, false);
  assert.equal(row.export_policy, "local-review-only"); assert.equal(row.affiliation.parent_company, null);
  assert.equal(row.quality.source_freshness_verified, false); assert.equal(row.provenance.publisher_source_updated_at, null);
  assert.equal(Object.hasOwn(row, "geometry"), false); assert.deepEqual(f, before); assert.deepEqual(normalize(f), row);
});

test("MI missing ZIP, identifier and paired coordinate gaps remain explicit without inference", () => {
  for (const missing of [null, "", "   "]) {
    const f = feature(); f.attributes.ZIPCode = missing; f.attributes.LicenseNumber = missing; f.attributes.CountyCode = missing; f.attributes.Capacity = null;
    f.attributes.Latitude = null; f.attributes.Longitude = null;
    const row = normalize(f); assert.equal(row.physical_address.zip_code, null); assert.equal(row.physical_address.postal_code, null); assert.equal(row.physical_address.zip4, null);
    assert.equal(row.quality.zip_unavailable_reason, "missing-source-zip"); assert.equal(row.quality.license_identifier_missing, true);
    assert.deepEqual(row.external_identifiers, []); assert.equal(row.geocode.latitude, null); assert.equal(row.geocode.longitude, null);
  }
  const f = feature(); f.attributes.ZIPCode = " 49901 "; assert.equal(normalize(f).physical_address.zip4, null);
});

test("MI rejects malformed ZIPs including unproven zero placeholders and typed or partial coordinates", () => {
  for (const zip of ["0", "00000", "499010023", "49901-23", 49901, {}, "\t", "4990"]) {
    const f = feature(); f.attributes.ZIPCode = zip; assert.throws(() => normalize(f), { code: "MI_CHILDCARE_RECORD_REJECTED" });
  }
  for (const pair of [[null, -88], [47, null], ["47", -88], [NaN, -88], [Infinity, -88], [0, 0], [50, -88], [47, -92], [47, -81]]) {
    const f = feature(); [f.attributes.Latitude, f.attributes.Longitude] = pair;
    assert.throws(() => normalize(f), { reason: "invalid-source-coordinate" });
  }
});

test("MI rejects private nested missing attributes geometry and raw scope drift", () => {
  for (const mutate of [f => { f.attributes.Owner = "PRIVATE"; }, f => { delete f.attributes.City; }, f => { f.geometry = null; }, f => { f.geometry = { x: -88, y: 47 }; },
    f => { f.attributes.LicenseNumber = { value: "PRIVATE" }; }, f => { f.attributes.FacilityTypeCode = "DC "; }, f => { f.attributes.FacilityType = "Home"; },
    f => { f.attributes.State = "mi"; }, f => { f.attributes.Latitude = {}; }, f => { f.extra = "PRIVATE"; }]) {
    const f = feature(); mutate(f); assert.throws(() => normalize(f), error => error.code === "MI_CHILDCARE_RECORD_REJECTED" && !error.message.includes("PRIVATE"));
  }
});

test("MI validates bounded source scalars premises capacity and source-row identity", () => {
  for (const [key, value] of [["OBJECTID", 0], ["OBJECTID", 1.2], ["LicenseNumber", 123], ["LicenseNumber", "0".repeat(26)], ["FacilityName", " "] ,
    ["StreetAddress", "PO Box 123"], ["StreetAddress", "General Delivery"], ["City", "\nPRIVATE"], ["CountyCode", "x".repeat(51)],
    ["Capacity", -1], ["Capacity", 32768], ["Capacity", "12"], ["Capacity", 1.2]]) {
    const f = feature(); f.attributes[key] = value; assert.throws(() => normalize(f), { code: "MI_CHILDCARE_RECORD_REJECTED" });
  }
  const f = feature(), first = normalize(f); f.attributes.OBJECTID++;
  assert.notEqual(normalize(f).source_record_id, first.source_record_id);
  assert.notEqual(normalizeMiChildcareFeature(feature(), { ...context(), sourceReleaseId: "next-release" }).source_record_id, first.source_record_id);
});

test("MI rejects invalid provenance clocks or context overrides without substituting freshness", () => {
  for (const change of [{ observedAt: "2026-09-08" }, { observedAt: "2026-09-08T00:00:00Z" }, { observedAt: "bad" }, { runId: " " }, { sourceReleaseId: "x\n" },
    { itemModifiedEpochMs: "1775844000000" }, { itemModifiedEpochMs: -1 }, { itemModifiedEpochMs: Infinity }, { outputWkid: 4326 }, { transformationVersion: "future" }]) {
    assert.throws(() => normalizeMiChildcareFeature(feature(), { ...context(), ...change }));
  }
  for (const ctx of [null, [], {}]) assert.throws(() => normalizeMiChildcareFeature(feature(), ctx));
  const row = normalizeMiChildcareFeature(feature(), { ...context(), itemModifiedEpochMs: null });
  assert.equal(row.provenance.publisher_item_modified_epoch_ms, null); assert.equal(row.provenance.observed_at, context().observedAt);
});
