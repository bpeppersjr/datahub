import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { normalizeTnChildcareFeature, TN_CHILDCARE_TRANSFORMATION, TN_CHILDCARE_REPROCESS_TRANSFORMATION } from "./tn-childcare-normalization.mjs";
import { TN_CHILDCARE_SCHEMA, TN_CHILDCARE_WHERE } from "./tn-childcare-preflight.mjs";

const context = { runId: "fixture-run", sourceReleaseId: "fixture-release", observedAt: "2026-09-07T20:00:00.000Z", outputWkid: 4326,
  editingInfo: { lastEditDate: 1788460779896, schemaLastEditDate: 1788460779896, dataLastEditDate: 1788460779896 }, itemModifiedEpochMs: 1788460782000 };
function feature() { return { attributes: { OBJECTID: 1, Provider_ID: 123, Provider_Status: "Active", Provider_Type: "Child Care", Child_Care_Type: "Child Care Center",
  Provider_Name: " Fixture Center ", Street_Address: " 10 Main Street ", Street_Address_2: null, City: "Nashville", State: "TN", Zip: "37201-0123", County: "Davidson" }, geometry: { x: -86.78, y: 36.16, spatialReference: { wkid: 4326, latestWkid: 4326 } } }; }
const normalize = (value = feature(), extra = {}) => normalizeTnChildcareFeature(value, { ...context, ...extra });
const rejected = (mutate, reason) => { const value = feature(); mutate(value); assert.throws(() => normalize(value), (error) => error.code === "TN_CHILDCARE_RECORD_REJECTED" && (!reason || error.reason === reason)); };

test("TN explicit1.0.1 represents missing or exact placeholder ZIP without invention; legacy stays unchanged", () => {
  const ordinary = feature(), legacy = normalize(ordinary);
  assert.deepEqual(normalize(ordinary, { transformationVersion: TN_CHILDCARE_TRANSFORMATION }), legacy);
  assert.equal(Object.hasOwn(legacy.quality, "zip_unavailable_reason"), false);
  for (const Zip of [null, "", "   ", "\u00a0\u2003", "0"]) {
    const raw = feature(); raw.attributes.Zip = Zip; const before = structuredClone(raw);
    assert.throws(() => normalize(raw), (e) => e.code === "TN_CHILDCARE_RECORD_REJECTED");
    const record = normalize(raw, { transformationVersion: TN_CHILDCARE_REPROCESS_TRANSFORMATION });
    assert.deepEqual([record.physical_address.zip_code, record.physical_address.postal_code, record.physical_address.zip4], [null, null, null]);
    assert.equal(record.quality.zip_unavailable_reason, Zip === "0" ? "invalid-source-zip-placeholder" : "missing-source-zip");
    assert.equal(record.provenance.transformation_version, TN_CHILDCARE_REPROCESS_TRANSFORMATION);
    assert.equal(record.provenance.input_feature_sha256, createHash("sha256").update(JSON.stringify(raw)).digest("hex"));
    assert.equal(record.provenance.observed_at, context.observedAt); assert.equal(record.geocode.latitude, 36.16); assert.deepEqual(raw, before);
  }
  const current = normalize(ordinary, { transformationVersion: TN_CHILDCARE_REPROCESS_TRANSFORMATION });
  assert.equal(current.quality.zip_unavailable_reason, null); current.provenance.transformation_version = TN_CHILDCARE_TRANSFORMATION; delete current.quality.zip_unavailable_reason;
  assert.deepEqual(current, legacy);
});
test("TN1.0.1 does not expand malformed ZIPs required premises scope or other text rules", () => {
  const extra = { transformationVersion: TN_CHILDCARE_REPROCESS_TRANSFORMATION };
  for (const Zip of ["00000", "00", "0 ", " 0", "372010123", "37201-123", "37201+0123", "n/a", 0, undefined, " ".repeat(8001), "\u0000", "\n", "\t", "\r", " \t\n ", "37201\n"]) {
    const raw = feature(); raw.attributes.Zip = Zip; assert.throws(() => normalize(raw, extra), (e) => e.code === "TN_CHILDCARE_RECORD_REJECTED");
  }
  for (const field of ["Provider_Name", "Street_Address", "City", "State"]) for (const value of [null, "", "\t", "name\nprivate"]) {
    const raw = feature(); raw.attributes.Zip = "0"; raw.attributes[field] = value; assert.throws(() => normalize(raw, extra));
  }
  const raw = feature(); raw.attributes.Zip = "0"; raw.attributes.Child_Care_Type = "Family Child Care Home"; assert.throws(() => normalize(raw, extra));
  for (const transformationVersion of ["1.0.1", "tn-childcare-normalization@1.0.2", 1, null]) assert.throws(() => normalize(feature(), { transformationVersion }), /version/);
});

