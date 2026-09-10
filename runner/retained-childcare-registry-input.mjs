import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson, mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';
import {loadPaChildcareReportingEnrollment} from './pa-childcare-reporting-enrollment.mjs';
import {loadCtChildcareReportingEnrollment} from './ct-childcare-reporting-enrollment.mjs';
import {loadMdChildcareReportingEnrollment} from './md-childcare-reporting-enrollment.mjs';
import {loadVtChildcareReportingEnrollment} from './vt-childcare-reporting-enrollment.mjs';
import {loadCoChildcareReportingEnrollment} from './co-childcare-reporting-enrollment.mjs';
import {loadUtChildcareReportingEnrollment} from './ut-childcare-reporting-enrollment.mjs';
import {loadIaChildcareReportingEnrollment} from './ia-childcare-reporting-enrollment.mjs';

export const RETAINED_CHILDCARE_REGISTRY_VERSION='retained-childcare-registry-input@1.0.0';
export const RETAINED_CHILDCARE_CANDIDATE_TYPE='retained-childcare-source-candidate-jsonl';
export const RETAINED_CHILDCARE_STATES=Object.freeze(['PA','CT','MD','VT','CO','UT','IA']);
const DATASETS=new Set(['pa-dhs-childcare-centers','ct-oec-childcare-centers','md-msde-childcare-centers','vt-cdd-childcare-centers','co-cdec-childcare-centers','ut-dlbc-childcare-centers','ia-childcare-centers']);
const loaders=[loadPaChildcareReportingEnrollment,loadCtChildcareReportingEnrollment,loadMdChildcareReportingEnrollment,loadVtChildcareReportingEnrollment,loadCoChildcareReportingEnrollment,loadUtChildcareReportingEnrollment,loadIaChildcareReportingEnrollment];
const hash=value=>createHash('sha256').update(value).digest('hex');
const check=value=>{if(!value)throw Error('Retained childcare registry input rejected.');};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const relative=file=>path.relative(APP_ROOT,file).replaceAll('\\','/');
const claims=()=>({row_unit:'source-candidate-row',identity_matching_eligible:false,physical_site_verified:false,current_operations_verified:false,public_export_authorized:false,export_policy:'internal',national_completeness_percent:null});

/** A release-scoped observation, deliberately not a canonical business or site. */
export function projectRetainedChildcareCandidate(row,binding){
  check(row?.dataset_id===binding?.dataset_id&&RETAINED_CHILDCARE_STATES.includes(binding.publisher_scope)
    &&typeof row.source_record_id==='string'&&row.source_record_id.length>0&&row.export_policy==='internal'
    &&row.provenance?.source_release_id===binding.release_id&&row.provenance.ingest_run_id===binding.ingest_run_id
    &&sha(binding.manifest_sha256)&&sha(binding.app_receipt_sha256));
  const address=row.physical_address??row.reported_address;
  check(address&&Object.hasOwn(address,'zip4')&&(address.zip_code===null||/^[0-9]{5}$/.test(address.zip_code))
    &&address.postal_code===address.zip_code&&(address.zip4===null||/^[0-9]{4}$/.test(address.zip4)));
  // Retain source-native evidence by hash. Do not copy source geometries into entity records.
  const fields=Object.fromEntries(Object.entries(row).filter(([key])=>key!=='source'));
  return {schema_version:RETAINED_CHILDCARE_REGISTRY_VERSION,
    candidate_id:`candidate:childcare:${hash(JSON.stringify([row.dataset_id,binding.release_id,binding.ingest_run_id,row.source_record_id]))}`,
    publisher_scope:binding.publisher_scope,reported_address:structuredClone(address),geocode:structuredClone(row.geocode),
    business_name:row.business_name,source_record:structuredClone(fields),
    source:structuredClone(binding),source_record_sha256:hash(JSON.stringify(row)),claims:claims()};
}

/** Explicit immutable selection pins; never silently enroll whichever files exist. */
export function validateRetainedChildcareSelection(value){
  check(value&&same(Object.keys(value).sort(),['enrollments','schema_version'])
    &&value.schema_version===RETAINED_CHILDCARE_REGISTRY_VERSION&&value.enrollments
    &&same(Object.keys(value.enrollments).sort(),[...RETAINED_CHILDCARE_STATES].sort())
    &&Object.values(value.enrollments).every(sha));
  return structuredClone(value);
}

