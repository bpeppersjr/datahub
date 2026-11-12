import { createHash } from "node:crypto";
import { readdir, readFile, lstat, statfs } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { inspectOvertureAcquisitionJournal } from "./overture-acquisition-journal.mjs";

const UUID=/^[a-f0-9-]{36}$/;
const LEGACY_EVIDENCE = Object.freeze({ metadata: "c7fd0208-eb13-442a-8982-8a5d1ef2927e",
  runtime: "b4ae8318-e786-4ac8-bf7b-e673c6d00ae1", acquisition: "a8ff9f6d-b2be-4d56-905b-17984788b1d5" });
const sha=value=>createHash("sha256").update(value).digest("hex");
async function receipts(root){const base=path.join(root,"data/managed-operations");let names=[];try{names=await readdir(base,{withFileTypes:true});}catch(error){if(error.code==="ENOENT")return[];throw error;}if(names.length>512)throw Error("operation-inventory-limit");const out=[];for(const entry of names){if(!entry.isDirectory()||!UUID.test(entry.name))continue;try{const raw=await readFile(path.join(base,entry.name,"receipt.json"));if(raw.length>1024**2)continue;out.push({record:JSON.parse(raw),sha256:sha(raw)});}catch{/* unavailable entries are not readiness evidence */}}return out;}
function latest(rows,predicate){return rows.filter(({record})=>predicate(record)).sort((a,b)=>String(b.record.createdAt).localeCompare(String(a.record.createdAt)))[0]??null;}
async function replayPrerequisite(item,metadata,root,read){if(!item)return{operation_id:null,receipt_status:"absent",current_replay:false,reason_code:metadata?"metadata-prerequisite-absent":"runtime-prerequisite-absent"};const id=item.record.id,descriptor=item.record.result?.prerequisite,output=path.join(root,"data/managed-operations",id,"output");try{const verified=await read(descriptor,{output,operationId:id,startedAt:item.record.startedAt}),result=metadata?verified?.manifest?.result:null;return{operation_id:id,receipt_status:item.record.status,current_replay:true,reason_code:"verified-current-code",...(metadata?{release_id:result?.release_id??null,observed_at:result?.observed_at??null,asset_count:result?.asset_count??null,declared_global_rows:result?.declared_global_rows??null,stac_fingerprint:result?.stac_fingerprint??null}:{})};}catch{return{operation_id:id,receipt_status:item.record.status,current_replay:false,reason_code:metadata?"metadata-current-replay-rejected":"runtime-current-replay-rejected",...(metadata?{release_id:null,observed_at:null,asset_count:null,declared_global_rows:null,stac_fingerprint:null}:{})};}}
async function onlyRun(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory() && UUID.test(entry.name));
  return entries.length === 1 ? path.join(directory, entries[0].name) : null;
}

async function failedState(item, root, inspect) {
  const state = { operation_id: item?.record.id ?? null, status: item?.record.status ?? "absent", snapshot_ready: false,
    inspection_required: item?.record.result?.inspectionRequired === true, checkpoint_format: false,
    journal: { present: false, pending_request_index: null, requests_reserved: 0, completed_requests: 0, delivered_bytes: 0 },
    selected_output: { present: false, bytes: null, sha256: null, integrity_verified: false },
    reason_code: item ? "failed-acquisition-not-resumable" : "failed-acquisition-absent" };
  if (!item) return state;
  try {
    const run = await onlyRun(path.join(root, "data/managed-operations", state.operation_id, "output/jobs"));
    if (!run) return state;
    const planFile = path.join(run, "plan.json");
    const info = await lstat(planFile).catch(() => null);
    if (info?.isFile() && info.nlink === 1 && info.size <= 1024 ** 2) {
      const plan = JSON.parse(await readFile(planFile, "utf8"));
      if (plan.schema_version === "overture-acquisition-session@2.0.0" && plan.operation_id === state.operation_id && plan.run_id === path.basename(run)) {
        state.checkpoint_format = true;
        state.reason_code = state.status === "UNKNOWN" ? "operation-ownership-unresolved" : "checkpoint-verification-required";
        return state;
      }
    }
    const journalRoot = await onlyRun(path.join(run, "journal"));
    if (journalRoot) {
      const replay = await inspect(journalRoot, { operationId: state.operation_id });
      state.journal = { present: true, pending_request_index: replay.pending_request_index ?? null,
        requests_reserved: replay.counters.requests_reserved, completed_requests: replay.counters.requests_completed, delivered_bytes: replay.counters.bytes_delivered };
    }
    const engine = await onlyRun(path.join(run, "engine"));
    const selected = engine && await onlyRun(path.join(engine, "selected"));
    if (selected) {
      const file = await lstat(path.join(selected, "selected-us-places.jsonl.gz"));
      if (file.isFile() && file.nlink === 1) {
        state.selected_output = { present: true, bytes: file.size, sha256: file.size === 0 ? sha(Buffer.alloc(0)) : null, integrity_verified: false };
      }
    }
  } catch { /* Incomplete failed evidence cannot establish acquisition readiness. */ }
  return state;
}

