import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, realpath, lstat, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';

export const MN_CONSTRUCTION_NOTICE_URLS=Object.freeze(['https://dli.mn.gov/about-department/about-dli/disclaimer','https://dli.mn.gov/license-and-registration-lookup']);
const MAXIMUM=1_000_000;
const sha=v=>createHash('sha256').update(v).digest('hex');
const check=(v,why)=>{if(!v)throw new Error(`Minnesota notice prerequisite rejected: ${why}.`);};
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function abortable(promise,signal,late){
  return new Promise((resolve,reject)=>{let settled=false;
    const abort=()=>{if(!settled){settled=true;reject(signal.reason);}};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',abort);if(settled){late?.(value);return;}settled=true;resolve(value);},error=>{signal.removeEventListener('abort',abort);if(!settled){settled=true;reject(error);}});
  });
}
export function inspectMnConstructionNotice(html){
  check(typeof html==='string'&&Buffer.byteLength(html)<=MAXIMUM,'HTML ceiling');
  const articles=[...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article\s*>/gi)];
  check(articles.length===1&&(html.match(/<article\b/gi)||[]).length===1&&(html.match(/<\/article\s*>/gi)||[]).length===1,'single complete article required');
  const article=articles[0][0].replaceAll('\r\n','\n').trim();
  check(Buffer.byteLength(article)<=200000&&!/<\s*(?:script|iframe|object|form)\b/i.test(article),'bounded static article required');
  return {article_html:article,article_sha256:sha(article)};
}
export async function captureMnConstructionNotices(options={}){
  check(options&&typeof options==='object'&&!Array.isArray(options)&&Object.keys(options).every(k=>['fetchImpl','signal','now','sleep','timeoutMs'].includes(k)),'options');
  const {fetchImpl=fetch,signal,now=()=>new Date(),sleep=(ms,opts)=>delay(ms,undefined,opts),timeoutMs=15000}=options;
  check([fetchImpl,now,sleep].every(v=>typeof v==='function')&&(signal===undefined||signal instanceof AbortSignal)&&Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=60000,'runtime options');
  signal?.throwIfAborted();const startedAt=now().toISOString(),observations=[];check(time(startedAt),'clock');
  for(const url of MN_CONSTRUCTION_NOTICE_URLS){
    if(observations.length)await sleep(1000,{signal});signal?.throwIfAborted();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Notice request deadline.','TimeoutError')),timeoutMs);
    const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;let response,reader;
    const cancel=r=>{if(r?.body&&!r.body.locked)void r.body.cancel().catch(()=>{});};
    try{
      response=await abortable(Promise.resolve().then(()=>{combined.throwIfAborted();return fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',headers:{'Accept-Encoding':'identity',Accept:'text/html'},signal:combined});}),combined,cancel);
      combined.throwIfAborted();check(response instanceof Response&&!response.redirected&&response.status===200,'HTTP response');
      check(/^text\/html(?:;|$)/i.test(response.headers.get('content-type')??'')&&(!response.headers.get('content-encoding')||response.headers.get('content-encoding')==='identity'),'HTML encoding/type');
      const declared=response.headers.get('content-length');check(declared===null||/^\d+$/.test(declared)&&Number(declared)<=MAXIMUM,'declared size');
      check(response.body,'body missing');reader=response.body.getReader();const chunks=[];let size=0;
      for(;;){combined.throwIfAborted();const next=await abortable(reader.read(),combined);combined.throwIfAborted();if(next.done)break;size+=next.value.byteLength;check(size<=MAXIMUM,'consumed ceiling');chunks.push(next.value);}
      check(declared===null||Number(declared)===size,'body length mismatch');const raw=Buffer.concat(chunks,size),html=new TextDecoder('utf-8',{fatal:true}).decode(raw);
      const article=inspectMnConstructionNotice(html),observedAt=now().toISOString();check(time(observedAt)&&observedAt>=(observations.at(-1)?.observed_at??startedAt),'observation clock');
      observations.push({url,observed_at:observedAt,http_status:200,body_bytes:size,body_sha256:sha(raw),...article});
    }catch{signal?.throwIfAborted();throw new Error('Minnesota notice prerequisite failed; no source-use authorization.');}
    finally{clearTimeout(timer);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else cancel(response);}
  }
  const result={schema_version:'mn-construction-notices@1.0.0',started_at:startedAt,finished_at:now().toISOString(),observations,
    scope:'Complete single article HTML retained; full response hash is observed but full page bytes are not retained. Not native source acquisition or source authenticity.'};
  signal?.throwIfAborted();return validateMnConstructionNotices(result);
}
export function validateMnConstructionNotices(value){
  check(exact(value,['schema_version','started_at','finished_at','observations','scope'])&&value.schema_version==='mn-construction-notices@1.0.0'&&time(value.started_at)&&time(value.finished_at)&&value.finished_at>=value.started_at
    &&value.scope==='Complete single article HTML retained; full response hash is observed but full page bytes are not retained. Not native source acquisition or source authenticity.'&&Array.isArray(value.observations)&&value.observations.length===2,'envelope');
  let prior=value.started_at;
  for(const [index,o]of value.observations.entries()){
    check(exact(o,['url','observed_at','http_status','body_bytes','body_sha256','article_html','article_sha256'])&&o.url===MN_CONSTRUCTION_NOTICE_URLS[index]&&time(o.observed_at)&&o.observed_at>=prior&&o.observed_at<=value.finished_at
      &&o.http_status===200&&Number.isSafeInteger(o.body_bytes)&&o.body_bytes>0&&o.body_bytes<=MAXIMUM&&typeof o.body_sha256==='string'&&/^[a-f0-9]{64}$/.test(o.body_sha256),'observation');
    const article=inspectMnConstructionNotice(o.article_html);check(article.article_html===o.article_html&&article.article_sha256===o.article_sha256&&Buffer.byteLength(o.article_html)<=o.body_bytes,'article reconstruction');prior=o.observed_at;
  }
  return value;
}

export async function writeMnConstructionNotices(value,{signal,outputRoot=path.join(APP_ROOT,'data/business-sources/mn-dli-construction/source-use')}={}){
  validateMnConstructionNotices(value);signal?.throwIfAborted();const raw=Buffer.from(JSON.stringify(value)+'\n');
  const relative=path.relative(APP_ROOT,outputRoot),segments=relative.split(path.sep);
  check(outputRoot===path.resolve(outputRoot)&&relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&segments.every(s=>s&&!/[ .]$|[<>:"|?*\u0000-\u001f]/u.test(s)&&!['releases','.staging'].includes(s.toLowerCase()))&&await realpath(APP_ROOT)===APP_ROOT,'output path');
  let directory=APP_ROOT;
  for(const segment of segments){directory=path.join(directory,segment);signal?.throwIfAborted();try{await mkdir(directory);}catch(e){if(e.code!=='EEXIST')throw e;}
    const stat=await lstat(directory);check(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(directory)===directory,'output alias');
    check(!await lstat(path.join(directory,'manifest.json')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),'manifest output ancestor');}
  const id=randomUUID(),temporary=path.join(directory,id+'.tmp'),destination=path.join(directory,id+'.json');let owner,written,published=false;
  const owned=s=>s?.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.ino===owner?.ino&&s.dev===owner?.dev;
  try{signal?.throwIfAborted();const handle=await open(temporary,'wx+');
    try{owner=await handle.stat({bigint:true});await handle.writeFile(raw);await handle.sync();const verified=Buffer.alloc(raw.length+1),read=await handle.read(verified,0,verified.length,0);
      check(read.bytesRead===raw.length&&verified.subarray(0,raw.length).equals(raw),'written receipt');written=await handle.stat({bigint:true});}finally{await handle.close();}
    const current=await lstat(temporary,{bigint:true});check(owned(current)&&current.size===BigInt(raw.length)&&current.mtimeNs===written.mtimeNs&&current.ctimeNs===written.ctimeNs&&await realpath(directory)===directory,'receipt ownership');
    signal?.throwIfAborted();await link(temporary,destination);published=true;await unlink(temporary);check(owned(await lstat(destination,{bigint:true})),'published ownership');
    return {path:destination,bytes:raw.length,sha256:sha(raw)};
  }catch(error){if(signal?.aborted&&!published&&await realpath(directory).catch(()=>null)===directory&&owned(await lstat(temporary,{bigint:true}).catch(()=>null)))await unlink(temporary);throw error;}
}
