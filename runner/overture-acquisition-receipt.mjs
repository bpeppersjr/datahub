import path from 'node:path';
import { createHash } from 'node:crypto';
import { open, lstat, readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';
import { readOvertureSourcePreflight, readOvertureSourcePreflightForTest } from './overture-source-preflight.mjs';
import { readOvertureHttpfsRuntime } from './overture-httpfs-runtime.mjs';
import { inspectOvertureAcquisitionJournal } from './overture-acquisition-journal.mjs';
import { OVERTURE_SELECTED_FIELDS, overtureStreamingQueryFingerprint } from './overture-us-places.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const STATUS = 'selected-source-retained-not-published';
const descriptorKeys = ['run_id','operation_id','manifest','sha256','status','cancellation_after_publication'];
const claimKeys = ['native_acquisition_verified','normalized_businesses_published','complete_us_business_coverage','restart_resume_supported','process_memory_cap_enforced','hard_deadline_enforced','public_export_authorized'];
const settings = { threads:'1',memory_limit:'2GiB',max_temp_directory_size:'4GiB',home_directory:'owned-run-directory',extension_directory:'owned-run-directory',temp_directory:'owned-run-directory',autoinstall_known_extensions:'false',autoload_known_extensions:'false',allow_unsigned_extensions:'false',allow_community_extensions:'false',enable_external_access:'true',http_retries:'0',auto_fallback_to_full_download:'false',force_download:'false',force_download_threshold:'0',http_timeout:'30',enable_server_cert_verification:'true',enable_curl_server_cert_verification:'true' };
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k)) && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d,'value'));
const fail = () => { throw new Error('Overture acquisition receipt rejected; preserve retained evidence for inspection.'); };
const integer = (v,max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const iso = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const same = (a,b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && !b.isSymbolicLink();
const equivalent = (a,b) => exact(a,Object.keys(b)) && Object.keys(b).every(k => a[k] === b[k]);

async function selectedFile(filename, selected) {
  await canonical(path.dirname(filename));
  const initial = await lstat(filename,{bigint:true});
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1n || initial.size !== BigInt(selected.bytes)) fail();
  const handle = await open(filename,'r'), digest = createHash('sha256');
  let compressed = 0, raw = 0, count = 0, pending = Buffer.alloc(0);
  try {
    if (!same(initial,await handle.stat({bigint:true}))) fail();
    async function* chunks() {
      for (;;) {
        const buffer = Buffer.alloc(65536), {bytesRead} = await handle.read(buffer,0,buffer.length,null);
        if (!bytesRead) break;
        compressed += bytesRead; if (compressed > selected.bytes) fail();
        const chunk = buffer.subarray(0,bytesRead); digest.update(chunk); yield chunk;
      }
    }
    await pipeline(Readable.from(chunks()),createGunzip(),async source => {
      for await (const chunk of source) {
        raw += chunk.length; if (raw > 16 * 1024 ** 3) fail();
        pending = Buffer.concat([pending,chunk]);
        let end;
        while ((end = pending.indexOf(10)) !== -1) {
          if (end < 1 || end > 16 * 1024 ** 2 || ++count > 20_000_000) fail();
          const row = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(pending.subarray(0,end)));
          if (!exact(row,OVERTURE_SELECTED_FIELDS) || typeof row.address_country !== 'string' || row.address_country.toUpperCase() !== 'US' || row.operating_status === 'permanently_closed') fail();
          pending = pending.subarray(end+1);
        }
        if (pending.length > 16 * 1024 ** 2) fail();
      }
    });
    if (pending.length || compressed !== selected.bytes || raw !== selected.uncompressed_bytes || count !== selected.record_count || digest.digest('hex') !== selected.sha256) fail();
    for (const current of [await handle.stat({bigint:true}),await lstat(filename,{bigint:true})]) if (!same(initial,current) || current.nlink !== 1n || !current.isFile()) fail();
    return initial;
  } finally { await handle.close(); }
}

