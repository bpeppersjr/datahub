import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import addFormats from "ajv-formats";
import { normalizeNjChildcareFeature, NJ_CHILDCARE_TRANSFORMATION } from "./nj-childcare-normalization.mjs";
import { NJ_CHILDCARE_LAYER, NJ_CHILDCARE_ITEM_URL } from "./nj-childcare-preflight.mjs";
import { reconcileNjChildcareCenter } from "./nj-childcare-registry-adapter.mjs";

function fixture(overrides = {}, release = "a", version = "1.0.0", geometry = { x: -74.76, y: 40.22 }) {
  const runId = version === "1.0.0" ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const manifest = { schema_version: "1.0.0", dataset_id: "nj-licensed-childcare-centers", connector_id: "nj-licensed-childcare-centers",
    connector_version: version, transformation_version: `nj-childcare-normalization@${version}`, status: "complete",
    run_id: runId, release_id: `nj-childcare-${runId}`,
    source_release_id: `nj-childcare-${release.repeat(64)}`, observed_at: "2026-09-07T12:00:00.000Z", source_url: NJ_CHILDCARE_LAYER,
    policy: { profile: "njdep-childcare-local-review@1.0.0", export: "local-review-only",
      owner: "New Jersey Department of Environmental Protection / Department of Children and Families",
      terms_url: NJ_CHILDCARE_ITEM_URL, allowed_use: "local governed business-source review",
      redistribution: "not-authorized-by-this-release", retention: "immutable local evidence; operator-governed deletion",
      private_fields: "owner, director, center_phone and center_email excluded",
      attribution: "New Jersey Department of Environmental Protection; New Jersey Department of Children and Families",
      publisher_notices: "Complete distribution terms are retained in source-observation.json item payloads and publisher-metadata.xml; authorized publication must carry prescribed publisher credit/disclaimers and accompanying metadata.",
      legal_approval: false },
    claims: { active_business_verified: false, unique_business_identity_verified: false, national_coverage_complete: false,
      current_usps_validity_verified: false, disappearance_means_closure: false } };
  if (version === "1.0.1") Object.assign(manifest, { processed_at: "2026-09-07T13:00:00.000Z",
    reprocessing: { mode: "local-retained-evidence", network_requests: 0,
      parent_release_id: "nj-childcare-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", parent_source_release_id: manifest.source_release_id,
      parent_manifest_sha256: "d".repeat(64), parent_manifest_artifact: "reprocessing-parent-manifest.json",
      parent_transformation_version: NJ_CHILDCARE_TRANSFORMATION } });
  const feature = { attributes: { OBJECTID: 1, center_id: "00012", center_name: "Fixture Childcare", address: "10 Main Street", address2: "Suite 2",
    city: "Trenton", county: "Mercer", state: "NJ", zip: "08625-5023", licensed_capacity: 25, age_range: "2-5",
    months_operational: "Year-round", sessions: "Morning", license_approval_date: -31536000000, license_renewal_date: 0,
    foips: "Y", location_reference_desc: "Building", coord_source_type_desc: "GPS", coord_sys_desc: "Web Mercator",
    coord_source_org_desc: "NJDEP", download_date: 1786463205000, ...overrides }, geometry };
  const record = normalizeNjChildcareFeature(feature, { runId: manifest.run_id, sourceReleaseId: manifest.source_release_id,
    observedAt: manifest.observed_at, outputWkid: 4326, downloadDateEpochMs: feature.attributes.download_date, transformationVersion: manifest.transformation_version });
  return { record, context: { manifest, manifestSha256: "b".repeat(64) } };
}

test("NJ registry candidates preserve split postal, geocode, policy and full provenance without identity/ownership inference", () => {
  const { record, context } = fixture(); const original = structuredClone({ record, context });
  const result = reconcileNjChildcareCenter(record, context);
  assert.deepEqual(reconcileNjChildcareCenter(record, context), result);
  assert.deepEqual({ record, context }, original);
  assert.deepEqual(result.entities.map((e) => e.entity_type), ["physical_site", "establishment"]);
  assert.ok(result.entities.every((e) => e.identity_status === "provisional"));
  assert.deepEqual(result.relationships.map((r) => r.relationship_type), ["located_at"]);
  assert.deepEqual(result.matchProfiles, []);
  const by = (predicate) => result.assertions.find((a) => a.predicate === predicate);
  assert.equal(by("site.address").value.zip_code, "08625"); assert.equal(by("site.address").value.zip4, "5023");
  assert.deepEqual(by("site.reported-location").value, record.geocode);
  assert.ok(result.assertions.every((a) => a.value_type !== "geometry" && a.export_policy === "local-review-only"));
  assert.ok(result.assertions.every((a) => a.source.source_record_id === record.source_record_id && a.source.ingest_run_id === context.manifest.run_id));
  assert.ok(result.assertions.every((a) => a.source.policy_id === "njdep-childcare-local-review"));
  assert.equal(result.evidence.policy_profile, "njdep-childcare-local-review@1.0.0");
  assert.match(result.evidence.confidence_semantics, /not verified operation, identity/);
  assert.deepEqual(result.evidence.normalized_provenance, record.provenance);
  assert.equal(by("establishment.source-affiliation").value.parent_company, null);
  by("site.address").value.street = "Mutated output";
  assert.equal(record.physical_address.street, "10 Main Street");
});

test("NJ registry candidate IDs distinguish rows and source releases, not provider/address identity", () => {
  const outputs = [fixture(), fixture({ OBJECTID: 2 }), fixture({}, "c")].map(({ record, context }) => reconcileNjChildcareCenter(record, context));
  assert.equal(new Set(outputs.flatMap((r) => r.entities.map((e) => e.entity_id))).size, 6);
});

