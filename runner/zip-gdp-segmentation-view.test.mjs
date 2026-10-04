import test from "node:test";
import assert from "node:assert/strict";
import { readZipGdpSegmentationView } from "./zip-gdp-segmentation-view.mjs";
import { readZipIndustryDemographicCrossView } from "./zip-industry-demographic-cross-view.mjs";

const readiness = (zcta, executionStatus = "feasible-on-approval") => ({
  schema_version: "zcta-gdp-execution-readiness-view@1.0.0",
  zcta,
  available: true,
  status: "found",
  readiness: {
    zcta,
    execution_status: executionStatus,
    decision_status: "hold",
    material_relationship_count: 1,
    county_geoids: ["72001"],
    withhold_reasons: executionStatus === "withheld" ? ["material-county-gdp-input-incomplete"] : [],
    total_model: { approval_required: true, output_authorized: false, numeric_output: false },
    industry_readiness: { status: "unavailable", county_industry_input: false, governed_naics_bea_concordance: false, nonemployer_zip_allocation: false, numeric_output_authorized: false },
  },
  provenance: { release_id: "zcta-gdp-execution-readiness-r1", manifest_sha256: "a".repeat(64), artifact_sha256: "b".repeat(64) },
  claims: { model_approved: false, output_authorized: false, numeric_gdp: false, industry_gdp: false, official_usps_zip: false },
});
const matrixHash = "c".repeat(64);
const matrixRelease = `national-exact-zip-industry-evidence-matrix-${matrixHash}`;
const industryCell = (status, count) => ({
  status,
  count,
  measure: "test_source_rows",
  source_release_id: "retained-test-source",
  temporal_status: {
    status: "source-referenced-current-operation-unverified",
    source_reference_date: "2026-10-02",
  },
});
const industryEvidence = (zip5, cells = { retail: industryCell("positive", 12) }) => ({
  schema_version: "national-exact-zip-industry-evidence-matrix@1.7.0",
  status: "present",
  row: {
    schema_version: "national-exact-zip-industry-evidence-matrix-row@1.7.0",
    zip5,
    zip4: null,
    cells,
  },
  out_of_cohort_source_zip_gaps: [],
  source_quality_gaps: [],
  source_address_row_gaps: [],
  release_id: matrixRelease,
  manifest_sha256: matrixHash,
  claims: {
    additive_cross_industry_total: false,
    current_operation_verified: false,
    all_business_completeness: false,
  },
});
const cross = (zip5, zcta = zip5, evidence = industryEvidence(zip5)) => ({
  schema_version: "zip-industry-demographic-cross-view@1.0.0",
  zip5,
  zcta_geoid: zcta,
  industry_evidence: evidence,
  demographic_context: { availability: { race: true, ancestry_lineage: false, sex: true, age: true }, provenance: { release_id: "demographic-r1" } },
});

test("exposes the requested total, industry, and demographic structure while withholding numeric GDP", async () => {
  const view = await readZipGdpSegmentationView({
    zip5: "00601",
    readGdpReadiness: ({ zcta }) => readiness(zcta),
    readCrossView: ({ zip5 }) => cross(zip5),
  });
  assert.equal(view.modeled_geography.type, "2020-census-zcta");
  assert.equal(view.methodology.estimate_type, "modeled-not-observed");
  assert.equal(view.total_gdp.estimate_current_dollars, null);
  assert.equal(view.total_gdp.reason, "model-approval-and-output-authorization-required");
  assert.deepEqual(view.industry_breakdown.map((row) => row.industry_id), ["retail"]);
  assert.equal(view.industry_breakdown[0].source_measure_value, 12);
  assert.deepEqual(view.provenance.industry_evidence, {
    release_id: matrixRelease,
    manifest_sha256: matrixHash,
  });
  assert.ok(view.industry_breakdown.every((row) => row.gdp.estimate_current_dollars === null));
  assert.deepEqual(view.demographic_breakdown.map((row) => row.dimension), ["race", "ancestry_lineage", "sex", "age"]);
  assert.ok(view.demographic_breakdown.every((row) => row.role === "context-only-not-allocation-weight" && row.groups.length === 0));
  assert.equal(view.claims.numeric_gdp_emitted, false);
  assert.equal(view.claims.demographic_gdp_emitted, false);
  assert.equal(view.methodology.confidence.score, null);
});

test("projects only positive and measured-zero source values; absent and outside cells remain unmeasured", async () => {
  const evidence = industryEvidence("00601", {
    positive: industryCell("positive", 17),
    zero: industryCell("measured-zero", 0),
    absent: industryCell("absent-from-retained-source-rows", 0),
    outside: industryCell("outside-source-denominator", null),
  });
  const view = await readZipGdpSegmentationView({
    zip5: "00601",
    readGdpReadiness: ({ zcta }) => readiness(zcta),
    readCrossView: ({ zip5 }) => cross(zip5, zip5, evidence),
  });
  assert.deepEqual(
    Object.fromEntries(view.industry_breakdown.map((row) => [row.industry_id, row.source_measure_value])),
    { absent: null, outside: null, positive: 17, zero: 0 },
  );
  assert.equal(view.industry_breakdown.find((row) => row.industry_id === "absent").source_evidence.count, 0);
  assert.ok(view.industry_breakdown.every((row) => row.gdp.display_value === null));
  assert.equal(view.claims.industry_gdp_emitted, false);
});

