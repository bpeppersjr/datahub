import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import connector from '../config/connectors/vt-childcare-preflight.json' with {type:'json'};
import {APP_ROOT} from './paths.mjs';
import {acquireVtChildcarePreflight,validateVtChildcarePreflight,writeVtChildcarePreflight,VT_CHILDCARE_FIELDS,VT_CHILDCARE_FIELD_TYPES,VT_CHILDCARE_URLS} from './vt-childcare-preflight.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const descriptions={
 file_name:'Name of the working file. Used in part to track reporting period.',
 license_id:'The distinct license number for each individual provider.',
 provider_name:'',license_type:'Whether the provider is Licensed (afterschool programs, center-based programs, license family homes) or Registered (registered family homes). Different CCFAP rates apply depending on whether the program is Licensed or Registered.',
 provider_program_type:'What specific type of program the provider is.',address_1:'',address_2:'',provider_town:'',zip_code:'',county:'',
 current_license_start_date:'When the current license term began.',current_license_end_date:'When the current license term expires.',
 total_licensed_capacity:'The maximum number of children a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 infant_licensed_capacity:'The maximum number of infants a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 toddler_licensed_capacity:'The maximum number of toddlers a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 preschool_licensed_capacity:'The maximum number of preschoolers a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 school_age_licensed_capacity:'The maximum number of school age children a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.'
};
const jitter=axis=>axis+' coordinates are generated based on the address fields provided. Coordinates are slightly offset (jittered) to distinguish programs sharing the same location while preserving the overall spatial pattern. Refer to the address fields for the provider\'s exact location.';
const catalogDescription='Vermont Child Care Provider Data including location, capacity, mailing list data and contact information, updated monthly. Data reflects the number of programs in business on the final day of the last complete month prior to the most recent update.';
const license={name:'Open Database License',termsLink:'http://opendatacommons.org/licenses/odbl/1.0/'};
const owner={id:'ihpx-mmkb',displayName:'Child Development Division Data Unit'};

function fixture(mutate=()=>{}){
 const calls=[];
 return {calls,now:()=>new Date('2026-09-08T21:00:00.000Z'),fetchImpl:async(url,options)=>{
 const kind=Object.keys(VT_CHILDCARE_URLS).find(k=>VT_CHILDCARE_URLS[k]===url);assert.ok(kind);calls.push(kind);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
 const value=kind==='metadata'?{id:'ctdw-tmfz',name:'Vermont Child Care Provider Data',description:catalogDescription,attribution:'Department for Children and Families (DCF), Child Development Division',owner:{...owner,privateContact:'PRIVATE_CONTACT'},licenseId:'OPEN_DATABASE_LICENSE',license:{...license},rowsUpdatedAt:1786726136,viewLastModified:1786726133,publicationDate:1786648521,columns:[...VT_CHILDCARE_FIELDS.map(fieldName=>({fieldName,dataTypeName:VT_CHILDCARE_FIELD_TYPES[fieldName],description:descriptions[fieldName],cachedContents:{sample:'PRIVATE_CONTACT'}})),{fieldName:'latitude',dataTypeName:'number',description:jitter('Latitudinal')},{fieldName:'longitude',dataTypeName:'number',description:jitter('Longitudinal')},{fieldName:'email_address',dataTypeName:'text',cachedContents:{sample:'PRIVATE_CONTACT'}}]}:
 kind==='groups'?[
 {file_name:'Provider_Report_07012026_08012026.xlsx',provider_program_type:'Afterschool Child Care Program',license_type:'Licensed Provider',source_rows:'149'},
 {file_name:'Provider_Report_07012026_08012026.xlsx',provider_program_type:'CBCCPP',license_type:'Licensed Provider',source_rows:'489'},
 {file_name:'Provider_Report_07012026_08012026.xlsx',provider_program_type:'CBCCPP - Non-Recurring',license_type:'Licensed Provider',source_rows:'14'},
 {file_name:'Provider_Report_07012026_08012026.xlsx',provider_program_type:'Licensed FCCH',license_type:'Licensed Provider',source_rows:'32'},
 {file_name:'Provider_Report_07012026_08012026.xlsx',provider_program_type:'Registered FCCH',license_type:'Registered Home',source_rows:'373'}]:
 [{source_rows:'503',distinct_licenses:'503',reporting_files:'1',license_start_count:'503',license_end_count:'502'}];
 const response=mutate(value,kind,calls.length);return response instanceof Response?response:Response.json(value);
 }};
}
const run=f=>acquireVtChildcarePreflight({fetchImpl:f.fetchImpl,now:f.now});
let good;const receipt=()=>good??=run(fixture());

