import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {zctaDemographicReadinessHttp} from './zcta-demographic-readiness-http.mjs';

const sample=zcta=>({schema_version:'zcta-demographic-readiness-view@1.0.0',zcta,available:false,status:'not-found',readiness:null});
async function call({method='GET',query='?zcta=00601',headers={},reader=({zcta})=>sample(zcta)}={}){let reply,reads=0,cache;const request=Object.assign(new EventEmitter(),{method,headers,resume(){}}),response=Object.assign(new EventEmitter(),{writableEnded:false,destroyed:false,setHeader(name,value){if(name==='Cache-Control')cache=value;}});await zctaDemographicReadinessHttp(request,response,new URL(`http://local/${query}`),async opts=>{reads++;return reader(opts);},(_r,status,body)=>{reply={status,body};});return {...reply,reads,cache};}

test('accepts exactly one empty GET and disables caching',async()=>{const result=await call({});assert.equal(result.status,200);assert.equal(result.reads,1);assert.equal(result.cache,'no-store');assert.deepEqual(result.body,sample('00601'));for(const input of [{method:'POST'},{query:''},{query:'?zcta=601'},{query:'?zcta=00601&zcta=00602'},{query:'?zcta=00601&extra=1'},{headers:{'content-length':'2'}},{headers:{'transfer-encoding':'chunked'}}]){const bad=await call(input);assert.equal(bad.status,400);assert.equal(bad.reads,0);}});

test('redacts reader failures and aborts on disconnect',async()=>{const failed=await call({reader:()=>{throw Error('C:/secret/token-value');}});assert.equal(failed.status,503);assert.doesNotMatch(JSON.stringify(failed.body),/secret|token-value/);let signal,writes=0;const request=Object.assign(new EventEmitter(),{method:'GET',headers:{},resume(){}}),response=Object.assign(new EventEmitter(),{writableEnded:false,destroyed:false,setHeader(){}});const pending=zctaDemographicReadinessHttp(request,response,new URL('http://local/?zcta=00601'),async opts=>{signal=opts.signal;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('private')),{once:true}));},()=>writes++);request.emit('aborted');await pending;assert.equal(signal.aborted,true);assert.equal(writes,0);});

test('server wires the protected demographic readiness route',async()=>{const server=await readFile(new URL('./server.mjs',import.meta.url),'utf8'),authorize=server.indexOf('controlPlane.authorize(request)'),route=server.indexOf("url.pathname === '/api/business-map/zcta-demographic-readiness'");assert.ok(authorize>=0&&route>authorize);assert.match(server,/zctaDemographicReadinessHttp\(request,response,url,readZctaDemographicReadiness,json\)/);});
