import assert from 'node:assert/strict';
import test from 'node:test';
import {projectCensusNonemployerCountyIndustryRows} from './census-nonemployer-county-industry-adjacent-evidence.mjs';

function row({code='23',raw=7,usable=raw,flag=null,missing=false,extra={}}={}){return{schema_version:'census-nonemployer-county-industry-context@1.0.0',naics:{code,label:code==='23'?'Construction':'Child Day Care Services',classification:'2022 NAICS'},geography_type:'county',geoid:'01001',state_fips:'01',county_fips:'001',geography_name:'Autauga County, Alabama',reference_year:2023,status:missing?'not-published-in-retained-selected-total-cells':flag?'published-flagged-establishment-measure':'published-annual-aggregate',missing_cell:missing,measures:{nonemployer_establishments:usable,nonemployer_establishments_raw:raw,nonemployer_establishments_flag:flag,receipts_thousands_usd:10,receipts_thousands_usd_raw:10,receipts_flag:null,receipts_noise_range_thousands_usd:null,receipts_noise_range_thousands_usd_raw:0,receipts_noise_range_flag:'G',flags_preserved_without_reinterpretation:true},provenance:{source_release_id:'census-nonemployer-2023-20260830-230249716Z-78268f89',transformation_version:'census-nonemployer-county-industry-context@1.0.0',source_record_id:missing?null:`county:01001:${code}:001:001`},...extra};}

test('county projection preserves genuine zero, flagged raw value, nullable usable value and provenance',()=>{
 const zero=row({raw:0}),flagged=row({code:'62441',raw:3,usable:null,flag:'D'});flagged.geoid='01003';flagged.county_fips='003';
 const result=projectCensusNonemployerCountyIndustryRows([zero,flagged]);
 assert.deepEqual(result.map(x=>[x.county_geoid,x.naics_2022.code,x.measurement_status,x.measures.nonemployer_establishments]),[['01001','23','measured-zero',0],['01003','62441','published-flagged-unusable',null]]);
 assert.equal(result[1].measures.nonemployer_establishments_raw,3);assert.equal(result[1].provenance.source_record_id,'county:01001:62441:001:001');
});

test('county projection preserves explicit absent cells as null rather than zero',()=>{
 const absent=row({code:'62441',raw:null,usable:null,missing:true});absent.measures.receipts_thousands_usd=null;absent.measures.receipts_thousands_usd_raw=null;absent.measures.receipts_noise_range_thousands_usd_raw=null;absent.measures.receipts_noise_range_flag=null;
 const [value]=projectCensusNonemployerCountyIndustryRows([absent]);assert.equal(value.measurement_status,'absent-from-retained-source-cell');assert.equal(value.measures.nonemployer_establishments,null);
});

test('county projection rejects hierarchy substitutions, ZIP/geocode allocation fields and invalid flag semantics',()=>{
 assert.throws(()=>projectCensusNonemployerCountyIndustryRows([row({code:'236'})]),/county\/industry identity/);
 assert.throws(()=>projectCensusNonemployerCountyIndustryRows([row({extra:{zip5:'01001'}})]),/retained row shape/);
 const allocated=row();allocated.provenance.zip_allocation='crosswalk';assert.throws(()=>projectCensusNonemployerCountyIndustryRows([allocated]),/ZIP\/geocode\/allocation/);
 assert.throws(()=>projectCensusNonemployerCountyIndustryRows([row({raw:4,usable:4,flag:'D'})]),/flagged semantics/);
});