test("TN normalization preserves exact source provenance, split postal fields and unverified source status", () => {
  const value = feature(), original = structuredClone(value), result = normalize(value);
  assert.equal(TN_CHILDCARE_SCHEMA.length, 12); assert.deepEqual(value, original); assert.deepEqual(result, normalize(value));
  assert.equal(result.business_name, "Fixture Center"); assert.equal(result.physical_address.street, "10 Main Street");
  assert.deepEqual([result.physical_address.zip_code, result.physical_address.postal_code, result.physical_address.zip4], ["37201", "37201", "0123"]);
  assert.deepEqual(result.external_identifiers, [{ type: "tennessee_dhs_provider_id", value: "123" }]);
  assert.equal(result.source_record_id, "fixture-release:object:1"); assert.equal(result.provenance.ingest_run_id, context.runId);
  assert.equal(result.provenance.observed_at, context.observedAt); assert.equal(result.provenance.source_filter, TN_CHILDCARE_WHERE);
  assert.equal(result.provenance.input_feature_sha256, createHash("sha256").update(JSON.stringify(value)).digest("hex"));
  assert.equal(result.provenance.transformation_version, TN_CHILDCARE_TRANSFORMATION);
  assert.deepEqual(result.provenance.publisher_editing_info, context.editingInfo);
  assert.equal(result.source_status.status_source, "Active"); assert.equal(result.source_status.active_business_verified, false);
  assert.equal(result.export_policy, "local-review-only"); assert.equal(result.affiliation.parent_company, null);
  assert.equal(result.provenance.policy_profile, "tn-childcare-local-review@1.0.0");
  assert.equal(result.physical_address.county_source, "Davidson"); assert.equal(result.quality.geographic_boundary_verified, false);
  for (const forbidden of ["geometry", "license", "capacity", "license_number"]) assert.equal(Object.hasOwn(result, forbidden), false);
});

test("TN missing optional provider ID, county, street2 and point remain missing without enrichment", () => {
  const value = feature(); Object.assign(value.attributes, { Provider_ID: null, County: null, Street_Address_2: "  ", Zip: "37201" }); value.geometry = null;
  const result = normalize(value); assert.deepEqual(result.external_identifiers, []); assert.equal(result.quality.provider_identifier_missing, true);
  assert.equal(result.physical_address.zip4, null); assert.equal(result.physical_address.county_source, null); assert.equal(result.physical_address.street2, null);
  assert.equal(result.geocode.latitude, null); assert.equal(result.geocode.longitude, null);
  delete value.geometry; assert.deepEqual(normalize(value).geocode, result.geocode);
  const minimal = { ...context }; delete minimal.editingInfo; delete minimal.itemModifiedEpochMs;
  assert.equal(normalizeTnChildcareFeature(value, minimal).provenance.publisher_editing_info, null);
});

