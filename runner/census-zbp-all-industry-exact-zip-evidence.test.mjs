import assert from 'node:assert/strict';
import test from 'node:test';
import {projectZbpAllIndustryExactZip} from './census-zbp-all-industry-exact-zip-evidence.mjs';

const evidence=zip=>[{source_id:'census-zbp-2023',source_record_id:zip}];
const coverage=(zip,status,published,zcta)=>({zip_code:zip,coverage_status:status,employer_baseline:{status:published?'published':'not-published-for-zip',provenance:{source_record_id:published?zip:`absence:${zip}`}},geography:{status:zcta?'2020-zcta-polygon-available':'not-published-as-2020-zcta'},source_evidence:evidence(zip)});
const raw=(zip,establishments)=>({zip_code:zip,naics_code:'------',establishments,size_1_4:null,size_1_4_suppression_code:'D'});

test('direct all-industry projection conserves both, asymmetric coverage and genuine zero without ZIP4 inflation',()=>{
 const rows=projectZbpAllIndustryExactZip([
  coverage('10001','zbp-and-zcta',true,true),coverage('20001','zbp-without-zcta',true,false),coverage('00601','zcta-without-published-zbp',false,true)
 ],new Map([['10001',raw('10001',12)],['20001',raw('20001',0)]]));
 assert.deepEqual(rows.map(x=>[x.zip5,x.zip4,x.measurement_status,x.establishments,x.published_zbp,x.same_code_zcta]),[
  ['10001',null,'measured-positive',12,true,true],['20001',null,'measured-zero',0,true,false],['00601',null,'not-published-for-zip',null,false,true]
 ]);
 assert.equal(rows[1].source_values.size_1_4_suppression_code,'D');assert.equal(rows[2].source_values,null);
 assert.equal(rows[0].source_employer_baseline.status,'published');
});

test('published null remains suppressed or unpublished and never becomes zero',()=>{
 const rows=projectZbpAllIndustryExactZip([coverage('10001','zbp-and-zcta',true,true)],new Map([['10001',raw('10001',null)]]));
 assert.equal(rows[0].measurement_status,'suppressed-or-unpublished');assert.equal(rows[0].establishments,null);
});

test('projection refuses missing direct publisher totals and duplicate coverage instead of summing hierarchy',()=>{
 assert.throws(()=>projectZbpAllIndustryExactZip([coverage('10001','zbp-and-zcta',true,true)],new Map()),/direct-row\/published conservation/);
 assert.throws(()=>projectZbpAllIndustryExactZip([coverage('00601','zcta-without-published-zbp',false,true)],new Map([['00601',raw('00601',2)]])),/direct-row\/published conservation/);
 assert.throws(()=>projectZbpAllIndustryExactZip([coverage('00601','x',false,true),coverage('00601','x',false,true)],new Map()),/coverage ZIP identity/);
});
