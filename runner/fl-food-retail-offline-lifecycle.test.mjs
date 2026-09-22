import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {FL_FOOD_GIS_ITEM, FL_FOOD_GIS_SERVICE} from './fl-food-gis-contract.mjs';
import {FL_RETAIL_NOTICE} from './fl-food-retail-contract.mjs';
import {runFlRetailOfflineFixture, verifyFlRetailOfflineFixture} from './fl-food-retail-offline-lifecycle.mjs';

const ROOT = path.join(APP_ROOT, 'data/tmp/fl-food-retail-offline-lifecycle-tests');
const encode = value => Buffer.from(JSON.stringify(value));

function metadata() {
  const lengths = {FOOD_ENTITY_NUM:8,FE_TYPE:5,FOOD_ENTITY_NAME:100,ADDRESS_LINE_1:100,CITY:50,ZIP:6,ZIP_PLUS4:4,COUNTY:2000,IS_RETAIL:1,IS_WHOLESALE:1,FE_DESCRIPTION:255,OPERATING_HOURS:150,FE_CONTACT_EMAILL:100,FE_CONTACT_PHONE:100,FE_CONTACT_NAME:127,OWNER_CONTACT_NAME:127,OWNER_CONTACT_EMAIL:100,OWNER_CONTACT_PHONE:100,FDA_WORKPLAN_IND:1};
  return [
    {serviceItemId:FL_FOOD_GIS_ITEM,capabilities:'Map,Query,Data',layers:[{id:0,name:'Food Entities - Retail'},{id:1,name:'Food Entities - Manufacturing'}],spatialReference:{wkid:4326}},
    {id:0,name:'Food Entities - Retail',serviceItemId:FL_FOOD_GIS_ITEM,type:'Feature Layer',geometryType:'esriGeometryPoint',spatialReference:{wkid:4326},sourceSpatialReference:{wkid:4326},maxRecordCount:2000,advancedQueryCapabilities:{supportsStatistics:true,supportsPagination:true,supportsOrderBy:true},fields:[{name:'OBJECTID',type:'esriFieldTypeOID'},{name:'Geolocation',type:'esriFieldTypeGeometry'},{name:'OWNERS_PK',type:'esriFieldTypeBigInteger'},...Object.entries(lengths).map(([name,length])=>({name,type:'esriFieldTypeString',length,domain:null}))],drawingInfo:{renderer:{field1:'FE_DESCRIPTION',uniqueValueInfos:['HIGH RISK','MEDIUM RISK','LOW RISK'].map(value=>({value}))}}},
    {licenseInfo:'',accessInformation:''},
    {id:FL_FOOD_GIS_ITEM,type:'Map Service',access:'public',url:FL_FOOD_GIS_SERVICE,licenseInfo:FL_RETAIL_NOTICE}
  ];
}

function attributes() {
  return {OBJECTID:7,FOOD_ENTITY_NUM:'12345678',FE_TYPE:'0042',FOOD_ENTITY_NAME:'Synthetic Store',ADDRESS_LINE_1:'100 Fixture St',CITY:'Tallahassee',ZIP:'32301',ZIP_PLUS4:'1234',COUNTY:'Leon',IS_RETAIL:'Y',IS_WHOLESALE:'N',FE_DESCRIPTION:'HIGH RISK'};
}

function fixtures({includePoints = false} = {}) {
  const map = new Map();
  for (const stage of ['before', 'after']) {
    const values = metadata();
    ['service.json','layer.json','iteminfo.json','portal.json'].forEach((name,index)=>map.set(`${stage}-${name}`,encode(values[index])));
    map.set(`${stage}-count.json`, encode({count:1}));
    map.set(`${stage}-ids.json`, encode({objectIdFieldName:'OBJECTID',objectIds:[7]}));
  }
  map.set('page-001.json', encode({geometryType:'esriGeometryPoint',spatialReference:{wkid:4326,latestWkid:4326},features:[{attributes:attributes(),...(includePoints?{geometry:{x:-84.2807,y:30.4383}}:{})}]}));
  return map;
}

async function clean() {
  await rm(ROOT, {recursive:true, force:true});
  await mkdir(ROOT, {recursive:true});
}

