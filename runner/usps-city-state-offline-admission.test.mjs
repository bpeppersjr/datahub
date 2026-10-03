import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {admitOfflineCityStatePackage,validateCityStateAuthorization,validateCityStatePackageManifest,validateCityStateProjection,validateCityStateSourceDeclaration,validateCityStateStatusMapping} from './usps-city-state-offline-admission.mjs';

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

test('closed validators enforce non-authorizing policy and exact sorted four-class projection',()=>{
 assert.equal(validateCityStateAuthorization(authorization),authorization);assert.equal(validateCityStateSourceDeclaration(declaration),declaration);assert.equal(validateCityStateStatusMapping(mapping),mapping);
 const raw=Buffer.from(`${rows.map(JSON.stringify).join('\n')}\n`);assert.equal(validateCityStateProjection(raw,4).rows,4);
 for(const bad of [Buffer.from(`${rows.slice().reverse().map(JSON.stringify).join('\n')}\n`),Buffer.from(`${rows.map(JSON.stringify).join('\r\n')}\r\n`),Buffer.from(rows.map(JSON.stringify).join('\n'))])assert.throws(()=>validateCityStateProjection(bad,4));
 assert.throws(()=>validateCityStateAuthorization({...authorization,production_admission_authorized:true}));assert.throws(()=>validateCityStateSourceDeclaration({...declaration,complete_zip_classes:{...declaration.complete_zip_classes,military:false}}));assert.throws(()=>validateCityStateStatusMapping({...mapping,extra:true}));
});

test('native empty registries fail closed after bounded operation-owned copy and publish nothing',async t=>{
 const id=randomUUID(),pkg=path.join(APP_ROOT,'data/imports',`usps-city-state-test-${id}`),op=path.join(APP_ROOT,'data/tmp',`usps-city-state-operation-${id}`);t.after(()=>Promise.all([fs.rm(pkg,{recursive:true,force:true}),fs.rm(op,{recursive:true,force:true})]));await fs.mkdir(pkg,{recursive:true});
 const bodies={'authorization.json':Buffer.from(`${JSON.stringify(authorization)}\n`),'source-declaration.json':Buffer.from(`${JSON.stringify(declaration)}\n`),'status-mapping.json':Buffer.from(`${JSON.stringify(mapping)}\n`),'projection.jsonl':Buffer.from(`${rows.map(JSON.stringify).join('\n')}\n`)};const artifacts=Object.entries(bodies).map(([p,b])=>({path:p,bytes:b.length,sha256:sha(b)}));const manifest={schema_version:'usps-city-state-offline-package@1.0.0',record_count:4,artifacts};bodies['manifest.json']=Buffer.from(`${JSON.stringify(manifest)}\n`);for(const [name,b] of Object.entries(bodies))await fs.writeFile(path.join(pkg,name),b,{flag:'wx'});
 validateCityStatePackageManifest(manifest);await assert.rejects(admitOfflineCityStatePackage({root:APP_ROOT,packageDirectory:pkg,operationDirectory:op}),/authorization is not in the reviewed registry/);assert.deepEqual((await fs.readdir(path.join(op,'usps-city-state-package'))).sort(),['authorization.json','manifest.json','projection.jsonl','source-declaration.json','status-mapping.json']);
});

test('managed endpoint remains protected and dispatches the dedicated admission method',async()=>{const server=await fs.readFile(new URL('./server.mjs',import.meta.url),'utf8'),managed=await fs.readFile(new URL('./managed-operations.mjs',import.meta.url),'utf8'),worker=await fs.readFile(new URL('../scripts/admit-usps-city-state-package.mjs',import.meta.url),'utf8');assert.ok(server.indexOf('controlPlane.authorize(request);')<server.indexOf("endpoint === 'usps-city-state-admissions'"));assert.match(server,/startUspsCityStateAdmission/);assert.match(managed,/scripts\/admit-usps-city-state-package\.mjs/);assert.doesNotMatch(worker,/\bfetch\s*\(|https?:\/\//);});

test('Data Operations exposes only a local package path and truthful fail-closed status',async()=>{const ui=await fs.readFile(new URL('../app/data-operations.tsx',import.meta.url),'utf8');assert.match(ui,/USPS City State package directory/);assert.match(ui,/\/usps-city-state-admissions/);assert.match(ui,/approval registries are intentionally empty/i);assert.match(ui,/does not obtain or grant a USPS license/i);assert.doesNotMatch(ui,/USPS.*(?:token|password|secret)/i);});