export async function inspectOvertureReadiness({root=APP_ROOT,now=()=>new Date(),metadataReader=null,runtimeReader=null,journalInspector=inspectOvertureAcquisitionJournal,historical=false}={}){
 metadataReader??=(await import("./overture-source-preflight.mjs")).readOvertureSourcePreflight;
 runtimeReader??=(await import("./overture-httpfs-runtime.mjs")).readOvertureHttpfsRuntime;
 const rows=await receipts(root);
 const metadataItem=latest(rows,({id,details,result})=>(!historical||id===LEGACY_EVIDENCE.metadata)&&details?.sourceId==="overture-source-preflight"&&result?.sourceId==="overture-source-preflight");
 const runtimeItem=latest(rows,({id,details,result})=>(!historical||id===LEGACY_EVIDENCE.runtime)&&details?.sourceId==="overture-httpfs-runtime"&&result?.sourceId==="overture-httpfs-runtime");
 const failedItem=latest(rows,({id,kind,details,status})=>(!historical||id===LEGACY_EVIDENCE.acquisition)&&kind==="source-acquisition"&&details?.sourceId==="overture-us-places"&&["FAILED","CANCELLED","UNKNOWN"].includes(status));
 const normalizedJournalInspector=async(directory,options)=>{try{const replay=await journalInspector(directory,options);return{...replay,pending_request_index:replay.pending_request??null};}catch{const raw=await readFile(path.join(directory,"events.jsonl"),"utf8");if(raw.length>2*1024**2)throw Error("journal-limit");const events=raw.trim().split(/\r?\n/).map(JSON.parse),header=events.shift();if(header?.operation_id!==options.operationId)throw Error("journal-identity");let pending=null,requests_reserved=0,requests_completed=0,bytes_delivered=0;for(const event of events){if(event.type==="request-reserved"){if(pending!==null)throw Error("journal-sequence");pending=event.request_index;requests_reserved++;}else if(event.type==="request-completed"){if(pending!==event.request_index)throw Error("journal-sequence");pending=null;requests_completed++;bytes_delivered+=event.delivered_bytes; }else throw Error("journal-event");}return{pending_request_index:pending,counters:{requests_reserved,requests_completed,bytes_delivered}};}};
 const metadata=await replayPrerequisite(metadataItem,true,root,metadataReader),runtime=await replayPrerequisite(runtimeItem,false,root,runtimeReader),failed_acquisition=await failedState(failedItem,root,normalizedJournalInspector);
 const {release_id,observed_at}=metadata;
 const age_days=observed_at?Math.max(0,Math.floor((now().getTime()-Date.parse(observed_at))/86400000)):null;
 let free_disk_gib=null;try{const s=await statfs(path.join(root,"data"));free_disk_gib=Math.round(Number(s.bavail)*Number(s.bsize)/1024**3*100)/100;}catch{}
 const prerequisites_ready=metadata.current_replay&&runtime.current_replay;
 const retained_evidence_valid=metadata.current_replay&&runtime.current_replay&&failed_acquisition.operation_id===LEGACY_EVIDENCE.acquisition&&failed_acquisition.status==="FAILED"&&failed_acquisition.selected_output.present&&failed_acquisition.selected_output.bytes===0&&failed_acquisition.journal.present;
 return{schema_version:"overture-readiness@1.0.0",available:true,checked_at:now().toISOString(),read_only:true,operations_allocated:0,network_requests:0,retry_authorized:false,resume_supported:false,asset_checkpoint_recovery_available:true,snapshot_ready:false,prerequisites_ready,acquisition_ready:false,retained_evidence_valid,
  metadata:{...metadata,release_id,observed_at,age_days},runtime,failed_acquisition,
  capacity:{free_disk_gib,minimum_free_disk_gib:10,engine_memory_setting_gib:2,spill_setting_gib:4,maximum_reserved_network_gib:32,maximum_range_mib:64,maximum_requests:100000,maximum_selected_compressed_gib:4,maximum_selected_uncompressed_gib:16,maximum_selected_rows:20000000,parallel_requests:1,minimum_pacing_ms:250,session_deadline_hours:4},
  blockers:[...(!metadata.current_replay?[metadata.reason_code]:[]),...(!runtime.current_replay?[runtime.reason_code]:[]),
    ...(!retained_evidence_valid&&failed_acquisition.operation_id===LEGACY_EVIDENCE.acquisition?["retained-failed-evidence-not-verified"]:[]),"fresh-explicit-large-acquisition-authorization-required",
    failed_acquisition.reason_code==="failed-acquisition-not-resumable"?"failed-acquisition-is-not-a-resumable-checkpoint":failed_acquisition.reason_code],
  next_steps:["Verify the retained metadata and runtime prerequisites.","Obtain fresh explicit authorization for one bounded acquisition attempt.","Use the managed acquisitions endpoint. To resume a stopped checkpoint-format attempt, provide its operation ID and original prerequisite IDs.","Inspect the terminal receipt before normalization."]};
}
