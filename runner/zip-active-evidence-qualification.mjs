import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {readNationalReportingSnapshot} from './national-reporting-snapshot.mjs';
import {mnSelectionReadJson, mnSelectionReadLines} from './mn-construction-retained-selection.mjs';
import {assessBusinessSourceTemporalStatus, BUSINESS_SOURCE_TEMPORAL_POLICY_VERSION} from './business-source-temporal-status.mjs';

export const ZIP_ACTIVE_EVIDENCE_SCHEMA='zip-active-evidence-qualification@1.0.0';
const check=(value,message='ZIP evidence qualification rejected.')=>{if(!value)throw Error(message);};
const count=value=>Number.isSafeInteger(value)&&value>=0;
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const sorted=value=>Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
const child=(base,relative)=>{
 check(typeof relative==='string'&&!path.isAbsolute(relative)&&relative.split('/').every(part=>part&&part!=='.'&&part!=='..')&&!relative.includes('\\'));
 return path.join(base,...relative.split('/'));
};

// Counts remain in their source-defined units. Eligibility is only an internal
// temporal review qualification; it never upgrades a record to an active business.
export function createZipActiveEvidenceProjection({sources,asOf,createdAt,bindings={},upstreamExportPolicies={}}){
 check(iso(asOf)&&iso(createdAt)&&Date.parse(createdAt)>=Date.parse(asOf),'Explicit assessment/build clocks are invalid.');
 check(Array.isArray(sources)&&sources.length<=1000);
 const policies={...upstreamExportPolicies,...Object.fromEntries(sources.filter(source=>source.export_policy!==undefined).map(source=>[`source:${source.source_key}`,source.export_policy]))};
 check(Object.values(policies).every(value=>['internal','local-review-only'].includes(value)),'Unsupported upstream export policy.');
 const exportPolicy=Object.values(policies).includes('internal')?'internal':'local-review-only';
 const policyBinding={rule:'most-restrictive-upstream-with-local-review-only-ceiling',upstream:sorted(policies),effective:exportPolicy};
 const bySource=new Map(),totals=new Map(),members=new Map(),zips=new Set(),rows=[];
 for(const source of sources){
  check(typeof source.source_key==='string'&&source.source_key&&!bySource.has(source.source_key)&&source.complete_source_for_all_businesses===false);
  bySource.set(source.source_key,source);
  if(source.zip_level_counts!==undefined){
   check(plain(source.zip_level_counts)&&count(source.zip_rows_with_contribution));
   check(Object.entries(source.zip_level_counts).every(([unit,value])=>unit.endsWith('_count')&&count(value)));
   totals.set(source.source_key,{});members.set(source.source_key,0);
  }
 }
 let finished=false;
 return {
  add(zip){
   check(!finished&&/^\d{5}$/.test(zip.zip_code)&&!zips.has(zip.zip_code)&&zips.size<100000,'Duplicate or invalid ZIP.');zips.add(zip.zip_code);
   check(zip.complete_all_businesses===false&&plain(zip.source_contributions),'ZIP claim or contribution shape invalid.');
   for(const [key,contribution] of Object.entries(zip.source_contributions)){
    const source=bySource.get(key);
    check(source&&totals.has(key)&&plain(contribution),'Unbound ZIP source contribution.');
    const metadata=source.release_metadata;
    check(plain(metadata)&&typeof metadata.source_release_id==='string'&&metadata.source_release_id,'Missing source release identity.');
    const counts={};
    for(const [field,value] of Object.entries(contribution)){
     if(field.endsWith('_count')){
      check(count(value)&&Object.hasOwn(source.zip_level_counts,field),'Invalid or undeclared source count unit.');
      counts[field]=value;
      const total=(totals.get(key)[field]??0)+value;check(count(total),'Count overflow.');totals.get(key)[field]=total;
     }else if(value!==null&&value!==undefined)check(Object.hasOwn(metadata,field)&&isDeepStrictEqual(value,metadata[field]),'Source metadata drift.');
    }
    check(Object.keys(counts).length>0&&contribution.source_release_id===metadata.source_release_id,'Source count/release absent.');
    if(Object.values(counts).some(value=>value>0))members.set(key,members.get(key)+1);
    const temporal=assessBusinessSourceTemporalStatus(source,{asOf});
    const qualification=temporal.status==='within-review-window'?'measured-within-review-window':temporal.status==='review-due'?'measured-stale-review-due':'unmeasured';
    check(rows.length<750000,'ZIP/source pair limit exceeded.');
    rows.push({zip5:zip.zip_code,source_key:key,source_release_id:metadata.source_release_id,
     source_kind:source.source_kind??'unmeasured',evidence_type:temporal.evidence_scope,
     qualification,temporal_status:temporal,source_reference_metadata:{...metadata},
     evidence_counts_by_unit:sorted(counts),eligible_evidence_counts_by_unit:sorted(Object.fromEntries(Object.entries(counts).map(([unit,value])=>[unit,qualification==='unmeasured'?null:qualification==='measured-stale-review-due'?0:value]))),
     eligibility_basis:'internal-source-temporal-review-window-only-not-verified-operation',
     current_operations_verified:false,current_operating_business_count:null,all_business_denominator:null,all_business_completion_percent:null});
   }
  },
  finish(){
   check(!finished);finished=true;
   const conservation=[];
   for(const [key,actual] of totals){
    const source=bySource.get(key);
    for(const [unit,expected] of Object.entries(source.zip_level_counts))check((actual[unit]??0)===expected,'Source typed-count conservation failed.');
    check(members.get(key)===source.zip_rows_with_contribution,'Source ZIP membership conservation failed.');
    conservation.push({source_key:key,source_release_id:source.release_metadata?.source_release_id??null,counts_by_unit:sorted(source.zip_level_counts),positive_zip_members:members.get(key)});
   }
   return {schema_version:ZIP_ACTIVE_EVIDENCE_SCHEMA,as_of:asOf,created_at:createdAt,temporal_policy_version:BUSINESS_SOURCE_TEMPORAL_POLICY_VERSION,
    bindings:{...bindings,export_policy:policyBinding},zip_members:zips.size,rows:rows.sort((a,b)=>a.zip5.localeCompare(b.zip5)||a.source_key.localeCompare(b.source_key)),conservation:conservation.sort((a,b)=>a.source_key.localeCompare(b.source_key)),
    claims:{current_operations_verified:false,active_business_count:null,all_business_denominator:null,all_business_completion_percent:null,overlapping_units_additive:false,source_record_status_distribution_replayed:false,source_replay_performed:false,network_requests:0,production_pointers_changed:false,export_policy:exportPolicy},
    limitations:['Source-level temporal qualification only; within-review-window is not verified current operation.','Source units and sources overlap; never sum them into unique businesses or sites.','Absent ZIP/source pairs remain absent, not measured zero. ZIP5 is source-reported evidence, not a USPS validity or polygon claim.','Stale means the internal review window elapsed, not closure. Build time does not refresh source reference dates.','Observation-only, missing, future and unconfigured source references remain unmeasured. Sources without ZIP contribution measures are outside this projection.']};
  },
 };
}

