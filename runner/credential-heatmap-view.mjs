import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';
import {normalizeFeatureIndex} from './census-geography.mjs';
import {buildMnCredentialHeatmap,selectMnCredentialHeatmap} from './mn-credential-heatmap.mjs';
import {CREDENTIAL_COVERAGE_CATEGORIES as CATEGORIES} from './credential-coverage.mjs';

const RELEASE='us-census-geography-20260830-132803990Z-3629abc0';
const MANIFEST=`data/geography/releases/${RELEASE}/manifest.json`;
const HASH='5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b';
const PAIRS='01:AL 02:AK 04:AZ 05:AR 06:CA 08:CO 09:CT 10:DE 11:DC 12:FL 13:GA 15:HI 16:ID 17:IL 18:IN 19:IA 20:KS 21:KY 22:LA 23:ME 24:MD 25:MA 26:MI 27:MN 28:MS 29:MO 30:MT 31:NE 32:NV 33:NH 34:NJ 35:NM 36:NY 37:NC 38:ND 39:OH 40:OK 41:OR 42:PA 44:RI 45:SC 46:SD 47:TN 48:TX 49:UT 50:VT 51:VA 53:WA 54:WV 55:WI 56:WY 60:AS 66:GU 69:MP 72:PR 78:VI'.split(' ').map(v=>v.split(':'));
const FIPS=new Map(PAIRS),PEERS=PAIRS.slice(0,51);
const fail=()=>{throw Error('Credential heatmap view evidence rejected.');};
const check=v=>{if(!v)fail();};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const pct=(n,d)=>d?n/d*100:null;
function object(v,keys){check(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));}
function dense(v,max){check(Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1);for(let i=0;i<v.length;i++)check(Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))??{},'value'));}
function geometry(value,budget){
 check(value&&['Polygon','MultiPolygon'].includes(value.type));dense(value.coordinates,10000);
 const polygons=value.type==='Polygon'?[value.coordinates]:value.coordinates;check(polygons.length>0);
 for(const polygon of polygons){dense(polygon,10000);check(polygon.length>0);for(const ring of polygon){dense(ring,500000);check(ring.length>=4);
  for(const point of ring){dense(point,2);check(point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90);check(++budget.points<=500000);}
  check(same(ring[0],ring.at(-1)));
 }}
}
const stable=(a,b)=>['ino','dev','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);
async function loadGeometry(manifestPath,expectedHash,signal,synthetic){
 signal?.throwIfAborted();const mm={},manifest=await readJson(manifestPath,1000000,signal,mm);
 check(mm.sha256===expectedHash&&manifest.schema_version==='1.0.0'&&manifest.dataset_id==='us-census-geography'&&manifest.status==='published'&&manifest.coordinate_reference_system==='EPSG:4326');
 if(!synthetic)check(manifest.release_id===RELEASE);dense(manifest.artifacts,10000);
 const roster=[['derived/index/states.jsonl',100000,'record_count'],['source/states.geojson',8000000,'feature_count']],artifacts=[];
 for(const [relative,max,count] of roster){const found=manifest.artifacts.filter(a=>a.path===relative);check(found.length===1);const a=found[0];check(Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=max&&sha(a.sha256)&&Number.isSafeInteger(a[count])&&a[count]>=0&&a[count]<=56);
  check(count==='record_count'?a.artifact_type==='normalized-index':a.geography_type==='state');artifacts.push(a);}
 const directory=path.dirname(manifestPath),index=[],im={},pm={};
 for await(const row of readLines(path.join(directory,roster[0][0]),roster[0][1],signal,im)){check(index.length<56);index.push(row);}
 const polygons=await readJson(path.join(directory,roster[1][0]),roster[1][1],signal,pm);
 check(polygons.type==='FeatureCollection');dense(polygons.features,56);
 for(const [i,meter] of [im,pm].entries())check(meter.sha256===artifacts[i].sha256&&meter.bytes===artifacts[i].bytes);
 check(index.length===artifacts[0].record_count&&polygons.features.length===artifacts[1].feature_count);
 const rows=new Map(),features=new Map(),budget={points:0};
 for(const row of index){check(row&&FIPS.has(row.geoid)&&FIPS.get(row.geoid)===row.postal_abbreviation&&row.geo_type==='state'&&row.geo_id===`state:${row.geoid}`&&row.state_fips===row.geoid&&row.county_fips===null&&row.zcta===null&&row.is_50_states_or_dc===PEERS.some(([id])=>id===row.geoid)&&row.geometry_file==='source/states.geojson'&&!rows.has(row.geoid));rows.set(row.geoid,row);}
 for(const feature of polygons.features){signal?.throwIfAborted();check(feature?.type==='Feature'&&feature.properties&&FIPS.has(feature.properties.GEOID)&&FIPS.get(feature.properties.GEOID)===feature.properties.STUSAB&&!features.has(feature.properties.GEOID));geometry(feature.geometry,budget);
  const normalized=normalizeFeatureIndex(feature,'state','source/states.geojson');if(rows.has(normalized.geoid))check(same(rows.get(normalized.geoid),normalized));
  check(typeof normalized.name==='string'&&normalized.name.length>0&&normalized.name.length<=100&&!/[\u0000-\u001f]/u.test(normalized.name));features.set(normalized.geoid,{name:normalized.name,geometry:feature.geometry});await yieldTurn(undefined,{signal});}
 // Rehash each selected file, then the manifest, preserving the three-file boundary.
 for(const [i,before] of [[1,pm],[0,im]]){const after={};if(i===0){for await(const row of readLines(path.join(directory,roster[i][0]),roster[i][1],signal,after))void row;}else await readJson(path.join(directory,roster[i][0]),roster[i][1],signal,after);check(after.sha256===before.sha256&&stable(before.identity,after.identity));}
 const final={};await readJson(manifestPath,1000000,signal,final);check(final.sha256===mm.sha256&&stable(mm.identity,final.identity));signal?.throwIfAborted();
 return freeze({verificationMode:synthetic?'synthetic-test-input':'verified-fixed-state-geometry',pins:{manifestPath:path.relative(APP_ROOT,manifestPath).replaceAll('\\','/'),manifestSha256:mm.sha256,releaseId:manifest.release_id,artifacts:artifacts.map(a=>({path:a.path,bytes:a.bytes,sha256:a.sha256,records:a.record_count??a.feature_count}))},
  states:PEERS.map(([stateFips,state])=>({stateFips,state,name:features.get(stateFips)?.name??state,
   geometryStatus:!rows.has(stateFips)?'missing-index':!features.has(stateFips)?'missing-polygon':'available',geometry:rows.has(stateFips)?features.get(stateFips)?.geometry??null:null})),
  excludedTerritoryGeoids:PAIRS.slice(51).filter(([id])=>rows.has(id)||features.has(id)).map(([id])=>id)});
}
export async function loadCredentialStateGeometry({signal}={}){return loadGeometry(path.join(APP_ROOT,MANIFEST),HASH,signal,false);}
export async function loadCredentialStateGeometryWithTestInput(input,{signal}={}){object(input,['manifestPath','manifestSha256']);check(typeof input.manifestPath==='string'&&path.isAbsolute(input.manifestPath)&&sha(input.manifestSha256));const rel=path.relative(path.join(APP_ROOT,'data/tmp'),input.manifestPath);check(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel)&&path.basename(input.manifestPath)==='manifest.json');return loadGeometry(input.manifestPath,input.manifestSha256,signal,true);}

