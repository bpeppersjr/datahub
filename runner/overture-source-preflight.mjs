import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, lstat, readdir, link, unlink } from 'node:fs/promises';
import { preflightOverturePlaces } from './overture-us-places.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson, mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';

const VERSION = 'overture-source-preflight@1.0.0';
const STATUS = 'metadata-verified-no-place-acquisition';
const LIMITS = { maxCalls: 34, maxBodyBytes: 2 * 1024 ** 2, maxTotalBytes: 16 * 1024 ** 2, minIntervalMs: 250, requestTimeoutMs: 15000, deadlineMs: 120000 };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest = value => createHash('sha256').update(value).digest('hex');
const failure = () => Object.assign(new Error('Overture source metadata prerequisite rejected; preserve outputs for inspection.'), { name: 'AbortError' });
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key)) && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value'));
const claims = () => ({ place_acquisition_performed: false, native_acquisition_verified: false, acquisitionReady: false, hard_deadline_enforced: false });
const same = (a, b) => a && b && a.ino === b.ino && a.dev === b.dev && !a.isSymbolicLink() && !b.isSymbolicLink();
function admitted(options, extra = []) {
  const keys = ['output','operationId', ...extra.filter(key => Object.hasOwn(options ?? {}, key))];
  if (!exact(options, keys) || typeof options.output !== 'string' || options.output !== path.resolve(options.output)
    || typeof options.operationId !== 'string' || !UUID.test(options.operationId) || path.basename(options.output) !== 'output'
    || path.basename(path.dirname(options.output)) !== options.operationId) throw failure();
  return { ...options };
}
function metadataUrl(value) {
  const text = String(value), url = new URL(text);
  if (url.href !== text || url.protocol !== 'https:' || url.hostname !== 'stac.overturemaps.org' || url.port || url.username || url.password || url.search || url.hash
    || !/^\/(?:catalog\.json|20\d{2}-\d{2}-\d{2}\.\d+\/places\/place\/(?:collection\.json|\d{5}\/\d{5}\.json))$/.test(url.pathname)) throw failure();
  return text;
}
async function owned(directory, owner, names) {
  await canonical(directory);
  if (!same(owner, await lstat(directory, { bigint: true }))) throw failure();
  const actual = (await readdir(directory)).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...names].sort())) throw failure();
}
async function bytesFile(filename, raw) {
  const file = await open(filename, 'wx');
  try {
    const owner = await file.stat({ bigint: true });
    await file.writeFile(raw); await file.sync();
    for (const value of [await file.stat({ bigint: true }), await lstat(filename, { bigint: true })]) if (!same(owner,value) || value.nlink !== 1n || value.size !== BigInt(raw.length)) throw failure();
  } finally { await file.close(); }
}

