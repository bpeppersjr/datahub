import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {projectZipEvidenceQualification} from './zip-evidence-qualification-http.mjs';

/** Candidate configuration is not evidence that licensed input exists or was admitted. */
export async function readZipOperationalAdmission({root=APP_ROOT,signal}={}) {
 const paths=['config/datasets/usps-city-state-operational-denominator-candidate.json','config/source-policies/usps-city-state-operational-denominator-candidate.json'];
 const reads=[];
 try {
  for(const relative of paths){const meter={};const value=await readJson(path.join(root,relative),32000,signal,meter);reads.push({relative,meter,value});}
  const [registration,policy]=reads.map(item=>item.value),id='usps-city-state-operational-denominator-candidate';
  if(registration.dataset_id!==id||registration.version!=='1.0.0'||registration.policy_profile!==paths[1]||registration.production_admission!==false||registration.current_pointer!==false||registration.export_policy!=='local-restricted'||policy.policy_id!==id||policy.version!=='1.0.0'||policy.dataset_id!==id||policy.redistribution!=='not authorized'||!policy.prohibited_use?.includes('production admission')||!policy.prohibited_use?.includes('address deliverability claim'))throw Error();
  const recheck=async()=>{for(const item of reads){const meter={};await readJson(path.join(root,item.relative),32000,signal,meter);if(meter.sha256!==item.meter.sha256||meter.identity.ino!==item.meter.identity.ino||meter.identity.mtimeNs!==item.meter.identity.mtimeNs)throw Error('ZIP admission metadata changed.');}};
  await recheck();
  return {value:{schema_version:'zip-operational-admission@1.0.0',status:'candidate-not-admitted',current_operation_verified:false,operational_status:null,deliverability_verified:false,production_admission:false,export_policy:'local-restricted',blockers:['licensed-input-and-permission-not-established-by-registration','candidate-policy-prohibits-production-admission','current-operation-and-address-deliverability-not-established'],bindings:{dataset_id:id,registration_version:registration.version,registration_sha256:reads[0].meter.sha256,policy_version:policy.version,policy_sha256:reads[1].meter.sha256}},recheck};
 } catch {signal?.throwIfAborted();return {value:{schema_version:'zip-operational-admission@1.0.0',status:'scope-comparison-unavailable',current_operation_verified:false,operational_status:null,deliverability_verified:false,production_admission:null,export_policy:null,blockers:['candidate-registration-or-policy-unavailable'],bindings:null},recheck:async()=>{signal?.throwIfAborted();}};}
}

export function compatibleZipQualification(value,{zip,categoryId,catalog}) {
 const unavailable=status=>projectZipEvidenceQualification({zip5:zip,category_id:categoryId,available:false,status},{zip,categoryId});
 try {
  const result=projectZipEvidenceQualification(value,{zip,categoryId});
  if(result.available&&['coverage_release_id','coverage_manifest_sha256','registry_release_id','registry_manifest_sha256'].some(key=>!catalog[key]||result.bindings[key]!==catalog[key]))return unavailable('incompatible-bindings');
  return result;
 } catch {return unavailable('unavailable');}
}
