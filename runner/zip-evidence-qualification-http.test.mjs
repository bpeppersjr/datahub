import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {once} from 'node:events';
import http from 'node:http';
import {createLocalControlPlaneGuard} from './control-plane-security.mjs';
import {readFile} from 'node:fs/promises';
import {projectZipEvidenceQualification,zipEvidenceQualificationHttp,zipEvidenceQualificationPreflight} from './zip-evidence-qualification-http.mjs';
import {qualificationFixture} from './zip-evidence-qualification-test-fixtures.mjs';
const scope={zip:'00501',categoryId:'all'};
async function call({method='GET',query='?zip=00501',authorize=()=>true,value=qualificationFixture()}={}){let reply,reads=0;const request=Object.assign(new EventEmitter(),{method}),response=Object.assign(new EventEmitter(),{writableEnded:false,setHeader(){}});await zipEvidenceQualificationHttp(request,response,new URL(`http://local/proposed${query}`),{authorize,reader:async()=>{reads++;return value;}},(_r,status,body)=>{reply={status,body};});return {...reply,reads};}
test('authentication precedes lookup and exact GET ZIP/category validation',async()=>{
 for(const authorize of [undefined,()=>false,()=>{throw Error('secret');}]){const input=authorize===undefined?()=>undefined:authorize;const result=await call({authorize:input});assert.equal(result.status,401);assert.equal(result.reads,0);assert.doesNotMatch(JSON.stringify(result),/secret/);}
 for(const query of ['', '?zip=501','?zip=00501&zip=12345','?zip=00501&category=all&category=all','?zip=00501&category=unknown','?zip=00501&token=secret']){const r=await call({query});assert.equal(r.status,400);assert.equal(r.reads,0);}
 assert.equal((await call({method:'POST'})).status,400);assert.equal((await call()).status,200);
});
test('whitelist strips paths/metadata and preserves source units, policy and null claims',()=>{
 const value=qualificationFixture();value.secret='private';value.release.local_path='C:/secret';value.rows[0].source_reference_metadata={token:'private'};
 const result=projectZipEvidenceQualification(value,scope);assert.doesNotMatch(JSON.stringify(result),/secret|private|local_path|source_reference_metadata/);assert.equal(result.export_policy,'internal');assert.deepEqual(result.rows[0].evidence_counts_by_unit,{retailer_count:9});assert.equal(result.claims.active_business_count,null);
 for(const[qualification,total]of [['measured-within-review-window',9],['measured-stale-review-due',0],['unmeasured',null]])assert.equal(projectZipEvidenceQualification(qualificationFixture({qualification}),scope).rows[0].eligible_evidence_counts_by_unit.retailer_count,total);
});
test('unavailable, absent and unsupported remain distinct without invented zero rows',async()=>{
 for(const selection_status of ['absent','unsupported']){const value=qualificationFixture();value.selection_status=selection_status;value.rows=[];const r=await call({value});assert.equal(r.status,200);assert.equal(r.body.selection_status,selection_status);assert.deepEqual(r.body.rows,[]);}
 const r=await call({value:{available:false,status:'not-enrolled',zip5:'00501',category_id:'all',rows:[{private:'secret'}]}});assert.equal(r.body.release,null);assert.deepEqual(r.body.rows,[]);assert.equal(r.body.claims.all_business_completion_percent,null);
});
test('rejects incompatible scope, overclaims, policy escalation, malformed and oversized rows',async()=>{
 for(const mutate of [v=>v.zip5='12345',v=>v.category_id='health-care',v=>v.claims.active_business_count=1,v=>v.claims.current_operations_verified=true,v=>v.export_policy='public',v=>v.rows.push(v.rows[0]),v=>v.rows=Array(31).fill(v.rows[0]),v=>v.rows[0].eligible_evidence_counts_by_unit.retailer_count=0,v=>v.rows[0].temporal_status.status='review-due',v=>v.bindings.mapping_sha256='bad',v=>v.rows[0].source_key='C:/private',v=>v.rows[0].evidence_counts_by_unit.retailer_count=-1]){const value=qualificationFixture();mutate(value);const r=await call({value});assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r),/private/);}
});
test('disconnect aborts injected reader without response or leaked listeners',async()=>{
 const request=Object.assign(new EventEmitter(),{method:'GET'}),response=Object.assign(new EventEmitter(),{writableEnded:false});let signal,writes=0;
 const pending=zipEvidenceQualificationHttp(request,response,new URL('http://local/?zip=00501'),{authorize:()=>true,reader:async options=>{signal=options.signal;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error()),{once:true}));}},()=>writes++);
 await new Promise(resolve=>setImmediate(resolve));request.emit('aborted');await pending;assert.equal(signal.aborted,true);assert.equal(writes,0);assert.equal(request.listenerCount('aborted'),0);assert.equal(response.listenerCount('close'),0);
});
test('prepared browser preflight precedes bearer authorization while actual lookup follows full guard',async()=>{const code=await readFile(new URL('./zip-evidence-qualification-http.mjs',import.meta.url),'utf8'),server=await readFile(new URL('./server.mjs',import.meta.url),'utf8');assert.doesNotMatch(code,/\bimport\b|buildZip|verifyZip|readFile|readLines/);assert.ok(server.indexOf('controlPlane.prepare(request, response);')<server.indexOf('zipEvidenceQualificationPreflight(request,response,json);'));assert.ok(server.indexOf('zipEvidenceQualificationPreflight(request,response,json);')<server.indexOf('controlPlane.authorize(request);'));assert.ok(server.indexOf('controlPlane.authorize(request);')<server.indexOf('await zipEvidenceQualificationHttp'));assert.match(server,/reader:readZipEvidenceQualification,authorize:incoming=>\{\s*controlPlane\.prepare\(incoming,response\);controlPlane\.authorize\(incoming\);return true;/);assert.doesNotMatch(server,/url\.pathname !== '\/api\/business-map\/zip-evidence-qualification'/);});

test('real HTTP full guard rejects Host Origin bearer and body writes before any read',async t=>{
 const token='fixture-qualification-control-token-at-least-32-bytes';let guard,reads=0;
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 const server=http.createServer(async(req,res)=>{try{guard.prepare(req,res);if(req.method==='OPTIONS'){zipEvidenceQualificationPreflight(req,res,json);return;}guard.authorize(req);await zipEvidenceQualificationHttp(req,res,new URL(req.url,`http://${req.headers.host}`),{authorize:r=>{guard.prepare(r,res);guard.authorize(r);return true;},reader:async()=>{reads++;return qualificationFixture();}},json);}catch(error){json(res,error.statusCode??503,{error:'Rejected'});}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;guard=createLocalControlPlaneGuard({host:'127.0.0.1',port,controlToken:token,allowedOrigins:['http://localhost:3000']});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const request=({headers={},method='GET',body,authorized=true,details=false}={})=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/api/business-map/zip-evidence-qualification?zip=00501',method,headers:{Host:`127.0.0.1:${port}`,...(authorized?{Authorization:`Bearer ${token}`} :{}),Connection:'close',...headers}},res=>{res.resume();res.on('end',()=>resolve(details?{status:res.statusCode,headers:res.headers}:res.statusCode));});req.on('error',reject);req.end(body);});
 const preflightHeaders={Origin:'http://localhost:3000','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'};
 const preflight=await request({method:'OPTIONS',authorized:false,headers:preflightHeaders,details:true});assert.equal(preflight.status,204);assert.equal(preflight.headers['access-control-allow-origin'],'http://localhost:3000');assert.equal(preflight.headers['access-control-allow-methods'],'GET');assert.equal(preflight.headers['access-control-allow-headers'],'Authorization');assert.equal(reads,0);
 for(const [headers,status]of [[{Host:'evil.example'},400],[{Origin:'https://evil.example'},403],[{'Access-Control-Request-Method':'POST'},400],[{'Access-Control-Request-Headers':'authorization,x-secret'},400],[{'Access-Control-Request-Headers':'content-type'},400],[{'Access-Control-Request-Headers':''},400]])assert.equal(await request({method:'OPTIONS',authorized:false,headers:{...preflightHeaders,...headers}}),status);
 assert.equal(reads,0);assert.equal(await request({authorized:false,headers:{Origin:'http://localhost:3000'}}),401);assert.equal(reads,0);
 assert.equal(await request({headers:{Host:'evil.example'}}),400);assert.equal(await request({headers:{Origin:'https://evil.example'}}),403);assert.equal(await request({headers:{Authorization:'Bearer wrong'}}),401);
 for(const method of ['POST','OPTIONS','DELETE'])assert.equal(await request({method}),400);
 assert.equal(await request({headers:{'Content-Length':'1'},body:'x'}),400);assert.equal(await request({headers:{'Transfer-Encoding':'chunked'},body:'x'}),400);assert.equal(reads,0);
 assert.equal(await request({headers:{Origin:'http://localhost:3000'}}),200);assert.equal(reads,1);
});

test('deadline responds503 even when reader resolves after abort; pre-aborted requests write nothing',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let reply;
 const request=Object.assign(new EventEmitter(),{method:'GET'}),response=Object.assign(new EventEmitter(),{writableEnded:false});
 const pending=zipEvidenceQualificationHttp(request,response,new URL('http://local/?zip=00501'),{authorize:()=>true,reader:({signal})=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve(qualificationFixture()),{once:true}))},(_r,status)=>{reply=status;});
 await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(30000);await pending;assert.equal(reply,503);assert.equal(request.listenerCount('aborted'),0);
 let writes=0;request.aborted=true;response.destroyed=true;await zipEvidenceQualificationHttp(request,response,new URL('http://local/?zip=00501'),{authorize:()=>true,reader:()=>{throw Error('must not read');}},()=>writes++);assert.equal(writes,0);
});
