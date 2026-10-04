import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {admitOfflineCityStatePackage,verifyOfflineCityStatePackageRelease,validateCityStateAuthorization,validateCityStatePackageManifest,validateCityStateProjection,validateCityStateSourceDeclaration,validateCityStateStatusMapping} from './usps-city-state-offline-admission.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const rows=[
 {zip5:'00501',zip_class:'unique',status:'active'},
 {zip5:'09012',zip_class:'military',status:'active'},
 {zip5:'12345',zip_class:'standard',status:'active'},
 {zip5:'60688',zip_class:'po-box',status:'active'},
];
const authorization={schema_version:'usps-city-state-offline-authorization@1.0.0',authorization_id:'reviewed-license-1',authorized_at:'2026-10-03T00:00:00.000Z',authorized_by:'review-board',licensed_source_supplied_offline:true,network_acquisition_authorized:false,production_admission_authorized:false,current_pointer_change_authorized:false,redistribution_authorized:false};
const declaration={schema_version:'usps-city-state-source-declaration@1.0.0',schema_id:'city-state-projection-1',source_month:'2026-09',source_version:'CITYSTATE-2026-09',product:'USPS City State Product',projection_method:'Reviewed deterministic local projection.',complete_zip_classes:{standard:true,'po-box':true,unique:true,military:true}};
const mapping={semantics_reference:'reviewed-city-state-statuses-1',statuses:{active:{disposition:'included',meaning:'Source marks this ZIP as active.',reason:'Included by reviewed operational rule.'}}};
const isolatedRows=[
 {zip5:'00100',zip_class:'standard',status:'active'},
 {zip5:'00101',zip_class:'po-box',status:'active'},
 {zip5:'00102',zip_class:'unique',status:'active'},
 {zip5:'00103',zip_class:'military',status:'active'},
 {zip5:'00104',zip_class:'standard',status:'active'},
];
const writeJson=async(file,value)=>fs.writeFile(file,`${JSON.stringify(value,null,2)}\n`,{flag:'wx'});
async function makeIsolatedFixture(t,maximumRows){
 const root=path.join(APP_ROOT,'data/tmp',`usps-city-state-offline-${randomUUID()}`),configDir=path.join(root,'config'),packageDir=path.join(root,'data/imports','synthetic-package'),operationDir=path.join(root,'data/tmp','operation');
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(packageDir),{recursive:true});
 const actualConfig=JSON.parse(await fs.readFile(path.join(APP_ROOT,'config/usps-city-state-offline-admission.json'),'utf8'));
 actualConfig.maximum_projection_rows=maximumRows;
 await fs.mkdir(configDir,{recursive:true});
 for(const key of ['authorization_registry','projection_schema_registry','source_policy','candidate_policy','source_profile','admission_connector','candidate_connector','candidate_dataset']){
  const relative=actualConfig[key],target=path.join(root,relative);await fs.mkdir(path.dirname(target),{recursive:true});
  let value=JSON.parse(await fs.readFile(path.join(APP_ROOT,relative),'utf8'));
  if(key==='authorization_registry')value={...value,status:'synthetic-review-fixture',approved_receipts:[{authorization_id:authorization.authorization_id,authorization_sha256:sha(Buffer.from(`${JSON.stringify(authorization)}\n`)),source_month:declaration.source_month,source_version:declaration.source_version}]};
  if(key==='projection_schema_registry')value={...value,status:'synthetic-review-fixture',approved_schemas:[{schema_id:declaration.schema_id,package_manifest_sha256:'0'.repeat(64),projection_method:declaration.projection_method}]};
  await writeJson(target,value);
 }
 const body={'authorization.json':Buffer.from(`${JSON.stringify(authorization)}\n`),'source-declaration.json':Buffer.from(`${JSON.stringify(declaration)}\n`),'status-mapping.json':Buffer.from(`${JSON.stringify(mapping)}\n`),'projection.jsonl':Buffer.from(`${isolatedRows.map(JSON.stringify).join('\n')}\n`)};
 const artifacts=Object.entries(body).map(([name,bytes])=>({path:name,bytes:bytes.length,sha256:sha(bytes)}));
 const manifest={schema_version:'usps-city-state-offline-package@1.0.0',record_count:isolatedRows.length,artifacts};
 const manifestBytes=Buffer.from(`${JSON.stringify(manifest)}\n`);
 const schemaRegistry={schema_version:'usps-city-state-projection-schema-registry@1.0.0',status:'synthetic-review-fixture',approved_schemas:[{schema_id:declaration.schema_id,package_manifest_sha256:sha(manifestBytes),projection_method:declaration.projection_method}]};
 await fs.writeFile(path.join(root,actualConfig.projection_schema_registry),`${JSON.stringify(schemaRegistry,null,2)}\n`);
 body['manifest.json']=manifestBytes;
 for(const [name,bytes]of Object.entries(body))await fs.writeFile(path.join(packageDir,name),bytes,{flag:'wx'});
 await writeJson(path.join(root,'config/usps-city-state-offline-admission.json'),actualConfig);
 return{root,packageDir,operationDir,manifest};
}

