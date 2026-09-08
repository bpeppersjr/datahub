import {setImmediate as yieldLoop} from 'node:timers/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {verifyPaChildcareAppJob} from './pa-childcare-app.mjs';
import {readPaChildcareNormalizedRelease} from './pa-childcare-normalized-release.mjs';
import {readPaChildcareAcquiredEvidence} from './pa-childcare-acquired-release.mjs';

export const PA_CHILDCARE_REPORTING_VERSION='pa-childcare-reporting@1.0.0';
const check=value=>{if(!value)throw Error('Pennsylvania retained cohort reporting rejected.');};
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value)&&Buffer.from(value,'utf8').toString('utf8')===value;
const nullableText=(value,max)=>value===null||text(value,max);
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function optionsOnly(value){check(value&&typeof value==='object'&&!Array.isArray(value)&&Reflect.ownKeys(value).every(key=>key==='signal'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')));check(value.signal===undefined||value.signal instanceof AbortSignal);}
function add(map,dimensions){const key=JSON.stringify(dimensions),entry=map.get(key);if(entry)entry.facility_rows++;else map.set(key,{...dimensions,facility_rows:1});}
function rows(map,total){return [...map.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,row])=>({...row,percent_of_accepted_cohort:total===0?null:100*row.facility_rows/total}));}

/** Read-only cohort projection. Complete release replay, not caller statistics,
 * establishes membership. Address labels do not establish governed boundaries. */
export async function summarizePaChildcareAppJob(receiptPath,options={}){
  optionsOnly(options);const {signal}=options;signal?.throwIfAborted();
  const app=await verifyPaChildcareAppJob(receiptPath,{signal}),receipt=app.receipt;
  const normalized=await readPaChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal});
  const acquired=await readPaChildcareAcquiredEvidence(receipt.acquired.manifest_path,{signal});
  check(same(normalized.verification,receipt.normalized)&&same(acquired.verification,receipt.acquired));
  check(same(normalized.manifest.acquired,{manifest_path:acquired.verification.manifest_path,manifest_sha256:acquired.verification.manifest_sha256,run_id:acquired.verification.run_id}));
  const records=normalized.records,quarantine=normalized.quarantine,sourceRows=acquired.verification.record_count;
  check(Array.isArray(records)&&Array.isArray(quarantine)&&Number.isSafeInteger(sourceRows)&&sourceRows>=0&&sourceRows<=20000&&records.length+quarantine.length===sourceRows);
  const states=new Map(),counties=new Map(),zips=new Map(),keys=new Set(),recordIds=new Set();
  const quality={with_zip5:0,with_zip4:0,with_points:0,missing_points:0,capacity_unavailable:0};
  for(const [index,row]of records.entries()){
    if(index%128===0){await yieldLoop();signal?.throwIfAborted();}
    check(row&&typeof row==='object'&&Buffer.byteLength(JSON.stringify(row))<65536&&row.dataset_id==='pa-dhs-childcare-centers'&&row.export_policy==='internal');
    const address=row.physical_address,provenance=row.provenance,gaps=row.quality,geo=row.geocode;
    check(text(row.source_record_id,2048)&&text(provenance.source_master_provider_index,256)&&!recordIds.has(row.source_record_id)&&!keys.has(provenance.source_master_provider_index));
    keys.add(provenance.source_master_provider_index);recordIds.add(row.source_record_id);
    check(provenance.ingest_run_id===normalized.verification.run_id&&provenance.source_release_id===normalized.manifest.source_release_id&&timestamp(provenance.observed_at)&&timestamp(provenance.source_updated_at));
    check(address.state==='PA'&&['PA','Pennsylvania'].includes(address.state_source.trim())&&nullableText(address.county_source,256)&&nullableText(address.county_fips_source,16));
    check(address.zip_code===null||typeof address.zip_code==='string'&&/^\d{5}$/.test(address.zip_code)&&address.zip_code!=='00000');
    check(address.postal_code===address.zip_code&&(address.zip4===null||address.zip_code!==null&&typeof address.zip4==='string'&&/^\d{4}$/.test(address.zip4)));
    check((geo.latitude===null&&geo.longitude===null)||(typeof geo.latitude==='number'&&Number.isFinite(geo.latitude)&&Math.abs(geo.latitude)<=90&&typeof geo.longitude==='number'&&Number.isFinite(geo.longitude)&&Math.abs(geo.longitude)<=180));
    check(gaps.identity_matching_eligible===false&&gaps.geographic_boundary_verified===false&&gaps.unique_business_identity_verified===false&&row.source_status.active_business_verified===false);
    check((address.zip_code===null)===(gaps.zip_unavailable_reason!==null)&&(geo.latitude===null)===(gaps.point_unavailable_reason!==null)&&(row.industry.capacity_parsed===null)===(gaps.capacity_unavailable_reason!==null));
    add(states,{state:address.state});add(counties,{state:address.state,county_source:address.county_source,county_fips_source:address.county_fips_source});add(zips,{state:address.state,zip5:address.zip_code});
    if(address.zip_code!==null)quality.with_zip5++;if(address.zip4!==null)quality.with_zip4++;
    if(geo.latitude!==null)quality.with_points++;else quality.missing_points++;
    if(gaps.capacity_unavailable_reason!==null)quality.capacity_unavailable++;
  }
  for(const [index,row]of quarantine.entries()){
    if(index%128===0){await yieldLoop();signal?.throwIfAborted();}
    check(text(row.source_master_provider_index,256)&&text(row.source_record_id,2048)&&!keys.has(row.source_master_provider_index)&&!recordIds.has(row.source_record_id));keys.add(row.source_master_provider_index);recordIds.add(row.source_record_id);
  }
  check(keys.size===sourceRows&&normalized.summary.source_records===sourceRows&&normalized.summary.accepted_records===records.length&&normalized.summary.quarantined_records===quarantine.length);
  check(normalized.summary.accepted_with_zip5===quality.with_zip5&&normalized.summary.accepted_with_zip4===quality.with_zip4&&normalized.summary.accepted_with_points===quality.with_points&&quality.with_points+quality.missing_points===records.length);
  check(Object.values(normalized.summary.capacity_unavailable_reasons).reduce((a,b)=>a+b,0)===quality.capacity_unavailable);
  const byState=rows(states,records.length),byCounty=rows(counties,records.length),byZip=rows(zips,records.length);
  for(const group of [byState,byCounty,byZip])check(group.reduce((total,row)=>total+row.facility_rows,0)===records.length);
  const sourceUpdated=acquired.evidence.before_preflight.source.source_updated_at,observed=acquired.evidence.finished_at;check(timestamp(sourceUpdated)&&timestamp(observed));
  const result={schema_version:PA_CHILDCARE_REPORTING_VERSION,source_id:'pa-dhs-childcare-centers',accepted_facility_rows:records.length,source_rows:sourceRows,quarantined_rows:quarantine.length,
    by_reported_state:byState,by_reported_county:byCounty,by_reported_zip:byZip,quality,
    provenance:{app_receipt_sha256:app.receipt_sha256,app_run_id:receipt.run_id,industry_run_id:receipt.industry_run_id,execution_mode:receipt.execution_mode,acquired_manifest_sha256:acquired.verification.manifest_sha256,normalized_manifest_sha256:normalized.verification.manifest_sha256,source_updated_at:sourceUpdated,observed_at:observed},
    claims:{denominator:'accepted facility rows in this retained Pennsylvania center cohort; not all United States businesses',row_unit:'publisher-listed-facility-row',export_policy:'internal',national_reporting_integrated:false,national_completeness_percent:null,unique_active_business_count:null,current_usps_assignment_verified:false,boundary_assignment_verified:false,identity_matching_applied:false,public_export_authorized:false,source_authenticity_verified:false,observation_semantics:'acquisition completion; individual record page observations remain in the normalized release'}};
  const finalNormalized=await readPaChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal});check(same(finalNormalized,normalized));
  const finalApp=await verifyPaChildcareAppJob(receiptPath,{signal});check(same(finalApp,app));signal?.throwIfAborted();return result;
}