async function probe(value, synthetic) {
  const options = admitted(value, synthetic ? ['signal','fetchImpl','limits'] : ['signal']);
  const { output, operationId, signal } = options;
  if ((signal !== undefined && !(signal instanceof AbortSignal)) || (synthetic && typeof options.fetchImpl !== 'function')) throw failure();
  const fetchImpl = synthetic ? options.fetchImpl : globalThis.fetch, limits = { ...LIMITS };
  if (options.limits !== undefined) {
    if (!options.limits || Object.getPrototypeOf(options.limits) !== Object.prototype || Reflect.ownKeys(options.limits).some(key => !Object.hasOwn(limits,key))
      || Object.values(Object.getOwnPropertyDescriptors(options.limits)).some(d => !Object.hasOwn(d,'value'))) throw failure();
    for (const [key, number] of Object.entries(options.limits)) {
      if (!Number.isSafeInteger(number) || number < (key === 'minIntervalMs' ? 0 : 1) || number > limits[key]) throw failure();
      limits[key] = number;
    }
  }
  const whole = new AbortController(), abort = () => whole.abort();
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  const deadline = setTimeout(abort, limits.deadlineMs);
  let published = false, descriptor, manifestWriter, pendingFetch, reader, response;
  const check = s => { if (s.aborted) throw failure(); };
  async function guarded(promise, s) {
    let listener;
    try {
      check(s);
      return await Promise.race([promise, new Promise((resolve,reject) => { listener = () => reject(failure()); s.addEventListener('abort',listener,{once:true}); if(s.aborted)listener(); })]);
    } finally { if(listener)s.removeEventListener('abort',listener); }
  }
  async function cancel(body) { try { await body?.cancel(); } catch { /* Preserve fixed errors. */ } }
  try {
    check(whole.signal); await canonical(output,{create:true,output:true,signal:whole.signal});
    const jobs = path.join(output,'jobs'); await canonical(jobs,{create:true,output:true,signal:whole.signal});
    const run = randomUUID(), directory = path.join(jobs,run); await mkdir(directory);
    const owner = await lstat(directory,{bigint:true}), startedAt = new Date().toISOString(), requests = [], names = [];
    let total = 0, calls = 0, lastStart = null;
    const result = await preflightOverturePlaces({ signal:whole.signal, now:() => new Date(startedAt), sleep:async()=>{throw failure();}, fetchImpl:async(value,init)=>{
      let timer, pendingRead;
      const local = new AbortController(), localAbort=()=>local.abort(); whole.signal.addEventListener('abort',localAbort,{once:true});
      try {
        const url = metadataUrl(value); check(whole.signal);
        if ((init.method !== undefined && init.method !== 'GET') || ++calls > limits.maxCalls) throw failure();
        if(lastStart!==null){let pace;try{await guarded(new Promise(resolve=>{pace=setTimeout(resolve,Math.max(0,limits.minIntervalMs-(performance.now()-lastStart)));}),whole.signal);}finally{clearTimeout(pace);}}
        check(whole.signal); timer=setTimeout(localAbort,limits.requestTimeoutMs); lastStart=performance.now();
        pendingFetch=Promise.resolve().then(()=>{check(local.signal);return fetchImpl(url,{method:'GET',redirect:'manual',credentials:'omit',headers:{Accept:'application/json','Accept-Encoding':'identity'},signal:local.signal});}).then(async value=>{if(local.signal.aborted)await cancel(value?.body);return value;});
        response=await guarded(pendingFetch,local.signal);
        if(response.status!==200||response.redirected||!response.body?.getReader||(response.headers.get('content-encoding')&&response.headers.get('content-encoding')!=='identity'))throw failure();
        const length=response.headers.get('content-length');
        if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limits.maxBodyBytes))throw failure();
        reader=response.body.getReader();const chunks=[];let size=0;
        for(;;){pendingRead=reader.read();const part=await guarded(pendingRead,local.signal);pendingRead=null;check(local.signal);if(part.done)break;
          if(!(part.value instanceof Uint8Array))throw failure();size+=part.value.length;total+=part.value.length;if(size>limits.maxBodyBytes||total>limits.maxTotalBytes)throw failure();chunks.push(Buffer.from(part.value));}
        if(!size||(length!==null&&Number(length)!==size))throw failure();
        const raw=Buffer.concat(chunks), parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
        const name=`response-${String(calls).padStart(2,'0')}.json`;
        check(local.signal);await owned(directory,owner,names);await bytesFile(path.join(directory,name),raw);names.push(name);
        requests.push({index:calls,url,path:name,bytes:size,sha256:digest(raw)});check(local.signal);
        return {ok:true,status:200,json:async()=>structuredClone(parsed)};
      } catch { throw failure(); }
      finally {local.abort();clearTimeout(timer);whole.signal.removeEventListener('abort',localAbort);
        if(reader){await cancel(reader);if(pendingRead)await pendingRead.catch(()=>{});try{reader.releaseLock();}catch{/* Drain fetch even if lock release fails. */}}else await cancel(response?.body);
        if(pendingFetch)await pendingFetch.catch(()=>{});reader=null;response=null;pendingFetch=null;}
    }});
    check(whole.signal);await owned(directory,owner,names);
    const manifest={schema_version:VERSION,run_id:run,operation_id:operationId,execution_mode:synthetic?'injected-metadata-only':'native-metadata-only',status:STATUS,
      started_at:startedAt,completed_at:new Date().toISOString(),requests,result,result_sha256:digest(JSON.stringify(result)),claims:claims()};
    const temporary=path.join(directory,'manifest.tmp'),filename=path.join(directory,'manifest.json');
    manifestWriter=await writer(temporary,512*1024,whole.signal,new Map());await manifestWriter.write(manifest);const receipt=await manifestWriter.finish();
    descriptor={run_id:run,operation_id:operationId,manifest:filename,sha256:receipt.sha256,status:STATUS,cancellation_after_publication:false};
    check(whole.signal);await owned(directory,owner,[...names,'manifest.tmp']);await link(temporary,filename);published=true;await unlink(temporary);
    await inspect(descriptor,{output,operationId},synthetic);descriptor.cancellation_after_publication=whole.signal.aborted;return descriptor;
  } catch {const error=failure();if(published)error.recovery=descriptor;throw error;}
  finally {clearTimeout(deadline);signal?.removeEventListener('abort',abort);try{await manifestWriter?.close();}catch{const error=failure();if(published)error.recovery=descriptor;throw error;}}
}

