import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,readdir,writeFile,unlink,rmdir,mkdir,mkdtemp,rm,symlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {EventEmitter} from 'node:events';
import {createCliCancellation} from './cli-cancellation.mjs';
import {APP_ROOT} from './paths.mjs';
import {createMeOfflineParser} from './me-asc-preflight-parser.mjs';
import {ME_ASC_BASE as B,ME_ASC_COUNTIES,ME_ASC_LIMITS,meHash,serializeMeForm} from './me-asc-preflight-contract.mjs';
import {runMeAscPreflightWithTestTransport,createMeCookieJar,mePolicy,ME_POLICY_SHA256} from './me-asc-preflight-session.mjs';
import {persistMeAscReceipt,persistMeAscReceiptWithTestHook} from './me-asc-preflight-receipt.mjs';
import {readMeAscReceipt,validateMeAscReceipt,validateMeManagedOptions} from './me-asc-preflight-reader.mjs';

const secret='SYNTHETIC_PRIVATE_VALUE',csrf=n=>`<input type="hidden" name="CSRFToken" value="SYNTHETIC_TOKEN_${n}">`;
const box=(name,value)=>`<input type="checkbox" name="${name}" value="${value}">`;
const fixture={
 initial:'<a href="type_pop_services.asp?types=12">ASC</a>',
 county:`<form name="county_city" method="post" action="facility_list.asp">${csrf(1)}${ME_ASC_COUNTIES.map(c=>box('counties',c)).join('')}${box('FAC_CITY','SYNTHETIC_CITY')}<input type="button" name="bcounties"><input type="submit" value="Search"></form>`,
 list:`<form name="facility_list" method="post" action="aspen_details.asp">${csrf(2)}<input type="hidden" name="referer" value="county_town.asp">${box('which','fixture-1')}${box('which','fixture-2')}<input type="submit" name="details" value="Details"><input type="submit" name="other" value="Ignore"></form>`,
 details:`<table><tr><td>Provider Type</td><td>${secret}</td></tr><tr><td>Provider Type</td><td>${secret}</td></tr></table><form name="get_excel" method="post" action="make_excel.asp"><input type="submit" value="Export"></form>`,
 export:`<table><tr><th>Provider</th><th>City</th></tr><tr><td>${secret}</td><td>${secret}</td></tr><tr><td>${secret}</td><td>${secret}</td></tr></table>`,
};
let projected;
test.before(async()=>{
 const parser=await createMeOfflineParser(undefined,{browserRoot:process.env.ME_ASC_TEST_BROWSER_ROOT??path.join(APP_ROOT,'.playwright-browsers')});
 try{projected={};for(const [key,html]of Object.entries(fixture))projected[key]=await parser.parse(Buffer.from(html));
  const disabled=await parser.parse(Buffer.from('<script>document.body.innerHTML="EXECUTED"</script><img src="https://example.invalid/no-network"><label>Provider</label>'));assert.deepEqual(disabled.labels,['Provider']);
  await assert.rejects(parser.parse(Buffer.from('<iframe src="https://example.invalid"></iframe>')));
 }finally{await parser.close();}
 assert.deepEqual(await readdir(path.join(APP_ROOT,'data/tmp/me-asc-parser')),[]);
});
async function run({alter,transport,signal,close=async()=>{}}={}){
 const requests=[];let stage=0;
 const fetcher=async(url,options)=>{
  requests.push({url,options});if(transport)return transport(url,options,requests.length);
  if(requests.length===2)return new Response('',{status:302,headers:{location:'county_town.asp','set-cookie':'session=SYNTHETIC_COOKIE; Path=/dhhs-apps/aspen/; Secure'}});
  const key=['initial','county','list','details','export'][stage++];
  return new Response(key==='export'?fixture.export:key,{headers:{'content-type':'text/html'}});
 };
 const parserFactory=async()=>({parse:async raw=>{const text=raw.toString();const key=text.startsWith('<table')?'export':text;const doc=structuredClone(projected[key]);return alter?alter(key,doc):doc;},close});
 const result=await runMeAscPreflightWithTestTransport(fetcher,parserFactory,{signal});return {result,requests};
}
test('actual imports and exact form flow with rotating tokens, repeated selections and empty export',async()=>{
 assert.equal(await mePolicy(),ME_POLICY_SHA256);const {result,requests}=await run();
 assert.equal(requests.length,6);assert.deepEqual(requests.map(r=>r.url),[B,B+'type_pop_services.asp?types=12',B+'county_town.asp',B+'facility_list.asp',B+'aspen_details.asp',B+'make_excel.asp']);
 const county=new URLSearchParams(requests[3].options.body),details=new URLSearchParams(requests[4].options.body);
 assert.deepEqual(county.getAll('counties'),ME_ASC_COUNTIES);assert.equal(county.has('FAC_CITY'),false);assert.equal(county.has('undefined'),false);assert.equal(county.get('CSRFToken'),'SYNTHETIC_TOKEN_1');
 assert.deepEqual(details.getAll('which'),['fixture-1','fixture-2']);assert.equal(details.get('CSRFToken'),'SYNTHETIC_TOKEN_2');assert.equal(details.get('referer'),'county_town.asp');assert.equal(details.get('details'),'Details');assert.equal(details.has('other'),false);
 assert.equal(requests[4].options.headers.Referer,B+'facility_list.asp');assert.equal(requests[5].options.body,'');assert.match(requests[5].options.headers.Cookie,/SYNTHETIC_COOKIE/);
 assert.equal(result.status,'schema-observed-not-collection-ready');
 validateMeAscReceipt(result);assert.equal(result.cleanup_verified,true);assert.equal(result.counts.list_export_match,true);assert.equal(result.export_schema.conservation_verified,false);assert.equal(result.claims.collection_ready,false);
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_|fixture-1|county_town\.asp|Details/);
});
test('unknown export headers counted and never retained',async()=>{
 const {result}=await run({alter:(key,doc)=>{if(key==='export')doc.tables[0].header[0].label=null;return doc;}});
 assert.equal(result.export_schema.unknown_label_count,1);assert.equal(result.status,'inspection-required');
});
test('direct category county response uses the exact five-step itinerary',async()=>{
 const {result}=await run({transport:async(_url,_options,n)=>new Response(n===5?fixture.export:['initial','county','list','details'][n-1],{headers:{'content-type':'text/html'}})});
 assert.equal(result.requests.length,5);assert.equal(result.status,'schema-observed-not-collection-ready');validateMeAscReceipt(result);
});
test('unknown format remains unresolved',async()=>{
 let i=0;const {result}=await run({transport:async()=>{i++;if(i===2)return new Response('',{status:302,headers:{location:'county_town.asp'}});return new Response(i===6?'SYNTHETIC_BINARY':({1:'initial',3:'county',4:'list',5:'details'}[i]),{headers:{'content-type':'text/html'}});}});
 assert.equal(result.export_schema.format,'unresolved');assert.equal(result.counts.export_rows,null);
});
test('form and selection barriers reject unobserved actions, checked towns, missing referer and row cap',async()=>{
 for(const mutation of [doc=>doc.forms[0].action='https://example.invalid/aspen_details.asp',doc=>doc.forms[0].name='wrong',doc=>doc.forms[0].controls=doc.forms[0].controls.filter(c=>c.name!=='referer'),doc=>doc.forms[0].controls.push(...Array.from({length:1000},(_,i)=>({name:'which',type:'checkbox',value:'extra-'+i})))]){
  const {result,requests}=await run({alter:(key,doc)=>{if(key==='list')mutation(doc);return doc;}});assert.equal(requests.length,4);assert.equal(result.status,'inspection-required');assert.equal(result.cleanup_verified,true);
 }
 const {requests}=await run({alter:(key,doc)=>{if(key==='county')doc.forms[0].controls.find(c=>c.name==='FAC_CITY').checked=true;return doc;}});assert.equal(requests.length,3);
 assert.throws(()=>serializeMeForm({controls:[{type:'hidden',name:'unexpected',value:secret}]},{allowNames:[]}));
});
test('redirect origin/path/query and barrier status never followed; bodies cancelled',async()=>{
 for(const location of ['https://example.invalid/','../elsewhere','county_town.asp?extra=1','county_town.asp#fragment']){
  const {requests}=await run({transport:async(_url,_options,n)=>new Response(n===1?'initial':'',{status:n===1?200:302,headers:{'content-type':'text/html',location}})});assert.equal(requests.length,2);
 }
 let cancelled=false;const {result,requests}=await run({transport:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:403})});assert.equal(requests.length,1);assert.equal(cancelled,true);assert.equal(result.cleanup_verified,true);
});
test('decoded response ceiling and cancellation close body/parser before result',async()=>{
 let cancelled=false,closed=false;const {result}=await run({transport:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(ME_ASC_LIMITS.response_bytes+1));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/html'}}),close:async()=>{closed=true;}});
 assert.equal(cancelled,true);assert.equal(closed,true);assert.equal(result.status,'inspection-required');
 const controller=new AbortController();cancelled=false;closed=false;
 const cancelledRun=run({signal:controller.signal,transport:async()=>new Response(new ReadableStream({start(){setTimeout(()=>controller.abort(),20);},cancel(){cancelled=true;}}),{headers:{'content-type':'text/html'}}),close:async()=>{closed=true;}});
 const output=await cancelledRun;assert.equal(cancelled,true);assert.equal(closed,true);assert.equal(output.result.cleanup_verified,true);assert.equal(output.result.requests.length,1);
});
async function removeBundle(manifest){const directory=path.dirname(manifest);assert.equal(path.dirname(directory),path.join(APP_ROOT,'data/tmp/me-asc-receipts'));for(const name of await readdir(directory))await unlink(path.join(directory,name));await rmdir(directory);}
test('manifest last, independent reader rehash, redaction and forged receipt rejection',async()=>{
 const {result}=await run();assert.throws(()=>validateMeAscReceipt({...result,raw:secret}));await assert.rejects(persistMeAscReceipt(structuredClone(result)));
 let manifest;try{
  const saved=await persistMeAscReceiptWithTestHook(result,async(stage,{directory})=>{if(stage==='before-publication')assert.deepEqual((await readdir(directory)).sort(),['manifest.tmp','receipt.json']);});manifest=saved.manifest;
  assert.match(manifest,/data[\\/]tmp/);const independently=await readMeAscReceipt(manifest,{expectedSha256:saved.sha256});assert.deepEqual(independently.receipt,result);
  const receiptPath=path.join(path.dirname(manifest),'receipt.json'),raw=await readFile(receiptPath,'utf8');assert.doesNotMatch(raw,/SYNTHETIC_|fixture-1/);
  const originalManifest=JSON.parse(await readFile(manifest,'utf8'));
  for(const mutate of [r=>{r.requests[0].status=500;},r=>{r.requests.shift();},r=>{delete r.pages.county;},r=>{r.pages.details.label_counts={'Provider Type':1};r.pages.details.known_label_occurrences=1;},r=>{r.pages.list.form_structure[0].checkbox_controls=1;}]){
   const forged=structuredClone(result);mutate(forged);const changed=JSON.stringify(forged)+'\n',m=structuredClone(originalManifest);m.receipt.bytes=Buffer.byteLength(changed);m.receipt.sha256=meHash(changed);
   await writeFile(receiptPath,changed);await writeFile(manifest,JSON.stringify(m)+'\n');await assert.rejects(readMeAscReceipt(manifest));
  }
  await writeFile(manifest,JSON.stringify(originalManifest)+'\n');
  await writeFile(receiptPath,raw+' ');await assert.rejects(readMeAscReceipt(manifest));
 }finally{if(manifest)await removeBundle(manifest);}
 const before=await readdir(path.join(APP_ROOT,'data/tmp/me-asc-receipts'));
 await assert.rejects(persistMeAscReceiptWithTestHook(result,async(stage,{directory})=>{if(stage==='before-publication')await writeFile(path.join(directory,'receipt.json'),'{}');}));
 assert.deepEqual(await readdir(path.join(APP_ROOT,'data/tmp/me-asc-receipts')),before);
 assert.equal(meHash('x').length,64);
});
test('cookie origin and path scoping, rotation and clearing',()=>{
 const jar=createMeCookieJar();jar.accept(new Headers({'set-cookie':'session=SYNTHETIC_ONE; Path=/dhhs-apps/aspen/; Secure'}),B);assert.match(jar.header(B),/SYNTHETIC_ONE/);assert.equal(jar.header('https://gateway.maine.gov/elsewhere'),'');
 jar.accept(new Headers({'set-cookie':'session=SYNTHETIC_TWO; Path=/dhhs-apps/aspen/; Secure'}),B);assert.doesNotMatch(jar.header(B),/ONE/);assert.throws(()=>jar.header('https://example.invalid/'));
 assert.throws(()=>jar.accept(new Headers({'set-cookie':'x=y; Domain=example.invalid'}),B));jar.clear();assert.equal(jar.header(B),'');
});
test('noncooperative body cleanup and late transport cannot mint a clean receipt',async()=>{
 const start=Date.now();const {result}=await run({transport:async()=>new Response(new ReadableStream({cancel(){return new Promise(()=>{});}}),{status:403})});
 assert.equal(result.cleanup_verified,false);assert.ok(Date.now()-start<5000);await assert.rejects(persistMeAscReceipt(result));
 const controller=new AbortController();let deliver,cancelled=false;
 const pending=run({signal:controller.signal,transport:()=>new Promise(resolve=>{deliver=resolve;setTimeout(()=>controller.abort(),10);})});
 const late=await pending;assert.equal(late.result.cleanup_verified,false);await assert.rejects(persistMeAscReceipt(late.result));
 deliver(new Response(new ReadableStream({cancel(){cancelled=true;}})));await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true);
});
test('offline parser abort closes its persistent profile and scratch',async()=>{
 const controller=new AbortController(),parser=await createMeOfflineParser(controller.signal,{browserRoot:process.env.ME_ASC_TEST_BROWSER_ROOT??path.join(APP_ROOT,'.playwright-browsers')});
 controller.abort();await assert.rejects(parser.parse(Buffer.from('<label>Provider</label>')));await parser.close();assert.deepEqual(await readdir(path.join(APP_ROOT,'data/tmp/me-asc-parser')),[]);
});
test('changed policy fails before native transport or browser access',async()=>{
 const base=path.join(APP_ROOT,'data/tmp');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'me-policy-test-'));
 try{
  await mkdir(path.join(root,'config/source-policies'),{recursive:true});const policy=JSON.parse(await readFile(path.join(APP_ROOT,'config/source-policies/me-asc-preflight-internal.json'),'utf8'));policy.redistribution='SYNTHETIC_CHANGED_TERMS';
  await writeFile(path.join(root,'config/source-policies/me-asc-preflight-internal.json'),JSON.stringify(policy));
  const source=`import {runMeAscPreflight} from ${JSON.stringify(import.meta.resolve('./me-asc-preflight-session.mjs'))};let called=false;globalThis.fetch=()=>{called=true;throw Error('unexpected transport');};try{await runMeAscPreflight();process.exitCode=2;}catch{if(called)process.exitCode=3;}`;
  await promisify(execFile)(process.execPath,['--input-type=module','-e',source],{env:{...process.env,DATAHUB_ROOT:root},timeout:10000});
  assert.deepEqual((await readdir(root)).sort(),['config']);
 }finally{assert.equal(path.dirname(root),base);await rm(root,{recursive:true,force:true});}
});
test('native CLI rejects unsupported arguments before loading source execution',async()=>{
 await assert.rejects(promisify(execFile)(process.execPath,[path.join(APP_ROOT,'scripts/preflight-me-asc.mjs'),'--unsupported'],{env:{...process.env,DATAHUB_ROOT:path.join(APP_ROOT,'data/tmp/nonexistent-me-cli-root')},timeout:10000,windowsHide:true}),error=>{
  assert.equal(error.code,1);assert.equal(error.stdout,'');assert.equal(error.stderr,'Maine ASC metadata preflight did not complete; inspect local evidence before retry.\n');return true;
 });
});
test('app IPC cancellation drives fixture body and parser cleanup',async()=>{
 const fake=new EventEmitter(),cancellation=createCliCancellation({processRef:fake});let bodyClosed=false,parserClosed=false;
 try{
  const {result}=await run({signal:cancellation.signal,transport:async()=>new Response(new ReadableStream({start(){setImmediate(()=>fake.emit('message',{type:'cancel'}));},cancel(){bodyClosed=true;}}),{headers:{'content-type':'text/html'}}),close:async()=>{parserClosed=true;}});
  assert.equal(cancellation.signal.aborted,true);assert.equal(result.cleanup_verified,true);assert.equal(result.status,'inspection-required');assert.equal(bodyClosed,true);assert.equal(parserClosed,true);
 }finally{cancellation.dispose();}
 assert.equal(fake.listenerCount('message'),0);
});
test('managed bindings reject aliases, invalid paths and synthetic issuance without publication',async()=>{
 const base=path.join(APP_ROOT,'data/me-asc-managed-options-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'run-')),operationId=randomUUID(),output=path.join(root,operationId,'output');
 try{
  assert.deepEqual(await validateMeManagedOptions({output,operationId}),{output,operationId});
  const getter=Object.defineProperty({operationId},'output',{get(){assert.fail('getter forbidden');},enumerable:true});
  for(const options of [getter,{output,operationId,extra:true},{output:'relative',operationId},{output,operationId:randomUUID()},{output:path.join(APP_ROOT,'data/tmp',operationId,'output'),operationId}])await assert.rejects(validateMeManagedOptions(options));
  await mkdir(path.join(root,'actual'));await symlink(path.join(root,'actual'),path.join(root,'alias'),'junction');
  await assert.rejects(validateMeManagedOptions({output:path.join(root,'alias',operationId,'output'),operationId}));
  const {result}=await run();await assert.rejects(persistMeAscReceipt(result,{output,operationId}));assert.deepEqual((await readdir(root)).sort(),['actual','alias']);
 }finally{await unlink(path.join(root,'alias')).catch(()=>{});assert.equal(path.dirname(root),base);await rm(root,{recursive:true,force:true});}
});
test('publication cancellation and recovery retain only a bounded committed descriptor',async()=>{
 const {result}=await run(),before=await readdir(path.join(APP_ROOT,'data/tmp/me-asc-receipts'));
 const early=new AbortController();await assert.rejects(persistMeAscReceiptWithTestHook(result,async stage=>{if(stage==='before-publication')early.abort();},{signal:early.signal}));assert.deepEqual(await readdir(path.join(APP_ROOT,'data/tmp/me-asc-receipts')),before);
 let manifest;try{
  const late=new AbortController(),saved=await persistMeAscReceiptWithTestHook(result,async stage=>{if(stage==='after-publication')late.abort();},{signal:late.signal});manifest=saved.manifest;assert.equal(saved.cancellation_after_publication,true);await readMeAscReceipt(manifest,{expectedSha256:saved.sha256});
 }finally{if(manifest)await removeBundle(manifest);}
 manifest=undefined;try{
  await assert.rejects(persistMeAscReceiptWithTestHook(result,async stage=>{if(stage==='after-publication')throw Error(secret);}),error=>{assert.equal(error.code,'ME_ASC_PUBLICATION_UNCERTAIN');manifest=error.recovery.manifest;assert.doesNotMatch(JSON.stringify(error.recovery),/SYNTHETIC_PRIVATE_VALUE/);assert.deepEqual(Object.keys(error.recovery).sort(),['cancellation_after_publication','execution_mode','manifest','sha256','status']);return true;});
  await readMeAscReceipt(manifest);
 }finally{if(manifest)await removeBundle(manifest);}
});
