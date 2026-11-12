import path from "node:path";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";

const rows = [
  ["US","fdic-bankfind","fdic-bankfind","verifyFdicBankfind","config/governed-source-refresh-assessments/fdic-bankfind-2026-11-12.json"],
  ["US","ncua-quarterly","ncua-quarterly-credit-unions","verifyNcuaQuarterly","config/governed-source-refresh-assessments/ncua-quarterly-2026-11-12.json"],
  ["US","fmcsa-company-census","fmcsa-active-us-company-census","verifyFmcsaCompanyCensus","config/governed-source-refresh-assessments/fmcsa-company-census-2026-11-12.json"],
  ["US","usda-snap-retailers","usda-snap-retailers","verifyUsdaSnapRelease","config/governed-source-refresh-assessments/usda-snap-retailers-2026-11-12.json","data/business-sources/usda-snap"],
  ["US","cms-nppes-organizations","cms-nppes-organizations","verifyCmsNppesOrganizations","config/governed-source-refresh-assessments/cms-nppes-organizations-2026-11-12.json",null,["runner/nppes-source.mjs"]],
  ["US","irs-eo-bmf","irs-eo-bmf-organizations","verifyIrsEoBmf","config/governed-source-refresh-assessments/irs-eo-bmf-2026-11-12.json"],
  ["AK","ak-active-business-licenses","ak-active-business-licenses","verifyAkActiveBusinessLicenses","config/governed-source-refresh-assessments/ak-active-business-licenses-2026-11-12.json",null,["scripts/run-ak-business-app.mjs","runner/ak-business-app.mjs","config/connectors/ak-active-business-licenses-app.json"],["scripts/run-ak-business-app.mjs"]],
  ["CA","ca-abc-active-license-sites","ca-abc-active-license-sites","verifyCaAbcActiveLicenseSites","config/governed-source-refresh-assessments/ca-abc-active-license-sites-2026-11-12.json"],
  ["CO","co-business-registry","co-business-registry-good-standing-or-delinquent-organizations","verifyCoBusinessRegistry"],
  ["CO","co-childcare","co-childcare-licensed-center-candidates","verifyCoChildcare","config/governed-source-refresh-assessments/co-childcare-2026-11-12.json",null,["runner/governed-app-pointer.mjs","runner/co-childcare-app.mjs","runner/co-childcare-acquired-release.mjs","runner/co-childcare-acquisition.mjs","runner/co-childcare-normalized-release.mjs","runner/co-childcare-normalization.mjs","config/connectors/co-childcare-centers-app.json","config/connectors/co-childcare-centers-acquisition.json","config/connectors/co-childcare-centers-normalization.json","config/connectors/co-childcare-preflight.json","config/source-policies/co-childcare-centers-internal.json","config/source-policies/co-childcare-preflight.json","config/co-childcare-source-contract.json"]],
  ["CT","ct-business-registry","ct-business-registry-active-organizations","verifyCtBusinessRegistry"],
  ["CT","ct-childcare","ct-childcare-active-center-candidates","verifyCtChildcare","config/governed-source-refresh-assessments/ct-childcare-2026-11-12.json",null,["runner/ct-childcare-app.mjs","runner/ct-childcare-acquired-release.mjs","runner/ct-childcare-acquisition.mjs","runner/ct-childcare-normalized-release.mjs","runner/ct-childcare-normalization.mjs","config/connectors/ct-childcare-centers-app.json","config/connectors/ct-childcare-centers-acquisition.json","config/connectors/ct-childcare-centers-normalization.json","config/connectors/ct-childcare-preflight.json","config/source-policies/ct-childcare-centers-internal.json","config/source-policies/ct-childcare-preflight.json"]],
  ["DC","dc-basic-business-licenses","dc-basic-business-license-sites","verifyDcBasicBusinessLicenses","config/governed-source-refresh-assessments/dc-basic-business-licenses-2026-11-12.json"],
  ["DE","de-business-licenses","de-business-licenses-current","verifyDeBusinessLicenses",null,null,["scripts/run-de-business-app.mjs","runner/de-business-app.mjs","config/connectors/de-business-licenses-app.json"],["scripts/run-de-business-app.mjs"]],
  ["FL","fl-business-registry","fl-business-registry-quarterly-active-entities","verifyFlBusinessRegistry"],
  ["IA","ia-business-registry","ia-business-registry-active-entities","verifyIaBusinessRegistry"],
  ["IL","il-business-registry","il-business-registry-active-organizations","verifyIllinoisBusinessRegistry"],
  ["MD","md-childcare","md-childcare-licensed-center-candidates","verifyMdChildcare","config/governed-source-refresh-assessments/md-childcare-2026-11-12.json",null,["runner/md-childcare-app.mjs","runner/md-childcare-acquired-release.mjs","runner/md-childcare-acquisition.mjs","runner/md-childcare-normalized-release.mjs","runner/md-childcare-normalization.mjs","config/connectors/md-childcare-centers-app.json","config/connectors/md-childcare-centers-acquisition.json","config/connectors/md-childcare-centers-normalization.json","config/connectors/md-childcare-preflight.json","config/source-policies/md-childcare-centers-internal.json","config/source-policies/md-childcare-preflight.json"]],
  ["NY","ny-business-registry","ny-business-registry-active-entities","verifyNyBusinessRegistry"],
  ["NY","ny-retail-food-stores","ny-retail-food-store-license-sites","verifyNyRetailFoodStores","config/governed-source-refresh-assessments/ny-retail-food-stores-2026-11-12.json"],
  ["OR","or-business-registry","or-business-registry-active-registrations","verifyOrBusinessRegistry"],
  ["PA","pa-business-registry","pa-business-registry-active-registrations","verifyPaBusinessRegistry"],
  ["PA","pa-childcare","pa-childcare-open-certified-center-candidates","verifyPaChildcare","config/governed-source-refresh-assessments/pa-childcare-2026-11-12.json",null,["runner/governed-app-pointer.mjs","runner/pa-childcare-app.mjs","runner/pa-childcare-acquired-release.mjs","runner/pa-childcare-acquisition.mjs","runner/pa-childcare-normalized-release.mjs","runner/pa-childcare-normalization.mjs","config/connectors/pa-childcare-centers-app.json","config/connectors/pa-childcare-centers-acquisition.json","config/connectors/pa-childcare-centers-normalization.json","config/connectors/pa-childcare-preflight.json","config/source-policies/pa-childcare-centers-internal.json","config/source-policies/pa-childcare-preflight.json"]],
  ["TX","tx-active-sales-tax-permits","tx-active-sales-tax-outlets","verifyTxActiveSalesTaxPermits","config/governed-source-refresh-assessments/tx-active-sales-tax-permits-2026-11-12.json"],
  ["VT","vt-childcare","vt-childcare-licensed-center-candidates","verifyVtChildcare","config/governed-source-refresh-assessments/vt-childcare-2026-11-12.json",null,["runner/governed-app-pointer.mjs","runner/vt-childcare-app.mjs","runner/vt-childcare-acquired-release.mjs","runner/vt-childcare-acquisition.mjs","runner/vt-childcare-normalized-release.mjs","runner/vt-childcare-normalization.mjs","config/connectors/vt-childcare-centers-app.json","config/connectors/vt-childcare-centers-acquisition.json","config/connectors/vt-childcare-centers-normalization.json","config/connectors/vt-childcare-preflight.json","config/source-policies/vt-childcare-centers-internal.json","config/source-policies/vt-childcare-preflight.json"]],
  ["WA","wa-lni-active-contractor-licenses","wa-lni-active-contractor-organizations","verifyWaLniActiveContractors","config/governed-source-refresh-assessments/wa-lni-active-contractor-licenses-2026-11-12.json"],
];