test('closed validators enforce non-authorizing policy and exact sorted four-class projection',()=>{
 assert.equal(validateCityStateAuthorization(authorization),authorization);assert.equal(validateCityStateSourceDeclaration(declaration),declaration);assert.equal(validateCityStateStatusMapping(mapping),mapping);
 const raw=Buffer.from(`${rows.map(JSON.stringify).join('\n')}\n`);assert.equal(validateCityStateProjection(raw,4).rows,4);
 for(const bad of [Buffer.from(`${rows.slice().reverse().map(JSON.stringify).join('\n')}\n`),Buffer.from(`${rows.map(JSON.stringify).join('\r\n')}\r\n`),Buffer.from(rows.map(JSON.stringify).join('\n'))])assert.throws(()=>validateCityStateProjection(bad,4));
 assert.throws(()=>validateCityStateAuthorization({...authorization,production_admission_authorized:true}));assert.throws(()=>validateCityStateSourceDeclaration({...declaration,complete_zip_classes:{...declaration.complete_zip_classes,military:false}}));assert.throws(()=>validateCityStateStatusMapping({...mapping,extra:true}));
});

test('five-row four-class package over a four-row ceiling is rejected during offline admission',async t=>{
 const fixture=await makeIsolatedFixture(t,4);
 await assert.rejects(admitOfflineCityStatePackage({root:fixture.root,packageDirectory:fixture.packageDir,operationDirectory:fixture.operationDir}),/projection row ceiling/);
 await assert.rejects(fs.access(path.join(fixture.root,'data/zip-validity/usps-city-state/packages/releases')),{code:'ENOENT'});
});

test('isolated-root package admission, candidate replay and root-relative publication paths succeed; replay enforces row ceiling',async t=>{
 const fixture=await makeIsolatedFixture(t,5),result=await admitOfflineCityStatePackage({root:fixture.root,packageDirectory:fixture.packageDir,operationDirectory:fixture.operationDir,now:()=>new Date('2026-10-04T00:00:00.000Z')});
 assert.equal(path.isAbsolute(result.packageManifest),false);assert.equal(path.isAbsolute(result.admissionManifest),false);assert.equal(path.isAbsolute(result.candidateManifest),false);
 assert.equal(path.resolve(fixture.root,result.packageManifest).startsWith(fixture.root),true);
 assert.equal(result.recordCount,5);assert.equal(result.currentPointerWritten,false);assert.equal(result.productionAdmission,false);
 const proof=await verifyOfflineCityStatePackageRelease(result.packageManifest,{root:fixture.root,admissionManifest:result.admissionManifest,candidateManifest:result.candidateManifest});assert.equal(proof.record_count,5);
 await assert.rejects(verifyOfflineCityStatePackageRelease(result.packageManifest,{root:fixture.root,admissionManifest:path.join(APP_ROOT,'config/usps-city-state-offline-admission.json'),candidateManifest:result.candidateManifest}),/admission manifest escapes isolated root/);
 const configPath=path.join(fixture.root,'config/usps-city-state-offline-admission.json'),config=JSON.parse(await fs.readFile(configPath,'utf8'));config.maximum_projection_rows=4;
 const configBytes=Buffer.from(`${JSON.stringify(config,null,2)}\n`);await fs.writeFile(configPath,configBytes);
 const releasePath=path.resolve(fixture.root,result.packageManifest),release=JSON.parse(await fs.readFile(releasePath,'utf8'));release.bindings.config.bytes=configBytes.length;release.bindings.config.sha256=sha(configBytes);await fs.writeFile(releasePath,`${JSON.stringify(release,null,2)}\n`);
 await assert.rejects(verifyOfflineCityStatePackageRelease(result.packageManifest,{root:fixture.root,admissionManifest:result.admissionManifest,candidateManifest:result.candidateManifest}),/projection row ceiling/);
});

