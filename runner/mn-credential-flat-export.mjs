import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,mkdir,readdir,link,unlink,rmdir} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {parse} from 'csv-parse/sync';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {loadMnCredentialRegistryInput} from './mn-credential-registry-input.mjs';
import {validateMnConstructionCredentialReporting} from './mn-construction-credential-reporting.mjs';

const VERSION='mn-credential-flat-export@1.0.0',MAX=150000000,ROWS=250000;
const SELECTION='config/mn-credential-registry-selection.json',REPORT='data/credential-reporting/mn-construction/30cd9c0e-0a8d-467c-b416-150453e1513f/manifest.json';
// Reviewed manifest pin; spelling retained separately from fixture hashes.
const REPORT_HASH='558182417940580140fbc4640e80ac177b6a9c1886a435f06ae8130b1f258b75';
const check=v=>{if(!v)throw Error('Typed credential export rejected.');};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const claims=()=>({record_unit:'publisher-business-credential-row',export_policy:'local-review-only',public_export_authorized:false,source_national_reporting_integrated:false,unique_business_count:null,active_business_count:null,physical_site_count:null,geographic_assignment_performed:false,source_request_performed:false});
export const MN_CREDENTIAL_FLAT_FIELDS=Object.freeze('reporting_id source_record_id record_unit publisher_jurisdiction credential_identifier_type credential_identifier credential_kind credential_category business_name_source dba_name_source status_source original_date_source expiration_date_source date_semantics reported_street reported_street2 reported_city reported_state reported_country reported_zip5 reported_zip4 address_role source_url source_release_id source_file_sha256 source_row_number selected_fields_sha256 ingest_run_id source_observed_at source_transformation_version attribution export_policy source_national_reporting_integrated active_business_verified physical_location_verified geographic_assignment_performed'.split(' '));
export const MN_CREDENTIAL_FLAT_REQUIRED_FIELDS=Object.freeze('reporting_id source_record_id record_unit publisher_jurisdiction credential_identifier_type credential_identifier credential_kind credential_category date_semantics reported_state address_role source_url source_release_id source_file_sha256 source_row_number selected_fields_sha256 ingest_run_id source_observed_at source_transformation_version attribution export_policy source_national_reporting_integrated active_business_verified physical_location_verified geographic_assignment_performed'.split(' '));
const STATES='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
function denseValues(value,maximum){check(Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype);const length=Object.getOwnPropertyDescriptor(value,'length').value;check(length<=maximum&&Reflect.ownKeys(value).length===length+1);const values=[];for(let i=0;i<length;i++){const descriptor=Object.getOwnPropertyDescriptor(value,String(i));check(descriptor&&Object.hasOwn(descriptor,'value'));values.push(descriptor.value);}return values;}
function selections(fields,states){const requested=fields===undefined?undefined:denseValues(fields,MN_CREDENTIAL_FLAT_FIELDS.length),places=states===undefined?[]:denseValues(states,STATES.length);check(requested===undefined||requested.every(x=>MN_CREDENTIAL_FLAT_FIELDS.includes(x))&&new Set(requested).size===requested.length);check(places.every(x=>STATES.includes(x))&&new Set(places).size===places.length);return {fields:MN_CREDENTIAL_FLAT_FIELDS.filter(f=>requested===undefined||requested.includes(f)||MN_CREDENTIAL_FLAT_REQUIRED_FIELDS.includes(f)),states:places.sort()};}
export function projectMnCredentialFlat(envelope){
 validateMnConstructionCredentialReporting(envelope);const r=envelope.record,c=r.credential,a=r.reported_address,p=r.provenance;
 check(c.kind==='license');return {reporting_id:envelope.reporting_id,source_record_id:r.source_record_id,record_unit:'publisher-business-credential-row',publisher_jurisdiction:'MN',
  credential_identifier_type:r.external_identifiers[0].type,credential_identifier:r.external_identifiers[0].value,credential_kind:c.kind,credential_category:c.category,
  business_name_source:r.business_name,dba_name_source:r.dba_name,status_source:c.status_source,original_date_source:c.original_date_source,expiration_date_source:c.expiration_date_source,date_semantics:c.date_semantics,
  reported_street:a.street,reported_street2:a.street2,reported_city:a.city,reported_state:a.state,reported_country:a.country,reported_zip5:a.zip_code,reported_zip4:a.zip4,address_role:a.address_role,
  source_url:p.source_url,source_release_id:p.source_release_id,source_file_sha256:p.source_file_sha256,source_row_number:p.source_row_number,selected_fields_sha256:p.selected_fields_sha256,ingest_run_id:p.ingest_run_id,source_observed_at:p.observed_at,source_transformation_version:p.transformation_version,attribution:p.attribution,
  export_policy:'local-review-only',source_national_reporting_integrated:false,active_business_verified:false,physical_location_verified:false,geographic_assignment_performed:false};
}
function options(value){check(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).every(k=>['selection','policyMode','format','signal','fields','states'].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')));check(value.selection===SELECTION&&value.policyMode==='local-review-only'&&['csv','jsonl','both'].includes(value.format)&&(!value.signal||value.signal instanceof AbortSignal));return {...value,...selections(value.fields,value.states)};}
async function nativeInput(signal){const selected=await readJson(path.join(APP_ROOT,SELECTION),10000,signal);check(same(selected,{schema_version:'mn-credential-registry-input@1.0.0',manifest_path:REPORT,manifest_sha256:REPORT_HASH}));const input=await loadMnCredentialRegistryInput(path.join(APP_ROOT,SELECTION),{signal});check(input.records.length===11456&&input.source.manifest_sha256===REPORT_HASH);return input;}
function inputCheck(input){check(input&&Array.isArray(input.records)&&input.records.length>0&&input.records.length<=ROWS&&input.source&&digest(input.source.manifest_sha256)&&digest(input.source.artifact_sha256)&&input.selection&&digest(input.selection.sha256));const ids=new Set();for(const row of input.records){projectMnCredentialFlat(row);check(!ids.has(row.reporting_id));ids.add(row.reporting_id);}return input;}
const text=v=>v===null?'':String(v);
const safeCsv=v=>{const s=text(v);return /^[=+\-@\t\r]/.test(s)?"'"+s:s;};
const csv=v=>'"'+safeCsv(v).replaceAll('"','""')+'"';
const stable=(a,b)=>a?.isFile()&&b?.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&a.ino===b.ino&&a.dev===b.dev&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
async function* lines(file,maximum,signal,meter){
 await canonical(path.dirname(file));const before=await lstat(file,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(maximum));const handle=await open(file,'r'),sha=createHash('sha256'),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,tail='';
 try{check(stable(before,await handle.stat({bigint:true})));for(;;){signal?.throwIfAborted();const buffer=Buffer.alloc(65536),part=await handle.read(buffer);if(!part.bytesRead)break;bytes+=part.bytesRead;check(bytes<=maximum);const raw=buffer.subarray(0,part.bytesRead);sha.update(raw);tail+=decoder.decode(raw,{stream:true});let end;while((end=tail.indexOf('\n'))!==-1){const line=tail.slice(0,end);check(Buffer.byteLength(line)<=65536);yield line;tail=tail.slice(end+1);}check(Buffer.byteLength(tail)<=65536);}
  tail+=decoder.decode();check(tail==='');check(stable(before,await handle.stat({bigint:true}))&&stable(before,await lstat(file,{bigint:true}))&&bytes===Number(before.size));meter.bytes=bytes;meter.sha256=sha.digest('hex');
 }finally{await handle.close();}
}
async function verify(directory,name,input,synthetic,expectedHash,signal){
 const mm={},m=await readJson(path.join(directory,name),100000,signal,mm);check(mm.sha256===expectedHash&&m.schema_version===VERSION&&m.run_id===path.basename(directory)&&m.execution_mode===(synthetic?'synthetic-test-input':'verified-retained-input')&&same(m.claims,claims())&&same(m.source,input.source)&&same(m.selection,input.selection));
 check(same(Object.keys(m).sort(),'schema_version run_id execution_mode created_at format fields reported_states source_credential_rows filtered_out_credential_rows credential_rows_written csv_formula_safety source selection claims artifacts'.split(' ').sort()));
 check(typeof m.created_at==='string'&&Number.isFinite(Date.parse(m.created_at))&&new Date(m.created_at).toISOString()===m.created_at);
 const selected=selections(m.fields,m.reported_states);check(same(selected.fields,m.fields)&&same(selected.states,m.reported_states));const records=input.records.filter(r=>!selected.states.length||selected.states.includes(r.record.reported_address.state));
 check(m.source_credential_rows===input.records.length&&m.filtered_out_credential_rows===input.records.length-records.length&&m.credential_rows_written===records.length&&m.csv_formula_safety==='apostrophe-prefix'&&['csv','jsonl','both'].includes(m.format)&&Array.isArray(m.artifacts));
 const expectedNames=m.format==='both'?['credentials.csv','credentials.jsonl']:['credentials.'+m.format];check(same(m.artifacts.map(a=>a.path),expectedNames)&&same((await readdir(directory)).sort(),[name,...expectedNames].sort()));
 const fields=m.fields;
 for(const a of m.artifacts){check(same(Object.keys(a).sort(),'path bytes sha256 artifact_type records export_policy'.split(' ').sort())&&Number.isSafeInteger(a.bytes)&&a.bytes>=0&&a.bytes<=MAX&&digest(a.sha256)&&a.artifact_type===(a.path.endsWith('.csv')?'mn-credential-flat-csv':'mn-credential-flat-jsonl')&&a.records===records.length&&a.export_policy==='local-review-only');const meter={};let index=0,header=a.path.endsWith('.csv');
  for await(const line of lines(path.join(directory,a.path),MAX,signal,meter)){if(header){const parsed=parse(line);check(parsed.length===1&&same(parsed[0],fields));header=false;continue;}check(index<records.length);const full=projectMnCredentialFlat(records[index++]),expected=Object.fromEntries(fields.map(k=>[k,full[k]]));if(a.path.endsWith('.csv')){const parsed=parse(line);check(parsed.length===1&&same(parsed[0],fields.map(k=>safeCsv(expected[k]))));}else check(same(JSON.parse(line),expected));}
  check(!header&&index===records.length&&meter.sha256===a.sha256&&meter.bytes===a.bytes);
 }
 const again={};await readJson(path.join(directory,name),100000,signal,again);check(again.sha256===mm.sha256&&again.identity.ino===mm.identity.ino&&again.identity.dev===mm.identity.dev);return m;
}
async function build(input,opts,synthetic,hook,revalidate){
 inputCheck(input);const {signal,format,fields,states}=opts,records=input.records.filter(r=>!states.length||states.includes(r.record.reported_address.state));signal?.throwIfAborted();const root=path.join(APP_ROOT,synthetic?'data/tmp/mn-credential-flat-tests':'data/exports/mn-credentials');await canonical(root,{create:true,output:true,signal});const run=randomUUID(),directory=path.join(root,run);await mkdir(directory);const owner=await lstat(directory,{bigint:true}),owned=new Map();let published=false,manifestHash;
 const manifest=path.join(directory,'manifest.json');
 async function stableDirectory(){await canonical(directory);const s=await lstat(directory,{bigint:true});check(s.isDirectory()&&!s.isSymbolicLink()&&s.ino===owner.ino&&s.dev===owner.dev);}
 async function write(name,produce,maximum=MAX){const file=path.join(directory,name);await stableDirectory();const h=await open(file,'wx');const identity=await h.stat({bigint:true});owned.set(file,identity);const sha=createHash('sha256');let bytes=0;
  try{for await(const value of produce){signal?.throwIfAborted();const raw=Buffer.from(value);bytes+=raw.length;check(bytes<=maximum);sha.update(raw);await h.writeFile(raw);}await h.sync();const current=await h.stat({bigint:true}),named=await lstat(file,{bigint:true});check(stable(current,named)&&current.ino===identity.ino&&current.dev===identity.dev&&current.size===BigInt(bytes));return {path:name,bytes,sha256:sha.digest('hex')};}finally{await h.close();}}
 const descriptor=()=>({manifest,sha256:manifestHash,execution_mode:synthetic?'synthetic-test-input':'verified-retained-input',source_credential_rows:input.records.length,filtered_out_credential_rows:input.records.length-records.length,credential_rows_written:records.length,export_policy:'local-review-only',cancellation_after_publication:Boolean(signal?.aborted)});
 try{
  const artifacts=[];
  for(const extension of format==='both'?['csv','jsonl']:[format]){async function* rows(){if(extension==='csv')yield fields.map(csv).join(',')+'\n';for(const record of records){const full=projectMnCredentialFlat(record),row=Object.fromEntries(fields.map(k=>[k,full[k]]));yield extension==='csv'?fields.map(k=>csv(row[k])).join(',')+'\n':JSON.stringify(row)+'\n';}}
   artifacts.push({...await write('credentials.'+extension,rows()),artifact_type:'mn-credential-flat-'+extension,records:records.length,export_policy:'local-review-only'});
  }
  const m={schema_version:VERSION,run_id:run,execution_mode:synthetic?'synthetic-test-input':'verified-retained-input',created_at:new Date().toISOString(),format,fields,reported_states:states,source_credential_rows:input.records.length,filtered_out_credential_rows:input.records.length-records.length,credential_rows_written:records.length,csv_formula_safety:'apostrophe-prefix',source:input.source,selection:input.selection,claims:claims(),artifacts};
  manifestHash=(await write('manifest.tmp',[JSON.stringify(m)+'\n'],100000)).sha256;
  await hook?.('before-publication',{directory});await verify(directory,'manifest.tmp',input,synthetic,manifestHash,signal);
  if(revalidate){const after=await revalidate();check(same(after.source,input.source)&&same(after.selection,input.selection)&&same(after.records,input.records));}
  await stableDirectory();signal?.throwIfAborted();await link(path.join(directory,'manifest.tmp'),manifest);published=true;await unlink(path.join(directory,'manifest.tmp'));
  await hook?.('after-publication',{directory});await verify(directory,'manifest.json',input,synthetic,manifestHash);return descriptor();
 }catch{const error=Error(published?'Credential export publication uncertain; preserve output for inspection.':'Credential export failed.');error.code=published?'MN_CREDENTIAL_EXPORT_UNCERTAIN':'MN_CREDENTIAL_EXPORT_FAILED';if(published)error.recovery=descriptor();throw error;}
 finally{if(!published)try{await stableDirectory();for(const [file,id]of owned){const now=await lstat(file,{bigint:true}).catch(()=>null);if(now?.isFile()&&!now.isSymbolicLink()&&now.nlink===1n&&now.ino===id.ino&&now.dev===id.dev)await unlink(file);}await rmdir(directory);}catch{/* Preserve artifacts whose ownership changed. */}}
}
export async function exportMnCredentialFlat(value){const opts=options(value);const input=await nativeInput(opts.signal);return build(input,opts,false,undefined,()=>nativeInput(opts.signal));}
export async function exportMnCredentialFlatWithTestInput(input,value,hook){const opts=options(value);check(hook===undefined||typeof hook==='function');return build(structuredClone(input),opts,true,hook);}
function manifestPath(manifest,synthetic){check(typeof manifest==='string'&&path.isAbsolute(manifest)&&path.basename(manifest)==='manifest.json'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(path.basename(path.dirname(manifest)))&&path.dirname(path.dirname(manifest))===path.join(APP_ROOT,synthetic?'data/tmp/mn-credential-flat-tests':'data/exports/mn-credentials'));}
export async function verifyMnCredentialFlat(manifest,expectedHash,{signal}={}){manifestPath(manifest,false);check(digest(expectedHash));await canonical(path.dirname(manifest));const input=await nativeInput(signal);return verify(path.dirname(manifest),'manifest.json',input,false,expectedHash,signal);}
export async function verifyMnCredentialFlatWithTestInput(manifest,expectedHash,input){manifestPath(manifest,true);inputCheck(input);return verify(path.dirname(manifest),'manifest.json',input,true,expectedHash);}
