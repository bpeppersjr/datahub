import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile,rm,link,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setImmediate as tick} from 'node:timers/promises';
import {APP_ROOT} from './paths.mjs';
import {normalizeFeatureIndex} from './census-geography.mjs';
import {MN_CONSTRUCTION_COLUMNS} from './mn-construction-preflight.mjs';
import {normalizeMnConstructionRecord} from './mn-construction-normalization.mjs';
import {projectMnConstructionCredential} from './mn-construction-credential-reporting.mjs';
import {aggregateMnCredentialHeatmap} from './mn-credential-heatmap.mjs';
import {createCredentialHeatmapView as create,loadCredentialStateGeometryWithTestInput as readGeometry} from './credential-heatmap-view.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const polygon=(id,state)=>({type:'Feature',properties:{GEOID:id,STUSAB:state,NAME:state},geometry:{type:'Polygon',coordinates:[[[-94,43],[-93,43],[-93,44],[-94,43]]]}});
async function geoFixture(t,change=()=>{}){
 const parent=path.join(APP_ROOT,'data/tmp');await mkdir(parent,{recursive:true});const root=await mkdtemp(path.join(parent,'credential-geo-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const features=[polygon('27','MN'),polygon('55','WI'),polygon('72','PR')],rows=features.map(f=>normalizeFeatureIndex(f,'state','source/states.geojson'));change({features,rows});
 const source=JSON.stringify({type:'FeatureCollection',features}),index=rows.map(r=>JSON.stringify(r)+'\n').join('');
 await mkdir(path.join(root,'source'));await mkdir(path.join(root,'derived/index'),{recursive:true});await writeFile(path.join(root,'source/states.geojson'),source);await writeFile(path.join(root,'derived/index/states.jsonl'),index);
 const artifacts=[{path:'source/states.geojson',sha256:hash(source),bytes:Buffer.byteLength(source),feature_count:features.length,geography_type:'state'},{path:'derived/index/states.jsonl',sha256:hash(index),bytes:Buffer.byteLength(index),record_count:rows.length,artifact_type:'normalized-index'}];
 const manifest=JSON.stringify({schema_version:'1.0.0',dataset_id:'us-census-geography',release_id:'fixture',status:'published',coordinate_reference_system:'EPSG:4326',artifacts});const manifestPath=path.join(root,'manifest.json');await writeFile(manifestPath,manifest);return {manifestPath,manifestSha256:hash(manifest)};
}
async function snapshot(){return aggregateMnCredentialHeatmap([{St:'MN',Zip:'00501',Lic_Number:'BC123456'},{St:'WI',Zip:'00501',Lic_Number:'RR123456'},{St:'WI',Zip:'',Lic_Number:'BC123456'}].map((values,i)=>projectMnConstructionCredential(normalizeMnConstructionRecord({...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,''])),Bus_Pers:'Business',Status:'Issued',Name:'PRIVATE NAME',...values},{runId:'view-fixture',sourceReleaseId:'view-fixture',observedAt:'2026-09-08T12:00:00.000Z',cohort:'residential',sourceFileSha256:'a'.repeat(64),rowNumber:i+1}))));}
async function deps(t){const input=await geoFixture(t),aggregate=await snapshot(),geo=await readGeometry(input);return {aggregate,geo,options:{snapshotLoader:async()=>aggregate,geographyLoader:async()=>geo}};}
test('bounded geography joins exact state identities, excludes valid territories and marks missing peers',async t=>{
 const f=await geoFixture(t),g=await readGeometry(f);assert.equal(g.states.length,51);assert.equal(g.states.find(s=>s.state==='MN').geometryStatus,'available');assert.equal(g.states.find(s=>s.state==='AK').geometryStatus,'missing-index');assert.deepEqual(g.excludedTerritoryGeoids,['72']);assert.equal(g.verificationMode,'synthetic-test-input');
});
test('rehash does not permit duplicate, contradictory, unknown or invalid geometry identities',async t=>{
 for(const change of [({features})=>features.push(features[0]),({rows})=>rows.push(rows[0]),({features})=>features[0].properties.STUSAB='WI',({features})=>features[0].properties.GEOID='99',({features})=>features[0].geometry.type='Point',({features})=>features[0].geometry.coordinates[0][0][0]=181])await assert.rejects(readGeometry(await geoFixture(t,change)));
});
test('hash drift, linked inputs and pre-abort reject; missing polygon is an explicit gap',async t=>{
 const f=await geoFixture(t);await assert.rejects(readGeometry({...f,manifestSha256:'0'.repeat(64)}));const alias=f.manifestPath+'.alias';await link(f.manifestPath,alias);await assert.rejects(readGeometry(f));await unlink(alias);
 const missing=await readGeometry(await geoFixture(t,({features})=>features.shift()));assert.equal(missing.states.find(s=>s.state==='MN').geometryStatus,'missing-polygon');assert.equal(missing.states.find(s=>s.state==='MN').geometry,null);
 const c=new AbortController();c.abort();await assert.rejects(readGeometry(f,{signal:c.signal}),{name:'AbortError'});
});
test('national map stays full while state/category postal summary preserves cohort denominators',async t=>{
 const d=await deps(t),service=create(d.options);t.after(()=>service.close());const value=await service.get({state:'WI',category:'residential-building-contractor'});
 assert.equal(value.nationalStates.length,51);assert.equal(value.nationalStates.find(s=>s.state==='MN').heatValue,1);assert.equal(value.summary.credentialRows,1);assert.equal(value.summary.percentOfAcceptedCohort,1/3*100);
 assert.equal(value.postalGroups.find(z=>z.zip5===null).heatValue,1);assert.equal(value.acceptedCohortRows,3);assert.equal(value.rowsWithoutExistingZipView,null);assert.equal(value.claims.uniqueBusinessCount,null);assert.doesNotMatch(JSON.stringify(value),/PRIVATE NAME|BC123456/);
 const zero=await service.get({state:'AK'});assert.equal(zero.summary.credentialRows,0);assert.equal(zero.generation,value.generation);
});
test('missing geometry never subtracts rows from national values or selected summary',async t=>{
 const aggregate=await snapshot(),geo=await readGeometry(await geoFixture(t,({features})=>features.shift())),service=create({snapshotLoader:async()=>aggregate,geographyLoader:async()=>geo});t.after(()=>service.close());const value=await service.get({state:'MN'});
 assert.equal(value.summary.credentialRows,1);assert.equal(value.displayGaps.selectedCategoryRowsWithoutStateGeometry,1);assert.equal(value.nationalStates.find(s=>s.state==='MN').heatValue,1);
});
test('coalesced callers have independent cancellation; ordinary filters reuse snapshot',async t=>{
 const d=await deps(t),gate=deferred();let calls=0,buildSignal;const service=create({...d.options,snapshotLoader:async signal=>{calls++;buildSignal=signal;await gate.promise;return d.aggregate;}});t.after(()=>service.close());
 const controller=new AbortController(),first=service.get({}, {signal:controller.signal}),second=service.get({state:'MN'});await tick();controller.abort();await assert.rejects(first,{name:'AbortError'});assert.equal(buildSignal.aborted,false);gate.resolve();const value=await second;assert.equal(value.available,true);await service.get({state:'WI'});assert.equal(calls,1);
});
test('all waiters leaving aborts abandoned build and late result cannot publish',async t=>{
 const d=await deps(t),gate=deferred();let signal,calls=0;const service=create({...d.options,snapshotLoader:async s=>{signal=s;if(++calls===1)await gate.promise;return d.aggregate;}});t.after(()=>service.close());
 const c=new AbortController(),first=service.get({}, {signal:c.signal});await tick();c.abort();await assert.rejects(first,{name:'AbortError'});assert.equal(signal.aborted,true);assert.equal((await service.get()).status,'busy-cancelling-prior-build');assert.equal(calls,1);gate.resolve();await tick();const second=await service.get();assert.equal((await service.get()).generation,second.generation);assert.equal(calls,2);
});
test('failed recheck makes data unavailable until explicit recheck succeeds',async t=>{
 const d=await deps(t);let fail=false,calls=0;const service=create({...d.options,snapshotLoader:async()=>{calls++;if(fail)throw Error('PRIVATE FAILURE');return d.aggregate;}});t.after(()=>service.close());const initial=await service.get();fail=true;const failed=await service.get({}, {recheck:true});assert.equal(failed.available,false);assert.equal(failed.acceptedCohortRows,null);assert.doesNotMatch(JSON.stringify(failed),/PRIVATE FAILURE/);await service.get();assert.equal(calls,2);fail=false;assert.ok((await service.get({}, {recheck:true})).generation>initial.generation);
});
test('simultaneous rechecks coalesce; timeout and close bound noncooperative callers',async t=>{
 const d=await deps(t),gate=deferred();let calls=0;const service=create({...d.options,snapshotLoader:async()=>{calls++;await gate.promise;return d.aggregate;}});const a=service.get({}, {recheck:true}),b=service.get({state:'MN'},{recheck:true});await tick();gate.resolve();assert.equal((await a).generation,(await b).generation);assert.equal(calls,1);service.close();assert.equal((await service.get()).status,'closed');
 const slow=create({...d.options,snapshotLoader:()=>new Promise(()=>{}),buildTimeoutMs:5});assert.equal((await slow.get()).available,false);assert.equal((await slow.close()).loaderCleanup,'unverified-timeout');
 const closing=create({...d.options,snapshotLoader:()=>new Promise(()=>{})});const pending=closing.get();closing.close();await assert.rejects(pending,{name:'AbortError'});
});
test('explicit recheck supersedes initial generation and close reports settled cooperative loaders',async t=>{
 const d=await deps(t),gate=deferred();let calls=0;const service=create({...d.options,snapshotLoader:async()=>{if(++calls===1)await gate.promise;return d.aggregate;}});
 const initial=service.get();await tick();const rejected=assert.rejects(initial,{name:'AbortError'});assert.equal((await service.get({}, {recheck:true})).status,'busy-cancelling-prior-build');await rejected;
 gate.resolve();await tick();const next=await service.get({}, {recheck:true});assert.equal(next.generation,2);assert.equal((await service.get()).generation,2);assert.equal((await service.close()).loaderCleanup,'settled');
});
test('repeated rechecks cannot accumulate noncooperative physical loader pairs',async t=>{
 const d=await deps(t),gate=deferred();let snapshotCalls=0,geometryCalls=0;const service=create({snapshotLoader:async()=>{snapshotCalls++;await gate.promise;return d.aggregate;},geographyLoader:async()=>{geometryCalls++;await gate.promise;return d.geo;}});
 const c=new AbortController(),initial=service.get({}, {signal:c.signal});await tick();c.abort();await assert.rejects(initial,{name:'AbortError'});
 for(let i=0;i<20;i++)assert.equal((await service.get({}, {recheck:true})).status,'busy-cancelling-prior-build');assert.equal(snapshotCalls,1);assert.equal(geometryCalls,1);
 gate.resolve();await tick();assert.equal((await service.get({}, {recheck:true})).available,true);assert.equal(snapshotCalls,2);assert.equal(geometryCalls,2);assert.equal((await service.close()).loaderCleanup,'settled');
});
test('invalid filters reject before either loader starts',async()=>{
 let calls=0;const service=create({snapshotLoader:()=>{calls++;},geographyLoader:()=>{calls++;}});for(const query of [{county:'001'},{state:'27'},{category:'all'},{state:'MN',path:'x'}])await assert.rejects(service.get(query));assert.equal(calls,0);service.close();
});