async function inspect(descriptor,value,synthetic){
  const {output,operationId,startedAt}=admitted(value,['startedAt']);
  if(startedAt!==undefined&&(typeof startedAt!=='string'||!Number.isFinite(Date.parse(startedAt))||new Date(startedAt).toISOString()!==startedAt))throw failure();
  if(!exact(descriptor,['run_id','operation_id','manifest','sha256','status','cancellation_after_publication'])||typeof descriptor.run_id!=='string'||!UUID.test(descriptor.run_id)
    ||descriptor.operation_id!==operationId||typeof descriptor.sha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptor.sha256)||descriptor.status!==STATUS||typeof descriptor.cancellation_after_publication!=='boolean')throw failure();
  descriptor={...descriptor};const directory=path.join(output,'jobs',descriptor.run_id);
  if(descriptor.manifest!==path.join(directory,'manifest.json'))throw failure();
  await canonical(directory);const owner=await lstat(directory,{bigint:true}),meter={};
  const manifest=await readJson(descriptor.manifest,512*1024,undefined,meter);
  if(meter.sha256!==descriptor.sha256||!exact(manifest,['schema_version','run_id','operation_id','execution_mode','status','started_at','completed_at','requests','result','result_sha256','claims'])
    ||manifest.schema_version!==VERSION||manifest.run_id!==descriptor.run_id||manifest.operation_id!==operationId||manifest.status!==STATUS||manifest.execution_mode!==(synthetic?'injected-metadata-only':'native-metadata-only')
    ||!exact(manifest.claims,Object.keys(claims()))||Object.values(manifest.claims).some(value=>value!==false)
    ||!Array.isArray(manifest.requests)||manifest.requests.length<3||manifest.requests.length>LIMITS.maxCalls)throw failure();
  for(const key of ['started_at','completed_at'])if(typeof manifest[key]!=='string'||!Number.isFinite(Date.parse(manifest[key]))||new Date(manifest[key]).toISOString()!==manifest[key])throw failure();
  if(manifest.completed_at<manifest.started_at||(startedAt&&manifest.started_at<startedAt)||Date.parse(manifest.completed_at)>Date.now()+5000)throw failure();
  let position=0,total=0;const names=['manifest.json'], retained=[];
  const replay=await preflightOverturePlaces({now:()=>new Date(manifest.started_at),sleep:async()=>{throw failure();},fetchImpl:async(value)=>{
    try{const request=manifest.requests[position++];if(!exact(request,['index','url','path','bytes','sha256'])||request.index!==position||request.url!==metadataUrl(value)||request.path!==`response-${String(position).padStart(2,'0')}.json`)throw failure();
      const meter={};const parsed=await readJson(path.join(directory,request.path),LIMITS.maxBodyBytes,undefined,meter);total+=meter.bytes;if(total>LIMITS.maxTotalBytes||meter.bytes!==request.bytes||meter.sha256!==request.sha256)throw failure();names.push(request.path);retained.push({request,meter});return{ok:true,status:200,json:async()=>parsed};
    }catch{throw failure();}
  }});
  if(position!==manifest.requests.length||JSON.stringify(replay)!==JSON.stringify(manifest.result)||digest(JSON.stringify(replay))!==manifest.result_sha256)throw failure();
  await owned(directory,owner,names);const end={};await readJson(descriptor.manifest,512*1024,undefined,end);if(end.sha256!==descriptor.sha256||!same(meter.identity,end.identity))throw failure();
  for(const item of retained){const final={};await readJson(path.join(directory,item.request.path),LIMITS.maxBodyBytes,undefined,final);if(final.sha256!==item.meter.sha256||!same(final.identity,item.meter.identity))throw failure();}
  await owned(directory,owner,names);
  return{manifest,sha256:descriptor.sha256};
}
export async function probeOvertureSourcePreflight(options){try{return await probe(options,false);}catch(error){const fixed=failure();if(error?.recovery)fixed.recovery=error.recovery;throw fixed;}}
export async function probeOvertureSourcePreflightForTest(options){try{return await probe(options,true);}catch(error){const fixed=failure();if(error?.recovery)fixed.recovery=error.recovery;throw fixed;}}
export async function readOvertureSourcePreflight(descriptor,options){try{return await inspect(descriptor,options,false);}catch{throw failure();}}
export async function readOvertureSourcePreflightForTest(descriptor,options){try{return await inspect(descriptor,options,true);}catch{throw failure();}}