export function summarizeRetainedChildcareCandidates(records){
  const sources=new Map(),states=new Map(),zips=new Map(),ids=new Set();
  const add=(map,key)=>map.set(key,(map.get(key)??0)+1);
  for(const row of records){
    check(row.schema_version===RETAINED_CHILDCARE_REGISTRY_VERSION&&same(row.claims,claims())&&!ids.has(row.candidate_id));ids.add(row.candidate_id);
    add(sources,row.source.dataset_id);add(states,row.reported_address.state??null);add(zips,row.reported_address.zip_code??null);
  }
  const buckets=(map,key)=>[...map].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([value,count])=>({[key]:value,candidate_rows:count}));
  return {schema_version:RETAINED_CHILDCARE_REGISTRY_VERSION,candidate_rows:records.length,
    by_source:buckets(sources,'dataset_id'),by_reported_state:buckets(states,'state'),by_reported_zip:buckets(zips,'zip_code'),
    with_zip4:records.filter(row=>row.reported_address.zip4!==null).length,
    with_source_coordinates:records.filter(row=>Number.isFinite(row.geocode?.latitude)&&Number.isFinite(row.geocode?.longitude)).length,
    county_assignment_performed:false,publisher_scope_assigns_address_state:false,...claims()};
}

/** Full local source replay precedes consuming the exact normalized artifact bytes. No network calls. */
export async function loadRetainedChildcareRegistryInput(selectionPath,{signal}={}){
  signal?.throwIfAborted();const selectionMeter={};
  const selection=validateRetainedChildcareSelection(await readJson(path.resolve(selectionPath),10000,signal,selectionMeter));
  const records=[],bindings=[],configurationPins=[];
  for(let index=0;index<RETAINED_CHILDCARE_STATES.length;index++){
    signal?.throwIfAborted();const state=RETAINED_CHILDCARE_STATES[index];
    const enrollment=await loaders[index]({signal});
    check(enrollment.status==='available'&&enrollment.enrollmentSha256===selection.enrollments[state]);
    const configPath=path.join(APP_ROOT,`config/${state.toLowerCase()}-childcare-reporting-enrollment.json`),cm={};
    const config=await readJson(configPath,10000,signal,cm);check(cm.sha256===selection.enrollments[state]);
    const receiptPath=path.resolve(APP_ROOT,config.app_receipt_path),rm={};
    const receipt=await readJson(receiptPath,100000,signal,rm);check(rm.sha256===config.app_receipt_sha256&&rm.sha256===enrollment.summary.provenance.app_receipt_sha256);
    const manifestPath=receipt.normalized.manifest_path,mm={};
    const manifest=await readJson(manifestPath,100000,signal,mm);
    check(mm.sha256===receipt.normalized.manifest_sha256&&mm.sha256===enrollment.summary.provenance.normalized_manifest_sha256);
    const artifacts=manifest.artifacts.filter(a=>a.path==='normalized.jsonl');check(artifacts.length===1);
    const artifact=artifacts[0],normalizedPath=path.join(path.dirname(manifestPath),'normalized.jsonl');
    const binding={dataset_id:enrollment.sourceId,publisher_scope:state,release_id:manifest.source_release_id,ingest_run_id:manifest.run_id,
      manifest_path:relative(manifestPath),manifest_sha256:mm.sha256,app_receipt_path:relative(receiptPath),app_receipt_sha256:rm.sha256,
      enrollment_path:relative(configPath),enrollment_sha256:cm.sha256,normalized_path:relative(normalizedPath),normalized_sha256:artifact.sha256,
      historical_source_claims:structuredClone(enrollment.summary.claims)};
    const meter={},start=records.length;
    for await(const row of readLines(normalizedPath,200_000_000,signal,meter)){
      check(meter.records<=100000);records.push(projectRetainedChildcareCandidate(row,binding));
    }
    check(meter.sha256===artifact.sha256&&meter.bytes===artifact.bytes&&meter.records===artifact.records
      &&records.length-start===(enrollment.summary.accepted_facility_rows??enrollment.summary.accepted_candidate_rows));
    // Detect replacement of the verified enrollment, receipt or manifest during consumption.
    for(const [file,limit,expected]of [[configPath,10000,cm.sha256],[receiptPath,100000,rm.sha256],[manifestPath,100000,mm.sha256]]){
      const final={};await readJson(file,limit,signal,final);check(final.sha256===expected);
    }
    bindings.push(binding);configurationPins.push({path:relative(configPath),sha256:cm.sha256,bytes:cm.bytes});
  }
  const final={};await readJson(path.resolve(selectionPath),10000,signal,final);check(final.sha256===selectionMeter.sha256);
  return {selection:{path:relative(path.resolve(selectionPath)),sha256:selectionMeter.sha256},bindings,configurationPins,records,summary:summarizeRetainedChildcareCandidates(records)};
}