export const GOVERNED_SOURCE_REFRESH_DESCRIPTORS = Object.freeze(Object.fromEntries(rows.map(([state,sourceId,datasetId,verifierExport,assessment,outputRoot,dependencies=[],automationScripts=[]])=>[sourceId,Object.freeze({
  state,sourceId,datasetId,builder:`scripts/build-${sourceId}.mjs`,verifier:`runner/${sourceId}.mjs`,verifierExport,
  outputRoot:outputRoot??`data/business-sources/${datasetId}`,connector:`config/connectors/${sourceId}.json`,policy:`config/source-policies/${sourceId}.json`,dataset:`config/datasets/${datasetId}.json`,
  ...(assessment?{assessment}:{}),
  ...(dependencies.length?{dependencies:Object.freeze([...dependencies])}:{}),
  ...(automationScripts.length?{automationScripts:Object.freeze([...automationScripts])}:{}),
})])));
export const GOVERNED_SOURCE_REFRESH_SOURCE_IDS = Object.freeze(rows.map(([,sourceId])=>sourceId));

const sha256=value=>createHash("sha256").update(value).digest("hex");
const AUTHORIZATION_REGISTRY = "config/governed-source-refresh-authorizations.json";
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join("|")===[...keys].sort().join("|");
function inside(root,relative){
  if(typeof relative!=="string"||relative.includes("\\")||path.isAbsolute(relative)||relative.split("/").some(part=>!part||part==="."||part===".."))throw new Error("Governed refresh path is invalid.");
  const file=path.resolve(root,...relative.split("/")),rel=path.relative(path.resolve(root),file);
  if(rel.startsWith("..")||path.isAbsolute(rel))throw new Error("Governed refresh path escapes datahub.");return file;
}
async function fixedFile(root,relative,maximum=1024*1024){
  const file=inside(root,relative),info=await lstat(file,{bigint:true});
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1n||info.size<=0n||info.size>BigInt(maximum)||await realpath(file)!==file)throw new Error("Governed refresh binding is not a safe regular file.");
  const bytes=await readFile(file),after=await lstat(file,{bigint:true});
  if(bytes.length!==Number(info.size)||after.dev!==info.dev||after.ino!==info.ino||after.size!==info.size||after.mtimeNs!==info.mtimeNs||after.ctimeNs!==info.ctimeNs)throw new Error("Governed refresh binding changed while read.");
  return {bytes,sha256:sha256(bytes)};
}