test('VT sanitized six-request preflight conserves center and excluded groups without date inference',async()=>{
 const f=fixture(),r=await run(f);good=Promise.resolve(r);
 assert.deepEqual(f.calls,['metadata','groups','aggregate','aggregate','groups','metadata']);
 assert.equal(validateVtChildcarePreflight(r),r);assert.equal(r.source.record_count,503);assert.equal(r.source.total_source_rows,1057);assert.equal(r.source.distinct_licenses,503);assert.equal(r.source.license_end_count,502);
 assert.equal(r.source.reporting_period,null);assert.equal(r.source.reporting_period_verified,false);assert.equal(r.execution_mode,'injected-test-transport');assert.equal(r.readiness.acquisition_ready,false);assert.equal(r.claims.coordinates_selected,false);
 assert.equal(JSON.stringify(r).includes('PRIVATE_CONTACT'),false);assert.equal(r.observations[0].payload.license.termsLink,license.termsLink);assert.equal(r.observations[0].payload.coordinate_notices.length,2);
 assert.equal(new URL(VT_CHILDCARE_URLS.groups).searchParams.get('pageSize'),'201');assert.equal(new URL(VT_CHILDCARE_URLS.aggregate).searchParams.get('pageSize'),'2');assert.equal(VT_CHILDCARE_FIELDS.includes('latitude'),false);
});
test('VT rejects metadata/enum/period/count drift and unselected row leaks',async()=>{
 await Promise.all([
 (v,k)=>{if(k==='metadata')v.description='wrong';},(v,k)=>{if(k==='metadata')v.owner.id='wrong';},
 (v,k)=>{if(k==='metadata')v.license.termsLink='https://other.invalid';},(v,k)=>{if(k==='metadata')v.licenseId='PUBLIC_DOMAIN';},
 (v,k)=>{if(k==='metadata')v.columns[0].description='changed';},(v,k)=>{if(k==='metadata')v.columns.find(c=>c.fieldName==='latitude').description='precise';},
 (v,k)=>{if(k==='metadata')v.rows=[];},(v,k)=>{if(k==='metadata')v.rowsUpdatedAt=2000000000;},
 (v,k,n)=>{if(k==='metadata'&&n===6)v.viewLastModified++;},
 (v,k)=>{if(k==='groups')v[0].provider_program_type='Unknown';},(v,k)=>{if(k==='groups')v[0].license_type='ACTIVE';},
 (v,k)=>{if(k==='groups')v[0].file_name='Provider_Report_08012026_09012026.xlsx';},(v,k)=>{if(k==='groups')v.push({...v[0]});},
 (v,k)=>{if(k==='groups')v[1].source_rows='488';},(v,k)=>{if(k==='groups')v[0].phone='PRIVATE';},
 (v,k,n)=>{if(k==='groups'&&n===5)v[0].source_rows='148';},
 (v,k)=>{if(k==='aggregate')v[0].distinct_licenses='502';},(v,k)=>{if(k==='aggregate')v[0].source_rows='20001';},
 (v,k)=>{if(k==='aggregate')v[0].phone='PRIVATE';},
 (v,k)=>{if(k==='aggregate')v.push({...v[0]});},(v,k,n)=>{if(k==='aggregate'&&n===4)v[0].license_end_count='501';},
 ].map(async mutate=>assert.rejects(run(fixture(mutate)))));
});
test('VT strict HTTP and cancellation reject without retries or privacy leakage',async()=>{
 for(const response of [()=>new Response('PRIVATE',{status:429}),()=>new Response(null,{status:302}),()=>new Response(Uint8Array.of(255),{headers:{'content-type':'application/json'}}),()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'2000001'}})]){
 let calls=0;await assert.rejects(acquireVtChildcarePreflight({fetchImpl:()=>{calls++;return response();}}),e=>!e.message.includes('PRIVATE'));assert.equal(calls,1);
 }
 await assert.rejects(acquireVtChildcarePreflight({signal:AbortSignal.abort(),fetchImpl:()=>assert.fail('preabort')}),{name:'AbortError'});
 await assert.rejects(acquireVtChildcarePreflight({url:'https://other.invalid'}));
 for(const mode of ['headers','body']){
 const controller=new AbortController();let late,cancelled=0;
 const pending=acquireVtChildcarePreflight({signal:controller.signal,fetchImpl:()=>{
 if(mode==='headers')return new Promise(resolve=>{late=resolve;controller.abort();});
 return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));setImmediate(()=>controller.abort());},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}});
 }});
 await assert.rejects(pending,{name:'AbortError'});if(late){late(new Response(new ReadableStream({cancel(){cancelled++;}})));await new Promise(resolve=>setImmediate(resolve));}assert.equal(cancelled,1);
 }
});
test('VT immutable writer, offline semantic replay and config guard fail closed',async()=>{
 const r=await receipt(),created=[];
 for(const mutate of [v=>{v.readiness.acquisition_ready=true;},v=>{v.observations[0].payload.cachedContents={sample:'PRIVATE'};},v=>{v.observations[1].payload[0].source_rows='1';},v=>{v.source.reporting_period='2026-07';},v=>{for(const o of v.observations)if(o.kind==='metadata')o.payload.rowsUpdatedAt=2000000000;}]){
 const changed=structuredClone(r);mutate(changed);for(const o of changed.observations)o.payload_sha256=hash(o.payload);assert.throws(()=>validateVtChildcarePreflight(changed));
 }
 const old=connector.description;try{connector.description='drift';assert.throws(()=>validateVtChildcarePreflight(r));}finally{connector.description=old;}
 try{const a=await writeVtChildcarePreflight(r);created.push(a.path);const before=await readFile(a.path);const b=await writeVtChildcarePreflight(r);created.push(b.path);assert.notEqual(a.path,b.path);assert.deepEqual(await readFile(a.path),before);assert.deepEqual(JSON.parse(before),r);await assert.rejects(writeVtChildcarePreflight(r,{signal:AbortSignal.abort()}),{name:'AbortError'});await assert.rejects(writeVtChildcarePreflight(r,{outputRoot:'foreign'}));}finally{for(const p of created)await rm(p);}
});
test('VT CLI help and malformed options never acquire',()=>{
 for(const [args,status]of [[['--help'],0],[['--url','https://other.invalid'],1],[['--help','--help'],1]]){
 const r=spawnSync(process.execPath,[path.join(APP_ROOT,'scripts/preflight-vt-childcare.mjs'),...args],{cwd:APP_ROOT,encoding:'utf8',timeout:5000});assert.equal(r.status,status);assert.equal(r.stderr.includes('https://other.invalid'),false);
 }
});
