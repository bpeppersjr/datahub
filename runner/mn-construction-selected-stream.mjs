import { createHash } from 'node:crypto';
import { Readable, Transform, Writable, addAbortSignal } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import { MN_CONSTRUCTION_COLUMNS } from './mn-construction-preflight.mjs';
import { normalizeMnConstructionRecord } from './mn-construction-normalization.mjs';

const VERSION = 'mn-construction-selected-stream@1.0.0';
const LIMIT = 50_000_000, ROW_LIMIT = 250_000;
const SELECTED = ['Bus_Pers','Lic_Number','Status','Name','DBA_Name','Addr1','Addr2','City','St','Zip','Orig_Date','Exp_Date'];
const REASONS = ['not-literal-business-marker','not-issued-credential','unsupported-business-credential','credential-cohort-mismatch','invalid-selected-text','missing-required-text'];
const counts = () => ({ source_records:0, accepted_records:0, rejected_records:0, rejected_by_reason:Object.fromEntries(REASONS.map(k=>[k,0])) });
const hash = () => createHash('sha256');
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k=>Object.hasOwn(v,k));
const check = (v, why) => { if (!v) throw new Error(`Minnesota selected stream rejected: ${why}.`); };
const emptyRow = () => Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,'']));
function validateContext(context) {
  check(exact(context,['runId','sourceReleaseId','observedAt','cohort']),'context fields');
  // Validate metadata through the same normalizer before consuming any input.
  normalizeMnConstructionRecord({...emptyRow(),Bus_Pers:'Business',Status:'Issued',Name:'Context validation',Lic_Number:context.cohort==='registrations'?'IR000001':'BC000001'},
    {...context,sourceFileSha256:'0'.repeat(64),rowNumber:1});
}
function settings(context, emit, signal) {
  validateContext(context); check(typeof emit === 'function' && (signal === undefined || signal instanceof AbortSignal),'sink or cancellation'); signal?.throwIfAborted();
}
const encode = frame => `${JSON.stringify(frame)}\n`;
const claims = () => ({ native_acquisition_verified:false, source_authenticity_verified:false, discarded_rejection_values_replayed:false, public_export_authorized:false, national_reporting_integrated:false });

/** Streaming CSV -> privacy-selected frames. The trusted awaited sink owns
 * durable storage and cancellation of its writes. No network or files here.
 */
export async function processMnConstructionSelectedStream(source, { context, emit, signal } = {}) {
  settings(context,emit,signal); check(source instanceof Readable,'Node readable required');
  // Snapshot primitive validated metadata before the first asynchronous step.
  context={...context}; let sourceBytes=0, headerSeen=false;
  const totals=counts(), sourceHash=hash(), frameHash=hash(), decoder=new TextDecoder('utf-8',{fatal:true});
  const meter=new Transform({ transform(chunk,_encoding,callback) {
    try { check(Buffer.isBuffer(chunk),'byte chunks required'); sourceBytes+=chunk.length;check(sourceBytes<=LIMIT,'source byte ceiling');sourceHash.update(chunk);callback(null,decoder.decode(chunk,{stream:true})); }
    catch { callback(new Error('Invalid bounded UTF-8 source stream.')); }
  }, flush(callback) { try {callback(null,decoder.decode());}catch {callback(new Error('Invalid bounded UTF-8 source stream.'));} } });
  const parser=parse({bom:true,columns:columns=>{check(JSON.stringify(columns)===JSON.stringify(MN_CONSTRUCTION_COLUMNS),'column drift');headerSeen=true;return columns;},
    skip_empty_lines:false,relax_column_count:false,max_record_size:65536});
  const sink=new Writable({objectMode:true,write(row,_encoding,callback) {
    void (async()=>{
      signal?.throwIfAborted();totals.source_records++;check(totals.source_records<=ROW_LIMIT,'source row ceiling');
      const sequence=totals.source_records;let frame;
      try {
        // Provisional normalization validates selection only. Its placeholder
        // file hash is never emitted; final replay uses the measured checksum.
        normalizeMnConstructionRecord(row,{...context,sourceFileSha256:'0'.repeat(64),rowNumber:sequence});
        frame={sequence,disposition:'accepted',selected_fields:Object.fromEntries(SELECTED.map(k=>[k,row[k]]))};totals.accepted_records++;
      } catch(error) {
        if(error.code!=='MN_CONSTRUCTION_RECORD_REJECTED'||!REASONS.includes(error.reason))throw error;
        frame={sequence,disposition:'rejected',reason:error.reason};totals.rejected_records++;totals.rejected_by_reason[error.reason]++;
      }
      // Hash before caller code, and pass a separate value so mutation cannot
      // change the internal digest. A durable release must replay saved frames.
      frameHash.update(encode(frame));await emit(structuredClone(frame),{signal});signal?.throwIfAborted();
    })().then(()=>callback(),()=>callback(new Error('Selected frame processing failed.')));
  }});
  try { await pipeline(source,meter,parser,sink,{signal});check(headerSeen && sourceBytes>0,'missing header');signal?.throwIfAborted(); }
  catch { signal?.throwIfAborted();throw new Error('Minnesota selected stream failed; no completed receipt.'); }
  return {schema_version:VERSION,context,source_bytes:sourceBytes,source_file_sha256:sourceHash.digest('hex'),canonical_frames_sha256:frameHash.digest('hex'),counts:totals,
    claims:claims(),mode:'caller-supplied-csv-stream',scope:'Selected accepted fields replayable; discarded source values and provider completeness are not independently replayed.'};
}

