import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { inspectMississippiBusinessReportPackage } from "./mississippi-business-report-offline.mjs";

export const MS_BUSINESS_REPORT_APP_VERSION = "mississippi-business-report-app@1.0.0";
const OPERATIONS_ROOT = path.join(APP_ROOT, "data", "imports", "mississippi-business-report", "operations");
const PACKAGES_ROOT = path.join(APP_ROOT, "data", "imports", "mississippi-business-report", "packages");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = message => Object.assign(new Error(`Mississippi business-report app operation rejected: ${message}`), { code:"MS_BUSINESS_REPORT_APP" });
const check = (value, message) => { if (!value) throw fail(message); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Reflect.ownKeys(value).sort(), [...keys].sort());
const relative = filename => path.relative(APP_ROOT, filename).replaceAll("\\", "/");
const jsonBytes = value => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");

async function canonical(filename, { file=false, create=false }={}) {
  const target=path.resolve(filename), root=path.resolve(APP_ROOT), rel=path.relative(root,target);
  check(rel && !rel.startsWith("..") && !path.isAbsolute(rel), "Path must remain inside datahub.");
  check(await realpath(root) === root, "Datahub root is not canonical.");
  let current=root;
  for(const part of rel.split(path.sep)){
    current=path.join(current,part); let info;
    try{info=await lstat(current,{bigint:true});}catch(error){if(!create||error.code!=="ENOENT")throw error;await mkdir(current);info=await lstat(current,{bigint:true});}
    check(!info.isSymbolicLink() && await realpath(current)===current,"Links are not accepted.");
    if(current!==target||create)check(info.isDirectory(),"Path ancestor is not a directory.");
    if(current===target&&file)check(info.isFile()&&info.nlink===1n,"Input is not a single regular file.");
  }
  return target;
}
async function fixedRead(filename, maximum=1_500_000_000){
  filename=await canonical(filename,{file:true}); const before=await lstat(filename,{bigint:true});
  check(before.size>0n&&before.size<=BigInt(maximum),"File size is outside the operation limit.");
  const bytes=await readFile(filename),after=await lstat(filename,{bigint:true});
  check(["dev","ino","size","mtimeNs","ctimeNs"].every(key=>before[key]===after[key]),"File changed while read.");
  return {filename,bytes,bytes_count:Number(before.size),sha256:sha256(bytes)};
}
async function atomicJson(filename,value){const temporary=`${filename}.tmp-${randomUUID()}`,bytes=jsonBytes(value),handle=await open(temporary,"wx");try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await rename(temporary,filename);return sha256(bytes);}
function releaseRecord(record){
  check(record.export_policy==="local-review-only" && record.claims?.statewide_complete===false && record.claims?.current_operation_verified===false && record.claims?.physical_site_verified===false && record.claims?.redistribution_authorized===false && record.claims?.national_admission_performed===false && record.claims?.production_enrollment===false && record.claims?.current_pointer_written===false,"Normalized record exceeds review authority.");
  return `${JSON.stringify(record)}\n`;
}

