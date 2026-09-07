import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import addFormats from "ajv-formats";
import { normalizeMaChildcareFeature, MA_CHILDCARE_TRANSFORMATION } from "./ma-childcare-normalization.mjs";
import { MA_CHILDCARE_LAYER } from "./ma-childcare-preflight.mjs";
import { reconcileMaChildcareProgram } from "./ma-childcare-registry-adapter.mjs";

function fixture(overrides = {}, release = "a") {
  const manifest = { schema_version: "1.0.0", dataset_id: "ma-licensed-center-based-childcare", connector_id: "ma-licensed-center-based-childcare",
    connector_version: "1.0.1", transformation_version: MA_CHILDCARE_TRANSFORMATION, status: "complete",
    run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", release_id: "ma-childcare-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    source_release_id: `ma-childcare-${release.repeat(64)}`, observed_at: "2026-09-07T12:00:00.000Z", source_url: MA_CHILDCARE_LAYER,
    policy: { profile: "massgis-eec-childcare-local-review@1.0.0", export: "local-review-only",
      owner: "Commonwealth of Massachusetts MassGIS/EEC", terms_url: "https://www.mass.gov/info-details/about-massgis",
      allowed_use: "local governed business-source review", redistribution: "not-authorized-by-this-release",
      retention: "immutable local source evidence; operator-governed deletion", private_fields: "PHONE excluded",
      attribution: "MassGIS (Bureau of Geographic Information), Commonwealth of Massachusetts EOTSS; Massachusetts Department of Early Education and Care (EEC)" },
    claims: { active_business_verified: false, unique_business_identity_verified: false, national_coverage_complete: false,
      current_usps_validity_verified: false, disappearance_means_closure: false } };
  const feature = { attributes: { OBJECTID: 1, PROV_NUM: "P-123", PROG_NAME: "Fixture Childcare", ADDRESS: "10 Main Street", CITY: "Falmouth",
    ZIPCODE: "02536-5023", LICENSED_STATUS: "Current", PROG_TYPE: "Center-based Care", CAPACITY: 25,
    PROG_UM: "Fixture umbrella", LICENSED_FUNDED: "Licensed", MAD_ID: "123", ...overrides }, geometry: { x: -70.6, y: 41.57 } };
  const record = normalizeMaChildcareFeature(feature, { runId: manifest.run_id, sourceReleaseId: manifest.source_release_id,
    observedAt: manifest.observed_at, outputWkid: 4326 });
  return { record, context: { manifest, manifestSha256: "b".repeat(64) } };
}

test("MA registry candidates preserve split postal, geocode, policy and full provenance without identity/ownership inference", () => {
  const { record, context } = fixture(); const original = structuredClone({ record, context });
  const result = reconcileMaChildcareProgram(record, context);
  assert.deepEqual(reconcileMaChildcareProgram(record, context), result);
  assert.deepEqual({ record, context }, original);
  assert.deepEqual(result.entities.map((e) => e.entity_type), ["physical_site", "establishment"]);
  assert.ok(result.entities.every((e) => e.identity_status === "provisional"));
  assert.deepEqual(result.relationships.map((r) => r.relationship_type), ["located_at"]);
  assert.deepEqual(result.matchProfiles, []);
  const by = (predicate) => result.assertions.find((a) => a.predicate === predicate);
  assert.equal(by("site.address").value.zip_code, "02536"); assert.equal(by("site.address").value.zip4, "5023");
  assert.deepEqual(by("site.reported-location").value, record.geocode);
  assert.ok(result.assertions.every((a) => a.value_type !== "geometry" && a.export_policy === "local-review-only"));
  assert.ok(result.assertions.every((a) => a.source.source_record_id === record.source_record_id && a.source.ingest_run_id === context.manifest.run_id));
  assert.ok(result.assertions.every((a) => a.source.policy_id === "massgis-eec-childcare-local-review"));
  assert.equal(result.evidence.policy_profile, "massgis-eec-childcare-local-review@1.0.0");
  assert.equal(by("establishment.source-affiliation").value.parent_company, null);
  by("site.address").value.street = "Mutated output";
  assert.equal(record.physical_address.street, "10 Main Street");
});

test("MA registry candidate IDs distinguish rows and source releases, not provider/address identity", () => {
  const outputs = [fixture(), fixture({ OBJECTID: 2 }), fixture({}, "c")].map(({ record, context }) => reconcileMaChildcareProgram(record, context));
  assert.equal(new Set(outputs.flatMap((r) => r.entities.map((e) => e.entity_id))).size, 6);
});

test("MA registry retains expired, unknown and missing licensing statuses without active-business claims", () => {
  for (const LICENSED_STATUS of ["Current", "Expired", "Renewal in progress", "Regional Enrollment Freeze", "New code", null]) {
    const { record, context } = fixture({ LICENSED_STATUS });
    const result = reconcileMaChildcareProgram(record, context);
    const value = result.assertions.find((a) => a.predicate === "establishment.source-status").value;
    assert.equal(value.status_source, LICENSED_STATUS); assert.equal(value.active_business_verified, false);
    assert.match(result.evidence.assertion_status_semantics, /not operating-business/);
  }
});

test("MA registry rejects malformed context, provenance, policy and normalized mutations", () => {
  for (const mutate of [
    (r, c) => { c.manifestSha256 = "bad"; }, (r, c) => { c.manifest.policy.export = "public"; },
    (r, c) => { c.manifest.claims.active_business_verified = true; }, (r, c) => { c.manifest.source_release_id = `ma-childcare-${"f".repeat(64)}`; },
    (r) => { r.physical_address.zip_code = 2536; }, (r) => { r.physical_address.zip4 = "02536-5023"; },
    (r) => { r.physical_address.postal_code = "02536-5023"; }, (r) => { r.license.active_business_verified = true; },
    (r) => { r.license.status_interpretation = "verified-active"; }, (r) => { r.affiliation.parent_company = "Invented"; },
    (r) => { r.provenance.source_url = "https://example.com"; }, (r) => { r.provenance.input_feature_sha256 = "bad"; },
    (r) => { r.geocode.latitude = "41.57"; }, (r) => { r.PHONE = "private"; },
  ]) {
    const { record, context } = fixture(); mutate(record, context);
    assert.throws(() => reconcileMaChildcareProgram(record, context), /registry candidate rejected/);
  }
  assert.throws(() => reconcileMaChildcareProgram(fixture().record), /manifest context/);
});

test("MA registry candidate entities, assertions and relationships satisfy repository schemas", async () => {
  // Resolve the Ajv 8 peer used by installed ajv-formats, not ESLint's root Ajv 6.
  const require = createRequire(import.meta.url);
  const Ajv2020 = createRequire(require.resolve("ajv-formats/package.json"))("ajv/dist/2020.js").default;
  const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
  const { record, context } = fixture(); const result = reconcileMaChildcareProgram(record, context);
  for (const [name, rows] of [["business-entity", result.entities], ["business-assertion", result.assertions], ["business-relationship", result.relationships]]) {
    const schema = JSON.parse(await readFile(new URL(`../config/schemas/${name}.schema.json`, import.meta.url), "utf8"));
    const validate = ajv.compile(schema);
    for (const row of rows) assert.ok(validate(row), JSON.stringify(validate.errors));
  }
});