/** Replay only a completed receipt and its canonical frames, without CSV or
 * provider requests. Rejects are ledger assertions, not recovered private rows.
 * Output sinks must stage records until this function successfully returns.
 */
export async function replayMnConstructionSelectedStream(frames, receipt, options = {}) {
  try { return await replayFrames(frames, receipt, options); }
  catch { options.signal?.throwIfAborted(); throw new Error('Minnesota selected replay failed; no verified completion.'); }
}
async function replayFrames(frames, receipt, { emit, signal } = {}) {
  check(exact(receipt,['schema_version','context','source_bytes','source_file_sha256','canonical_frames_sha256','counts','claims','mode','scope']),'receipt fields');
  settings(receipt.context,emit,signal);
  check(receipt.schema_version===VERSION && receipt.mode==='caller-supplied-csv-stream'
    && receipt.scope==='Selected accepted fields replayable; discarded source values and provider completeness are not independently replayed.'
    && JSON.stringify(receipt.claims)===JSON.stringify(claims()),'receipt claims');
  check(Number.isSafeInteger(receipt.source_bytes)&&receipt.source_bytes>0&&receipt.source_bytes<=LIMIT
    && ['source_file_sha256','canonical_frames_sha256'].every(k=>typeof receipt[k]==='string'&&/^[a-f0-9]{64}$/.test(receipt[k])),'source digest or byte ceiling');
  check(exact(receipt.counts,['source_records','accepted_records','rejected_records','rejected_by_reason'])
    && exact(receipt.counts.rejected_by_reason,REASONS)
    && ['source_records','accepted_records','rejected_records'].every(k=>Number.isSafeInteger(receipt.counts[k])&&receipt.counts[k]>=0&&receipt.counts[k]<=ROW_LIMIT)
    && REASONS.every(k=>Number.isSafeInteger(receipt.counts.rejected_by_reason[k])&&receipt.counts.rejected_by_reason[k]>=0&&receipt.counts.rejected_by_reason[k]<=ROW_LIMIT),'receipt counts');
  check(Array.isArray(frames)||frames instanceof Readable,'parsed frame array or Node readable required');
  if(frames instanceof Readable&&signal)addAbortSignal(signal,frames);
  receipt=structuredClone(receipt);const totals=counts(),digest=hash();
  for await (const entry of frames) {
    signal?.throwIfAborted();check(totals.source_records<ROW_LIMIT,'frame ceiling');
    const accepted=entry?.disposition==='accepted';
    check(exact(entry,accepted?['sequence','disposition','selected_fields']:['sequence','disposition','reason'])&&entry.sequence===totals.source_records+1,'frame sequence or fields');
    let record,frame;
    if(accepted){
      check(exact(entry.selected_fields,SELECTED)&&SELECTED.every(k=>typeof entry.selected_fields[k]==='string'),'selected fields');
      // Rebuild the exact known schema without restoring excluded field values.
      const selected=Object.fromEntries(SELECTED.map(k=>[k,entry.selected_fields[k]]));
      record=normalizeMnConstructionRecord({...emptyRow(),...selected},{...receipt.context,sourceFileSha256:receipt.source_file_sha256,rowNumber:entry.sequence});
      frame={sequence:entry.sequence,disposition:'accepted',selected_fields:selected};totals.accepted_records++;
    }else{
      check(entry.disposition==='rejected'&&REASONS.includes(entry.reason),'rejection reason');
      frame={sequence:entry.sequence,disposition:'rejected',reason:entry.reason};totals.rejected_records++;totals.rejected_by_reason[entry.reason]++;
    }
    totals.source_records++;digest.update(encode(frame));if(record)await emit(record,{signal});signal?.throwIfAborted();
  }
  check(JSON.stringify(totals)===JSON.stringify(receipt.counts)&&digest.digest('hex')===receipt.canonical_frames_sha256,'frame digest or conservation');
  return {counts:totals,accepted_records_replayed:true,discarded_rejection_values_replayed:false,source_authenticity_verified:false};
}
