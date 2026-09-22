import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,unlink,rmdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {NE_ALLOWED_URLS,runNeChildcareAggregatePreflight,runNeChildcareAggregatePreflightWithTestTransport,verifyNeChildcarePreflightBundle} from './ne-childcare-aggregate-preflight.mjs';

const categories=['Child Care Center','Provisional Child Care Center'];
function payload(step) {
  if(step==='item')return {id:'d3d3f44cb252424fb2f76e27162f534c',orgId:'Sj9eBhzWwOMzQCfI',owner:'Builtin_User',url:'https://gis.ne.gov/Agency/rest/services/DHHS_Licensed_Child_Care/FeatureServer',accessInformation:'DHHS DPH Licensure, DHHS GIS'};
  if(step==='service')return {serviceItemId:'4fce65a576fd49489db42f49b669fc79',maxRecordCount:2000,layers:[{id:0,name:'DHHS Licensed Child Care'}],capabilities:'Query,Extract'};
  if(step==='layer')return {id:0,objectIdField:'OBJECTID',geometryType:'esriGeometryPoint',spatialReference:{wkid:4326},advancedQueryCapabilities:{supportsStatistics:true},fields:[{name:'OBJECTID',type:'esriFieldTypeOID'},...Object.entries({Full_Name:'esriFieldTypeString',License_Type:'esriFieldTypeString',License_Number:'esriFieldTypeString',Address:'esriFieldTypeString',Address_2:'esriFieldTypeString',City:'esriFieldTypeString',State:'esriFieldTypeString',County:'esriFieldTypeString',Zip_Code1:'esriFieldTypeDouble',Zip4:'esriFieldTypeString',Issue_Date:'esriFieldTypeDate',Roster_Date:'esriFieldTypeDateOnly',Geocoded_Date:'esriFieldTypeDateOnly',GIS_Status:'esriFieldTypeString'}).map(([name,type])=>({name,type}))],types:categories.map(name=>({name}))};
  if(step==='counts')return {features:[{attributes:{License_Type:categories[0],center_rows:699}},{attributes:{License_Type:categories[1],center_rows:51}}]};
  return {features:categories.map(category=>({attributes:{License_Type:category,roster_rows:category===categories[0]?699:51,roster_min:'2025-10-15',roster_max:'2025-10-15'}}))};
}
const response=(value,status=200,headers={'content-type':'application/json; charset=utf-8'})=>new Response(JSON.stringify(value),{status,headers});
async function removeBundle(bundle){for(const filename of ['manifest.json','receipt.json','intent.json'])await unlink(path.join(bundle.directory,filename)).catch(()=>{});await rmdir(bundle.directory).catch(()=>{});await rmdir(path.dirname(bundle.directory)).catch(()=>{});}

test('Nebraska native mode is HOLD with zero calls when no separately recorded decision exists',async()=>{
  const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network must not run')};const outputRoot=path.join(APP_ROOT,'data/business-sources/ne-childcare-aggregate-preflight');
  const before=await readdir(outputRoot).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
  try{const result=await runNeChildcareAggregatePreflight();assert.equal(result.receipt.status,'HOLD');assert.equal(calls,0);assert.deepEqual(result.receipt.requests,[]);assert.equal(result.receipt.claims.facility_rows_acquired,0);assert.equal(result.receipt.output_allocated,false);assert.equal(result.manifest_path,null);const after=await readdir(outputRoot).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));assert.deepEqual(after,before);}finally{globalThis.fetch=old;}
});