// Read-only build from published aggregates. Every artifact is pinned/rechecked;
// this is not a raw-source or per-record status conservation replay.
export async function buildZipActiveEvidenceQualification({root=APP_ROOT,asOf,createdAt,signal}={}){
 signal?.throwIfAborted();
 const coveragePointer=path.join(root,'data/business-coverage-views/current.json');
 const snapshot=await readNationalReportingSnapshot({pointerPath:coveragePointer,signal});
 const dependency=snapshot.manifest.dependencies.filter(row=>row.dataset_id==='national-business-registry');check(dependency.length===1);
 const registryPointerPath=path.join(root,'data/business-registry/current.json'),pointerMeter={},registryMeter={};
 const pointer=await mnSelectionReadJson(registryPointerPath,16000,signal,pointerMeter);
 check(pointer.dataset_id==='national-business-registry'&&pointer.release_id===dependency[0].release_id&&/^[a-zA-Z0-9._-]+$/.test(pointer.release_id)&&pointer.manifest===`releases/${pointer.release_id}/manifest.json`);
 const registryPath=child(path.dirname(registryPointerPath),pointer.manifest);
 const registry=await mnSelectionReadJson(registryPath,2000000,signal,registryMeter);
 check(registryMeter.sha256===dependency[0].manifest_sha256&&registry.dataset_id===pointer.dataset_id&&registry.release_id===pointer.release_id&&registry.schema_version==='1.0.0'&&registry.status==='published-partial'&&registry.publisher?.id===pointer.dataset_id&&registry.publisher?.version===dependency[0].publisher_version,'Registry dependency mismatch.');
 check(count(registry.coverage?.resolution_location_profiles)&&registry.coverage.resolution_location_profiles===snapshot.manifest.coverage?.location_profiles_assessed,'Published profile totals do not conserve.');
 const matches=snapshot.manifest.artifacts.filter(row=>row.artifact_type==='zip-coverage-view-jsonl');check(matches.length===1);
 const artifact=matches[0];check(count(artifact.bytes)&&artifact.bytes>0&&artifact.bytes<=2_000_000_000&&count(artifact.record_count)&&artifact.record_count<=100000&&/^[a-f0-9]{64}$/.test(artifact.sha256)&&['internal','local-review-only'].includes(artifact.export_policy));
 const zipPath=child(path.join(path.dirname(coveragePointer),'releases',snapshot.manifest.release_id),artifact.path),meter={};
 const projection=createZipActiveEvidenceProjection({sources:snapshot.sources,asOf,createdAt,upstreamExportPolicies:{coverage_snapshot:snapshot.evidence.exportPolicy,zip_artifact:artifact.export_policy},bindings:{coverage:snapshot.evidence,registry:{release_id:pointer.release_id,manifest_sha256:registryMeter.sha256,pointer_sha256:pointerMeter.sha256},zip_artifact:{path:artifact.path,sha256:artifact.sha256,bytes:artifact.bytes,record_count:artifact.record_count,export_policy:artifact.export_policy}}});
 let records=0;
 for await(const row of mnSelectionReadLines(zipPath,artifact.bytes,signal,meter)){
  signal?.throwIfAborted();
  check(row.schema_version==='1.0.0'&&row.view_type==='zip'&&isDeepStrictEqual(row.lineage,snapshot.sources[0].lineage),'ZIP lineage mismatch.');projection.add(row);records++;
 }
 check(records===artifact.record_count&&meter.sha256===artifact.sha256&&meter.bytes===artifact.bytes,'ZIP artifact integrity mismatch.');
 const result=projection.finish();
 const after=await readNationalReportingSnapshot({pointerPath:coveragePointer,signal});check(isDeepStrictEqual(after.evidence,snapshot.evidence),'Coverage changed during projection.');
 for(const [file,expected,max] of [[registryPointerPath,pointerMeter.sha256,16000],[registryPath,registryMeter.sha256,2000000]]){const checked={};await mnSelectionReadJson(file,max,signal,checked);check(checked.sha256===expected,'Registry changed during projection.');}
 // Rehash the streamed artifact after projection as well as during its first read.
 const finalMeter={};for await(const line of mnSelectionReadLines(zipPath,artifact.bytes,signal,finalMeter)){signal?.throwIfAborted();void line;}
 check(finalMeter.sha256===artifact.sha256&&finalMeter.bytes===artifact.bytes,'ZIP changed during projection.');signal?.throwIfAborted();return result;
}

export async function verifyZipActiveEvidenceQualification(value,options={}){
 check(value?.schema_version===ZIP_ACTIVE_EVIDENCE_SCHEMA);
 const expected=await buildZipActiveEvidenceQualification({...options,asOf:value.as_of,createdAt:value.created_at});
 check(isDeepStrictEqual(value,expected),'ZIP qualification replay mismatch.');return {verified:true,schema_version:ZIP_ACTIVE_EVIDENCE_SCHEMA,zip_members:expected.zip_members,source_zip_rows:expected.rows.length,network_requests:0,production_pointers_changed:false};
}