function filters(value){object(value,['state','category']);if(value.state!==undefined)check(PEERS.some(([,s])=>s===value.state));if(value.category!==undefined)check(CATEGORIES.includes(value.category));return {...value};}
function response(snapshot,geo,selection,generation,verifiedAt,synthetic){
 const full=selectMnCredentialHeatmap(snapshot,selection.category===undefined?{}:{category:selection.category});
 const selected=selectMnCredentialHeatmap(snapshot,selection);const geography=new Map(geo.states.map(s=>[s.state,s]));
 const nationalStates=full.states.map(row=>{const g=geography.get(row.state),cell=selection.category===undefined?null:row.categories[0];return {...g,credentialRows:row.credentialRows,heatValue:row.heatValue,percentOfAcceptedCohort:pct(row.heatValue,snapshot.acceptedCohortRows),categoryWithinState:cell?.categoryWithinState??null,stateShareOfCategory:cell?.stateShareOfCategory??null};});
 return freeze({schemaVersion:'credential-heatmap-view@1.0.0',available:true,status:'available',verificationMode:synthetic?'synthetic-test-input':'verified-retained-snapshot',generation,verifiedAt,
  sourceObservedAt:snapshot.pins?.sourceObservedAt??null,evidence:{credential:snapshot.pins,geography:geo.pins},selection:{state:selection.state??null,category:selection.category??null},
  acceptedCohortRows:snapshot.acceptedCohortRows,missingZip5Rows:snapshot.missingZip5Rows,outside50DcOrUnresolvedRows:snapshot.outside50DcOrUnresolvedRows,
  nationalStates,postalGroups:selected.zips,summary:{credentialRows:selected.selectedCredentialRows,filteredOutCredentialRows:selected.filteredOutCredentialRows,
   percentOfAcceptedCohort:pct(selected.selectedCredentialRows,snapshot.acceptedCohortRows),state:selection.state?selected.states[0]:null},
  displayGaps:{states:nationalStates.filter(r=>r.geometryStatus!=='available').map(r=>r.state),selectedCategoryRowsWithoutStateGeometry:nationalStates.filter(r=>r.geometryStatus!=='available').reduce((n,r)=>n+r.heatValue,0),excludedTerritoryGeoids:geo.excludedTerritoryGeoids},
  percentageDenominators:{...snapshot.percentageDenominators,summaryPercentOfAcceptedCohort:'all accepted credential rows; display filters never shrink this denominator'},
  existingZipViewMembership:'not-evaluated',rowsWithoutExistingZipView:null,claims:snapshot.claims});
}
const abortError=()=>new DOMException('Credential heatmap request cancelled.','AbortError');
const unavailable=(generation,status='unavailable')=>freeze({schemaVersion:'credential-heatmap-view@1.0.0',available:false,status,generation,verifiedAt:null,acceptedCohortRows:null,nationalStates:[],postalGroups:[],summary:null});

