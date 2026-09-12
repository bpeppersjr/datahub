import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,writeFile,readdir,unlink,rmdir,link} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'csv-parse/sync';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {MN_CONSTRUCTION_COLUMNS} from './mn-construction-preflight.mjs';
import {normalizeMnConstructionRecord} from './mn-construction-normalization.mjs';
import {projectMnConstructionCredential} from './mn-construction-credential-reporting.mjs';
import {projectMnCredentialFlat,MN_CREDENTIAL_FLAT_REQUIRED_FIELDS,exportMnCredentialFlat,exportMnCredentialFlatWithTestInput as build,verifyMnCredentialFlatWithTestInput as verify} from './mn-credential-flat-export.mjs';
const opts={selection:'config/mn-credential-registry-selection.json',policyMode:'local-review-only',format:'both'},sha=v=>createHash('sha256').update(v).digest('hex');
function fixture(){const records=[{Name:'=SYNTHETIC FORMULA',St:'MN',Zip:'00501-0012'},{Name:'Outside state fixture',St:'WI',Zip:''}].map((changes,i)=>projectMnConstructionCredential(normalizeMnConstructionRecord({...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,''])),Bus_Pers:'Business',Lic_Number:'BC123456',Status:'Issued',Name:'Fixture',Addr1:'PO Box 12',City:'Fixture City',Orig_Date:'1/2/2020',Exp_Date:'3/31/2027',Phone_No:'EXCLUDED CONTACT',Email_Address:'EXCLUDED CONTACT',...changes},{runId:'flat-fixture',sourceReleaseId:'source-fixture',observedAt:'2026-09-08T12:00:00.000Z',cohort:'residential',sourceFileSha256:'a'.repeat(64),rowNumber:i+1})));
 return {records,source:{dataset_id:'mn-construction-credential-reporting',release_id:'fixture',manifest_sha256:'b'.repeat(64),artifact_sha256:'c'.repeat(64)},selection:{path:opts.selection,sha256:'d'.repeat(64)}};
}
async function cleanup(manifest){const directory=path.dirname(manifest);assert.equal(path.dirname(directory),path.join(APP_ROOT,'data/tmp/mn-credential-flat-tests'));for(const name of await readdir(directory))await unlink(path.join(directory,name));await rmdir(directory);}
test('typed projection preserves repeated IDs, source dates, provenance, ZIP4 and missing/outside ZIP',()=>{const input=fixture(),rows=input.records.map(projectMnCredentialFlat);assert.equal(rows[0].credential_identifier,rows[1].credential_identifier);assert.notEqual(rows[0].source_record_id,rows[1].source_record_id);assert.equal(rows[0].reported_zip5,'00501');assert.equal(rows[0].reported_zip4,'0012');assert.equal(rows[1].reported_state,'WI');assert.equal(rows[1].reported_zip5,null);assert.equal(rows[0].original_date_source,'1/2/2020');assert.equal(rows[0].source_national_reporting_integrated,false);assert.doesNotMatch(JSON.stringify(rows),/EXCLUDED CONTACT|latitude|longitude|county|site_entity_id/);});
test('CSV and JSONL publish last and independently conserve credential rows with explicit CSV safety',async()=>{
 const input=fixture();let saved;try{saved=await build(input,opts,async(stage,{directory})=>{if(stage==='before-publication')assert.deepEqual((await readdir(directory)).sort(),['credentials.csv','credentials.jsonl','manifest.tmp']);});const m=await verify(saved.manifest,saved.sha256,input);assert.equal(m.credential_rows_written,2);assert.equal(m.claims.unique_business_count,null);assert.equal(m.claims.physical_site_count,null);assert.equal(m.execution_mode,'synthetic-test-input');
  const csvRows=parse(await readFile(path.join(path.dirname(saved.manifest),'credentials.csv'),'utf8'),{columns:true});assert.equal(csvRows.length,2);assert.equal(csvRows[0].reported_zip5,'00501');assert.equal(csvRows[0].business_name_source,"'=SYNTHETIC FORMULA");
  const jsonRows=(await readFile(path.join(path.dirname(saved.manifest),'credentials.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(jsonRows[0].business_name_source,'=SYNTHETIC FORMULA');assert.deepEqual(jsonRows,input.records.map(projectMnCredentialFlat));
 }finally{if(saved)await cleanup(saved.manifest);}
});
test('public policy and unreviewed selections reject before retained loading',async()=>{for(const options of [{...opts,policyMode:'public-only'},{...opts,selection:'data/other.json'},{...opts,output:'outside'},{...opts,format:'xlsx'}])await assert.rejects(exportMnCredentialFlat(options));const input=fixture();input.records.push(input.records[0]);await assert.rejects(build(input,opts));});
test('single formats preserve exact declared roster',async()=>{for(const format of ['csv','jsonl']){let saved;try{saved=await build(fixture(),{...opts,format});const m=await verify(saved.manifest,saved.sha256,fixture());assert.deepEqual(m.artifacts.map(a=>a.path),['credentials.'+format]);}finally{if(saved)await cleanup(saved.manifest);}}});
test('rehashing altered output does not bypass source row verification',async()=>{const input=fixture();let saved;try{saved=await build(input,opts);const directory=path.dirname(saved.manifest),file=path.join(directory,'credentials.jsonl');const changed=(await readFile(file,'utf8')).replace('Outside state fixture','Altered fixture');await writeFile(file,changed);const m=JSON.parse(await readFile(saved.manifest,'utf8'));Object.assign(m.artifacts.find(a=>a.path==='credentials.jsonl'),{bytes:Buffer.byteLength(changed),sha256:sha(changed)});const raw=JSON.stringify(m)+'\n';await writeFile(saved.manifest,raw);await assert.rejects(verify(saved.manifest,sha(raw),input));}finally{if(saved)await cleanup(saved.manifest);}});
test('prepublication cancellation removes owned output; committed cancellation and failure preserve evidence',async()=>{
 const input=fixture(),controller=new AbortController();let directory;
 await assert.rejects(build(input,{...opts,signal:controller.signal},async(stage,value)=>{directory=value.directory;if(stage==='before-publication')controller.abort();}));await assert.rejects(readdir(directory),{code:'ENOENT'});
 let saved;try{const late=new AbortController();saved=await build(input,{...opts,signal:late.signal},async stage=>{if(stage==='after-publication')late.abort();});assert.equal(saved.cancellation_after_publication,true);await verify(saved.manifest,saved.sha256,input);}finally{if(saved)await cleanup(saved.manifest);}
 let recovery;try{await assert.rejects(build(input,opts,async stage=>{if(stage==='after-publication')throw Error('PRIVATE ERROR');}),error=>{assert.equal(error.code,'MN_CREDENTIAL_EXPORT_UNCERTAIN');recovery=error.recovery;assert.doesNotMatch(JSON.stringify(recovery),/PRIVATE ERROR/);return true;});await verify(recovery.manifest,recovery.sha256,input);}finally{if(recovery)await cleanup(recovery.manifest);}
});
test('CLI rejects public mode before importing loader or reading retained rows',async()=>{await assert.rejects(promisify(execFile)(process.execPath,[path.join(APP_ROOT,'scripts/export-mn-credentials.mjs'),'--selection',opts.selection,'--policy-mode','public-only','--format','both'],{windowsHide:true,timeout:10000}),error=>{assert.equal(error.code,1);assert.equal(error.stdout,'');return true;});});
test('failed publication preserves externally linked output instead of deleting changed ownership',async()=>{
 let directory;try{await assert.rejects(build(fixture(),{...opts,format:'jsonl'},async(stage,value)=>{directory=value.directory;if(stage==='before-publication')await link(path.join(directory,'credentials.jsonl'),path.join(directory,'unexpected.jsonl'));}));assert.deepEqual((await readdir(directory)).sort(),['credentials.jsonl','unexpected.jsonl']);}finally{if(directory)await cleanup(path.join(directory,'manifest.json'));}
});
test('closed field selection retains mandatory provenance and filters only reported address states',async()=>{
 const input=fixture();let saved;try{saved=await build(input,{...opts,fields:['business_name_source','reported_zip5'],states:['WI']});const m=await verify(saved.manifest,saved.sha256,input);assert.equal(m.source_credential_rows,2);assert.equal(m.filtered_out_credential_rows,1);assert.equal(m.credential_rows_written,1);assert.deepEqual(m.reported_states,['WI']);assert.ok(MN_CREDENTIAL_FLAT_REQUIRED_FIELDS.every(f=>m.fields.includes(f)));assert.equal(m.fields.includes('reported_street'),false);const row=JSON.parse((await readFile(path.join(path.dirname(saved.manifest),'credentials.jsonl'),'utf8')).trim());assert.equal(row.reported_state,'WI');assert.equal(row.publisher_jurisdiction,'MN');assert.equal(row.reported_zip5,null);}finally{if(saved)await cleanup(saved.manifest);}
 for(const invalid of [{fields:['phone']},{fields:['business_name_source','business_name_source']},{states:['mn']},{states:['ZZ']},{states:['MN','MN']}])await assert.rejects(exportMnCredentialFlat({...opts,...invalid}));
});
test('zero-row filtered exports remain valid with complete source/filter accounting',async()=>{
 const input=fixture();for(const format of ['csv','jsonl','both']){let saved;try{saved=await build(input,{...opts,format,states:['AK'],fields:[]});const m=await verify(saved.manifest,saved.sha256,input);assert.equal(m.source_credential_rows,2);assert.equal(m.filtered_out_credential_rows,2);assert.equal(m.credential_rows_written,0);assert.ok(m.artifacts.every(a=>a.records===0));if(format!=='csv')assert.equal(await readFile(path.join(path.dirname(saved.manifest),'credentials.jsonl'),'utf8'),'');}finally{if(saved)await cleanup(saved.manifest);}}
});
test('multiline/control source text is rejected by the retained-row contract',async()=>{
 for(const value of ['First\nSecond','First\rSecond','First\r\nSecond']){const input=fixture();input.records[0].record.business_name=value;assert.throws(()=>projectMnCredentialFlat(input.records[0]));await assert.rejects(build(input,opts));}
});
test('field/state controls reject sparse arrays, accessors, extra properties and excessive lengths before loading',async()=>{
 for(const key of ['fields','states']){
  const getter=[];Object.defineProperty(getter,'0',{get(){assert.fail('array getter must not run');},enumerable:true});
  const extra=[];extra.extra='ignored';const symbol=[];symbol[Symbol('extra')]=true;
  for(const value of [new Array(1),getter,extra,symbol,new Array(52)])await assert.rejects(exportMnCredentialFlat({...opts,[key]:value}));
 }
});
