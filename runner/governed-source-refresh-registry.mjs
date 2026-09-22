import path from "node:path";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";

const rows = [
  ["CO","co-business-registry","co-business-registry-good-standing-or-delinquent-organizations","verifyCoBusinessRegistry"],
  ["CT","ct-business-registry","ct-business-registry-active-organizations","verifyCtBusinessRegistry"],
  ["FL","fl-business-registry","fl-business-registry-quarterly-active-entities","verifyFlBusinessRegistry"],
  ["IA","ia-business-registry","ia-business-registry-active-entities","verifyIaBusinessRegistry"],
  ["IL","il-business-registry","il-business-registry-active-organizations","verifyIllinoisBusinessRegistry"],
  ["NY","ny-business-registry","ny-business-registry-active-entities","verifyNyBusinessRegistry"],
  ["OR","or-business-registry","or-business-registry-active-registrations","verifyOrBusinessRegistry"],
  ["PA","pa-business-registry","pa-business-registry-active-registrations","verifyPaBusinessRegistry"],
  ["TX","tx-active-sales-tax-permits","tx-active-sales-tax-outlets","verifyTxActiveSalesTaxPermits"],
  ["WA","wa-lni-active-contractor-licenses","wa-lni-active-contractor-organizations","verifyWaLniActiveContractors"],
];

export const GOVERNED_SOURCE_REFRESH_DESCRIPTORS = Object.freeze(Object.fromEntries(rows.map(([state,sourceId,datasetId,verifierExport])=>[sourceId,Object.freeze({
  state,sourceId,datasetId,builder:`scripts/build-${sourceId}.mjs`,verifier:`runner/${sourceId}.mjs`,verifierExport,
  outputRoot:`data/business-sources/${datasetId}`,connector:`config/connectors/${sourceId}.json`,policy:`config/source-policies/${sourceId}.json`,dataset:`config/datasets/${datasetId}.json`,
})])));
export const GOVERNED_SOURCE_REFRESH_SOURCE_IDS = Object.freeze(rows.map(([,sourceId])=>sourceId));

const sha256=value=>createHash("sha256").update(value).digest("hex");
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

export async function validateGovernedSourceRefreshDescriptor(sourceId,{appRoot=APP_ROOT}={}){
  const descriptor=GOVERNED_SOURCE_REFRESH_DESCRIPTORS[sourceId];if(!descriptor)throw new Error("Unsupported governed source refresh.");
  const root=path.resolve(appRoot);if(root!==appRoot)throw new Error("Governed refresh root must be absolute and canonical.");
  const entries=await Promise.all([descriptor.builder,descriptor.verifier,descriptor.connector,descriptor.policy,descriptor.dataset].map(relative=>fixedFile(root,relative)));
  const connector=JSON.parse(entries[2].bytes),policy=JSON.parse(entries[3].bytes),dataset=JSON.parse(entries[4].bytes);
  if(connector.connector_id!==sourceId||connector.source_policy!==descriptor.policy||policy.policy_id!==sourceId
    ||dataset.dataset_id!==descriptor.datasetId||dataset.connector!==descriptor.connector||dataset.source_policy!==descriptor.policy
    ||!entries[0].bytes.toString("utf8").includes(`../runner/${sourceId}.mjs`)
    ||!entries[1].bytes.toString("utf8").includes(`export async function ${descriptor.verifierExport}`))throw new Error("Governed source refresh binding drifted from its fixed contract.");
  return Object.freeze({...descriptor,status:"HOLD",dispatchAvailable:false,freshAcquisitionAuthorized:false,autonomousAcquisitionAuthorized:false,productionPointerChangeAuthorized:false,
    evidence:[descriptor.builder,descriptor.verifier,descriptor.connector,descriptor.policy,descriptor.dataset].map((relative,index)=>({path:relative,sha256:entries[index].sha256,bytes:entries[index].bytes.length}))});
}

export async function governedSourceRefreshHoldPlan(sourceId){
  const binding=await validateGovernedSourceRefreshDescriptor(sourceId);
  return Object.freeze({planId:`${sourceId}-managed-refresh-hold-${sha256(JSON.stringify(binding.evidence)).slice(0,16)}`,sourceId,mode:"governed-full-snapshot-refresh",status:"HOLD",allocationCount:0,networkRequestCount:0,operationCreated:false,
    implementation:{state:binding.state,builder:binding.builder,verifier:binding.verifier,verifierExport:binding.verifierExport,outputRoot:binding.outputRoot,datasetId:binding.datasetId,connector:binding.connector,policy:binding.policy,evidence:binding.evidence},
    unresolvedGates:["fresh-acquisition-authorization","autonomous-acquisition-authorization","production-pointer-change-authorization"]});
}
