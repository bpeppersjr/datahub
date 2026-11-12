import assert from "node:assert/strict";
import test from "node:test";
import { readOperationalIndustryCensusStatus } from "./operational-industry-census-status.mjs";

test("retained ZBP provides bounded annual aggregate context for six operational industries", async () => {
  const view = await readOperationalIndustryCensusStatus();
  assert.equal(view.schema_version, "operational-industry-census-status@1.1.0");
  assert.equal(view.industries.length, 9);
  assert.deepEqual(view.industries.filter(row => row.aggregate_status === "retained-annual-employer-establishment-aggregate").map(row => [row.id, row.naics_code, row.published_establishments]), [
    ["childcare", "624410", 72627],
    ["construction", "23----", 804566],
    ["financial-services", "52----", 458667],
    ["health-care", "62----", 993260],
    ["retail-consumer", "44----", 1032661],
    ["transportation", "48----", 278768],
  ]);
  assert.deepEqual(view.industries.filter(row => row.aggregate_status === "not-comparable-to-single-naics").map(row => row.id), ["local-business-licenses", "sales-tax-outlets", "tax-exempt-organizations"]);
  assert.deepEqual(view.claims, { annual_aggregate_context_only:true, named_businesses:false, current_operations_verified:false, business_completeness:null, industry_completeness:null, state_access_gap_resolution_performed:false, zip5_is_zcta:false, zip4_joined:false, network_requests:0, runtime_writes:0 });
  assert.match(view.source.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.match(view.source.naics_catalog_sha256, /^[a-f0-9]{64}$/);
  assert.equal(view.source.publisher_release_status,"latest-publisher-reference-year");
  assert.equal(view.source.next_release_status,"no-planned-release-date-publisher-evaluating-alternative-approach");
  assert.match(view.source.publisher_assessment_sha256,/^[a-f0-9]{64}$/);
});
