import test from "node:test";
import assert from "node:assert/strict";
import { NJ_CHILDCARE_SCHEMA } from "./nj-childcare-preflight.mjs";
import { normalizeNjChildcareFeature } from "./nj-childcare-normalization.mjs";

const context = { runId: "fixture-run", sourceReleaseId: "fixture-release", observedAt: "2026-09-07T00:00:00.000Z", outputWkid: 4326, downloadDateEpochMs: 1786463205000 };
function fixture() {
  return { attributes: { ...Object.fromEntries(NJ_CHILDCARE_SCHEMA.map(([name]) => [name, null])), OBJECTID: 1,
    center_id: "00012", center_name: "Example Center", address: "10 Example Street", city: "Trenton", state: "NJ",
    zip: "08625-0123", licensed_capacity: 20, foips: "Y", download_date: context.downloadDateEpochMs },
  geometry: { x: -74.76, y: 40.22, spatialReference: { wkid: 4326 } } };
}
test("NJ normalization keeps postal components, source identifiers and lat/lon without ownership or status inference", () => {
  const input = fixture(), saved = structuredClone(input), record = normalizeNjChildcareFeature(input, context);
  assert.deepEqual(input, saved);
  assert.equal(record.physical_address.zip_code, "08625"); assert.equal(record.physical_address.postal_code, "08625");
  assert.equal(record.physical_address.zip4, "0123"); assert.equal(record.external_identifiers[0].value, "00012");
  assert.equal(record.geocode.latitude, 40.22); assert.equal(record.geometry, undefined);
  assert.equal(record.industry.public_school_facility_source, "Y"); assert.equal(record.license.active_business_verified, false);
  assert.equal(record.affiliation.parent_company, null); assert.equal(record.export_policy, "local-review-only");
  assert.equal(record.provenance.publisher_metadata_required, true);
  assert.match(record.provenance.input_feature_sha256, /^[a-f0-9]{64}$/);
});
test("NJ nullable coordinates and license dates remain unknown; unusual FOIPS values are preserved", () => {
  const input = fixture(); input.geometry = null; input.attributes.zip = "08625"; input.attributes.foips = "Unknown";
  const result = normalizeNjChildcareFeature(input, context);
  assert.equal(result.geocode.latitude, null); assert.equal(result.physical_address.zip4, null);
  assert.equal(result.license.approval_date_epoch_ms, null); assert.equal(result.industry.public_school_facility_source, "Unknown");
});
test("NJ license dates preserve valid pre-1970 epochs without inventing a source date floor", () => {
  const input = fixture(); input.attributes.license_approval_date = -31536000000; input.attributes.license_renewal_date = 0;
  const record = normalizeNjChildcareFeature(input, context);
  assert.equal(record.license.approval_date_epoch_ms, -31536000000);
  assert.equal(record.license.renewal_date_epoch_ms, 0);
});
test("NJ rejects private or missing fields, state drift, nonphysical and malformed postal addresses", () => {
  for (const change of [a => a.owner = "private", a => delete a.center_id, a => a.state = "NY", a => a.address = "PO BOX 1",
    a => a.zip = 8625, a => a.zip = "086250123", a => a.zip = "00000", a => a.center_name = "bad\nname"]) {
    const input = fixture(); change(input.attributes);
    assert.throws(() => normalizeNjChildcareFeature(input, context), { code: "NJ_CHILDCARE_RECORD_REJECTED" });
  }
});
test("NJ rejects invalid dates, capacity and coordinate evidence without guessing", () => {
  for (const change of [f => f.attributes.download_date++, f => f.attributes.license_renewal_date = "2026-01-01",
    f => f.attributes.licensed_capacity = -1, f => f.geometry.x = Infinity, f => f.geometry.y = 50,
    f => f.geometry.spatialReference.wkid = 3857, f => f.geometry.spatialReference.owner = "private", f => f.geometry.rings = []]) {
    const input = fixture(); change(input); assert.throws(() => normalizeNjChildcareFeature(input, context), { code: "NJ_CHILDCARE_RECORD_REJECTED" });
  }
});
test("NJ provenance requires canonical observation and explicit coordinate/date context", () => {
  for (const change of [{ runId: "" }, { observedAt: "2026-02-30T00:00:00.000Z" }, { outputWkid: 3857 }, { downloadDateEpochMs: null }]) {
    assert.throws(() => normalizeNjChildcareFeature(fixture(), { ...context, ...change }));
  }
  assert.notEqual(normalizeNjChildcareFeature(fixture(), context).source_record_id,
    normalizeNjChildcareFeature(fixture(), { ...context, sourceReleaseId: "later-release" }).source_record_id);
});
