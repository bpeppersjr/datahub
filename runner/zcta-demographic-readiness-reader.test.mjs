import test from 'node:test';
import assert from 'node:assert/strict';
import {readZctaDemographicReadiness} from './zcta-demographic-readiness-reader.mjs';

test('reads the selected verified release and exposes only direct totals and blockers',async()=>{
 const view=await readZctaDemographicReadiness({zcta:'00601'});
 assert.equal(view.schema_version,'zcta-demographic-readiness-view@1.0.0');assert.equal(view.available,true);assert.equal(view.status,'found');
 assert.equal(view.readiness.population_2020,17242);assert.equal(view.readiness.housing_units_2020,7605);assert.equal(view.readiness.status,'partial-input-readiness');
 assert.deepEqual(view.readiness.availability,{population_2020:true,housing_units_2020:true,race:false,ancestry_lineage:false,sex:false,age:false});
 assert.deepEqual(view.readiness.blockers,['race-input-unavailable','ancestry-lineage-input-unavailable','sex-input-unavailable','age-input-unavailable']);
 assert.deepEqual(view.claims,{official_zip_code:false,demographic_percentages:false,gdp:false,network_requests:0,current_pointer_written:false,production_enrollment:false});
 assert.match(view.provenance.release_id,/^zcta-demographic-input-readiness-[a-f0-9]{64}$/);assert.match(view.provenance.manifest_sha256,/^[a-f0-9]{64}$/);assert.match(view.provenance.artifact_sha256,/^[a-f0-9]{64}$/);
});

test('preserves governed not-found semantics without zero or availability substitution',async()=>{
 const view=await readZctaDemographicReadiness({zcta:'00000'});assert.equal(view.available,false);assert.equal(view.status,'not-found');assert.equal(view.readiness,null);assert.equal(view.claims.demographic_percentages,false);
});

test('rejects malformed identities and honors cancellation before filesystem access',async()=>{
 await assert.rejects(readZctaDemographicReadiness({zcta:'601'}),/unavailable or incompatible/);const controller=new AbortController();controller.abort();await assert.rejects(readZctaDemographicReadiness({zcta:'00601',signal:controller.signal}),{name:'AbortError'});
});