export async function runMississippiBusinessReportAppJob({packageDirectory,operationsRoot=OPERATIONS_ROOT,signal,now=()=>new Date()}={}){
  check(signal===undefined||signal instanceof AbortSignal,"Invalid cancellation signal."); signal?.throwIfAborted();
  const selectedPathInfo=await lstat(path.resolve(packageDirectory),{bigint:true});
  check(selectedPathInfo.isDirectory()&&!selectedPathInfo.isSymbolicLink(),"Package location must be a real directory.");
  const selected=await inspectMississippiBusinessReportPackage(packageDirectory,{signal});
  const sourceDirectory=await realpath(packageDirectory),packageId=path.basename(sourceDirectory);
  check(path.dirname(sourceDirectory)===PACKAGES_ROOT,"Package location is not the fixed import root.");
  const root=await canonical(operationsRoot,{create:true}); check(root===OPERATIONS_ROOT,"Operations root is fixed.");
  const runId=randomUUID(),operation=path.join(root,runId);await mkdir(operation);const startedAt=now().toISOString();
  const start={schema_version:MS_BUSINESS_REPORT_APP_VERSION,run_id:runId,status:"RUNNING",started_at:startedAt,execution_mode:"operator-supplied-local-package",package_id:packageId,package_path:relative(sourceDirectory),selection_sha256:selected.selection_sha256,network_requests:0,acquisition_performed:false,account_action_performed:false,purchase_performed:false};
  const startSha256=await atomicJson(path.join(operation,"start.json"),start);
  const snapshotRoot=path.join(operation,"input-snapshot"),snapshotPackage=path.join(snapshotRoot,packageId),releaseRoot=path.join(operation,"release");
  try{
    signal?.throwIfAborted();await mkdir(snapshotPackage,{recursive:true});
    for(const name of await readdir(sourceDirectory)){signal?.throwIfAborted();await copyFile(path.join(sourceDirectory,name),path.join(snapshotPackage,name),constants.COPYFILE_EXCL);}
    const replay=await inspectMississippiBusinessReportPackage(snapshotPackage,{packagesRoot:snapshotRoot,signal});
    check(replay.selection_sha256===selected.selection_sha256 && replay.records.length===selected.records.length,"Operation snapshot differs from selected package.");
    await mkdir(releaseRoot);const organizationsBytes=Buffer.from(replay.records.map(releaseRecord).join(""),"utf8");
    await open(path.join(releaseRoot,"organizations.jsonl"),"wx").then(async handle=>{try{await handle.writeFile(organizationsBytes);await handle.sync();}finally{await handle.close();}});
    signal?.throwIfAborted();
    const manifest={schema_version:"mississippi-business-report-release-manifest@1.0.0",dataset_id:"mississippi-business-report-local-review",release_id:runId,status:"published-local-review",package_id:packageId,selection_sha256:replay.selection_sha256,record_count:replay.records.length,warnings:replay.warnings,claims:{network_requests:0,acquisition_performed:false,source_authenticity_verified:false,reproducible_extraction_verified:false,statewide_complete:false,current_operation_verified:false,geocodes_claimed:false,physical_sites_claimed:false,public_export_authorized:false,national_admission_performed:false,current_pointer_changed:false},artifacts:[{path:"organizations.jsonl",bytes:organizationsBytes.length,sha256:sha256(organizationsBytes)}]};
    const manifestSha256=await atomicJson(path.join(releaseRoot,"manifest.json"),manifest);
    const receipt={schema_version:MS_BUSINESS_REPORT_APP_VERSION,run_id:runId,status:"SUCCEEDED",execution_mode:start.execution_mode,started_at:startedAt,finished_at:now().toISOString(),start_sha256:startSha256,source:{snapshot:relative(snapshotPackage),release:relative(releaseRoot),manifest:relative(path.join(releaseRoot,"manifest.json")),manifest_sha256:manifestSha256,organizations:relative(path.join(releaseRoot,"organizations.jsonl")),organizations_sha256:manifest.artifacts[0].sha256,record_count:replay.records.length},network_requests:0,acquisition_performed:false,account_action_performed:false,purchase_performed:false,source_pointer_changed:false,national_admission_performed:false,statewide_complete:false,current_operation_claim:false,geocode_claim:false,physical_site_claim:false,public_export_authorized:false,export_policy:"local-review-only"};
    await atomicJson(path.join(operation,"receipt.json"),receipt);return {operationDirectory:operation,receiptPath:path.join(operation,"receipt.json"),receipt};
  }catch(error){
    await rm(releaseRoot,{recursive:true,force:true}).catch(()=>{});await rm(snapshotRoot,{recursive:true,force:true}).catch(()=>{});
    const cancelled=signal?.aborted===true,receipt={schema_version:MS_BUSINESS_REPORT_APP_VERSION,run_id:runId,status:cancelled?"CANCELLED":"FAILED",execution_mode:start.execution_mode,started_at:startedAt,finished_at:now().toISOString(),start_sha256:startSha256,source:null,network_requests:0,acquisition_performed:false,account_action_performed:false,purchase_performed:false,source_pointer_changed:false,national_admission_performed:false,statewide_complete:false,current_operation_claim:false,geocode_claim:false,physical_site_claim:false,public_export_authorized:false,error_code:cancelled?"MS_BUSINESS_REPORT_APP_CANCELLED":"MS_BUSINESS_REPORT_APP",inspection_required:true};
    await atomicJson(path.join(operation,"receipt.json"),receipt).catch(()=>{});if(cancelled)signal.throwIfAborted();throw fail(error?.message??"Operation failed.");
  }
}

