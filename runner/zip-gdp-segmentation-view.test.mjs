import test from "node:test";
import assert from "node:assert/strict";
import { readZipGdpSegmentationView } from "./zip-gdp-segmentation-view.mjs";

const readiness = (zcta, status = "eligible") => ({
  schema_version: "zcta-gdp-execution-readiness-view@1.0.0",
  zcta,
  available: true,
  status: "found",
  readiness: { status },
  provenance: { release_id: "readiness-r1", manifest_sha256: "a".repeat(64), artifact_sha256: "b".repeat(64) },
  claims: { model_approved: false, output_authorized: false, numeric_gdp: false, industry_gdp: false, official_usps_zip: false },
});
const cross = (zip5, zcta = zip5) => ({
  schema_version: "zip-industry-demographic-cross-view@1.0.0",
  zip5,
  zcta_geoid: zcta,
  industry_evidence: { row: { cells: { retail: { status: "positive", count: 12 } } }, release: { release_id: "industry-r1" } },
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
  assert.ok(view.industry_breakdown.every((row) => row.gdp.estimate_current_dollars === null));
  assert.deepEqual(view.demographic_breakdown.map((row) => row.dimension), ["race", "ancestry_lineage", "sex", "age"]);
  assert.ok(view.demographic_breakdown.every((row) => row.role === "context-only-not-allocation-weight" && row.groups.length === 0));
  assert.equal(view.claims.numeric_gdp_emitted, false);
  assert.equal(view.claims.demographic_gdp_emitted, false);
  assert.equal(view.methodology.confidence.score, null);
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

