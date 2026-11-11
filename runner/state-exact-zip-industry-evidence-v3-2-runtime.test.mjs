import test from "node:test";
import assert from "node:assert/strict";
import { readStateExactZipIndustryEvidenceProjectionV32 } from "./state-exact-zip-industry-evidence-map-v3-2.mjs";
import { readOperationalIndustryEvidenceSummary } from "./operational-industry-evidence-summary.mjs";

test("state v3.2 projects refreshed New York evidence with closed geography conservation",async()=>{
  const value=await readStateExactZipIndustryEvidenceProjectionV32({dimensionId:"ny_retail_food_license_address_evidence_count"});
  assert.equal(value.schema_version,"state-exact-zip-industry-evidence-projection@3.2.0");
  assert.equal(value.states.length,51);assert.equal(value.territories.length,5);assert.equal(value.special_scopes.length,4);
  assert.equal(Object.values(value.geography_scope_counts).reduce((sum,count)=>sum+count,0),48194);
  assert.equal([...value.states,...value.territories,...value.special_scopes].reduce((sum,row)=>sum+row.positive_zip5_rows,0),1497);
  assert.equal([...value.states,...value.territories,...value.special_scopes].reduce((sum,row)=>sum+row.count_sum,0),23663);
  assert.equal(value.provenance.matrix.release_id,"national-exact-zip-industry-evidence-matrix-761d2ac95b7f954a0bd2c55039649030ce360f8c5bc6187f82c834241490b629");
  assert.equal(value.claims.review_qualification,"within-review-window");
});

test("operational industry status binds refreshed summary and state release",async()=>{
  const value=await readOperationalIndustryEvidenceSummary({state:"NY"});
  assert.equal(value.schema_version,"operational-industry-evidence-summary@1.0.0");
  assert.equal(value.industries.length,9);
  assert.equal(value.provenance.summary_release_id,"national-exact-zip-industry-evidence-matrix-761d2ac95b7f954a0bd2c55039649030ce360f8c5bc6187f82c834241490b629");
  assert.equal(value.provenance.state_disposition_release_id,"state-exact-zip-industry-evidence-disposition-ca1cd19b3392bc7bfe93bea9e896f541f25aa7093a45982b62cb9acd746863e4");
  const retail=value.industries.find(row=>row.id==="retail-consumer"),ny=retail.dimensions.find(row=>row.id==="ny_retail_food_license_address_evidence_count");
  assert.equal(ny.temporal_qualification.review_qualification,"within-review-window");
  assert.equal(ny.temporal_qualification.source_release_id,"ny-retail-food-stores-2026-10-14-7f9dc6f0449f76e0");
  assert.equal(value.claims.business_completeness,null);
});
