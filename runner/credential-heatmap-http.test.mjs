import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import {once} from 'node:events';
import {createLocalControlPlaneGuard} from './control-plane-security.mjs';
import {credentialHeatmapHttp,credentialHeatmapQuery} from './credential-heatmap-http.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function request(method='GET',body=[]){const req=Readable.from(body);req.method=method;req.headers=body.length?{'content-length':String(body.reduce((n,b)=>n+b.length,0))}:{};const res=new EventEmitter();res.writableEnded=false;res.destroyed=false;return {req,res};}
async function call(query='',method='GET',body=[],view={get:async()=>({available:true})}){const {req,res}=request(method,body);let result;await credentialHeatmapHttp(req,res,new URL(`http://localhost/api/credential-heatmap${query}`),view,(_r,status,value)=>{result={status,value};res.writableEnded=true;});return result;}
test('closed credential query rejects duplicates, business filters, arbitrary paths and invalid enum values',()=>{
  assert.deepEqual(credentialHeatmapQuery(new URLSearchParams('state=MN&category=residential-roofer')),{state:'MN',category:'residential-roofer'});
  for(const query of ['state=MN&state=WI','state=27','category=all','county=001','source=x','path=data/x','state=','zip=55101','__proto__=x'])assert.throws(()=>credentialHeatmapQuery(new URLSearchParams(query)),{statusCode:400});
});
test('GET reuses snapshot and empty POST explicitly rechecks without arbitrary body or method options',async()=>{
  const calls=[],view={get:async(...args)=>{calls.push(args);return {available:true};}};
  assert.equal((await call('?state=MN','GET',[],view)).status,200);
  assert.equal(calls[0][1].recheck,false);assert.ok(calls[0][1].signal instanceof AbortSignal);
  assert.equal((await call('?category=residential-roofer','POST',[],view)).status,200);assert.equal(calls[1][1].recheck,true);
  assert.equal((await call('','POST',[Buffer.from('{"source":"SECRET"}')],view)).status,400);
  assert.equal((await call('','DELETE',[],view)).status,405);assert.equal(calls.length,2);
});
test('disconnect aborts this service waiter and suppresses late response; private errors stay redacted',async()=>{
  const {req,res}=request();let signal,resolve,sent=false;
  const pending=credentialHeatmapHttp(req,res,new URL('http://localhost/api/credential-heatmap'),{get:(_q,o)=>{signal=o.signal;return new Promise(r=>{resolve=r;});}},()=>{sent=true;});
  await tick();res.destroyed=true;res.emit('close');assert.equal(signal.aborted,true);resolve({available:true});await pending;assert.equal(sent,false);assert.equal(res.listenerCount('close'),0);
  const result=await call('','GET',[],{get:async()=>{throw Error('SECRET path/token');}});assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result),/SECRET|token/);
});
test('server route stays behind shared authentication and awaits view cleanup on shutdown',async()=>{
  const code=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
  assert.ok(code.indexOf('controlPlane.authorize(request)')<code.indexOf("url.pathname === '/api/credential-heatmap'"));
  assert.match(code,/await credentialHeatmapView.close\(\)/);assert.match(code,/loaderCleanup!=='settled'/);
});

test('real authenticated HTTP rejects fixed/chunked bodies promptly and aborts abandoned waiter',async t=>{
  let guard,calls=0,signal,release;
  const token='credential-heatmap-isolated-fixture-token-2026';
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const view={get:async(_q,options)=>{calls++;if(calls===1)return {available:true};signal=options.signal;return new Promise(resolve=>{release=resolve;});}};
  const server=http.createServer(async(req,res)=>{try{guard.prepare(req,res);guard.authorize(req);await credentialHeatmapHttp(req,res,new URL(req.url,'http://localhost'),view,json);}catch(error){json(res,error.statusCode??500,{error:'Rejected'});}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
  guard=createLocalControlPlaneGuard({host:'127.0.0.1',port,controlToken:token});
  t.after(async()=>{release?.({available:false});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const url=`http://127.0.0.1:${port}/api/credential-heatmap`;
  assert.equal((await fetch(url)).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`}})).status,200);
  assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:'{}',signal:AbortSignal.timeout(1000)})).status,400);
  const chunked=http.request(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Transfer-Encoding':'chunked'}});
  chunked.on('error',()=>{});const rejected=once(chunked,'response');chunked.write('x');
  const [response]=await Promise.race([rejected,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Chunked body rejection did not finish.')),1000);timer.unref();})]);
  assert.equal(response.statusCode,400);response.resume();chunked.destroy();assert.equal(calls,1);
  const controller=new AbortController(),pending=fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});const cancelled=assert.rejects(pending,{name:'AbortError'});
  for(let i=0;i<50&&!signal;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(signal);controller.abort();await cancelled;
  for(let i=0;i<50&&!signal.aborted;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(signal.aborted,true);release({available:true});
});
