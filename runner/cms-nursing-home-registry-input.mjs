import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadLines as readLines,mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';
import {loadCmsNursingHomeReportingInput,summarizeCmsNursingHomeReporting} from './cms-nursing-home-reporting-input.mjs';

export const CMS_NURSING_HOME_REGISTRY_VERSION='cms-nursing-home-registry-input@1.0.0';
export const CMS_NURSING_HOME_REGISTRY_ARTIFACT='cms-nursing-home-directory-reporting-jsonl';
export const CMS_NURSING_HOME_REGISTRY_PATH='reporting/cms-nursing-homes/directory.jsonl';
export const CMS_NURSING_HOME_DEPENDENCY='cms-nursing-home-provider-information';
const FIELD='cms_nursing_home_directory_reporting',COUNT='cms_nursing_home_directory_rows';
const check=v=>{if(!v)throw Error('CMS nursing-home registry admission rejected.');};
const relative=v=>path.relative(APP_ROOT,v).replaceAll('\\','/');
const claims=()=>({record_unit:'publisher-nursing-home-directory-row',identity_reconciliation_status:'not-yet-reconciled',identity_matching_applied:false,physical_site_assertion_applied:false,geographic_assignment_performed:false,current_operations_verified:false,unique_business_count:null,physical_site_count:null,national_completeness_percent:null,public_export_authorized:false,export_policy:'local-review-only'});
export async function loadCmsNursingHomeRegistryInput(selectionPath,{signal}={}){
 signal?.throwIfAborted();check(selectionPath===path.join(APP_ROOT,'config/cms-nursing-home-retained-selection.json'));
 const input=await loadCmsNursingHomeReportingInput({signal}),summary=summarizeCmsNursingHomeReporting(input,{signal});check(input.nativeSourceVerified&&input.verificationMode==='native-retained-recovery-replayed');
 return {selection:{path:relative(selectionPath),sha256:input.evidence.selectionSha256},source:{dataset_id:CMS_NURSING_HOME_DEPENDENCY,release_id:path.basename(path.dirname(input.evidence.manifestPath)),manifest_path:input.evidence.manifestPath,manifest_sha256:input.evidence.manifestSha256,selected_artifact:input.evidence.selectedArtifact,observed_at:input.evidence.observedAt,recovery_created_at:input.evidence.recoveryCreatedAt,source_dates:input.evidence.sourceDates,failed_source:input.evidence.failedSource,source_failed_at:input.evidence.sourceFailedAt,projection_version:input.evidence.recoveryProjectionVersion},records:input.rows,summary:{directory_rows:input.rows.length,...summary.denominators}};
}
export function cmsNursingHomeRegistryDeclaration(input){return {schema_version:CMS_NURSING_HOME_REGISTRY_VERSION,selection:input.selection,source:input.source,summary:input.summary,...claims()};}
export function cmsNursingHomeRegistryDependency(input){return {dataset_id:CMS_NURSING_HOME_DEPENDENCY,release_id:input.source.release_id,manifest_sha256:input.source.manifest_sha256};}

/** Structural envelope contract only. Native admission additionally replays the pinned source below. */
export function validateCmsNursingHomeRegistryEnvelope(manifest,input=null){
 const declaration=manifest[FIELD],artifacts=(manifest.artifacts??[]).filter(a=>a.artifact_type===CMS_NURSING_HOME_REGISTRY_ARTIFACT||a.path===CMS_NURSING_HOME_REGISTRY_PATH),dependencies=(manifest.dependencies??[]).filter(d=>d.dataset_id===CMS_NURSING_HOME_DEPENDENCY);
 if(declaration===undefined){check(input===null&&artifacts.length===0&&dependencies.length===0&&!Object.hasOwn(manifest.coverage??{},COUNT));return null;}
 check(input!==null&&manifest.dataset_id==='national-business-registry'&&manifest.publisher?.id==='national-business-registry'&&['2.12.0','2.13.0','2.14.0','2.15.0'].includes(manifest.publisher.version));
 check(typeof manifest.created_at==='string'&&Number.isFinite(Date.parse(manifest.created_at))&&new Date(manifest.created_at).toISOString()===manifest.created_at&&manifest.created_at>=input.source.recovery_created_at);
 check(same(declaration,cmsNursingHomeRegistryDeclaration(input))&&artifacts.length===1&&dependencies.length===1&&same(dependencies[0],cmsNursingHomeRegistryDependency(input))&&manifest.coverage?.[COUNT]===input.records.length&&typeof manifest.export_policy==='string'&&manifest.export_policy.includes('local-review-only'));
 const a=artifacts[0];check(a.path===CMS_NURSING_HOME_REGISTRY_PATH&&a.artifact_type===CMS_NURSING_HOME_REGISTRY_ARTIFACT&&a.export_policy==='local-review-only'&&a.record_count===input.records.length&&a.bytes===input.source.selected_artifact.bytes&&a.sha256===input.source.selected_artifact.sha256);return a;
}
export function validateCmsNursingHomeRegistryMembership(input,records,meter,artifact){
 check(Array.isArray(records)&&Object.getPrototypeOf(records)===Array.prototype&&records.length===input.records.length&&Reflect.ownKeys(records).length===records.length+1);for(let i=0;i<records.length;i++)check(Object.hasOwn(Object.getOwnPropertyDescriptor(records,String(i))??{},'value')&&same(records[i],input.records[i]));check(meter.bytes===artifact.bytes&&meter.sha256===artifact.sha256&&meter.records===artifact.record_count);
}
export async function verifyCmsNursingHomeRegistryExtension(manifest,directory,{signal}={}){
 signal?.throwIfAborted();
 if(manifest[FIELD]===undefined){validateCmsNursingHomeRegistryEnvelope(manifest);check(!await lstat(path.join(directory,CMS_NURSING_HOME_REGISTRY_PATH)).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}));return null;}
 await canonical(directory,{signal});const owner=await lstat(directory,{bigint:true}),selection=path.join(APP_ROOT,'config/cms-nursing-home-retained-selection.json'),input=await loadCmsNursingHomeRegistryInput(selection,{signal}),artifact=validateCmsNursingHomeRegistryEnvelope(manifest,input),meter={},records=[];
 for await(const record of readLines(path.join(directory,CMS_NURSING_HOME_REGISTRY_PATH),input.source.selected_artifact.bytes,signal,meter)){check(records.length<input.records.length);records.push(record);}validateCmsNursingHomeRegistryMembership(input,records,meter,artifact);
 const after=await loadCmsNursingHomeRegistryInput(selection,{signal});check(same(cmsNursingHomeRegistryDeclaration(after),cmsNursingHomeRegistryDeclaration(input)));const finalMeter={};for await(const ignored of readLines(path.join(directory,CMS_NURSING_HOME_REGISTRY_PATH),input.source.selected_artifact.bytes,signal,finalMeter)){void ignored;}check(finalMeter.bytes===meter.bytes&&finalMeter.sha256===meter.sha256&&finalMeter.records===meter.records&&['ino','dev','size','mtimeNs','ctimeNs'].every(key=>finalMeter.identity[key]===meter.identity[key]));const finalOwner=await lstat(directory,{bigint:true});check(finalOwner.isDirectory()&&!finalOwner.isSymbolicLink()&&finalOwner.ino===owner.ino&&finalOwner.dev===owner.dev);signal?.throwIfAborted();return input;
}