test('native empty registries fail closed after bounded operation-owned copy and publish nothing',async t=>{
 const id=randomUUID(),pkg=path.join(APP_ROOT,'data/imports',`usps-city-state-test-${id}`),op=path.join(APP_ROOT,'data/tmp',`usps-city-state-operation-${id}`);t.after(()=>Promise.all([fs.rm(pkg,{recursive:true,force:true}),fs.rm(op,{recursive:true,force:true})]));await fs.mkdir(pkg,{recursive:true});
 const bodies={'authorization.json':Buffer.from(`${JSON.stringify(authorization)}\n`),'source-declaration.json':Buffer.from(`${JSON.stringify(declaration)}\n`),'status-mapping.json':Buffer.from(`${JSON.stringify(mapping)}\n`),'projection.jsonl':Buffer.from(`${rows.map(JSON.stringify).join('\n')}\n`)};const artifacts=Object.entries(bodies).map(([p,b])=>({path:p,bytes:b.length,sha256:sha(b)}));const manifest={schema_version:'usps-city-state-offline-package@1.0.0',record_count:4,artifacts};bodies['manifest.json']=Buffer.from(`${JSON.stringify(manifest)}\n`);for(const [name,b] of Object.entries(bodies))await fs.writeFile(path.join(pkg,name),b,{flag:'wx'});
 validateCityStatePackageManifest(manifest);await assert.rejects(admitOfflineCityStatePackage({root:APP_ROOT,packageDirectory:pkg,operationDirectory:op}),/authorization is not in the reviewed registry/);assert.deepEqual((await fs.readdir(path.join(op,'usps-city-state-package'))).sort(),['authorization.json','manifest.json','projection.jsonl','source-declaration.json','status-mapping.json']);
});

test('managed endpoint remains protected and dispatches the dedicated admission method',async()=>{const server=await fs.readFile(new URL('./server.mjs',import.meta.url),'utf8'),managed=await fs.readFile(new URL('./managed-operations.mjs',import.meta.url),'utf8'),worker=await fs.readFile(new URL('../scripts/admit-usps-city-state-package.mjs',import.meta.url),'utf8');assert.ok(server.indexOf('controlPlane.authorize(request);')<server.indexOf("endpoint === 'usps-city-state-admissions'"));assert.match(server,/startUspsCityStateAdmission/);assert.match(managed,/scripts\/admit-usps-city-state-package\.mjs/);assert.doesNotMatch(worker,/\bfetch\s*\(|https?:\/\//);});

test('Data Operations exposes only a local package path and truthful fail-closed status',async()=>{const ui=await fs.readFile(new URL('../app/data-operations.tsx',import.meta.url),'utf8');assert.match(ui,/USPS City State package directory/);assert.match(ui,/\/usps-city-state-admissions/);assert.match(ui,/approval registries are intentionally empty/i);assert.match(ui,/does not obtain or grant a USPS license/i);assert.doesNotMatch(ui,/USPS.*(?:token|password|secret)/i);});
