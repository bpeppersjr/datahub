import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';
import {loadPaChildcareReportingEnrollment} from './pa-childcare-reporting-enrollment.mjs';
import {loadCtChildcareReportingEnrollment} from './ct-childcare-reporting-enrollment.mjs';
import {loadMdChildcareReportingEnrollment} from './md-childcare-reporting-enrollment.mjs';
import {loadVtChildcareReportingEnrollment} from './vt-childcare-reporting-enrollment.mjs';
import {loadCoChildcareReportingEnrollment} from './co-childcare-reporting-enrollment.mjs';
import {loadUtChildcareReportingEnrollment} from './ut-childcare-reporting-enrollment.mjs';
import {loadIaChildcareReportingEnrollment} from './ia-childcare-reporting-enrollment.mjs';

export const RETAINED_CHILDCARE_COHORT_VIEW_VERSION='retained-childcare-cohort-view@1.0.0';
export const RETAINED_CHILDCARE_COHORT_STATES=Object.freeze(['PA','CT','MD','VT','CO','UT','IA']);
const STATES=RETAINED_CHILDCARE_COHORT_STATES;
const SOURCES=Object.freeze({PA:'pa-dhs-childcare-centers',CT:'ct-oec-childcare-centers',MD:'md-msde-childcare-centers',VT:'vt-cdd-childcare-centers',CO:'co-cdec-childcare-centers',UT:'ut-dlbc-childcare-centers',IA:'ia-childcare-centers'});
const LOADERS={PA:loadPaChildcareReportingEnrollment,CT:loadCtChildcareReportingEnrollment,MD:loadMdChildcareReportingEnrollment,VT:loadVtChildcareReportingEnrollment,CO:loadCoChildcareReportingEnrollment,UT:loadUtChildcareReportingEnrollment,IA:loadIaChildcareReportingEnrollment};
const check=value=>{if(!value)throw Error('Retained childcare cohort view rejected.');};
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000&&!Object.is(value,-0);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const immutableClaims=result=>{Object.freeze(result.claims);return result;};
function keys(value,required,optional=[]){
  check(value&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));
  const own=Reflect.ownKeys(value);check(own.length<=128&&own.every(key=>typeof key==='string'&&[...required,...optional].includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))&&required.every(key=>Object.hasOwn(value,key)));
}
// Snapshot bounded JSON-like metadata without invoking accessors, toJSON or retaining aliases.
function snapshot(value,meter={nodes:0,bytes:0},depth=0){
  check(depth<=12&&++meter.nodes<=500000);
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){check(Number.isFinite(value)&&!Object.is(value,-0));return value;}
  if(typeof value==='string'){check(value.length<=4096&&!/[\u0000-\u001f\u007f]/u.test(value)&&Buffer.from(value,'utf8').toString('utf8')===value);meter.bytes+=Buffer.byteLength(value);check(meter.bytes<=16000000);return value;}
  check(value&&typeof value==='object');
  if(Array.isArray(value)){
    check(Object.getPrototypeOf(value)===Array.prototype&&value.length<=100000&&Reflect.ownKeys(value).length===value.length+1);
    const rows=[];for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));check(d&&Object.hasOwn(d,'value')&&d.enumerable);rows.push(snapshot(d.value,meter,depth+1));}return rows;
  }
  check([Object.prototype,null].includes(Object.getPrototypeOf(value)));const result={};const own=Reflect.ownKeys(value);check(own.length<=128);
  for(const key of own){const d=Object.getOwnPropertyDescriptor(value,key);check(typeof key==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(key)&&!['__proto__','prototype','constructor'].includes(key)&&Object.hasOwn(d,'value')&&d.enumerable);result[key]=snapshot(d.value,meter,depth+1);}
  return result;
}
function bucketRows(rows,total,pa,zip,publisherOnly){
  check(Array.isArray(rows)&&rows.length<=100000);const seen=new Set(),field=pa?'facility_rows':'candidate_rows';
  let sum=0;const result=rows.map(row=>{
    keys(row,['state',...(zip?['zip5']:[]),field,'percent_of_accepted_cohort']);
    check(row.state===null||typeof row.state==='string'&&/^[A-Z]{2}$/.test(row.state));if(publisherOnly)check(row.state===null);
    if(zip)check(row.zip5===null||typeof row.zip5==='string'&&/^[0-9]{5}$/.test(row.zip5)&&row.zip5!=='00000');
    check(count(row[field])&&row[field]>0&&row[field]<=total&&row.percent_of_accepted_cohort===100*row[field]/total);
    const token=JSON.stringify(zip?[row.state,row.zip5]:[row.state]);check(!seen.has(token));seen.add(token);sum+=row[field];
    return {state:row.state,...(zip?{zip5:row.zip5}:{}),candidate_rows:row[field],percent_of_accepted_cohort:100*row[field]/total};
  });check(sum===total);return result.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function qualityCounts(value,total){
  for(const item of Object.values(value)){
    if(typeof item==='number')check(count(item)&&item<=total);
    else if(typeof item==='boolean')check(item===false);
    else{check(item&&typeof item==='object'&&!Array.isArray(item));qualityCounts(item,total);}
  }
}
function countyRows(rows,total,byState){
  check(Array.isArray(rows)&&rows.length<=100000);const seen=new Set();let sum=0;
  const result=rows.map(row=>{
    keys(row,['state','county_source','county_fips_source','facility_rows','percent_of_accepted_cohort']);
    check(row.state===null||typeof row.state==='string'&&/^[A-Z]{2}$/.test(row.state));
    check((row.county_source===null||typeof row.county_source==='string'&&row.county_source.length<=256)&&(row.county_fips_source===null||typeof row.county_fips_source==='string'&&row.county_fips_source.length<=16));
    check(count(row.facility_rows)&&row.facility_rows>0&&row.facility_rows<=total&&row.percent_of_accepted_cohort===100*row.facility_rows/total);
    const token=JSON.stringify([row.state,row.county_source,row.county_fips_source]);check(!seen.has(token));seen.add(token);sum+=row.facility_rows;
    return {state:row.state,county_source:row.county_source,county_fips_source:row.county_fips_source,candidate_rows:row.facility_rows,percent_of_accepted_cohort:row.percent_of_accepted_cohort};
  });check(sum===total);
  for(const state of byState)check(result.filter(row=>row.state===state.state).reduce((n,row)=>n+row.candidate_rows,0)===state.candidate_rows);
  check(result.every(row=>byState.some(state=>state.state===row.state)));return result;
}
function cohort(state,enrollment){
  check(enrollment&&typeof enrollment==='object');const base={source_id:SOURCES[state],publisher_scope:state};
  if(enrollment.status==='not-enrolled'){keys(enrollment,['status']);return {...base,status:'not-enrolled'};}
  if(enrollment.status==='unavailable'){
    keys(enrollment,['status','reason','enrollmentSha256']);check(enrollment.reason==='enrolled-receipt-not-installed'&&sha(enrollment.enrollmentSha256));
    return {...base,status:'unavailable',reason:enrollment.reason,enrollment_sha256:enrollment.enrollmentSha256};
  }
  keys(enrollment,['status','sourceId','publisherJurisdiction','enrollmentSha256','summary']);
  check(enrollment.status==='available'&&enrollment.sourceId===SOURCES[state]&&enrollment.publisherJurisdiction===state&&sha(enrollment.enrollmentSha256));
  const s=enrollment.summary,pa=state==='PA',publisherOnly=['VT','IA'].includes(state);
  const common=['schema_version','source_id','by_reported_state','by_reported_zip','quality','provenance','claims'];
  keys(s,[...common,...(pa?['accepted_facility_rows','source_rows','quarantined_rows','by_reported_county']:['publisher_scope','source_candidate_rows','accepted_candidate_rows','quarantined_candidate_rows'])],['distinct_source_credentials','distinct_accepted_credentials','distinct_accepted_license_ids','accepted_rows_with_license','repeated_accepted_license_rows','source_response_rows','excluded_source_rows','duplicate_selected_rows']);
  check(s.schema_version===`${state.toLowerCase()}-childcare-reporting@1.0.0`&&s.source_id===SOURCES[state]&&(pa||s.publisher_scope===state));
  const accepted=pa?s.accepted_facility_rows:s.accepted_candidate_rows,source=pa?s.source_rows:s.source_candidate_rows,quarantine=pa?s.quarantined_rows:s.quarantined_candidate_rows;
  check([accepted,source,quarantine].every(count)&&accepted+quarantine===source);
  const byState=bucketRows(s.by_reported_state,accepted,pa,false,publisherOnly),byZip=bucketRows(s.by_reported_zip,accepted,pa,true,publisherOnly);
  for(const row of byState)check(byZip.filter(zip=>zip.state===row.state).reduce((sum,zip)=>sum+zip.candidate_rows,0)===row.candidate_rows);
  check(byZip.every(zip=>byState.some(row=>row.state===zip.state)));
  const q=s.quality;check(q&&typeof q==='object'&&!Array.isArray(q));qualityCounts(q,accepted);
  check(['with_zip5','with_zip4','with_points','missing_points'].every(key=>count(q[key]))&&q.with_points+q.missing_points===accepted&&q.with_zip4<=q.with_zip5&&q.with_zip5===byZip.filter(row=>row.zip5!==null).reduce((sum,row)=>sum+row.candidate_rows,0));
  const p=s.provenance,c=s.claims;check(p&&c&&typeof p==='object'&&typeof c==='object');
  check(sha(p.app_receipt_sha256)&&sha(p.normalized_manifest_sha256)&&timestamp(p.observed_at)&&typeof p.app_run_id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(p.app_run_id));
  check(p.industry_run_id===null||typeof p.industry_run_id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(p.industry_run_id));
  check(p.execution_mode===(state==='UT'?'retained-local-adoption':'fixed-native-fetch'));
  if(state!=='UT')check(sha(p.acquired_manifest_sha256)&&(p.source_updated_at===null||timestamp(p.source_updated_at)));
  check(c.export_policy==='internal'&&c.national_reporting_integrated===false&&c.national_completeness_percent===null&&c.unique_active_business_count===null&&c.public_export_authorized===false&&c.identity_matching_applied===false);
  check(typeof c.denominator==='string'&&/accepted/i.test(c.denominator)&&/cohort/i.test(c.denominator)&&/not.*business/i.test(c.denominator)&&['source-candidate-row','publisher-listed-facility-row'].includes(c.row_unit));
  for(const value of Object.values(c))if(typeof value==='boolean')check(value===false);
  let response=null,excluded=null,duplicates=null;
  if(Object.hasOwn(s,'source_response_rows')||Object.hasOwn(s,'excluded_source_rows')){check(count(s.source_response_rows)&&count(s.excluded_source_rows)&&s.source_response_rows===source+s.excluded_source_rows);response=s.source_response_rows;excluded=s.excluded_source_rows;}
  if(Object.hasOwn(s,'duplicate_selected_rows')){check(count(s.duplicate_selected_rows)&&s.duplicate_selected_rows<=source);duplicates=s.duplicate_selected_rows;}
  const metrics={};for(const key of ['distinct_source_credentials','distinct_accepted_credentials','distinct_accepted_license_ids','accepted_rows_with_license','repeated_accepted_license_rows'])if(Object.hasOwn(s,key)){check(count(s[key])&&s[key]<=source);metrics[key]=s[key];}
  for(const key of ['distinct_accepted_credentials','distinct_accepted_license_ids','accepted_rows_with_license','repeated_accepted_license_rows'])if(Object.hasOwn(metrics,key))check(metrics[key]<=accepted);
  if(Object.hasOwn(metrics,'distinct_accepted_credentials'))check(count(metrics.distinct_source_credentials)&&metrics.distinct_accepted_credentials<=metrics.distinct_source_credentials);
  if(state==='MD')check(count(metrics.distinct_accepted_license_ids)&&count(metrics.repeated_accepted_license_rows)&&count(metrics.accepted_rows_with_license)&&metrics.distinct_accepted_license_ids+metrics.repeated_accepted_license_rows===metrics.accepted_rows_with_license);
  return {...base,status:'available',evidence_basis:publisherOnly?'publisher-scope-not-reported-address-state':'publisher-cohort-with-reported-address-state-buckets',source_candidate_rows:source,accepted_candidate_rows:accepted,quarantined_candidate_rows:quarantine,source_response_rows:response,excluded_source_rows:excluded,duplicate_selected_rows:duplicates,by_reported_state:byState,by_reported_zip:byZip,...(pa?{by_reported_county:countyRows(s.by_reported_county,accepted,byState)}:{}),quality:q,provenance:p,source_claims:c,source_metrics:metrics,denominator:c.denominator,source_row_unit:c.row_unit,enrollment_sha256:enrollment.enrollmentSha256};
}
/** Structural projection only; callers cannot turn supplied aggregates into verified source evidence. */
export function projectRetainedChildcareCohortView(enrollments){
  try{
    keys(enrollments,STATES);const supplied=snapshot(enrollments),cohorts={};for(const state of STATES)cohorts[state]=[cohort(state,supplied[state])];
    return immutableClaims({schema_version:RETAINED_CHILDCARE_COHORT_VIEW_VERSION,cohorts,claims:{view_kind:'source-separated-retained-childcare-cohort-comparison',evidence_verification:'supplied-enrollment-structure-only',artifact_verification_performed:false,atomic_cross_source_snapshot_verified:false,source_access_performed:false,national_reporting_integrated:false,national_pointers_changed:false,national_completeness_percent:null,unique_active_business_count:null,cross_source_deduplication_applied:false,publisher_scope_assigns_address_state:false,public_export_authorized:false,export_policy:'internal',denominator:'each source uses its own accepted retained cohort rows; no combined business or national denominator'}});
  }catch{throw Error('Retained childcare cohort view rejected.');}
}
/** Validate persisted structure only. Historical build claims are not fresh source verification. */
export function validateRetainedChildcareCohortView(value){
  try{
    const view=snapshot(value);keys(view,['schema_version','cohorts','claims']);keys(view.cohorts,STATES);
    const enrollments={};
    for(const state of STATES){
      const rows=view.cohorts[state];check(Array.isArray(rows)&&rows.length===1);const row=rows[0];
      if(row.status==='not-enrolled'){enrollments[state]={status:row.status};continue;}
      if(row.status==='unavailable'){enrollments[state]={status:row.status,reason:row.reason,enrollmentSha256:row.enrollment_sha256};continue;}
      check(row.status==='available');const pa=state==='PA';
      keys(row.source_metrics,[],['distinct_source_credentials','distinct_accepted_credentials','distinct_accepted_license_ids','accepted_rows_with_license','repeated_accepted_license_rows']);
      const buckets=items=>items.map(item=>{
        const {candidate_rows,...dimensions}=item;return {...dimensions,...(pa?{facility_rows:candidate_rows}:{candidate_rows})};
      });
      const summary={schema_version:`${state.toLowerCase()}-childcare-reporting@1.0.0`,source_id:row.source_id,
        ...(pa?{source_rows:row.source_candidate_rows,accepted_facility_rows:row.accepted_candidate_rows,quarantined_rows:row.quarantined_candidate_rows,by_reported_county:buckets(row.by_reported_county)}
          :{publisher_scope:row.publisher_scope,source_candidate_rows:row.source_candidate_rows,accepted_candidate_rows:row.accepted_candidate_rows,quarantined_candidate_rows:row.quarantined_candidate_rows}),
        by_reported_state:buckets(row.by_reported_state),by_reported_zip:buckets(row.by_reported_zip),quality:row.quality,provenance:row.provenance,claims:row.source_claims,...row.source_metrics};
      for(const key of ['source_response_rows','excluded_source_rows','duplicate_selected_rows'])if(row[key]!==null)summary[key]=row[key];
      enrollments[state]={status:row.status,sourceId:row.source_id,publisherJurisdiction:row.publisher_scope,enrollmentSha256:row.enrollment_sha256,summary};
    }
    const expected=projectRetainedChildcareCohortView(enrollments),replayed=view.claims.evidence_verification==='source-specific-retained-enrollment-replay';
    const claims=replayed?{...expected.claims,evidence_verification:'source-specific-retained-enrollment-replay',artifact_verification_performed:Object.values(enrollments).some(row=>row.status==='available')}:expected.claims;
    check(same(view,{...expected,claims}));return immutableClaims(view);
  }catch{throw Error('Retained childcare cohort view rejected.');}
}

/** Serial, offline source-specific replay; no downloader, refresh, or national publication is invoked. */
export async function buildRetainedChildcareCohortView(options={}){
  try{
    keys(options,[],['root','signal']);const {root=APP_ROOT,signal}=options;check(typeof root==='string'&&root===path.resolve(root)&&(signal===undefined||signal instanceof AbortSignal));signal?.throwIfAborted();
    const relative=path.relative(APP_ROOT,root);check(root===APP_ROOT||relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
    if(root!==APP_ROOT)await canonical(root,{signal});
    const enrollments={};for(const state of STATES){signal?.throwIfAborted();enrollments[state]=await LOADERS[state]({root,signal});}
    signal?.throwIfAborted();const result=projectRetainedChildcareCohortView(enrollments);
    return immutableClaims({...result,claims:{...result.claims,evidence_verification:'source-specific-retained-enrollment-replay',artifact_verification_performed:Object.values(enrollments).some(enrollment=>enrollment.status==='available')}});
  }catch{throw Error('Retained childcare cohort view rejected.');}
}
