import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, link } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';
import { OVERTURE_HTTPFS_RUNTIME as C } from './overture-httpfs-runtime.mjs';
import { probeOvertureSourcePreflightForTest } from './overture-source-preflight.mjs';
import { createOvertureAcquisitionJournal, inspectOvertureAcquisitionJournal } from './overture-acquisition-journal.mjs';
import { OVERTURE_SELECTED_FIELDS, overtureStreamingQueryFingerprint } from './overture-us-places.mjs';
import { readOvertureAcquisitionSession as nativeRead, readOvertureAcquisitionSessionForTest as read } from './overture-acquisition-receipt.mjs';

const hash = v => createHash('sha256').update(v).digest('hex');
async function fixture(t) {
  const root = path.join(APP_ROOT,'data/tmp/overture-session-reader',randomUUID()); await mkdir(root,{recursive:true});
  t.after(async () => { assert.equal(path.dirname(root),path.join(APP_ROOT,'data/tmp/overture-session-reader')); await rm(root,{recursive:true,force:true}); });
  const metadataOp = randomUUID(), metadataOutput = path.join(root,metadataOp,'output'), release = '2026-08-19.0', stac = 'https://stac.overturemaps.org';
  const asset = `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/part-00000-abcdef-c000.zstd.parquet`;
  const docs = [{type:'Catalog',stac_version:'1.1.0',links:[{rel:'child',latest:true,href:`${stac}/${release}/catalog.json`}]},{type:'Collection',id:'place',stac_version:'1.1.0',links:[{rel:'item',href:`${stac}/${release}/places/place/00000/00000.json`}]},{type:'Feature',id:'00000',properties:{num_rows:10,num_row_groups:1},assets:{aws:{href:asset}}}];
  const metadataDescriptor = await probeOvertureSourcePreflightForTest({output:metadataOutput,operationId:metadataOp,limits:{minIntervalMs:0},fetchImpl:async () => Response.json(docs.shift())});
  const runtimeOp = randomUUID(), runtimeRun = randomUUID(), runtimeOutput = path.join(root,runtimeOp,'output'), runtimeDirectory = path.join(runtimeOutput,'jobs',runtimeRun);
  for (const child of ['home','extensions','spill']) await mkdir(path.join(runtimeDirectory,child),{recursive:true});
  // Deliberately fabricated structural fixture: never loaded or represented as signature evidence.
  const binary = Buffer.from('FABRICATED NONEXECUTABLE TEST RUNTIME'), artifacts = [];
  for (const [name,raw] of [['httpfs.duckdb_extension.gz',gzipSync(binary)],['httpfs.duckdb_extension',binary]]) { await writeFile(path.join(runtimeDirectory,name),raw); artifacts.push({path:name,bytes:raw.length,sha256:hash(raw)}); }
  const now = new Date().toISOString(), runtime = {schema_version:C.version,run_id:runtimeRun,operation_id:runtimeOp,execution_mode:'native-core-signature-checked-local-load',status:C.status,started_at:now,completed_at:now,source_url:C.url,package_version:C.package_version,engine_version:C.engine_version,platform:C.platform,artifacts,claims:{acquisitionReady:false,place_acquisition_performed:false,public_export_authorized:false,hard_process_deadline_enforced:false,engine_memory_is_process_ram_cap:false}};
  const runtimeRaw = JSON.stringify(runtime); await writeFile(path.join(runtimeDirectory,'manifest.json'),runtimeRaw);
  const runtimeDescriptor = {run_id:runtimeRun,operation_id:runtimeOp,manifest:path.join(runtimeDirectory,'manifest.json'),sha256:hash(runtimeRaw),status:C.status,cancellation_after_publication:false};
  const operationId = randomUUID(), run = randomUUID(), output = path.join(root,operationId,'output'), directory = path.join(output,'jobs',run), engineId = randomUUID(), selectedId = randomUUID();
  for (const child of ['home','extensions','spill','selected/'+selectedId]) await mkdir(path.join(directory,'engine',engineId,child),{recursive:true});
  const journal = await createOvertureAcquisitionJournal({output:path.join(directory,'journal'),operationId,executionMode:'injected-test-transport',assetCount:1});
  for (const [index,method] of ['HEAD','GET'].entries()) for (const type of ['request-reserved','request-completed']) await journal.onEvent({type,execution_mode:'injected-test-transport',request_index:index+1,asset_index:0,method,reserved_bytes:index,observed_bytes:type==='request-completed'?index:0,delivered_bytes:type==='request-completed'?index:0});
  await journal.close(); const journalRead = await inspectOvertureAcquisitionJournal(journal.directory,{operationId});
  const engineSettings = {threads:'1',memory_limit:'2GiB',max_temp_directory_size:'4GiB',home_directory:'owned-run-directory',extension_directory:'owned-run-directory',temp_directory:'owned-run-directory',autoinstall_known_extensions:'false',autoload_known_extensions:'false',allow_unsigned_extensions:'false',allow_community_extensions:'false',enable_external_access:'true',http_retries:'0',auto_fallback_to_full_download:'false',force_download:'false',force_download_threshold:'0',http_timeout:'30',enable_server_cert_verification:'true',enable_curl_server_cert_verification:'true'};
  const manifest = {schema_version:'overture-acquisition-session@1.0.0',run_id:run,operation_id:operationId,status:'selected-source-retained-not-published',execution_mode:'injected-test-transport',started_at:new Date().toISOString(),completed_at:new Date().toISOString(),metadata_reference:{output:metadataOutput,operation_id:metadataOp,descriptor:metadataDescriptor},runtime_reference:{output:runtimeOutput,operation_id:runtimeOp,descriptor:runtimeDescriptor},engine:{directory:'engine/'+engineId,query_fingerprint:overtureStreamingQueryFingerprint(1),engine_settings:engineSettings},selected:{path:`engine/${engineId}/selected/${selectedId}/selected-us-places.jsonl.gz`,bytes:0,sha256:'',record_count:1,uncompressed_bytes:0},journal:{directory:'journal/'+path.basename(journal.directory),sha256:journalRead.sha256,counters:journalRead.counters},transport:{requests_reserved:2,fetch_calls:2,bytes_reserved:1,bytes_observed:1,bytes_delivered:1},heads:[{asset_index:0,content_length:100,etag:'"fixture"'}],claims:{native_acquisition_verified:false,normalized_businesses_published:false,complete_us_business_coverage:false,restart_resume_supported:false,process_memory_cap_enforced:false,hard_deadline_enforced:false,public_export_authorized:false},plan_sha256:''};
  const plan = Object.fromEntries(['schema_version','run_id','operation_id','execution_mode','started_at','metadata_reference','runtime_reference'].map(k => [k,manifest[k]])); plan.asset_urls=[asset]; plan.query_fingerprint=manifest.engine.query_fingerprint;
  const planRaw = JSON.stringify(plan); await writeFile(path.join(directory,'plan.json'),planRaw); manifest.plan_sha256=hash(planRaw);
  const row = Object.fromEntries(OVERTURE_SELECTED_FIELDS.map(k => [k,null])); row.address_country='US';
  const descriptor = {run_id:run,operation_id:operationId,manifest:path.join(directory,'manifest.json'),sha256:'',status:manifest.status,cancellation_after_publication:false};
  async function rewrite() { const raw=JSON.stringify(manifest); await writeFile(descriptor.manifest,raw); descriptor.sha256=hash(raw); }
  async function rows(raw) { const gzip=gzipSync(raw); await writeFile(path.join(directory,manifest.selected.path),gzip); Object.assign(manifest.selected,{bytes:gzip.length,sha256:hash(gzip),uncompressed_bytes:Buffer.byteLength(raw)}); await rewrite(); }
  await rows(JSON.stringify(row)+'\n');
  return {root,directory,descriptor,manifest,row,rows,rewrite,options:{output,operationId}};
}

