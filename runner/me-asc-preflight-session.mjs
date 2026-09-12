import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {createMeOfflineParser} from './me-asc-preflight-parser.mjs';
import {ME_ASC_VERSION,ME_ASC_ORIGIN,ME_ASC_BASE,ME_ASC_LIMITS as L,ME_ASC_COUNTIES,meCheck,meHash,meClaims,selectMeForm,serializeMeForm,meSafeDocumentMetadata,meExportMetadata} from './me-asc-preflight-contract.mjs';
const issued=new WeakMap();
export function mePreflightSnapshot(result){meCheck(issued.get(result)===JSON.stringify(result));return JSON.parse(issued.get(result));}
const policyPath=path.join(APP_ROOT,'config/source-policies/me-asc-preflight-internal.json');
export const ME_POLICY_SHA256='793f793c288d68e354e6bfbfbd12e42f7a81a7a75eb33e37dbc2155f2e9326c5';
export async function mePolicy(){const policy=await readJson(policyPath,10000);const digest=meHash(JSON.stringify(policy));meCheck(digest===ME_POLICY_SHA256);return digest;}

// Exact-origin memory-only jar. No cookie/header/request-body data leaves this module.
export function createMeCookieJar(){
 const cookies=new Map();
 return {accept(headers,url){
   const lines=headers.getSetCookie?.()??[];meCheck(lines.length<=32);const target=new URL(url);
   for(const line of lines){meCheck(typeof line==='string'&&line.length<=4096&&!/[\r\n]/.test(line));const parts=line.split(';'),pair=parts.shift(),eq=pair.indexOf('=');meCheck(eq>0);const name=pair.slice(0,eq).trim(),value=pair.slice(eq+1).trim();meCheck(/^[A-Za-z0-9_\-]+$/.test(name)&&!/[,;\s]/.test(value));
    const attributes=new Map();for(const item of parts){const index=item.indexOf('='),key=(index<0?item:item.slice(0,index)).trim().toLowerCase();meCheck(!attributes.has(key));attributes.set(key,index<0?'':item.slice(index+1).trim());}
    const domain=(attributes.get('domain')??target.hostname).replace(/^\./,'').toLowerCase();meCheck(domain===new URL(ME_ASC_ORIGIN).hostname);
    const cookiePath=attributes.get('path')??target.pathname.slice(0,target.pathname.lastIndexOf('/')+1);meCheck(cookiePath.startsWith('/')&&!/[\r\n;]/.test(cookiePath));
    let expires=Infinity;if(attributes.has('max-age')){meCheck(/^-?\d+$/.test(attributes.get('max-age')));expires=Date.now()+Number(attributes.get('max-age'))*1000;}else if(attributes.has('expires')){expires=Date.parse(attributes.get('expires'));meCheck(Number.isFinite(expires));}
    const key=name+'|'+cookiePath;if(expires<=Date.now())cookies.delete(key);else cookies.set(key,{name,value,path:cookiePath,secure:attributes.has('secure'),expires});
   }
   meCheck(cookies.size<=32&&[...cookies.values()].reduce((n,c)=>n+c.name.length+c.value.length,0)<=16384);
  },header(url){const target=new URL(url);meCheck(target.origin===ME_ASC_ORIGIN);return [...cookies.values()].filter(c=>c.expires>Date.now()&&(!c.secure||target.protocol==='https:')&&(target.pathname===c.path||target.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/'))).sort((a,b)=>b.path.length-a.path.length).map(c=>c.name+'='+c.value).join('; ');},clear(){cookies.clear();}};
}
async function wait(ms,signal){signal.throwIfAborted();await new Promise((resolve,reject)=>{const timer=setTimeout(done,ms);function done(){signal.removeEventListener('abort',abort);resolve();}function abort(){clearTimeout(timer);signal.removeEventListener('abort',abort);reject(Error('cancelled'));}signal.addEventListener('abort',abort,{once:true});});}
async function bound(promise,signal){signal.throwIfAborted();let stop;try{return await Promise.race([promise,new Promise((_,reject)=>{stop=()=>reject(Error('cancelled'));signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();})]);}finally{signal.removeEventListener('abort',stop);}}
const urlFor=step=>ME_ASC_BASE+({initial:'',category:'type_pop_services.asp?types=12',county:'county_town.asp',list:'facility_list.asp',details:'aspen_details.asp',export:'make_excel.asp'}[step]);
async function execute(fetchImpl,parserFactory,parent,synthetic){
 await mePolicy();parent?.throwIfAborted();
 const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),L.session_timeout_ms),signal=parent?AbortSignal.any([parent,timeout.signal]):timeout.signal;
 const result={schema_version:ME_ASC_VERSION,execution_mode:synthetic?'injected-test-transport':'native-fetch',status:'inspection-required',started_at:new Date().toISOString(),finished_at:null,policy_sha256:ME_POLICY_SHA256,limits:L,claims:meClaims(),requests:[],pages:{},counts:{list_rows:null,details_rows:null,export_rows:null,list_details_match:false,list_export_match:false},export_schema:null,session_controls:{csrf_forms:0,export_named_fields:0,unnamed_controls_omitted:true},cleanup_verified:false};
 const jar=createMeCookieJar();let parser,lastRequest=0,total=0,bodyCleanup=true,pendingTransports=0;
 async function cancelBody(body){if(!body)return;let timer;try{await Promise.race([body.cancel(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cleanup incomplete')),2000);})]);}catch{bodyCleanup=false;}finally{clearTimeout(timer);}}
 async function request(step,method='GET',body,redirectStep){
  signal.throwIfAborted();meCheck(result.requests.length<L.requests);if(lastRequest)await wait(Math.max(0,L.spacing_ms-(Date.now()-lastRequest)),signal);lastRequest=Date.now();
  const url=urlFor(step),entry={step,method,status:null,bytes:0,sha256:null,complete:false};result.requests.push(entry);
  const deadline=new AbortController(),rt=setTimeout(()=>deadline.abort(),L.request_timeout_ms),local=AbortSignal.any([signal,deadline.signal]);let response,reader;
  try{
   pendingTransports++;
   const pending=Promise.resolve().then(()=>{local.throwIfAborted();return fetchImpl(url,{method,body,redirect:'manual',signal:local,headers:{Accept:'text/html,application/vnd.ms-excel,text/csv',...(jar.header(url)?{Cookie:jar.header(url)}:{}),...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded',Origin:ME_ASC_ORIGIN,Referer:urlFor({list:'county',details:'list',export:'details'}[step])}:{} )}});}).then(async r=>{if(local.aborted){await cancelBody(r?.body);throw Error('cancelled');}return r;}).finally(()=>pendingTransports--);
   response=await bound(pending,local);entry.status=response.status;meCheck(response instanceof Response&&!response.redirected&&(!response.url||response.url===url)&&[200,302].includes(response.status));jar.accept(response.headers,url);
   const length=response.headers.get('content-length');meCheck(length===null||/^\d+$/.test(length)&&Number(length)<=L.response_bytes);
   const chunks=[];if(response.body){reader=response.body.getReader();for(;;){const next=await bound(reader.read(),local);if(next.done)break;meCheck(next.value instanceof Uint8Array&&entry.bytes+next.value.length<=L.response_bytes&&total+next.value.length<=L.total_bytes);entry.bytes+=next.value.length;total+=next.value.length;chunks.push(next.value);}}
   local.throwIfAborted();const bytes=Buffer.concat(chunks);meCheck(length===null||response.headers.get('content-encoding')&&response.headers.get('content-encoding')!=='identity'||Number(length)===bytes.length);entry.sha256=meHash(bytes);entry.complete=true;
   if(response.status===302){meCheck(redirectStep==='county'&&response.headers.has('location')&&new URL(response.headers.get('location'),url).href===urlFor('county'));return request('county','GET');}
   const mime=response.headers.get('content-type')??'';meCheck(step==='export'||/^text\/html(?:;|$)/i.test(mime));return {bytes,mime};
  }finally{deadline.abort();clearTimeout(rt);if(reader){await cancelBody(reader);reader.releaseLock();}else await cancelBody(response?.body);}
 }
 const html=async(step,response)=>{const doc=await parser.parse(response.bytes);result.pages[step]=meSafeDocumentMetadata(doc);return doc;};
 try{
  signal.throwIfAborted();parser=await parserFactory(signal);
  const initial=await html('initial',await request('initial'));meCheck(initial.links.length===1);
  const county=await html('county',await request('category','GET',undefined,'county'));
  const countyForm=selectMeForm(county,'county_city','facility_list.asp');
  const countyBody=serializeMeForm(countyForm,{checkboxName:'counties',checkboxValues:ME_ASC_COUNTIES,allowNames:['CSRFToken','counties','FAC_CITY']});result.session_controls.csrf_forms++;
  const list=await html('list',await request('list','POST',countyBody));
  const listForm=selectMeForm(list,'facility_list','aspen_details.asp'),selected=listForm.controls.filter(control=>control.name==='which'&&control.type==='checkbox'&&!control.disabled).map(control=>control.value);meCheck(selected.length>0&&selected.length<=L.rows&&new Set(selected).size===selected.length);
  meCheck(listForm.controls.filter(c=>c.name==='referer'&&c.type==='hidden'&&!c.disabled).length===1);
  const detailsBody=serializeMeForm(listForm,{checkboxName:'which',checkboxValues:selected,allowNames:['CSRFToken','referer','which','details'],submitterName:'details'});result.session_controls.csrf_forms++;
  result.counts.list_rows=selected.length;
  const details=await html('details',await request('details','POST',detailsBody));result.counts.details_rows=details.labelCounts['Provider Type']??null;result.counts.list_details_match=result.counts.details_rows===selected.length;
  const exportForm=selectMeForm(details,'get_excel','make_excel.asp'),exportBody=serializeMeForm(exportForm,{allowNames:[],requireCsrf:false});meCheck(exportBody==='');
  const exported=await request('export','POST',exportBody);
  if(/^\s*(?:<!doctype\s+html|<html|<table)/i.test(exported.bytes.toString('utf8').slice(0,200))){const doc=await html('export',exported);result.export_schema=meExportMetadata(doc);result.counts.export_rows=result.export_schema.rows;result.counts.list_export_match=result.counts.export_rows===selected.length;}
  else result.export_schema={format:'unresolved',rows:null,columns:null,known_labels:[],unknown_label_count:null,conservation_verified:false};
  await mePolicy();signal.throwIfAborted();
  if(result.export_schema.format==='html-table'&&result.export_schema.unknown_label_count===0&&result.counts.list_details_match&&result.counts.list_export_match)result.status='schema-observed-not-collection-ready';
 }catch{result.status='inspection-required';}
 finally{jar.clear();try{await parser?.close();result.cleanup_verified=bodyCleanup&&pendingTransports===0;}catch{result.status='inspection-required';}clearTimeout(timer);result.finished_at=new Date().toISOString();}
 if(!result.cleanup_verified)result.status='inspection-required';
 if(signal.aborted)result.status='inspection-required';issued.set(result,JSON.stringify(result));return result;
}
export async function runMeAscPreflight({signal}={}){return execute(globalThis.fetch,createMeOfflineParser,signal,false);}
export async function runMeAscPreflightWithTestTransport(fetchImpl,parserFactory,{signal}={}){meCheck(typeof fetchImpl==='function'&&typeof parserFactory==='function');return execute(fetchImpl,parserFactory,signal,true);}
