import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {readExactZipIndustryEvidence} from './national-exact-zip-industry-evidence-matrix.mjs';
import {readNationalBusinessTemporalClaimRows} from './national-business-temporal-claim-matrix-reader.mjs';
import {readZipEvidenceQualification} from './zip-evidence-qualification-reader.mjs';

export const VERSION='exact-zip-industry-temporal-qualification@1.0.0';
const DATASET='exact-zip-industry-temporal-qualification', SHA=/^[a-f0-9]{64}$/;
const MATRIX_ID='national-exact-zip-industry-evidence-matrix-ada7e938a0bfa31a51b4cc165b0a3e357f025704eff853fb88a4ccadf2c9ceb6';
const MATRIX_SHA='743d1bad94a7e8b122969cbb0cb9618e20b820b4b1b5afb46285bd70458d9ffe';
const TEMPORAL_ID='national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090';
const TEMPORAL_SHA='342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05';
const QUALIFICATION_ID='zip-active-evidence-76630f473281f971dc8e588ad7cf918ef649ae6c3597f995118b1238223969d9';
const QUALIFICATION_SHA='9872e4b46fe01fc529ac189cda20a5a8a28d0a39904c8742b931934a5ce0b493';
const AS_OF='2026-10-02T16:30:00.000Z';
const UNMAPPED=new Set(['cms_hospital_directory','cms_nursing_home_directory',...['pa','ct','md','vt','co','ut','ia'].map(s=>`childcare_${s}_candidates`)]);
const MAP=Object.freeze({
 healthcare_organizations:'cms_nppes_organizations',regulated_facilities:'epa_echo_active_facilities',fdic_offices:'fdic_bankfind',food_safety_establishments:'fsis_active_mpi_establishments',credit_union_locations:'ncua_quarterly_credit_unions',snap_retailers:'usda_snap_retailers',pharmacy:'cms_nppes_organizations',transportation:'fmcsa_active_us_company_census',tax_exempt_organizations:'irs_eo_bmf_organizations',
 childcare_ma_reporting_centers:'ma_childcare_centers',childcare_nj_reporting_centers:'nj_childcare_centers',childcare_tn_reporting_centers:'tn_childcare_centers',childcare_oh_reporting_centers:'oh_childcare_centers',
 ak_license_location_profiles:'ak_active_business_licenses',ca_abc_license_location_profiles:'california_abc_active_issued_license_sites',chicago_license_location_profiles:'chicago_active_business_license_sites',dc_basic_license_location_profiles:'dc_basic_business_license_sites',la_registered_location_profiles:'la_active_business_location_accounts',ny_retail_food_location_profiles:'ny_retail_food_store_license_sites',nyc_dcwp_license_location_profiles:'nyc_dcwp_active_license_sites',tx_sales_tax_outlet_profiles:'tx_active_sales_tax_permit_outlets',
 broad_org_co_organization_addresses:'co_business_registry_good_standing_or_delinquent_organizations',broad_org_ct_organization_addresses:'ct_business_registry_active_organizations',broad_org_de_license_addresses:'de_business_licenses_current',broad_org_fl_organization_addresses:'fl_business_registry_quarterly_active_entities',broad_org_ia_organization_addresses:'ia_business_registry_active_entities',broad_org_ny_organization_addresses:'ny_business_registry_active_entities',broad_org_or_legal_registration_addresses:'or_business_registry_active_registrations',broad_org_or_brand_registration_addresses:'or_business_registry_active_registrations',broad_org_pa_organization_addresses:'pa_business_registry_active_registrations'
});
const hash=b=>createHash('sha256').update(b).digest('hex'), check=(v,m='temporal qualification contract rejected')=>{if(!v)throw Error(m);};
const canonical=v=>JSON.stringify(v);
function reviewState(row){const c=row.review_clock;if(!c||c.source_reference_at===null||c.age_days===null||c.review_after_days===null)return 'unmeasured';check(Number.isSafeInteger(c.age_days)&&Number.isSafeInteger(c.review_after_days));return c.age_days>c.review_after_days?'stale':'within-review-window';}
function dueAt(row){const c=row.review_clock;if(!c||!c.source_reference_at||!Number.isSafeInteger(c.review_after_days))return null;const d=new Date(c.source_reference_at);check(Number.isFinite(d.valueOf()));d.setUTCDate(d.getUTCDate()+c.review_after_days);return d.toISOString();}
async function inputs(root,signal,zip5='10001'){
 signal?.throwIfAborted();
 const matrixMeter={},temporalMeter={},qualificationMeter={};
 const matrixReg=await readJson(path.join(root,'config/datasets/national-exact-zip-industry-evidence-matrix.json'),200000,signal,matrixMeter), temporalReg=await readJson(path.join(root,'config/datasets/national-business-temporal-claim-matrix.json'),64000,signal,temporalMeter), qualReg=await readJson(path.join(root,'config/datasets/zip-active-evidence-qualification.json'),1000000,signal,qualificationMeter);
 const mr=matrixReg.retained_release, tr=temporalReg.retained_releases?.find(x=>x.selected===true), qr=qualReg.retained_release;
 check(mr?.release_id===MATRIX_ID&&mr.manifest_sha256===MATRIX_SHA&&tr?.release_id===TEMPORAL_ID&&tr.manifest_sha256===TEMPORAL_SHA&&qr?.release_id===QUALIFICATION_ID&&qr.manifest_sha256===QUALIFICATION_SHA);
 const matrix=await readExactZipIndustryEvidence({root,zip5}), temporal=await readNationalBusinessTemporalClaimRows({root,signal}), qualification=await readZipEvidenceQualification({root,zip:zip5,signal});
 check(matrix.release_id===MATRIX_ID&&matrix.manifest_sha256===MATRIX_SHA&&Object.keys(matrix.cell_status_counts_by_dimension).length===39&&temporal.provenance.release_id===TEMPORAL_ID&&temporal.provenance.manifest_sha256===TEMPORAL_SHA&&qualification.available===true&&qualification.release.id===QUALIFICATION_ID&&qualification.release.manifest_sha256===QUALIFICATION_SHA&&qualification.assessment_as_of===AS_OF);
 const matrixManifest=await readJson(path.join(root,mr.manifest),1000000,signal),matrixArtifactInventorySha=hash(JSON.stringify(matrixManifest.artifacts));
 check(matrixManifest.release_id===MATRIX_ID&&matrixManifest.schema_version==='national-exact-zip-industry-evidence-matrix@1.8.0'&&matrixManifest.status==='immutable-local-review-only'&&Array.isArray(matrixManifest.artifacts)&&matrixManifest.artifacts.length===103&&SHA.test(matrixArtifactInventorySha));
 return {matrixReg,temporalReg,qualReg,matrix,matrixManifest,matrixArtifactInventorySha,matrixRegistrationSha:matrixMeter.sha256,temporalRegistrationSha:temporalMeter.sha256,qualificationRegistrationSha:qualificationMeter.sha256,temporal,qualification};
}
function compose(input){
 const dims=Object.keys(input.matrix.cell_status_counts_by_dimension), sem=new Map(input.temporal.rows.map(r=>[r.source_key,r])), qual=new Map(input.qualification.rows.map(r=>[r.source_key,r]));
 check(dims.length===39&&new Set(dims).size===39&&UNMAPPED.size===9&&Object.keys(MAP).length===30);
 const rows=dims.map(dimension_id=>{
  if(UNMAPPED.has(dimension_id))return {dimension_id,source_key:null,source_release_id:null,semantic_class:'unmapped',source_status_term:null,source_reference_at:null,assessment_as_of:AS_OF,review_qualification:'unmapped',review_due_at:null,current_operations_verified:false};
  const source_key=MAP[dimension_id], s=sem.get(source_key), q=qual.get(source_key);check(source_key&&s&&q&&s.source_release_id===q.source_release_id&&s.source_key===q.source_key&&q.source_semantics?.classification===s.classification&&typeof s.source_status_term==='string'&&s.source_status_term.length>0);
  const semantic_class=s.classification==='source-defined-current-membership'?'source-defined-current':s.classification==='non-active-reporting-membership'?'non-active-reporting':null;check(semantic_class);
  return {dimension_id,source_key,source_release_id:s.source_release_id,semantic_class,source_status_term:s.source_status_term,source_reference_at:q.review_clock.source_reference_at,assessment_as_of:AS_OF,review_qualification:reviewState(q),review_due_at:dueAt(q),current_operations_verified:false};
 });
 check(rows.length===39&&rows.filter(x=>x.source_key!==null).length===30&&new Set(rows.filter(x=>x.source_key).map(x=>x.source_key)).size===28);
 const qualification_counts=Object.fromEntries(['within-review-window','stale','unmeasured','unmapped'].map(k=>[k,rows.filter(x=>x.review_qualification===k).length]));
 const semantic_counts=Object.fromEntries(['source-defined-current','non-active-reporting','unmapped'].map(k=>[k,rows.filter(x=>x.semantic_class===k).length]));
 check(canonical(qualification_counts)===canonical({'within-review-window':25,stale:1,unmeasured:4,unmapped:9})&&canonical(semantic_counts)===canonical({'source-defined-current':22,'non-active-reporting':8,unmapped:9}));
 const counts_by_dimension=input.matrix.cell_status_counts_by_dimension;
 const qualification_cell_counts=Object.fromEntries(Object.keys(qualification_counts).map(k=>[k,rows.filter(x=>x.review_qualification===k).length*48194]));
 const semantic_cell_counts=Object.fromEntries(Object.keys(semantic_counts).map(k=>[k,rows.filter(x=>x.semantic_class===k).length*48194]));
 check(Object.values(counts_by_dimension).every(v=>Object.values(v).reduce((a,b)=>a+b,0)===48194));
 return {rows,summary:{dimension_count:39,mapped_dimension_count:30,unmapped_dimension_count:9,source_key_count:28,qualification_dimension_counts:qualification_counts,qualification_cell_counts,semantic_dimension_counts:semantic_counts,semantic_cell_counts,zip_cohort_members:48194,qualification_cell_total:qualification_cell_counts['within-review-window']+qualification_cell_counts.stale+qualification_cell_counts.unmeasured+qualification_cell_counts.unmapped,semantic_cell_total:semantic_cell_counts['source-defined-current']+semantic_cell_counts['non-active-reporting']+semantic_cell_counts.unmapped},claims:{current_operations_verified:false,active_business_count:null,all_business_denominator:null,all_business_completion_percent:null,additive:false,network_requests:0,acquisition_performed:false,current_pointer_written:false,production_enrollment:false}};
}
function pins(x){return {matrix:{release_id:MATRIX_ID,manifest_sha256:MATRIX_SHA,artifact_inventory_sha256:x.matrixArtifactInventorySha,registration_sha256:x.matrixRegistrationSha},temporal:{release_id:TEMPORAL_ID,manifest_sha256:TEMPORAL_SHA,artifact_sha256:x.temporal.provenance.artifact_sha256,registration_sha256:x.temporalRegistrationSha},qualification:{release_id:QUALIFICATION_ID,manifest_sha256:QUALIFICATION_SHA,projection_sha256:x.qualReg.retained_release.projection_artifact.sha256,inventory_sha256:x.qualReg.retained_release.artifact_inventory_sha256,registration_sha256:x.qualificationRegistrationSha,assessment_as_of:AS_OF}};}
export async function buildExactZipIndustryTemporalQualification({root=APP_ROOT}={}){
 root=path.resolve(root);const x=await inputs(root), joined=compose(x), p=pins(x), data={schema_version:VERSION,predecessor:null,assessment_as_of:AS_OF,bindings:p,...joined}, artifact=`${JSON.stringify(data)}\n`, artifact_sha256=hash(artifact), release_id=`${DATASET}-${hash(JSON.stringify(data))}`;
 const manifest={schema_version:`${DATASET}-release@1.0.0`,dataset_id:DATASET,release_id,status:'immutable-pointer-free-local-review-only',publication_mode:'pointer-free',assessment_as_of:AS_OF,artifact:{path:'qualification.json',bytes:Buffer.byteLength(artifact),sha256:artifact_sha256,record_count:39},bindings:p,summary:joined.summary,claims:joined.claims};
 const manifestBytes=JSON.stringify(manifest)+'\n',manifestSha=hash(manifestBytes), relDir=`data/${DATASET}/releases/${release_id}`, abs=path.join(root,relDir);
 await fs.mkdir(abs,{recursive:true});await fs.writeFile(path.join(abs,'qualification.json'),artifact,{flag:'wx'}).catch(async e=>{if(e.code!=='EEXIST')throw e;check(hash(await fs.readFile(path.join(abs,'qualification.json')))==hash(artifact),'existing immutable artifact mismatch');});
 await fs.writeFile(path.join(abs,'manifest.json'),manifestBytes,{flag:'wx'}).catch(async e=>{if(e.code!=='EEXIST')throw e;check(hash(await fs.readFile(path.join(abs,'manifest.json')))==manifestSha,'existing immutable manifest mismatch');});
 const reg={schema_version:'1.0.0',dataset_id:DATASET,status:'registered-pointer-free-local-review-only',runtime_pointer:null,production_enrollment:false,current_pointer_written:false,export_policy:'local-review-only',retained_release:{release_id,manifest:`${relDir}/manifest.json`,manifest_sha256:manifestSha,artifact_sha256,bindings:p,summary:joined.summary}};
 await fs.mkdir(path.join(root,'config/datasets'),{recursive:true});await fs.writeFile(path.join(root,'config/datasets/exact-zip-industry-temporal-qualification.json'),JSON.stringify(reg,null,2)+'\n');
 return {release_id,manifest_sha256:manifestSha,artifact_sha256,summary:joined.summary};
}
export async function readExactZipIndustryTemporalQualification({root=APP_ROOT,zip5,signal}={}){
 check(/^\d{5}$/.test(zip5??''));root=path.resolve(root);signal?.throwIfAborted();
 const reg=await readJson(path.join(root,'config/datasets/exact-zip-industry-temporal-qualification.json'),64000,signal);check(reg.dataset_id===DATASET&&reg.schema_version==='1.0.0'&&reg.runtime_pointer===null&&reg.production_enrollment===false&&reg.current_pointer_written===false);
 const rr=reg.retained_release;check(rr&&rr.manifest===`data/${DATASET}/releases/${rr.release_id}/manifest.json`&&SHA.test(rr.manifest_sha256));
 const manifest=await readJson(path.join(root,rr.manifest),64000,signal);check(hash(JSON.stringify(manifest)+'\n')===rr.manifest_sha256&&manifest.schema_version===`${DATASET}-release@1.0.0`&&manifest.dataset_id===DATASET&&manifest.release_id===rr.release_id&&manifest.status==='immutable-pointer-free-local-review-only'&&manifest.publication_mode==='pointer-free'&&manifest.assessment_as_of===AS_OF&&manifest.artifact?.record_count===39&&rr.artifact_sha256===manifest.artifact.sha256);
 const artifact=await readJson(path.join(root,path.posix.join(path.posix.dirname(rr.manifest),manifest.artifact.path)),64000,signal);check(hash(JSON.stringify(artifact)+'\n')===manifest.artifact.sha256&&artifact.schema_version===VERSION&&artifact.bindings&&canonical(artifact.bindings)===canonical(manifest.bindings)&&canonical(artifact.summary)===canonical(manifest.summary));
 const x=await inputs(root,signal,zip5), expected=compose(x),p=pins(x);check(canonical(artifact.rows)===canonical(expected.rows)&&canonical(artifact.summary)===canonical(expected.summary)&&canonical(artifact.claims)===canonical(expected.claims)&&canonical(artifact.bindings)===canonical(p));
 signal?.throwIfAborted();return {schema_version:VERSION,zip5,assessment_as_of:AS_OF,rows:artifact.rows,summary:artifact.summary,provenance:{release_id:rr.release_id,manifest_sha256:rr.manifest_sha256,artifact_sha256:manifest.artifact.sha256,bindings:artifact.bindings},claims:artifact.claims};
}
export async function readExactZipIndustryEvidenceWithTemporalQualification({root=APP_ROOT,zip5,signal}={}){
 const [industry,temporal_qualification]=await Promise.all([readExactZipIndustryEvidence({root,zip5}),readExactZipIndustryTemporalQualification({root,zip5,signal})]);
 signal?.throwIfAborted();return {...industry,temporal_qualification};
}
