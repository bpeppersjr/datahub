import assert from "node:assert/strict";
import test from "node:test";
import { createZipInspectorView } from "./zip-inspector-view.mjs";

const bindings = { audit_id: "audit-1", release_id: "registry-1", pointer_sha256: "p", manifest_sha256: "m", zip_artifact_sha256: "z" };
function quality(zip, { classification = "valid-format-same-code-governed-zcta", status = "record-level-source-contribution", included = true, contributions = [{ source_id: "source-health", source_release_id: "source-r1", positive_counts: { record_count: 3 } }] } = {}) {
  if (!zip) return { schema_version: "1.0.0", bindings, zip5: "12345", found: false };
  return { schema_version: "1.0.0", bindings, zip5: zip, found: true,
    classification: { class: classification, ordinary_zip5_eligible: classification !== "explicit-placeholder" },
    registry_coverage_status: status, postal_fields: { zip_code: zip, zip4: null }, split_postal_contract: { status: "passed" },
    governed_zcta_membership: included ? { status: "included", geo_id: `zcta:${zip}`, geoid: zip, source_release_id: "geo-1" } : { status: "not-in-denominator", geo_id: null, geoid: null, source_release_id: null },
    positive_source_contributions: contributions, usps_operational_evidence: { status: "unverified", reason: "No USPS assertion", source_release_id: null, source_month: null }, limitations: ["current-usps-operational-status-unverified"] };
}
function fixture({ rows = [], getQuality = (zip) => quality(zip), registryRelease = "registry-1", manifest = "m", pharmacyCoverage = null, snapRetailerCoverage = null, fmcsaRegistrantCoverage = null, fdicBankfindCoverage = null, ncuaCreditUnionCoverage = null, fsisActiveEstablishmentCoverage = null, epaEchoActiveFacilityCoverage = null, irsEoBmfOrganizationCoverage = null } = {}) {
  return createZipInspectorView({
    businessMap: { getCatalog: async () => ({ available: true, coverage_release_id: "coverage-1", registry_release_id: registryRelease, registry_manifest_sha256: manifest, geography_release_id: "geo-1", categories: [
      { id: "all", label: "All source categories" },
      { id: "health-care", label: "Health care", source_ids: ["source-health"] },
      { id: "retail-consumer", label: "Retail and consumer", source_ids: ["source-retail"] },
    ] }) },
    businessCoverageViews: { listDimension: async (_dimension, { query }) => ({ available: true, release_id: "coverage-1", records: rows.filter((row) => row.zip_code.startsWith(query)) }) },
    zipQualityView: async ({ zip }) => getQuality(zip),
    pharmacyCoverage,
    snapRetailerCoverage,
    fmcsaRegistrantCoverage,
    fdicBankfindCoverage,
    ncuaCreditUnionCoverage,
    fsisActiveEstablishmentCoverage,
    epaEchoActiveFacilityCoverage,
    irsEoBmfOrganizationCoverage,
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
  assert.equal(detail.category_evidence.category_id, "all");
});

test("category evidence is separately filtered, provenance-bound, and absence is not zero or completeness", async () => {
  const detail = await fixture({ rows: [row("12345")], getQuality: zip => quality(zip, { contributions: [
    { source_id: "source-health", source_release_id: "health-release", positive_counts: { record_count: 3 } },
    { source_id: "source-retail", source_release_id: "retail-release", source_through_date: "2026-01-31", positive_counts: { record_count: 2 } },
  ] }) })({ zip: "12345", categoryId: "retail-consumer" });
  assert.deepEqual(detail.category_evidence.positive_source_contributions.map(item => item.source_id), ["source-retail"]);
  assert.equal(detail.category_evidence.positive_source_contributions[0].source_release_id, "retail-release");
  assert.equal(detail.category_evidence.positive_source_contributions[0].source_through_date, "2026-01-31");
  assert.equal(detail.category_evidence.bindings.registry_manifest_sha256, "m");
  assert.equal(detail.category_evidence.completeness_percent, null);
  assert.equal(detail.contributions.length, 2, "ZIP-wide contributions remain unchanged");

  const absent = await fixture({ rows: [row("12345")], getQuality: zip => quality(zip, { contributions: [
    { source_id: "source-health", source_release_id: "health-release", positive_counts: { record_count: 3 } },
  ] }) })({ zip: "12345", categoryId: "retail-consumer" });
  assert.equal(absent.category_evidence.status, "no-selected-positive-evidence");
  assert.deepEqual(absent.category_evidence.positive_source_contributions, []);
  assert.equal(absent.category_evidence.completeness_percent, null);
  assert.match(absent.category_evidence.semantics, /not a measured zero/);
});

test("category evidence rejects categories outside the current governed catalog", async () => {
  let evidenceReads = 0;
  const view = createZipInspectorView({
    businessMap: { getCatalog: async () => ({ available: true, categories: [{ id: "all", label: "All source categories", source_ids: [] }] }) },
    businessCoverageViews: { listDimension: async () => { evidenceReads += 1; return { available: true, records: [] }; } },
    zipQualityView: async () => { evidenceReads += 1; return quality("12345"); },
  });
  await assert.rejects(view({ zip: "12345", categoryId: "not-governed" }), { statusCode: 400 });
  assert.equal(evidenceReads, 0, "unrecognized category is rejected before ZIP evidence reads");
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

test("keeps optional aggregate pharmacy evidence in its own exact-ZIP block", async () => {
  const calls = [];
  const pharmacy = {
    zip_code: "12345",
    evidence_scope: "positive-source-reported-primary-address-evidence",
    reported_address_count: 6,
    unique_npi_count: 5,
    limitations: ["aggregate evidence is not a current-operation assertion"],
  };
  const detail = await fixture({
    rows: [row("12345")],
    pharmacyCoverage: async (selection) => { calls.push(selection); return pharmacy; },
  })({ zip: "12345", categoryId: "health-care" });
  assert.deepEqual(calls, [{ zip: "12345" }]);
  assert.deepEqual(detail.pharmacy_evidence, pharmacy);
  assert.equal(detail.counts.physical_sites, 12, "pharmacy aggregate does not change generic counts");
  assert.deepEqual(detail.category_evidence.positive_source_contributions.map(item => item.source_id), ["source-health"], "pharmacy aggregate does not change category evidence");
});

test("returns null when no pharmacy loader is bound and rejects mismatched or non-object evidence", async () => {
  assert.equal((await fixture({ rows: [row("12345")] })({ zip: "12345" })).pharmacy_evidence, null);
  await assert.rejects(fixture({ pharmacyCoverage: async () => ({ zip_code: "54321" }) })({ zip: "12345" }), /does not match/);
  await assert.rejects(fixture({ pharmacyCoverage: async () => 4 })({ zip: "12345" }), /invalid aggregate/);
});

test("keeps SNAP retailer evidence separate and fails closed on malformed or mismatched ZIP evidence", async () => {
  const snap={zip_code:"12345",evidence_scope:"positive-snap-authorization-evidence",authorized_retailer_location_count:8};
  const detail=await fixture({rows:[row("12345")],snapRetailerCoverage:async()=>snap})({zip:"12345"});
  assert.deepEqual(detail.snap_retailer_evidence,snap);
  assert.equal(detail.counts.physical_sites,12);
  await assert.rejects(fixture({snapRetailerCoverage:async()=>[]})({zip:"12345"}),/invalid aggregate/);
  await assert.rejects(fixture({snapRetailerCoverage:async()=>({zip_code:"54321"})})({zip:"12345"}),/does not match/);
  await assert.rejects(fixture({snapRetailerCoverage:async()=>({evidence_scope:"missing-zip"})})({zip:"12345"}),/does not match/);
});

test("keeps FMCSA principal-office evidence separate and fails closed on malformed or mismatched ZIP evidence", async () => {
  const fmcsa={zip_code:"12345",evidence_scope:"positive-fmcsa-source-active-principal-office-evidence",source_active_registrant_principal_office_count:9};
  const detail=await fixture({rows:[row("12345")],fmcsaRegistrantCoverage:async()=>fmcsa})({zip:"12345"});
  assert.deepEqual(detail.fmcsa_registrant_principal_office_evidence,fmcsa);
  assert.equal(detail.counts.physical_sites,12);
  await assert.rejects(fixture({fmcsaRegistrantCoverage:async()=>[]})({zip:"12345"}),/invalid aggregate/);
  await assert.rejects(fixture({fmcsaRegistrantCoverage:async()=>({zip_code:"54321"})})({zip:"12345"}),/does not match/);
  await assert.rejects(fixture({fmcsaRegistrantCoverage:async()=>({evidence_scope:"missing-zip"})})({zip:"12345"}),/does not match/);
});

test("keeps FDIC BankFind office evidence separate and fails closed on malformed or mismatched ZIP evidence", async () => {
  const fdic={zip_code:"12345",evidence_scope:"positive-fdic-current-indexed-office-evidence",current_indexed_office_count:7};
  const detail=await fixture({rows:[row("12345")],fdicBankfindCoverage:async()=>fdic})({zip:"12345"});
  assert.deepEqual(detail.fdic_bankfind_office_evidence,fdic);
  assert.equal(detail.counts.physical_sites,12,"FDIC aggregate does not change generic totals");
  await assert.rejects(fixture({fdicBankfindCoverage:async()=>[]})({zip:"12345"}),/invalid aggregate/);
  await assert.rejects(fixture({fdicBankfindCoverage:async()=>({zip_code:"54321"})})({zip:"12345"}),/does not match/);
});

test("keeps NCUA credit-union location evidence separate and fails closed on malformed or mismatched ZIP evidence", async () => {
  const ncua={zip_code:"12345",evidence_scope:"positive-ncua-scoped-location-evidence",scoped_location_count:6};
  const detail=await fixture({rows:[row("12345")],ncuaCreditUnionCoverage:async()=>ncua})({zip:"12345"});
  assert.deepEqual(detail.ncua_credit_union_location_evidence,ncua);
  assert.equal(detail.counts.physical_sites,12,"NCUA aggregate does not change generic totals");
  await assert.rejects(fixture({ncuaCreditUnionCoverage:async()=>[]})({zip:"12345"}),/invalid aggregate/);
  await assert.rejects(fixture({ncuaCreditUnionCoverage:async()=>({zip_code:"54321"})})({zip:"12345"}),/does not match/);
});

test("keeps FSIS active-establishment evidence separate and fails closed on malformed or mismatched ZIP evidence", async () => {
  const fsis={zip_code:"12345",evidence_scope:"positive-fsis-active-establishment-evidence",active_establishment_count:4};
  const detail=await fixture({rows:[row("12345")],fsisActiveEstablishmentCoverage:async()=>fsis})({zip:"12345"});
  assert.deepEqual(detail.fsis_active_establishment_evidence,fsis);
  assert.equal(detail.counts.physical_sites,12,"FSIS aggregate does not change generic totals");
  await assert.rejects(fixture({fsisActiveEstablishmentCoverage:async()=>[]})({zip:"12345"}),/invalid aggregate/);
  await assert.rejects(fixture({fsisActiveEstablishmentCoverage:async()=>({zip_code:"54321"})})({zip:"12345"}),/does not match/);
});

test("keeps EPA ECHO active-facility evidence separate and fails closed on malformed or mismatched ZIP evidence", async () => {
  const echo={zip_code:"12345",evidence_scope:"positive-epa-echo-active-facility-evidence",active_facility_count:41,rcra_association_count:20};
  const detail=await fixture({rows:[row("12345")],epaEchoActiveFacilityCoverage:async()=>echo})({zip:"12345"});
  assert.deepEqual(detail.epa_echo_active_facility_evidence,echo);
  assert.equal(detail.counts.physical_sites,12,"EPA ECHO aggregate does not change generic totals");
  await assert.rejects(fixture({epaEchoActiveFacilityCoverage:async()=>[]})({zip:"12345"}),/invalid aggregate/);
  await assert.rejects(fixture({epaEchoActiveFacilityCoverage:async()=>({zip_code:"54321"})})({zip:"12345"}),/does not match/);
});

test("keeps IRS EO BMF organization evidence separate and fails closed on malformed or mismatched ZIP evidence", async () => {
  const irs={zip_code:"12345",evidence_scope:"positive-irs-eo-bmf-organization-filing-address-evidence",organization_count:41,exempt_status_01_count:39};
  const detail=await fixture({rows:[row("12345")],irsEoBmfOrganizationCoverage:async()=>irs})({zip:"12345"});
  assert.deepEqual(detail.irs_eo_bmf_organization_evidence,irs);
  assert.equal(detail.counts.physical_sites,12,"IRS EO BMF aggregate does not change generic totals");
  await assert.rejects(fixture({irsEoBmfOrganizationCoverage:async()=>[]})({zip:"12345"}),/invalid aggregate/);
  await assert.rejects(fixture({irsEoBmfOrganizationCoverage:async()=>({zip_code:"54321"})})({zip:"12345"}),/does not match/);
});