function validateAuthorizationRegistry(value){
  if(!exact(value,["schema_version","authorizations"])||value.schema_version!=="governed-source-refresh-authorizations@1.0.0"
    ||!value.authorizations||typeof value.authorizations!=="object"||Array.isArray(value.authorizations))throw new Error("Governed refresh authorization registry is invalid.");
  return value;
}

function validateAssessment(value,descriptor){
  const top=["schema_version","assessment_id","source_id","dataset_id","observed_at","controls","observation","claims","citations","next_action"];
  const controls=descriptor.sourceId==="fdic-bankfind"?[0,2]:descriptor.sourceId==="irs-eo-bmf"?[1,4]:descriptor.sourceId==="ak-active-business-licenses"?[2,0]:descriptor.sourceId==="ca-abc-active-license-sites"?[1,0]:descriptor.sourceId==="md-childcare"?[2,2]:descriptor.sourceId==="co-childcare"?[2,6]:descriptor.sourceId==="vt-childcare"?[4,9]:["ny-retail-food-stores","ct-childcare","pa-childcare"].includes(descriptor.sourceId)?[1,2]:[1,1];
  const claimKeys=descriptor.sourceId==="tx-active-sales-tax-permits"?["active_permit_is_current_operation","reported_physical_address_is_verified_premise","complete_all_texas_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:descriptor.sourceId==="wa-lni-active-contractor-licenses"?["active_license_is_current_operation","reported_mailing_address_is_verified_premise","complete_all_washington_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:descriptor.sourceId==="fdic-bankfind"?["active_institution_is_current_operation","current_location_is_verified_public_premise","complete_all_financial_businesses","index_delta_is_net_business_creation","complete_all_us_businesses"]:descriptor.sourceId==="ncua-quarterly"?["quarterly_membership_is_current_operation","reported_branch_is_verified_public_premise","complete_all_credit_unions","edition_delta_is_net_business_creation","complete_all_us_businesses"]:descriptor.sourceId==="fmcsa-company-census"?["active_registration_is_current_operation","principal_office_is_verified_public_premise","complete_all_transportation_businesses","row_delta_is_net_business_creation","complete_all_us_businesses"]:descriptor.sourceId==="usda-snap-retailers"?["snap_authorization_is_current_operation","reported_location_is_verified_open_storefront","complete_all_grocery_retailers","row_delta_is_net_business_creation","complete_all_us_businesses"]:descriptor.sourceId==="cms-nppes-organizations"?["active_npi_is_current_operation","reported_practice_location_is_verified_open_premise","complete_all_healthcare_businesses","edition_delta_is_net_business_creation","complete_all_us_businesses"]:descriptor.sourceId==="irs-eo-bmf"?["current_extract_membership_is_current_operation","reported_filing_address_is_verified_physical_premise","complete_all_tax_exempt_organizations","edition_delta_is_net_organization_creation","complete_all_us_businesses"]:descriptor.sourceId==="ak-active-business-licenses"?["active_license_is_current_operation","reported_physical_address_is_verified_operating_premise","complete_all_alaska_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:descriptor.sourceId==="ca-abc-active-license-sites"?["active_license_is_current_operation","reported_premise_is_verified_operating_site","complete_all_california_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:descriptor.sourceId==="dc-basic-business-licenses"?["active_license_is_current_operation","reported_premise_is_verified_operating_site","complete_all_dc_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:descriptor.sourceId==="ny-retail-food-stores"?["annual_snapshot_membership_is_current_operation","reported_address_is_verified_operating_site","complete_all_new_york_food_retailers","row_delta_is_net_business_creation","record_level_public_export_authorized"]:descriptor.sourceId==="ct-childcare"?["active_credential_is_current_operation","reported_address_is_verified_operating_site","complete_all_connecticut_childcare_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:descriptor.sourceId==="md-childcare"?["licensed_cohort_membership_is_current_operation","reported_address_or_point_is_verified_operating_site","complete_all_maryland_childcare_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:descriptor.sourceId==="pa-childcare"?["monthly_membership_is_current_operation","reported_address_or_point_is_verified_operating_site","complete_all_pennsylvania_childcare_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:[];
  const expectedClaimKeys=descriptor.sourceId==="co-childcare"?["licensed_cohort_membership_is_current_operation","reported_physical_address_is_verified_operating_site","complete_all_colorado_childcare_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:descriptor.sourceId==="vt-childcare"?["monthly_membership_is_current_operation","reported_address_is_verified_operating_site","complete_all_vermont_childcare_businesses","row_delta_is_net_business_creation","record_level_public_export_authorized"]:claimKeys;
  if(!exact(value,top)||value.schema_version!=="governed-source-refresh-assessment@1.0.0"||value.source_id!==descriptor.sourceId||value.dataset_id!==descriptor.datasetId
    ||typeof value.assessment_id!=="string"||!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.assessment_id)||typeof value.observed_at!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value.observed_at)
    ||!exact(value.controls,["metadata_requests","aggregate_requests","entity_row_requests","records_downloaded","production_changes"])||value.controls.metadata_requests!==controls[0]||value.controls.aggregate_requests!==controls[1]||value.controls.entity_row_requests!==0||value.controls.records_downloaded!==0||value.controls.production_changes!==0
    ||!value.observation||typeof value.observation!=="object"||Array.isArray(value.observation)||typeof value.observation.metadata_sha256!=="string"||!/^[a-f0-9]{64}$/.test(value.observation.metadata_sha256)||typeof value.observation.aggregate_sha256!=="string"||!/^[a-f0-9]{64}$/.test(value.observation.aggregate_sha256)||!Number.isSafeInteger(value.observation.aggregate_records)||value.observation.aggregate_records<1
    ||!exact(value.claims,expectedClaimKeys)||Object.values(value.claims).some(item=>item!==false)
    ||!Array.isArray(value.citations)||value.citations.length<1||value.citations.some(item=>typeof item!=="string"||!item.startsWith("https://"))||typeof value.next_action!=="string"||value.next_action.length<1)throw new Error(`Governed refresh assessment is invalid for ${descriptor.sourceId}.`);
  return value;
}

function authorizationBinding(sourceId,evidence,registry){
  const receipt=registry.authorizations[sourceId];
  if(receipt===undefined)return null;
  const keys=["schema_version","authorization_id","source_id","approved_at","approved_by","mode","descriptor_evidence_sha256","permissions"];
  if(!exact(receipt,keys)||receipt.schema_version!=="governed-source-refresh-authorization@1.0.0"
    ||receipt.source_id!==sourceId||typeof receipt.authorization_id!=="string"||!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(receipt.authorization_id)
    ||typeof receipt.approved_by!=="string"||receipt.approved_by.length<1||receipt.approved_by.length>128
    ||typeof receipt.approved_at!=="string"||new Date(receipt.approved_at).toISOString()!==receipt.approved_at
    ||receipt.mode!=="app-owned-automatic-full-snapshot-refresh"
    ||receipt.descriptor_evidence_sha256!==sha256(JSON.stringify(evidence))
    ||!exact(receipt.permissions,["fresh_acquisition","autonomous_acquisition","production_pointer_change","terms_reviewed","source_access_reviewed"])
    ||Object.values(receipt.permissions).some(value=>value!==true))throw new Error(`Governed refresh authorization receipt is invalid for ${sourceId}.`);
  return Object.freeze(structuredClone(receipt));
}

export async function validateGovernedSourceRefreshDescriptor(sourceId,{appRoot=APP_ROOT,authorizationRegistry=AUTHORIZATION_REGISTRY}={}){
  const descriptor=GOVERNED_SOURCE_REFRESH_DESCRIPTORS[sourceId];if(!descriptor)throw new Error("Unsupported governed source refresh.");
  const root=path.resolve(appRoot);if(root!==appRoot)throw new Error("Governed refresh root must be absolute and canonical.");
  const paths=[descriptor.builder,descriptor.verifier,descriptor.connector,descriptor.policy,descriptor.dataset,...(descriptor.assessment?[descriptor.assessment]:[]),...(descriptor.dependencies??[])];
  const entries=await Promise.all(paths.map(relative=>fixedFile(root,relative)));
  const connector=JSON.parse(entries[2].bytes),policy=JSON.parse(entries[3].bytes),dataset=JSON.parse(entries[4].bytes);
  if(connector.connector_id!==sourceId||connector.source_policy!==descriptor.policy||policy.policy_id!==sourceId
    ||dataset.dataset_id!==descriptor.datasetId||dataset.connector!==descriptor.connector||dataset.source_policy!==descriptor.policy
    ||!entries[0].bytes.toString("utf8").includes(`../runner/${sourceId}.mjs`)
    ||!entries[1].bytes.toString("utf8").includes(`export async function ${descriptor.verifierExport}`))throw new Error("Governed source refresh binding drifted from its fixed contract.");
  const assessment=descriptor.assessment?validateAssessment(JSON.parse(entries[5].bytes),descriptor):null;
  const evidence=paths.map((relative,index)=>({path:relative,sha256:entries[index].sha256,bytes:entries[index].bytes.length}));
  const authorizationRead=await fixedFile(root,authorizationRegistry),registry=validateAuthorizationRegistry(JSON.parse(authorizationRead.bytes));
  if(Object.keys(registry.authorizations).some(id=>!GOVERNED_SOURCE_REFRESH_DESCRIPTORS[id]))throw new Error("Governed refresh authorization registry names an unsupported source.");
  const authorization=authorizationBinding(sourceId,evidence,registry);
  return Object.freeze({...descriptor,status:authorization?"AUTHORIZED":"HOLD",dispatchAvailable:Boolean(authorization),freshAcquisitionAuthorized:Boolean(authorization),autonomousAcquisitionAuthorized:Boolean(authorization),productionPointerChangeAuthorized:Boolean(authorization),authorization,observedAssessment:assessment?{assessmentId:assessment.assessment_id,observedAt:assessment.observed_at,aggregateRecords:assessment.observation.aggregate_records,aggregateLabel:typeof assessment.observation.aggregate_label==="string"?assessment.observation.aggregate_label:"current source rows",nextAction:assessment.next_action}:null,
    sourceUseNotice:typeof policy.required_application_notice==="string"&&policy.required_application_notice.length>0?policy.required_application_notice:null,
    authorizationRegistry:{path:authorizationRegistry,sha256:authorizationRead.sha256,bytes:authorizationRead.bytes.length},evidence});
}

export async function governedSourceRefreshPlan(sourceId,options){
  const binding=await validateGovernedSourceRefreshDescriptor(sourceId,options);
  const authorized=binding.status==="AUTHORIZED";
  return Object.freeze({planId:`${sourceId}-managed-refresh-${authorized?"authorized":"hold"}-${sha256(JSON.stringify(binding.evidence)).slice(0,16)}`,sourceId,mode:"governed-full-snapshot-refresh",status:binding.status,dispatchAvailable:binding.dispatchAvailable,allocationCount:0,networkRequestCount:0,operationCreated:false,
    implementation:{state:binding.state,builder:binding.builder,verifier:binding.verifier,verifierExport:binding.verifierExport,outputRoot:binding.outputRoot,datasetId:binding.datasetId,connector:binding.connector,policy:binding.policy,evidence:binding.evidence},
    authorization:binding.authorization?{authorizationId:binding.authorization.authorization_id,approvedAt:binding.authorization.approved_at,approvedBy:binding.authorization.approved_by}:null,
    unresolvedGates:authorized?[]:["fresh-acquisition-authorization","autonomous-acquisition-authorization","production-pointer-change-authorization"]});
}

export const governedSourceRefreshHoldPlan=governedSourceRefreshPlan;