export function retainedChildcareRegistryDeclaration(input){
  return {schema_version:RETAINED_CHILDCARE_REGISTRY_VERSION,selection:input.selection,bindings:input.bindings,configuration_pins:input.configurationPins,summary:input.summary};
}

export function retainedChildcareCoverageIndex(input){
  const stateGroups=new Map(),zipGroups=new Map();
  const add=(map,key,row)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(row);};
  for(const row of input.records){add(stateGroups,row.reported_address.state??null,row);add(zipGroups,row.reported_address.zip_code??null,row);}
  const metric=records=>({schema_version:RETAINED_CHILDCARE_REGISTRY_VERSION,candidate_rows:records.length,
    by_source:summarizeRetainedChildcareCandidates(records).by_source,
    percent_of_selected_retained_cohort:input.records.length?100*records.length/input.records.length:null,
    denominator:'accepted rows in the seven selected retained childcare cohorts; not all U.S. childcare businesses',
    county_assignment_performed:false,publisher_scope_assigns_address_state:false,zip4_not_aggregated:true,
    unknown_reported_state_rows_in_selected_cohort:input.records.filter(row=>row.reported_address.state===null).length,...claims()});
  return {national:metric(input.records),states:new Map([...stateGroups].map(([key,rows])=>[key,metric(rows)])),
    zips:new Map([...zipGroups].map(([key,rows])=>[key,metric(rows)])),empty:metric([])};
}

/** Independently replay all selected sources and reconcile every published candidate. */
export async function verifyRetainedChildcareRegistryExtension(manifest,releaseDirectory,{signal}={}){
  const declaration=manifest.retained_childcare_reporting;
  const artifacts=(manifest.artifacts??[]).filter(a=>a.artifact_type===RETAINED_CHILDCARE_CANDIDATE_TYPE);
  if(declaration===undefined){check(!artifacts.length&&!Object.hasOwn(manifest.coverage??{},'retained_childcare_candidate_rows')
    &&!(manifest.dependencies??[]).some(d=>DATASETS.has(d.dataset_id)));return null;}
  check(declaration.schema_version===RETAINED_CHILDCARE_REGISTRY_VERSION&&typeof declaration.selection?.path==='string');
  const input=await loadRetainedChildcareRegistryInput(path.resolve(APP_ROOT,declaration.selection.path),{signal});
  check(same(declaration,retainedChildcareRegistryDeclaration(input))&&artifacts.length===1);
  const artifact=artifacts[0];check(artifact.path==='reporting/retained-childcare/candidates.jsonl'&&artifact.export_policy==='internal'&&artifact.record_count===input.records.length);
  const meter={};let index=0;
  for await(const row of readLines(path.join(releaseDirectory,artifact.path),200_000_000,signal,meter))check(same(row,input.records[index++]));
  check(index===input.records.length&&meter.sha256===artifact.sha256&&meter.bytes===artifact.bytes);
  check(manifest.coverage.retained_childcare_candidate_rows===index
    &&Number.isSafeInteger(manifest.coverage.source_records)&&manifest.coverage.source_records>=0
    &&manifest.coverage.source_records_including_retained_childcare===manifest.coverage.source_records+index);
  for(const binding of input.bindings){
    const dependencies=manifest.dependencies.filter(d=>d.dataset_id===binding.dataset_id);
    check(dependencies.length===1&&same(dependencies[0],{dataset_id:binding.dataset_id,release_id:binding.release_id,manifest_sha256:binding.manifest_sha256}));
  }
  return input;
}