test('injected offline transport is exact, sequential, spaced, bounded, minimized, and verifiable',async()=>{
  const calls=[];let clock=10000;const sleeps=[];
  const result=await runNeChildcareAggregatePreflightWithTestTransport(async(url,init)=>{
    calls.push({url,init});assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');assert.deepEqual(init.headers,{Accept:'application/json'});const step=['item','service','layer','counts','dates'][calls.length-1];return response(payload(step));
  },{now:()=>clock,sleep:async ms=>{sleeps.push(ms);clock+=ms;}});
  try {
    assert.equal(result.receipt.status,'COMPLETE');assert.equal(result.receipt.claims.source_metadata_observed,true);assert.equal(result.receipt.claims.aggregate_observed,true);assert.deepEqual(calls.map(c=>c.url),NE_ALLOWED_URLS);assert.deepEqual(sleeps,[1000,1000,1000,1000]);assert.ok(calls.every(c=>c.init.signal instanceof AbortSignal));
    assert.equal(result.receipt.requests.length,5);assert.equal(result.receipt.facility_rows_requested,0);assert.equal(result.receipt.response_bodies_retained,false);assert.match(result.receipt.aggregate_snapshot,/not an atomic snapshot/i);assert.equal(result.receipt.summary.aggregates.counts['Child Care Center'].source_rows,699);assert.equal(result.receipt.summary.aggregates.dates['Provisional Child Care Center'].roster_date_min,'2025-10-15');
    const verified=await verifyNeChildcarePreflightBundle(result.manifest_path);assert.equal(verified.status,'COMPLETE');
    const receiptPath=path.join(result.directory,'receipt.json'),receipt=JSON.parse(await readFile(receiptPath,'utf8'));receipt.claims.coverage_promoted=true;await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');await assert.rejects(verifyNeChildcarePreflightBundle(result.manifest_path),/digest mismatch/);
  } finally {await removeBundle(result);}
});

test('transport and ArcGIS negative cases fail closed without fallback or retry',async()=>{
  for(const makeResponse of [()=>response(payload('item'),302),()=>response({error:{code:400,message:'bad'} }),()=>response(payload('item'),200,{'content-type':'text/html'}),()=>response({...payload('item'),id:'wrong'}),()=>response({...payload('item'),id:'d3d3f44cb252424fb2f76e27162f534c',orgId:'wrong'}),()=>response({...payload('item'),padding:'x'.repeat(1000001)})]) {
    let calls=0;const result=await runNeChildcareAggregatePreflightWithTestTransport(async()=>{calls++;return makeResponse();},{sleep:async()=>{}});
    try{assert.equal(result.receipt.status,'FAILED');assert.equal(calls,1);assert.equal(result.receipt.requests.length,1);assert.equal(result.receipt.claims.facility_rows_acquired,0);}finally{await removeBundle(result);}
  }
});

test('cancellation stops before the next request and keeps a verifiable cancelled receipt',async()=>{
  const controller=new AbortController();let calls=0;const result=await runNeChildcareAggregatePreflightWithTestTransport(async()=>{calls++;return response(payload('item'));},{signal:controller.signal,sleep:async()=>controller.abort()});
  try{assert.equal(result.receipt.status,'CANCELLED');assert.equal(calls,1);assert.equal(result.receipt.requests.length,1);assert.equal((await verifyNeChildcarePreflightBundle(result.manifest_path)).status,'CANCELLED');}finally{await removeBundle(result);}
});

test('CLI rejects URL, path, and approval overrides',()=>{
  const cli=path.join(APP_ROOT,'scripts/preflight-ne-childcare-aggregate.mjs');
  for(const args of [['--url','https://example.invalid'],['--output','C:/outside'],['--approve'],['--decision','true']]) {
    const result=spawnSync(process.execPath,[cli,...args],{cwd:APP_ROOT,encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);assert.match(result.stderr,/NE_INVALID_CLI/);
  }
});

test('connector and runner declare the same five literal source URLs',async()=>{
  const connector=JSON.parse(await readFile(path.join(APP_ROOT,'config/connectors/ne-childcare-aggregate-preflight.json'),'utf8'));
  assert.deepEqual(connector.allowed_urls,NE_ALLOWED_URLS);assert.deepEqual(connector.allowed_hosts,['www.arcgis.com','gis.ne.gov']);
});
