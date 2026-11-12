import test from "node:test";
import assert from "node:assert/strict";
import { readStateExactZipIndustryEvidenceStateV33 } from "./state-exact-zip-industry-evidence-disposition-v3-3.mjs";
import { readStateExactZipIndustryEvidenceProjectionV33 } from "./state-exact-zip-industry-evidence-map-v3-3.mjs";

test("v3.3 state reader exposes refreshed childcare without allocating conserved gaps",async()=>{
  const view=await readStateExactZipIndustryEvidenceStateV33({state:"VT"}),dimension=view.row.dimensions.childcare_vt_candidates;
  assert.equal(view.schema_version,"state-exact-zip-industry-evidence-disposition@3.3.0");
  assert.equal(view.claims.retained_childcare_v1_2,true);assert.equal(view.claims.missing_zip_allocated,false);assert.equal(view.claims.invalid_zip_allocated,false);
  assert.equal(Object.values(dimension.lifecycle_status_counts).reduce((a,b)=>a+b,0),view.row.zip5_rows);assert.equal(dimension.lifecycle_status_counts.unmeasured,view.row.zip5_rows);
});
test("v3.3 state map conserves all 60 scopes and pins refreshed childcare",async()=>{
  const view=await readStateExactZipIndustryEvidenceProjectionV33({dimensionId:"childcare_pa_candidates"});
  assert.equal(view.states.length,51);assert.equal(view.territories.length,5);assert.equal(view.special_scopes.length,4);assert.equal(Object.values(view.geography_scope_counts).reduce((a,b)=>a+b,0),48194);
  assert.equal(view.provenance.retained_childcare_zip_evidence.accepted_candidate_rows,12210);assert.equal(view.claims.current_operations_verified,false);
});
