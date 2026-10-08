import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { restrictedChildcareExactZipSidecarHttp } from './restricted-childcare-exact-zip-sidecar-http.mjs';

const response=()=>Object.assign(new EventEmitter(),{headers:{},writableEnded:false,destroyed:false,setHeader(k,v){this.headers[k]=v;}});
const request=(method='GET',headers={})=>Object.assign(new EventEmitter(),{method,headers,aborted:false,resume(){}});
const call=async({method='GET',url='http://localhost/api/business-map/restricted-childcare-exact-zip-sidecar?zip=03755',headers={},authorize=()=>true,reader}={})=>{const req=request(method,headers),res=response();let sent;await restrictedChildcareExactZipSidecarHttp(req,res,new URL(url),{authorize,reader},(r,status,body)=>{r.writableEnded=true;sent={status,body};});return sent;};

test('HTTP sidecar validates exact ZIP, authorization and empty GET',async()=>{
  assert.equal((await call({authorize:()=>false})).status,401);
  for(const options of [{method:'POST'},{url:'http://localhost/api/business-map/restricted-childcare-exact-zip-sidecar?zip=0375'},{url:'http://localhost/api/business-map/restricted-childcare-exact-zip-sidecar?zip=03755&extra=1'},{headers:{'content-length':'1'}}])assert.equal((await call(options)).status,400);
  const value=await call();assert.equal(value.status,200);assert.equal(value.body.zip5,'03755');assert.equal(value.body.groups[0].retained_sample_rows,6);
});

test('HTTP sidecar fails closed on reader errors or forged envelopes',async()=>{
  assert.equal((await call({reader:async()=>{throw Error('private')}})).status,503);
  assert.equal((await call({reader:async()=>({})})).status,503);
});

test('server wires the sidecar after the shared control-plane authorization boundary',async()=>{
  const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8'),guard=source.indexOf('controlPlane.authorize(request);'),route=source.indexOf("url.pathname === '/api/business-map/restricted-childcare-exact-zip-sidecar'");
  assert.ok(guard>=0&&route>guard);assert.match(source,/restrictedChildcareExactZipSidecarHttp\(request,response,url,\{authorize:\(\)=>true\},json\)/);
});