async function inspect(descriptor,options,synthetic) {
  const keys = ['output','operationId']; if (options && Object.hasOwn(options,'startedAt')) keys.push('startedAt');
  if (!exact(options,keys) || typeof options.output !== 'string' || options.output !== path.resolve(options.output) || typeof options.operationId !== 'string' || !UUID.test(options.operationId)
    || path.basename(options.output) !== 'output' || path.basename(path.dirname(options.output)) !== options.operationId || (options.startedAt !== undefined && !iso(options.startedAt))) fail();
  if (!exact(descriptor,descriptorKeys) || typeof descriptor.run_id !== 'string' || !UUID.test(descriptor.run_id) || descriptor.operation_id !== options.operationId || typeof descriptor.sha256 !== 'string' || !SHA.test(descriptor.sha256) || descriptor.status !== STATUS || typeof descriptor.cancellation_after_publication !== 'boolean') fail();
  descriptor = {...descriptor}; options = {...options};
  const directory = path.join(options.output,'jobs',descriptor.run_id);
  if (descriptor.manifest !== path.join(directory,'manifest.json')) fail();
  await canonical(directory);
  const meter = {}, manifest = await readJson(descriptor.manifest,1024 ** 2,undefined,meter);
  if (meter.sha256 !== descriptor.sha256 || !exact(manifest,['schema_version','run_id','operation_id','status','execution_mode','started_at','completed_at','metadata_reference','runtime_reference','engine','selected','journal','transport','heads','claims','plan_sha256']) || manifest.schema_version !== 'overture-acquisition-session@1.0.0' || manifest.run_id !== descriptor.run_id || manifest.operation_id !== options.operationId || manifest.status !== STATUS || manifest.execution_mode !== (synthetic ? 'injected-test-transport' : 'native-fetch') || !exact(manifest.claims,claimKeys) || Object.values(manifest.claims).some(v => v !== false)) fail();
  if (!iso(manifest.started_at) || !iso(manifest.completed_at) || manifest.completed_at < manifest.started_at || (options.startedAt && manifest.started_at < options.startedAt) || Date.parse(manifest.completed_at) > Date.now()+5000) fail();
  for (const ref of [manifest.metadata_reference,manifest.runtime_reference]) if (!exact(ref,['output','operation_id','descriptor']) || !exact(ref.descriptor,descriptorKeys) || ref.descriptor.cancellation_after_publication !== false) fail();
  if (new Set([options.operationId,manifest.metadata_reference.operation_id,manifest.runtime_reference.operation_id]).size !== 3) fail();
  async function prerequisites() {
    const m = manifest.metadata_reference, r = manifest.runtime_reference;
    const metadata = await (synthetic ? readOvertureSourcePreflightForTest : readOvertureSourcePreflight)(m.descriptor,{output:m.output,operationId:m.operation_id});
    const runtime = await readOvertureHttpfsRuntime(r.descriptor,{output:r.output,operationId:r.operation_id});
    if (metadata.manifest.completed_at > manifest.started_at || runtime.manifest.completed_at > manifest.started_at) fail();
    return metadata.manifest.result;
  }
  const metadata = await prerequisites(), engine = manifest.engine, selected = manifest.selected, journal = manifest.journal;
  if (!selected || selected.record_count > metadata.declared_global_rows) fail();
  if (!exact(engine,['directory','query_fingerprint','engine_settings']) || typeof engine.directory !== 'string' || !engine.directory.startsWith('engine/') || !UUID.test(engine.directory.slice(7)) || engine.query_fingerprint !== overtureStreamingQueryFingerprint(metadata.asset_count) || !equivalent(engine.engine_settings,settings)) fail();
  const planMeter = {}, plan = await readJson(path.join(directory,'plan.json'),1024**2,undefined,planMeter);
  if (planMeter.sha256 !== manifest.plan_sha256 || !exact(plan,['schema_version','run_id','operation_id','execution_mode','started_at','metadata_reference','runtime_reference','asset_urls','query_fingerprint'])) fail();
  for (const key of ['schema_version','run_id','operation_id','execution_mode','started_at','metadata_reference','runtime_reference']) if (JSON.stringify(plan[key]) !== JSON.stringify(manifest[key])) fail();
  if (plan.query_fingerprint !== engine.query_fingerprint || JSON.stringify(plan.asset_urls) !== JSON.stringify(metadata.assets.map(a => a.url))) fail();
  const prefix = engine.directory+'/selected/';
  if (!exact(selected,['path','bytes','sha256','record_count','uncompressed_bytes']) || typeof selected.path !== 'string' || !selected.path.startsWith(prefix) || !UUID.test(selected.path.slice(prefix.length).split('/')[0]) || selected.path !== prefix+selected.path.slice(prefix.length).split('/')[0]+'/selected-us-places.jsonl.gz' || !integer(selected.bytes,4*1024**3) || !SHA.test(selected.sha256) || !integer(selected.record_count,20_000_000) || !integer(selected.uncompressed_bytes,16*1024**3)) fail();
  if (!exact(journal,['directory','sha256','counters']) || typeof journal.directory !== 'string' || !journal.directory.startsWith('journal/') || !UUID.test(journal.directory.slice(8)) || !SHA.test(journal.sha256)) fail();
  const owners = new Map();
  async function inventory() {
    const entries = [['',['engine','journal','plan.json','manifest.json']],['engine',[engine.directory.slice(7)]],[engine.directory,['home','extensions','spill','selected']],[engine.directory+'/home',[]],[engine.directory+'/extensions',[]],[engine.directory+'/spill',[]],[engine.directory+'/selected',[selected.path.slice(prefix.length).split('/')[0]]],[path.posix.dirname(selected.path),['selected-us-places.jsonl.gz']],['journal',[journal.directory.slice(8)]],[journal.directory,['events.jsonl']]];
    for (const [relative,names] of entries) {
      const target = path.join(directory,relative); await canonical(target); const stat = await lstat(target,{bigint:true});
      if (!stat.isDirectory() || (owners.has(target) && !same(owners.get(target),stat)) || JSON.stringify((await readdir(target)).sort()) !== JSON.stringify(names.sort())) fail();
      owners.set(target,stat);
    }
  }
  await inventory();
  const selectedIdentity = await selectedFile(path.join(directory,selected.path),selected);
  const replay = await inspectOvertureAcquisitionJournal(path.join(directory,journal.directory),{operationId:options.operationId});
  if (replay.pending_request !== null || replay.execution_mode !== manifest.execution_mode || replay.sha256 !== journal.sha256 || !equivalent(journal.counters,replay.counters) || replay.counters.requests_reserved !== replay.counters.requests_completed) fail();
  const expectedTransport = {requests_reserved:replay.counters.requests_reserved,fetch_calls:replay.counters.requests_reserved,bytes_reserved:replay.counters.bytes_reserved,bytes_observed:replay.counters.bytes_observed,bytes_delivered:replay.counters.bytes_delivered};
  if (!equivalent(manifest.transport,expectedTransport) || !Array.isArray(manifest.heads) || manifest.heads.length !== metadata.asset_count) fail();
  for (const [index,head] of manifest.heads.entries()) if (!exact(head,['asset_index','content_length','etag']) || head.asset_index !== index || !integer(head.content_length,32*1024**3) || head.content_length < 1 || typeof head.etag !== 'string' || !/^"[\x21\x23-\x7e]{1,254}"$/.test(head.etag)) fail();
  const methods = Array.from({length:metadata.asset_count},()=>new Set()), journalMeter = {}; let header = true;
  for await (const event of readLines(path.join(directory,journal.directory,'events.jsonl'),128*1024**2,undefined,journalMeter)) {
    if (header) { if (event.asset_count !== metadata.asset_count) fail(); header = false; }
    else if (event.type === 'request-completed') methods[event.asset_index].add(event.method);
  }
  if (header || journalMeter.sha256 !== journal.sha256 || methods.some(s => !s.has('HEAD') || !s.has('GET'))) fail();
  await prerequisites(); await inventory();
  const endPlan = {}; await readJson(path.join(directory,'plan.json'),1024**2,undefined,endPlan);
  if (endPlan.sha256 !== manifest.plan_sha256 || !same(planMeter.identity,endPlan.identity)) fail();
  const end = {}; await readJson(descriptor.manifest,1024**2,undefined,end);
  const finalSelected = await lstat(path.join(directory,selected.path),{bigint:true});
  const finalJournal = await lstat(path.join(directory,journal.directory,'events.jsonl'),{bigint:true});
  if (end.sha256 !== descriptor.sha256 || !same(meter.identity,end.identity) || !same(selectedIdentity,finalSelected) || finalSelected.nlink !== 1n || !same(journalMeter.identity,finalJournal) || finalJournal.nlink !== 1n) fail();
  return {manifest,sha256:descriptor.sha256,verification:{artifact_integrity_verified:true,selected_field_contract_verified:true,native_source_replayed:false}};
}

export async function readOvertureAcquisitionSession(descriptor,options) { try { return await inspect(descriptor,options,false); } catch { fail(); } }
export async function readOvertureAcquisitionSessionForTest(descriptor,options) { try { return await inspect(descriptor,options,true); } catch { fail(); } }