test('publishes manifest-last verified offline evidence with zero native requests', async t => {
  await clean(); t.after(()=>rm(ROOT,{recursive:true,force:true}));
  const result = await runFlRetailOfflineFixture({fixtures:fixtures(),includePoints:false,outputRoot:ROOT});
  assert.equal(result.status,'OFFLINE_EVIDENCE_VERIFIED_ACQUISITION_BLOCKED');
  assert.equal(result.usage.nativeRequests,0);
  assert.equal(result.usage.fixtureRequests,13);
  const manifest = JSON.parse(await readFile(result.manifestPath,'utf8'));
  assert.equal(manifest.claims.productionDispatchRegistered,false);
  assert.equal(manifest.result.sourceRows,1);
  assert.equal(manifest.result.classificationMappingVerified,false);
  assert.equal(manifest.result.currentOperationsVerified,false);
  assert.equal(manifest.artifacts.at(-1).name,'stage-09-finalize.json');
  assert.equal((await readdir(result.directory)).at(-1) !== undefined,true);
  await verifyFlRetailOfflineFixture(result.manifestPath,result.manifestSha256);
});

test('rejects missing and per-response over-budget fixtures without publishing a manifest', async t => {
  await clean(); t.after(()=>rm(ROOT,{recursive:true,force:true}));
  const missing = fixtures(); missing.delete('before-count.json');
  await assert.rejects(runFlRetailOfflineFixture({fixtures:missing,includePoints:false,outputRoot:ROOT}),/Missing injected fixture/);
  let runs = await readdir(ROOT); let files = await readdir(path.join(ROOT,runs[0]));
  assert.ok(files.includes('failure.json')); assert.ok(!files.includes('manifest.json'));
  const oversized = fixtures(); oversized.set('before-service.json',Buffer.alloc(1048577,0x20));
  await assert.rejects(runFlRetailOfflineFixture({fixtures:oversized,includePoints:false,outputRoot:ROOT}),/response limit/);
  runs = await readdir(ROOT); files = await readdir(path.join(ROOT,runs[1]));
  assert.ok(files.includes('failure.json')); assert.ok(!files.includes('manifest.json'));
});

test('cancellation during fixture consumption retains cancellation evidence and no manifest', async t => {
  await clean(); t.after(()=>rm(ROOT,{recursive:true,force:true}));
  const controller = new AbortController();
  const base = fixtures();
  const cancelling = new class extends Map { get(name) { const value=super.get(name); if(name==='before-count.json') controller.abort(); return value; } }(base);
  await assert.rejects(runFlRetailOfflineFixture({fixtures:cancelling,includePoints:false,signal:controller.signal,outputRoot:ROOT}),{name:'AbortError'});
  const [run] = await readdir(ROOT); const files = await readdir(path.join(ROOT,run));
  assert.ok(files.includes('failure.json')); assert.ok(!files.includes('manifest.json'));
  assert.equal(JSON.parse(await readFile(path.join(ROOT,run,'failure.json'),'utf8')).status,'CANCELLED');
});

test('pre-manifest fault cannot create a success artifact', async t => {
  await clean(); t.after(()=>rm(ROOT,{recursive:true,force:true}));
  await assert.rejects(runFlRetailOfflineFixture({fixtures:fixtures(),includePoints:false,outputRoot:ROOT,faultAt:'before-manifest'}),/Injected pre-manifest fault/);
  const [run] = await readdir(ROOT); const files = await readdir(path.join(ROOT,run));
  assert.ok(files.includes('stage-09-finalize.json')); assert.ok(files.includes('failure.json')); assert.ok(!files.includes('manifest.json'));
});

test('offline verifier rejects artifact tampering and unexpected files', async t => {
  await clean(); t.after(()=>rm(ROOT,{recursive:true,force:true}));
  const result = await runFlRetailOfflineFixture({fixtures:fixtures({includePoints:true}),includePoints:true,outputRoot:ROOT});
  await writeFile(path.join(result.directory,'selected.synthetic.jsonl'),Buffer.from('{}\n'));
  await assert.rejects(verifyFlRetailOfflineFixture(result.manifestPath,result.manifestSha256),/rejected/);
  const cleanResult = await runFlRetailOfflineFixture({fixtures:fixtures(),includePoints:false,outputRoot:ROOT});
  await writeFile(path.join(cleanResult.directory,'unexpected.txt'),'unexpected');
  await assert.rejects(verifyFlRetailOfflineFixture(cleanResult.manifestPath,cleanResult.manifestSha256),/rejected/);
});