test("fails closed for unknown cell statuses and malformed matrix lineage", async () => {
  const unknown = industryEvidence("00601", { bad: industryCell("unknown", 0) });
  await assert.rejects(readZipGdpSegmentationView({
    zip5: "00601",
    readGdpReadiness: ({ zcta }) => readiness(zcta),
    readCrossView: ({ zip5 }) => cross(zip5, zip5, unknown),
  }), /unavailable or incompatible/);
  const unknownRelease = industryEvidence("00601");
  unknownRelease.release_id = "unregistered-industry-release";
  await assert.rejects(readZipGdpSegmentationView({
    zip5: "00601",
    readGdpReadiness: ({ zcta }) => readiness(zcta),
    readCrossView: ({ zip5 }) => cross(zip5, zip5, unknownRelease),
  }), /unavailable or incompatible/);
  const mismatched = industryEvidence("00601");
  mismatched.manifest_sha256 = "not-a-manifest-hash";
  await assert.rejects(readZipGdpSegmentationView({
    zip5: "00601",
    readGdpReadiness: ({ zcta }) => readiness(zcta),
    readCrossView: ({ zip5 }) => cross(zip5, zip5, mismatched),
  }), /unavailable or incompatible/);
});

test("real exact-ZIP reader provenance is bound into the GDP view", async () => {
  const view = await readZipGdpSegmentationView({
    zip5: "10000",
    readGdpReadiness: ({ zcta }) => readiness(zcta, "withheld"),
    readCrossView: ({ zip5, root, signal }) => readZipIndustryDemographicCrossView({
      zip5,
      root,
      signal,
      readDemographic: () => { throw new Error("same-code ZCTA is not present for ZIP 10000"); },
    }),
  });
  assert.deepEqual(view.provenance.industry_evidence, {
    release_id: "national-exact-zip-industry-evidence-matrix-105d71c084bf307d9ced71ec3a92623fb228770c36ef7bdefc7e6c348047a43f",
    manifest_sha256: "dd495c383f4d5a0bde67e2a4d4b2223ecde15597936ae4820e4b31ff47a3cca6",
  });
});

test("does not equate a ZIP5 with a different or absent governed ZCTA", async () => {
  const view = await readZipGdpSegmentationView({
    zip5: "00601",
    readGdpReadiness: ({ zcta }) => readiness(zcta, "withheld"),
    readCrossView: ({ zip5 }) => cross(zip5, "00602"),
  });
  assert.deepEqual(view.modeled_geography, { type: "2020-census-zcta", geoid: null, official_usps_zip: false, relationship: "not-established" });
  assert.equal(view.total_gdp.reason, "zcta-input-eligibility-incomplete");
});

test("preserves a governed withheld execution row without treating it as eligible", async () => {
  const view = await readZipGdpSegmentationView({
    zip5: "00601",
    readGdpReadiness: ({ zcta }) => readiness(zcta, "withheld"),
    readCrossView: ({ zip5 }) => cross(zip5),
  });
  assert.equal(view.modeled_geography.geoid, "00601");
  assert.equal(view.total_gdp.reason, "zcta-input-eligibility-incomplete");
  assert.equal(view.total_gdp.estimate_current_dollars, null);
  assert.equal(view.claims.output_authorized, false);
  assert.equal(view.claims.numeric_gdp_emitted, false);
});

test("rejects malformed execution status, lineage mismatch, and future numeric authority instead of silently withholding", async () => {
  const malformed = readiness("00601");
  malformed.readiness.execution_status = "eligible";
  await assert.rejects(readZipGdpSegmentationView({ zip5: "00601", readGdpReadiness: () => malformed, readCrossView: ({ zip5 }) => cross(zip5) }), /unavailable or incompatible/);
  const mismatched = readiness("00602");
  await assert.rejects(readZipGdpSegmentationView({ zip5: "00601", readGdpReadiness: () => mismatched, readCrossView: ({ zip5 }) => cross(zip5) }), /unavailable or incompatible/);
  const badHash = readiness("00601");
  badHash.provenance.manifest_sha256 = "not-a-lineage-hash";
  await assert.rejects(readZipGdpSegmentationView({ zip5: "00601", readGdpReadiness: () => badHash, readCrossView: ({ zip5 }) => cross(zip5) }), /unavailable or incompatible/);
  const numeric = readiness("00601");
  numeric.claims.output_authorized = true;
  numeric.claims.numeric_gdp = true;
  numeric.readiness.total_model.output_authorized = true;
  numeric.readiness.total_model.numeric_output = true;
  await assert.rejects(readZipGdpSegmentationView({ zip5: "00601", readGdpReadiness: () => numeric, readCrossView: ({ zip5 }) => cross(zip5) }), /unavailable or incompatible/);
});

test("rejects malformed input, incompatible dependencies, and cancellation", async () => {
  await assert.rejects(readZipGdpSegmentationView({ zip5: "601" }), (error) => error.statusCode === 400);
  await assert.rejects(readZipGdpSegmentationView({
    zip5: "00601",
    readGdpReadiness: () => ({ ...readiness("00601"), claims: { model_approved: true, output_authorized: true, numeric_gdp: true } }),
    readCrossView: ({ zip5 }) => cross(zip5),
  }), /unavailable or incompatible/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readZipGdpSegmentationView({ zip5: "00601", signal: controller.signal }), (error) => error.name === "AbortError");
});

