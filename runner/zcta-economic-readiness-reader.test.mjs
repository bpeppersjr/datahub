import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readZctaEconomicReadiness} from './zcta-economic-readiness-reader.mjs';

test('reads one exact indexed retained row without prohibited economic claims',async()=>{
 const value=await readZctaEconomicReadiness({zcta:'00601'});assert.equal(value.available,true);assert.equal(value.status,'found');assert.equal(value.readiness.population_2020,17242);assert.equal(value.readiness.housing_units_2020,7605);assert.equal(value.readiness.model_status,'withheld');assert.deepEqual(value.claims,{official_zip_code:false,active_businesses:false,numeric_gdp_or_demographic_allocation:false});assert.equal(value.provenance.release_id,'zcta-economic-model-readiness-20261003T021732755Z-e4adc3cd');assert.equal(JSON.stringify(value).includes('GDP_CAGDP'),false);assert.equal(Object.hasOwn(value.readiness,'gdp'),false);
});

test('returns governed not-found rather than a zero or ZIP validity claim',async()=>{
 const value=await readZctaEconomicReadiness({zcta:'00000'});assert.equal(value.zcta,'00000');assert.equal(value.available,false);assert.equal(value.status,'not-found');assert.equal(value.readiness,null);assert.equal(value.claims.official_zip_code,false);
});

test('reader contract is bounded and pointer-free',async()=>{
 const code=await readFile(new URL('./zcta-economic-readiness-reader.mjs',import.meta.url),'utf8');assert.doesNotMatch(code,/createReadStream|readLines|current\.json|buildZcta|fetch\(/);assert.match(code,/Buffer\.alloc\(entry\.bytes\)/);assert.match(code,/publication_mode==='immutable-pointer-free'/);
});