test("NJ registry preserves FOIPS, pre-epoch license dates and nullable publisher points without inference", () => {
  for (const foips of ["Y", "N", "Unknown", null]) {
    const { record, context } = fixture({ foips }, "a", "1.0.0", null);
    const result = reconcileNjChildcareCenter(record, context);
    const by = (predicate) => result.assertions.find((a) => a.predicate === predicate).value;
    assert.equal(by("establishment.source-classification").public_school_facility_source, foips);
    assert.equal(by("establishment.source-status").approval_date_epoch_ms, -31536000000);
    assert.equal(by("establishment.source-status").renewal_date_epoch_ms, 0);
    assert.equal(by("establishment.source-status").active_business_verified, false);
    assert.equal(by("site.reported-location").latitude, null);
  }
});

test("NJ reprocessed candidates retain source-row IDs and separate processing lineage from source observation", () => {
  const old = fixture(), current = fixture({}, "a", "1.0.1");
  const a = reconcileNjChildcareCenter(old.record, old.context), b = reconcileNjChildcareCenter(current.record, current.context);
  assert.deepEqual(a.entities, b.entities);
  assert.deepEqual(a.relationships.map((r) => r.relationship_id), b.relationships.map((r) => r.relationship_id));
  assert.deepEqual(a.assertions.map((r) => r.assertion_id), b.assertions.map((r) => r.assertion_id));
  assert.notEqual(a.assertions[0].source.ingest_run_id, b.assertions[0].source.ingest_run_id);
  assert.equal(b.evidence.processed_at, current.context.manifest.processed_at);
  assert.deepEqual(b.evidence.reprocessing, current.context.manifest.reprocessing);
  assert.ok(b.assertions.every((assertion) => assertion.observed_at === old.context.manifest.observed_at));
  const multiline = fixture({ sessions: "Morning\\nAfternoon" }, "a", "1.0.1");
  const c = reconcileNjChildcareCenter(multiline.record, multiline.context);
  assert.deepEqual(c.entities, b.entities);
  assert.equal(c.assertions.find((r) => r.predicate === "establishment.source-classification").value.sessions_source, "Morning\\nAfternoon");
  assert.notEqual(c.assertions.find((r) => r.predicate === "establishment.source-classification").assertion_id,
    b.assertions.find((r) => r.predicate === "establishment.source-classification").assertion_id);
  b.evidence.reprocessing.parent_manifest_sha256 = "mutated output";
  assert.equal(current.context.manifest.reprocessing.parent_manifest_sha256, "d".repeat(64));
});

test("NJ reprocessed manifest versions and lineage fail closed", () => {
  for (const mutate of [
    (m) => { m.transformation_version = NJ_CHILDCARE_TRANSFORMATION; }, (m) => { delete m.reprocessing; },
    (m) => { m.reprocessing.parent_manifest_artifact = "../outside"; }, (m) => { m.reprocessing.parent_source_release_id = "wrong"; },
    (m) => { m.reprocessing.parent_release_id = m.release_id; }, (m) => { m.reprocessing.parent_manifest_sha256 = "bad"; },
    (m) => { m.reprocessing.network_requests = 1; }, (m) => { m.processed_at = "2026-09-07T11:00:00.000Z"; },
    (m) => { m.processed_at = "2026-09-07T13:00:00Z"; }, (m) => { m.reprocessing.extra = "unapproved"; },
  ]) { const { record, context } = fixture({}, "a", "1.0.1"); mutate(context.manifest); assert.throws(() => reconcileNjChildcareCenter(record, context)); }
});

test("NJ registry rejects malformed context, provenance, policy and normalized mutations", () => {
  for (const mutate of [
    (r, c) => { c.manifestSha256 = "bad"; }, (r, c) => { c.manifest.policy.export = "public"; },
    (r, c) => { c.manifest.claims.active_business_verified = true; }, (r, c) => { c.manifest.source_release_id = `nj-childcare-${"f".repeat(64)}`; },
    (r) => { r.physical_address.zip_code = 2536; }, (r) => { r.physical_address.zip4 = "08625-5023"; },
    (r) => { r.physical_address.postal_code = "08625-5023"; }, (r) => { r.license.active_business_verified = true; },
    (r) => { r.license.status_interpretation = "verified-active"; }, (r) => { r.affiliation.parent_company = "Invented"; },
    (r) => { r.provenance.source_url = "https://example.com"; }, (r) => { r.provenance.input_feature_sha256 = "bad"; },
    (r) => { r.geocode.latitude = "41.57"; }, (r) => { r.center_phone = "private"; },
  ]) {
    const { record, context } = fixture(); mutate(record, context);
    assert.throws(() => reconcileNjChildcareCenter(record, context), /registry candidate rejected/);
  }
  assert.throws(() => reconcileNjChildcareCenter(fixture().record), /manifest context/);
});

test("NJ registry candidate entities, assertions and relationships satisfy repository schemas", async () => {
  // Resolve the Ajv 8 peer used by installed ajv-formats, not ESLint's root Ajv 6.
  const require = createRequire(import.meta.url);
  const Ajv2020 = createRequire(require.resolve("ajv-formats/package.json"))("ajv/dist/2020.js").default;
  const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
  for (const version of ["1.0.0", "1.0.1"]) {
    const { record, context } = fixture({}, "a", version); const result = reconcileNjChildcareCenter(record, context);
    for (const [name, rows] of [["business-entity", result.entities], ["business-assertion", result.assertions], ["business-relationship", result.relationships]]) {
      const schema = JSON.parse(await readFile(new URL(`../config/schemas/${name}.schema.json`, import.meta.url), "utf8"));
      const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
      for (const row of rows) assert.ok(validate(row), JSON.stringify(validate.errors));
    }
  }
});

