import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readNationalBusinessTemporalClaimMatrix} from './national-business-temporal-claim-matrix-reader.mjs';

test('reads the selected pointer-free temporal matrix and preserves unknown all-business claims',async()=>{
 const view=await readNationalBusinessTemporalClaimMatrix();
 assert.equal(view.available,true);assert.equal(view.scope,'retained-source-classification-only');
 assert.deepEqual(view.summary,{source_count:30,source_defined_current_membership_sources:22,non_active_directory_registration_reporting_sources:7,annual_aggregate_sources:1,broad_state_dc_source_defined_active:11,broad_state_dc_total:51,broad_state_dc_gaps:40,verified_current_complete_jurisdictions:0,verified_current_complete_gaps:51,active_business_count:null,completeness_percentage:null});
 assert.equal(view.provenance.release_id,'national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090');
 assert.equal(view.provenance.manifest_sha256,'342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05');
 assert.equal(view.provenance.artifact_sha256,'d7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0');
 assert.equal(view.claims.current_operations_verified,false);assert.equal(view.claims.active_business_count,false);assert.equal(view.claims.completeness_inferred,false);
});

test('reader remains bounded, pointer-free and contains no acquisition path',async()=>{
 const code=await readFile(new URL('./national-business-temporal-claim-matrix-reader.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/current\.json|fetch\(|https?:|publish|acquir|production.*write/i);assert.match(code,/selected===true/);assert.match(code,/artifact\.bytes<=65536/);
});
