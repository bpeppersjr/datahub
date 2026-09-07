import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMaChildcareFeature } from "./ma-childcare-normalization.mjs";

const context = { runId: "fixture-run", sourceReleaseId: "fixture-source", observedAt: "2026-09-07T12:00:00Z", outputWkid: 4326 };
function feature(overrides = {}) {
  return { attributes: { OBJECTID: 1, PROV_NUM: "P-123", PROG_NAME: "Fixture Childcare", ADDRESS: "10 Main Street", CITY: "Falmouth",
    ZIPCODE: "02536-5023", LICENSED_STATUS: "Current", PROG_TYPE: "Center-based Care", CAPACITY: 25, PROG_UM: "Fixture umbrella",
    LICENSED_FUNDED: "Licensed", MAD_ID: "123", ...overrides }, geometry: { x: -70.6, y: 41.57 } };
}
test("Massachusetts childcare preserves split ZIP, source location and licensing provenance", () => {
  const result = normalizeMaChildcareFeature(feature(), context);
  assert.equal(result.physical_address.zip_code, "02536"); assert.equal(result.physical_address.postal_code, "02536"); assert.equal(result.physical_address.zip4, "5023");
  assert.equal(result.geocode.latitude, 41.57); assert.equal(result.geocode.longitude, -70.6);
  assert.equal("geometry" in result, false); assert.equal(result.license.active_business_verified, false);
  assert.equal(result.affiliation.parent_company, null); assert.equal(result.affiliation.program_umbrella_source, "Fixture umbrella");
  assert.equal(result.provenance.ingest_run_id, "fixture-run"); assert.equal(result.provenance.source_release_id, "fixture-source");
  assert.match(result.provenance.input_feature_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.export_policy, "local-review-only");
});
test("Massachusetts childcare rejects privacy, schema and population-scope drift", () => {
  for (const changes of [{ PHONE: "private" }, { PROG_TYPE: "Family-based Care" }, { LICENSED_FUNDED: "Funded" }, { OBJECTID: "1" }, { PROG_NAME: "" }, { PROV_NUM: "" }, { ADDRESS: "PO Box 22" }]) {
    assert.throws(() => normalizeMaChildcareFeature(feature(changes), context), { code: "MA_CHILDCARE_RECORD_REJECTED" });
  }
  const missing = feature(); delete missing.attributes.MAD_ID;
  assert.throws(() => normalizeMaChildcareFeature(missing, context), /selected-field-drift/);
  assert.throws(() => normalizeMaChildcareFeature(feature({ PROG_NAME: "sensitive\nvalue" }), context), (error) => !error.message.includes("sensitive"));
});
test("Massachusetts childcare does not guess postal extensions, capacity or coordinates", () => {
  const plain = normalizeMaChildcareFeature(feature({ ZIPCODE: "02536", CAPACITY: null }), context);
  assert.equal(plain.physical_address.zip4, null); assert.equal(plain.license.licensed_capacity, null);
  for (const ZIPCODE of [2536, "2536", "025365023", "00000", "02536-23", null]) assert.throws(() => normalizeMaChildcareFeature(feature({ ZIPCODE }), context));
  for (const CAPACITY of [-1, "25", 1.5, Infinity]) assert.throws(() => normalizeMaChildcareFeature(feature({ CAPACITY }), context), /invalid-capacity/);
  for (const geometry of [{ x: "-70", y: 41 }, { x: 200, y: 41 }, { x: 0, y: 0 }, { x: -70, y: NaN }, { x: 200000, y: 800000 }, { x: -70, y: 41, spatialReference: { wkid: 26986 } }, { x: -70, y: 41, spatialReference: { wkid: 4326, latestWkid: 26986 } }]) {
    assert.throws(() => normalizeMaChildcareFeature({ ...feature(), geometry }, context), /invalid-source-coordinate/);
  }
  const absent = normalizeMaChildcareFeature({ ...feature(), geometry: null }, context);
  assert.equal(absent.geocode.latitude, null); assert.equal(absent.geocode.status, "missing-source-point");
});
test("Massachusetts childcare preserves unknown, missing and non-current statuses without activity claims", () => {
  for (const LICENSED_STATUS of ["Current", "Expired", "Regional Enrollment Freeze", "Renewal in progress", "New publisher code", null]) {
    const row = normalizeMaChildcareFeature(feature({ LICENSED_STATUS }), context);
    assert.equal(row.license.status_source, LICENSED_STATUS); assert.equal(row.license.active_business_verified, false);
  }
  assert.equal(normalizeMaChildcareFeature(feature({ LICENSED_STATUS: "New publisher code" }), context).license.status_interpretation, "unmapped-source-status");
  assert.throws(() => normalizeMaChildcareFeature(feature(), { ...context, outputWkid: 26986 }), /WGS84/);
  assert.throws(() => normalizeMaChildcareFeature(feature(), { ...context, sourceReleaseId: null }), /sourceReleaseId/);
  assert.throws(() => normalizeMaChildcareFeature(feature(), { ...context, observedAt: "yesterday" }), /UTC/);
  assert.throws(() => normalizeMaChildcareFeature(feature(), { ...context, observedAt: "2026-02-30T12:00:00Z" }), /UTC/);
});
test("Massachusetts childcare retains same-address program rows without inventing canonical merges", () => {
  const first = normalizeMaChildcareFeature(feature(), context);
  const second = normalizeMaChildcareFeature(feature({ OBJECTID: 2, PROV_NUM: "P-124" }), context);
  assert.notEqual(first.source_record_id, second.source_record_id);
  assert.deepEqual(first.physical_address, second.physical_address);
  assert.equal(first.quality.unique_business_identity_verified, false);
});
