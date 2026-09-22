import assert from "node:assert/strict";
import test from "node:test";
import { createZipInspectorView } from "./zip-inspector-view.mjs";

const bindings = { audit_id: "audit-1", release_id: "registry-1", pointer_sha256: "p", manifest_sha256: "m", zip_artifact_sha256: "z" };
function quality(zip, { classification = "valid-format-same-code-governed-zcta", status = "record-level-source-contribution", included = true, contributions = [{ source_id: "source-a", source_release_id: "source-r1", positive_counts: { record_count: 3 } }] } = {}) {
  if (!zip) return { schema_version: "1.0.0", bindings, zip5: "12345", found: false };
  return { schema_version: "1.0.0", bindings, zip5: zip, found: true,
    classification: { class: classification, ordinary_zip5_eligible: classification !== "explicit-placeholder" },
    registry_coverage_status: status, postal_fields: { zip_code: zip, zip4: null }, split_postal_contract: { status: "passed" },
    governed_zcta_membership: included ? { status: "included", geo_id: `zcta:${zip}`, geoid: zip, source_release_id: "geo-1" } : { status: "not-in-denominator", geo_id: null, geoid: null, source_release_id: null },
    positive_source_contributions: contributions, usps_operational_evidence: { status: "unverified", reason: "No USPS assertion", source_release_id: null, source_month: null }, limitations: ["current-usps-operational-status-unverified"] };
}
function fixture({ rows = [], getQuality = (zip) => quality(zip), registryRelease = "registry-1", manifest = "m" } = {}) {
  return createZipInspectorView({
    businessMap: { getCatalog: async () => ({ available: true, coverage_release_id: "coverage-1", registry_release_id: registryRelease, registry_manifest_sha256: manifest, geography_release_id: "geo-1" }) },
    businessCoverageViews: { listDimension: async (_dimension, { query }) => ({ available: true, release_id: "coverage-1", records: rows.filter((row) => row.zip_code.startsWith(query)) }) },
    zipQualityView: async ({ zip }) => getQuality(zip),
  });
}
const row = (zip, fields = {}) => ({ zip_code: zip, coverage_status: "record-level-source-contribution", physical_site_count: 12, establishment_count: 12, organization_primary_location_count: 7, employer_baseline_status: "published", employer_establishments: 4, zcta_geoid: zip, zcta_status: "2020-zcta-polygon-available", spatial_zip_polygon_membership_status: "included", material_county_count: 1, current_usps_validity_status: "unverified", coverage_gap_codes: ["gap-a"], ...fields });

test("governed positive exact ZIP returns joined release bindings, contributions, and measured alignment", async () => {
  const detail = await fixture({ rows: [row("12345")] })({ zip: "12345" });
  assert.equal(detail.evidence_status, "selected-evidence-present");
  assert.equal(detail.governed_zcta.geoid, "12345");
  assert.equal(detail.employer_alignment.percent, 300);
  assert.equal(detail.contributions[0].source_release_id, "source-r1");
  assert.equal(detail.bindings.registry_release_id, "registry-1");
  assert.equal(detail.selected_coverage_geography.county_assignment, "one-material-intersection");
});

test("measured zero remains zero and a zero or missing baseline yields null percent", async () => {
  const zero = await fixture({ rows: [row("12345", { physical_site_count: 0, employer_establishments: 0 })] })({ zip: "12345" });
  assert.equal(zero.counts.physical_sites, 0);
  assert.equal(zero.employer_alignment.percent, null);
  const missing = await fixture({ rows: [row("12345", { employer_establishments: null, employer_baseline_status: "missing" })] })({ zip: "12345" });
  assert.equal(missing.counts.employer_establishments, null);
  assert.equal(missing.employer_alignment.percent, null);
});

test("outside-denominator positive and denominator-only evidence are distinct without inferred geography", async () => {
  const outsideQuality = zip => quality(zip, { classification: "valid-format-source-reported-no-same-code-zcta", included: false });
  const positive = await fixture({ rows: [row("12345", { zcta_geoid: null, zcta_status: "missing", material_county_count: 0 })], getQuality: outsideQuality })({ zip: "12345" });
  assert.equal(positive.governed_zcta.status, "not-in-denominator");
  assert.equal(positive.selected_coverage_geography.zcta_geoid, null);
  assert.equal(positive.selected_coverage_geography.county_assignment, "not-uniquely-assigned");
  const denominatorOnly = await fixture({ rows: [row("12345", { coverage_status: "denominator-only-no-record-level-contribution" })], getQuality: zip => quality(zip, { classification: "valid-format-denominator-only-no-same-code-zcta", status: "denominator-only-no-record-level-contribution", included: false, contributions: [] }) })({ zip: "12345" });
  assert.equal(denominatorOnly.coverage_status, "denominator-only-no-record-level-contribution");
  assert.deepEqual(denominatorOnly.contributions, []);
});

test("explicit 00000 is a placeholder and absent evidence is not an invalid-USPS claim", async () => {
  const placeholder = await fixture({ rows: [row("00000", { zcta_geoid: null, zcta_status: "missing" })], getQuality: zip => quality(zip, { classification: "explicit-placeholder", included: false }) })({ zip: "00000" });
  assert.equal(placeholder.classification.class, "explicit-placeholder");
  assert.equal(placeholder.classification.ordinary_zip5_eligible, false);
  const absent = await fixture({ getQuality: async zip => ({ schema_version: "1.0.0", bindings, zip5: zip, found: false, classification: null }) })({ zip: "99999" });
  assert.equal(absent.evidence_status, "absent-from-selected-evidence");
  assert.equal(absent.zip_quality.usps_operational_status, "not-asserted");
});

test("rejects invalid exact input and mixed release bindings; reports cross-boundary without assigning county", async () => {
  await assert.rejects(fixture()({ zip: "1234" }), /exactly five digits/);
  await assert.rejects(fixture({ registryRelease: "other" })({ zip: "12345" }), /does not match/);
  const cross = await fixture({ rows: [row("12345", { material_county_count: 2, spatial_zip_polygon_membership_status: "cross-boundary" })] })({ zip: "12345" });
  assert.equal(cross.selected_coverage_geography.county_assignment, "not-uniquely-assigned");
});