test('independent offline receipt replay accepts synthetic structural fixture without native claims',async t => {
  const f = await fixture(t), result = await read(f.descriptor,f.options);
  assert.deepEqual(result.verification,{artifact_integrity_verified:true,selected_field_contract_verified:true,native_source_replayed:false});
  await f.rows(JSON.stringify({...f.row,address_country:'us'})+'\n');
  assert.equal((await read(f.descriptor,f.options)).manifest.selected.record_count,1);
  await assert.rejects(nativeRead(f.descriptor,f.options));
  await assert.rejects(read(f.descriptor,{...f.options,startedAt:new Date(Date.now()+10000).toISOString()}));
});

test('rehashed counters, engine query, mode, claims and inventory changes reject',async t => {
  const f = await fixture(t);
  for (const [object,key,value] of [[f.manifest.transport,'fetch_calls',3],[f.manifest.engine,'query_fingerprint','0'.repeat(64)],[f.manifest.engine.engine_settings,'threads','4'],[f.manifest,'execution_mode','native-fetch'],[f.manifest.claims,'public_export_authorized',true],[f.manifest.journal.counters,'bytes_observed',9],[f.manifest,'plan_sha256','0'.repeat(64)]]) {
    const before=object[key]; object[key]=value; await f.rewrite(); await assert.rejects(read(f.descriptor,f.options)); object[key]=before; await f.rewrite();
  }
  await writeFile(path.join(f.directory,'engine','extra'),'private'); await assert.rejects(read(f.descriptor,f.options));
});