/** One in-memory snapshot; no filesystem cache or automatic acquisition. */
export function createCredentialHeatmapView(dependencies={}){
 object(dependencies,['snapshotLoader','geographyLoader','now','buildTimeoutMs']);
 const synthetic=Object.hasOwn(dependencies,'snapshotLoader')||Object.hasOwn(dependencies,'geographyLoader');
 const snapshotLoader=dependencies.snapshotLoader??(signal=>buildMnCredentialHeatmap({selection:'config/mn-credential-registry-selection.json',signal}));
 const geographyLoader=dependencies.geographyLoader??(signal=>loadCredentialStateGeometry({signal}));
 const now=dependencies.now??(()=>new Date().toISOString()),timeout=dependencies.buildTimeoutMs??180000;
 check(typeof snapshotLoader==='function'&&typeof geographyLoader==='function'&&typeof now==='function'&&Number.isSafeInteger(timeout)&&timeout>=1&&timeout<=180000);
 let generation=0,pending=null,saved=null,closed=false,failed=false,closing;const workers=new Set();
 function finish(build,result,error){if(build.done)return;build.done=true;clearTimeout(build.timer);if(pending===build)pending=null;
  for(const waiter of build.waiters){waiter.cleanup();if(error)waiter.reject(error);else waiter.resolve(result);}build.waiters.clear();}
 function cancel(build){build.controller.abort();finish(build,null,abortError());}
 function start(recheck){const build={generation:++generation,recheck,controller:new AbortController(),waiters:new Set(),done:false};pending=build;saved=null;failed=false;
  build.timer=setTimeout(()=>{if(pending===build){failed=true;build.controller.abort();finish(build,unavailable(build.generation));}},timeout);
  const parts=[snapshotLoader,geographyLoader].map(loader=>Promise.resolve().then(()=>{build.controller.signal.throwIfAborted();return loader(build.controller.signal);}));
  const settled=Promise.allSettled(parts);workers.add(settled);settled.then(()=>workers.delete(settled));
  build.work=Promise.all(parts).then(([snapshot,geo])=>{
   if(build.done||pending!==build||closed||build.controller.signal.aborted)return;
   check(snapshot.verificationMode==='verified-retained-snapshot'||synthetic);check(geo.verificationMode==='verified-fixed-state-geometry'||synthetic);
   const verifiedAt=now();check(typeof verifiedAt==='string'&&new Date(verifiedAt).toISOString()===verifiedAt);
   // Force projection validation before any snapshot becomes service-visible.
   response(snapshot,geo,{},build.generation,verifiedAt,synthetic);saved={snapshot,geo,generation:build.generation,verifiedAt};failed=false;finish(build,saved);
  }).catch(()=>{if(build.done)return;if(pending===build){failed=true;build.controller.abort();finish(build,unavailable(build.generation));}});
  return build;
 }
 return {
  async get(query={},options={}){const selection=filters(query);object(options,['signal','recheck']);const {signal,recheck=false}=options;check(signal===undefined||signal instanceof AbortSignal);check(typeof recheck==='boolean');signal?.throwIfAborted();if(closed)return unavailable(generation,'closed');
   if(recheck&&pending&&!pending.recheck){cancel(pending);}if(recheck&&!pending){saved=null;failed=false;}
   if(saved&&!recheck)return response(saved.snapshot,saved.geo,selection,saved.generation,saved.verifiedAt,synthetic);
   // Cancellation cannot force arbitrary loaders to settle. Never accumulate
   // physical pairs while a superseded/abandoned pair is still unwinding.
   if(!pending&&workers.size)return unavailable(generation,'busy-cancelling-prior-build');
   if(failed&&!recheck)return unavailable(generation);
   const build=pending??start(recheck);
   const value=await new Promise((resolve,reject)=>{const waiter={resolve,reject,cleanup:()=>signal?.removeEventListener('abort',onAbort)};
    const onAbort=()=>{waiter.cleanup();build.waiters.delete(waiter);reject(signal.reason??abortError());if(!build.waiters.size&&!build.done){build.controller.abort();finish(build,null,abortError());}};
    build.waiters.add(waiter);signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();});
   if(value.available===false)return value;return response(value.snapshot,value.geo,selection,value.generation,value.verifiedAt,synthetic);
  },
  close(){if(closing)return closing;closed=true;saved=null;if(pending)cancel(pending);
   closing=(async()=>{let timer;try{const settled=await Promise.race([Promise.all([...workers]).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]);
    return {closed:true,loaderCleanup:settled?'settled':'unverified-timeout'};
   }finally{clearTimeout(timer);}})();return closing;
  },
 };
}
