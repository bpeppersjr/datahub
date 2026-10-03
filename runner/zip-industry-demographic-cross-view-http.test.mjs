import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {zipIndustryDemographicCrossViewHttp} from './zip-industry-demographic-cross-view-http.mjs';

const sample=zip5=>({schema_version:'zip-industry-demographic-cross-view@1.0.0',zip5,status:'not-applicable-no-same-code-zcta'});
async function call({method='GET',query='?zip=00601',headers={},reader=({zip5})=>sample(zip5)}={}){let reply,reads=0,cache;const request=Object.assign(new EventEmitter(),{method,headers,resume(){}}),response=Object.assign(new EventEmitter(),{writableEnded:false,destroyed:false,setHeader(name,value){if(name==='Cache-Control')cache=value;}});await zipIndustryDemographicCrossViewHttp(request,response,new URL(`http://local/${query}`),async opts=>{reads++;return reader(opts);},(_r,status,body)=>{reply={status,body};});return {...reply,reads,cache};}

test('accepts one bodyless exact-ZIP GET and disables caching',async()=>{const result=await call();assert.equal(result.status,200);assert.equal(result.reads,1);assert.equal(result.cache,'no-store');assert.deepEqual(result.body,sample('00601'));for(const input of [{method:'POST'},{query:''},{query:'?zip=601'},{query:'?zip=00601&zip=00602'},{query:'?zip=00601&extra=1'},{headers:{'content-length':'2'}},{headers:{'transfer-encoding':'chunked'}}]){const bad=await call(input);assert.equal(bad.status,400);assert.equal(bad.reads,0);}});

test('redacts failures and aborts bounded reads on disconnect',async()=>{const failed=await call({reader:()=>{throw Error('C:/secret/token-value');}});assert.equal(failed.status,503);assert.doesNotMatch(JSON.stringify(failed.body),/secret|token-value/);let signal,writes=0;const request=Object.assign(new EventEmitter(),{method:'GET',headers:{},resume(){}}),response=Object.assign(new EventEmitter(),{writableEnded:false,destroyed:false,setHeader(){}});const pending=zipIndustryDemographicCrossViewHttp(request,response,new URL('http://local/?zip=00601'),async opts=>{signal=opts.signal;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('private')),{once:true}));},()=>writes++);request.emit('aborted');await pending;assert.equal(signal.aborted,true);assert.equal(writes,0);});

test('server wires the route after shared authentication',async()=>{const server=await readFile(new URL('./server.mjs',import.meta.url),'utf8'),authorize=server.indexOf('controlPlane.authorize(request)'),route=server.indexOf("url.pathname === '/api/business-map/zip-industry-demographic-cross-view'");assert.ok(authorize>=0&&route>authorize);assert.match(server,/zipIndustryDemographicCrossViewHttp\(request,response,url,readZipIndustryDemographicCrossView,json\)/);});