export async function verifyMississippiBusinessReportAppJob(receiptPath,{signal}={}){
  signal?.throwIfAborted();receiptPath=await canonical(receiptPath,{file:true});const operation=path.dirname(receiptPath),runId=path.basename(operation);
  check(path.basename(receiptPath)==="receipt.json"&&UUID.test(runId)&&path.resolve(path.dirname(operation)).toLowerCase()===path.resolve(OPERATIONS_ROOT).toLowerCase(),"Receipt path is invalid.");
  const startFile=await fixedRead(path.join(operation,"start.json"),100_000),receiptFile=await fixedRead(receiptPath,100_000),start=JSON.parse(startFile.bytes),receipt=JSON.parse(receiptFile.bytes);
  check(exact(start,["schema_version","run_id","status","started_at","execution_mode","package_id","package_path","selection_sha256","network_requests","acquisition_performed","account_action_performed","purchase_performed"]),"Start record shape is invalid.");
  check(start.schema_version===MS_BUSINESS_REPORT_APP_VERSION&&start.run_id===runId&&start.status==="RUNNING"&&start.execution_mode==="operator-supplied-local-package"&&start.package_path===`data/imports/mississippi-business-report/packages/${start.package_id}`&&SHA.test(start.selection_sha256)&&start.network_requests===0&&start.acquisition_performed===false&&start.account_action_performed===false&&start.purchase_performed===false,"Start record envelope is invalid.");
  const common=["schema_version","run_id","status","execution_mode","started_at","finished_at","start_sha256","source","network_requests","acquisition_performed","account_action_performed","purchase_performed","source_pointer_changed","national_admission_performed","statewide_complete","current_operation_claim","geocode_claim","physical_site_claim","public_export_authorized"];
  const success=[...common,"export_policy"],failure=[...common,"error_code","inspection_required"];
  check(exact(receipt,receipt.status==="SUCCEEDED"?success:failure),"Terminal receipt shape is invalid.");
  check(receipt.schema_version===MS_BUSINESS_REPORT_APP_VERSION&&receipt.run_id===runId&&receipt.execution_mode===start.execution_mode&&receipt.started_at===start.started_at&&receipt.start_sha256===startFile.sha256&&!Number.isNaN(Date.parse(receipt.finished_at))&&Date.parse(receipt.finished_at)>=Date.parse(start.started_at)&&receipt.network_requests===0&&receipt.acquisition_performed===false&&receipt.account_action_performed===false&&receipt.purchase_performed===false&&receipt.source_pointer_changed===false&&receipt.national_admission_performed===false&&receipt.statewide_complete===false&&receipt.current_operation_claim===false&&receipt.geocode_claim===false&&receipt.physical_site_claim===false&&receipt.public_export_authorized===false,"Receipt envelope is invalid.");
  if(receipt.status!=="SUCCEEDED"){check(["FAILED","CANCELLED"].includes(receipt.status)&&receipt.source===null&&receipt.inspection_required===true,"Terminal failure receipt is invalid.");return {receiptPath,receiptSha256:receiptFile.sha256,receipt};}
  check(receipt.export_policy==="local-review-only"&&exact(receipt.source,["snapshot","release","manifest","manifest_sha256","organizations","organizations_sha256","record_count"]),"Successful receipt is incomplete.");
  const snapshot=path.join(operation,"input-snapshot",start.package_id),release=path.join(operation,"release"),manifestPath=path.join(release,"manifest.json"),organizationsPath=path.join(release,"organizations.jsonl");
  check(path.resolve(APP_ROOT,receipt.source.snapshot)===snapshot&&path.resolve(APP_ROOT,receipt.source.release)===release&&path.resolve(APP_ROOT,receipt.source.manifest)===manifestPath&&path.resolve(APP_ROOT,receipt.source.organizations)===organizationsPath,"Operation artifacts escape ownership.");
  const replay=await inspectMississippiBusinessReportPackage(snapshot,{packagesRoot:path.dirname(snapshot),signal}),manifestFile=await fixedRead(manifestPath,100_000),organizationsFile=await fixedRead(organizationsPath),manifest=JSON.parse(manifestFile.bytes);
  const replayBytes=Buffer.from(replay.records.map(releaseRecord).join(""),"utf8");
  check(replay.selection_sha256===start.selection_sha256&&replay.records.length===receipt.source.record_count&&organizationsFile.bytes.equals(replayBytes)&&organizationsFile.sha256===receipt.source.organizations_sha256&&manifestFile.sha256===receipt.source.manifest_sha256,"Independent replay differs from retained release.");
  check(exact(manifest,["schema_version","dataset_id","release_id","status","package_id","selection_sha256","record_count","warnings","claims","artifacts"])&&manifest.schema_version==="mississippi-business-report-release-manifest@1.0.0"&&manifest.dataset_id==="mississippi-business-report-local-review"&&manifest.release_id===runId&&manifest.status==="published-local-review"&&manifest.package_id===start.package_id&&manifest.selection_sha256===start.selection_sha256&&manifest.record_count===replay.records.length&&isDeepStrictEqual(manifest.warnings,replay.warnings)&&manifest.artifacts.length===1&&manifest.artifacts[0].path==="organizations.jsonl"&&manifest.artifacts[0].bytes===organizationsFile.bytes_count&&manifest.artifacts[0].sha256===organizationsFile.sha256,"Release manifest is invalid.");
  check(exact(manifest.claims,["network_requests","acquisition_performed","source_authenticity_verified","reproducible_extraction_verified","statewide_complete","current_operation_verified","geocodes_claimed","physical_sites_claimed","public_export_authorized","national_admission_performed","current_pointer_changed"])&&manifest.claims.network_requests===0&&Object.entries(manifest.claims).filter(([key])=>key!=="network_requests").every(([,value])=>value===false),"Release claims exceed authority.");
  return {receiptPath,receiptSha256:receiptFile.sha256,receipt};
}