test('rehashed selected output must preserve exact projection, US filter, closure filter and framing',async t => {
  const f = await fixture(t);
  for (const row of [{...f.row,geometry:{}},{...f.row,address_country:'CA'},{...f.row,operating_status:'permanently_closed'}]) { await f.rows(JSON.stringify(row)+'\n'); await assert.rejects(read(f.descriptor,f.options)); }
  await f.rows(JSON.stringify(f.row)); await assert.rejects(read(f.descriptor,f.options));
  await f.rows(JSON.stringify(f.row)+'\n'); f.manifest.selected.record_count=2; await f.rewrite(); await assert.rejects(read(f.descriptor,f.options));
});

test('corruption and hardlinked selected files reject and leave evidence readable',async t => {
  const f = await fixture(t), file=path.join(f.directory,f.manifest.selected.path);
  await writeFile(file,Buffer.alloc(f.manifest.selected.bytes)); await assert.rejects(read(f.descriptor,f.options));
  await f.rows(JSON.stringify(f.row)+'\n'); await link(file,path.join(f.root,'linked.gz')); await assert.rejects(read(f.descriptor,f.options));
});

test('rehashed journals cannot omit GET completion or change preflight asset count',async t => {
  const f = await fixture(t), filename=path.join(f.directory,f.manifest.journal.directory,'events.jsonl');
  const original=await readFile(filename,'utf8'), lines=original.trimEnd().split('\n').map(JSON.parse);
  const changed=structuredClone(lines); changed[0].asset_count=2;
  let raw=changed.map(v=>JSON.stringify(v)+'\n').join(''); await writeFile(filename,raw); f.manifest.journal.sha256=hash(raw); await f.rewrite();
  await assert.rejects(read(f.descriptor,f.options));
  raw=lines.slice(0,3).map(v=>JSON.stringify(v)+'\n').join(''); await writeFile(filename,raw); f.manifest.journal.sha256=hash(raw);
  Object.assign(f.manifest.journal.counters,{requests_reserved:1,requests_completed:1,bytes_reserved:0,bytes_observed:0,bytes_delivered:0});
  Object.assign(f.manifest.transport,{requests_reserved:1,fetch_calls:1,bytes_reserved:0,bytes_observed:0,bytes_delivered:0});
  await f.rewrite(); await assert.rejects(read(f.descriptor,f.options));
});

test('selected rows cannot exceed global declared rows and prerequisite operations stay distinct',async t => {
  const f=await fixture(t);
  f.manifest.selected.record_count=11;
  await f.rows((JSON.stringify(f.row)+'\n').repeat(11));
  await assert.rejects(read(f.descriptor,f.options));
  f.manifest.selected.record_count=1; await f.rows(JSON.stringify(f.row)+'\n');
  f.manifest.runtime_reference.operation_id=f.options.operationId; await f.rewrite();
  await assert.rejects(read(f.descriptor,f.options));
});