test("TN rejects undeclared/private/nested fields rather than flattening them", () => {
  for (const mutate of [v => { v.attributes.owner = "PRIVATE"; }, v => { v.director = "PRIVATE"; }, v => { delete v.attributes.County; },
    v => { v.attributes.Provider_Name = { owner: "PRIVATE" }; }, v => { v.attributes.Street_Address = ["PRIVATE"]; }, v => { v.attributes.Provider_ID = {}; },
    v => { v.geometry.owner = "PRIVATE"; }, v => { v.geometry.spatialReference.private = "PRIVATE"; }]) rejected(mutate);
});

test("TN rejects scope expansion and nonphysical or malformed premises", () => {
  for (const value of ["Family Child Care Home", "Group Child Care Home", "Drop-in Child Care Center", "Child Care Center "]) rejected(v => { v.attributes.Child_Care_Type = value; }, "source-scope-drift");
  rejected(v => { v.attributes.Provider_Type = "Authorized Provider"; }, "source-scope-drift");
  rejected(v => { v.attributes.Provider_Status = "Inactive"; }, "source-scope-drift");
  rejected(v => { v.attributes.State = "KY"; }, "source-state-drift");
  for (const value of ["PO Box 12", "P.O. BOX 1", "Post Office Box 2", "General Delivery"]) rejected(v => { v.attributes.Street_Address = value; }, "nonphysical-address");
  for (const field of ["Provider_Name", "Street_Address", "City", "Zip"]) for (const value of [null, "", " "]) rejected(v => { v.attributes[field] = value; });
});

test("TN accepts only explicit ZIP5 or hyphenated ZIP4 and bounded control-free scalar texts", () => {
  for (const value of ["00000", "3720", "372010123", "37201-123", "37201-01234", "37201+0123", 37201]) rejected(v => { v.attributes.Zip = value; });
  for (const value of ["x".repeat(8001), "name\nprivate", "name\u0000", "name\u007f"]) rejected(v => { v.attributes.Provider_Name = value; }, "invalid-text");
  for (const field of ["OBJECTID", "Provider_ID"]) for (const value of [0, -1, 1.2, "123", Number.MAX_SAFE_INTEGER + 1]) rejected(v => { v.attributes[field] = value; });
});

test("TN coordinates require explicit WGS84 finite point pairs inside broad plausibility bounds", () => {
  for (const geometry of [{ x: -86, y: null }, { x: null, y: 36 }, { x: "-86", y: 36 }, { x: -92, y: 36 }, { x: -80, y: 36 }, { x: -86, y: 33 }, { x: -86, y: 38 }, { x: -86, y: NaN }, [],
    { x: -86, y: 36, spatialReference: { wkid: 3857 } }, { x: -86, y: 36, spatialReference: { wkid: 4326, latestWkid: 3857 } }]) rejected(v => { v.geometry = geometry; }, "invalid-source-coordinate");
  assert.throws(() => normalize(feature(), { outputWkid: 3857 }), /WGS84/);
});

test("TN rejects invalid observation and publisher timestamps without inventing license dates", () => {
  for (const observedAt of ["2026-02-30T20:00:00.000Z", "2026-09-07", "2026-09-07T20:00:00.000-05:00", "not-a-date"]) assert.throws(() => normalize(feature(), { observedAt }), /timestamp/);
  for (const value of [0, -1, "1788460782000", 1.2, Number.MAX_SAFE_INTEGER]) assert.throws(() => normalize(feature(), { itemModifiedEpochMs: value }), /timestamp/);
  for (const editingInfo of [{}, { ...context.editingInfo, private: "PRIVATE" }, { ...context.editingInfo, lastEditDate: null }]) assert.throws(() => normalize(feature(), { editingInfo }), /timestamp/);
  for (const runId of ["", " x ", "x\n", "x".repeat(256)]) assert.throws(() => normalize(feature(), { runId }), /bounded text/);
  assert.throws(() => normalize(feature(), { token: "PRIVATE" }), /Unsupported/);
});
