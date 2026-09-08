import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp,mkdir,writeFile,readFile,readdir,rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { buildAkActiveBusinessLicenses as build,verifyAkActiveBusinessLicenses as verify,AK_BUSINESS_LICENSE_HEADERS,AK_BUSINESS_NAICS_HEADERS } from './ak-active-business-licenses.mjs';

async function fixture(t) {
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ak-outcomes-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const baseline=path.join(root,'baseline');await mkdir(path.join(baseline,'releases/zbp-fixture/derived'),{recursive:true});
  const bytes=Buffer.from(JSON.stringify({zip_code:'99501',coverage_status:'zbp-and-zcta',current_usps_validity:{status:'unverified'},geography:{status:'2020-zcta-polygon-available',geo_id:'zcta:99501',geoid:'99501'},employer_baseline:{status:'published',establishments:10}})+'\n');
  await writeFile(path.join(baseline,'releases/zbp-fixture/derived/zip-coverage.jsonl'),bytes);
  await writeFile(path.join(baseline,'releases/zbp-fixture/manifest.json'),JSON.stringify({dataset_id:'census-zbp-baseline',release_id:'zbp-fixture',complete_national_release:true,geography_dependency:{dataset_id:'us-census-geography',release_id:'geo-fixture'},artifacts:[{path:'derived/zip-coverage.jsonl',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
  const zbpPointer=path.join(baseline,'current.json');await writeFile(zbpPointer,JSON.stringify({manifest:'releases/zbp-fixture/manifest.json'}));
  return {outputRoot:path.join(root,'output'),zbpPointer,licenseRows:[{Owners:'Synthetic excluded owner',LicenseNumber:'1001',BusinessName:'Synthetic Alaska LLC',Status:'Active',IssueDate:'1/15/2020',RenewDate:'10/9/2025',ExpireDate:'12/31/2027',HasTelemedicine:'No',PhysicalCity:'Anchorage',PhysicalCountry:'UNITED STATES',PhysicalLine1:'100 Market Street',PhysicalLine2:'Suite 200',PhysicalState:'AK',PhysicalZip:'99501',PhysicalZipPlus:'1234'}],naicsRows:[{Lob:'44-45 - Retail Trade',NaicsCode:'445110 - SUPERMARKETS',NaicsDescription:'SUPERMARKETS',LicenseNumber:'1001',BusinessName:'Synthetic Alaska LLC'}],minimumLicenseRows:1,sourceMetadata:{licenseHeaders:AK_BUSINESS_LICENSE_HEADERS,naicsHeaders:AK_BUSINESS_NAICS_HEADERS,licenseObservedAt:'2026-09-01T12:00:00Z',naicsObservedAt:'2026-09-01T12:00:30Z'},logger:()=>{},now:()=>new Date('2026-09-01T12:01:00Z'),fetchImpl:()=>{throw Error('No network in fixture');}};
}

for(const phase of ['release-rename','pointer-write','pointer-rename','cleanup','primary-and-cleanup'])test(`AK ${phase} fault preserves structured publication outcome under cancellation`,async t=>{
  const options=await fixture(t),prior=await build(options),pointer=await readFile(prior.pointerPath),controller=new AbortController();
  const original={rename:fs.promises.rename,open:fs.promises.open,unlink:fs.promises.unlink};let fired=false;
  const fault=()=>{fired=true;controller.abort();throw Object.assign(Error('PRIVATE FAULT'),{code:'EIO'});};
  fs.promises.rename=async(from,to)=>{
    if(phase==='release-rename'&&path.basename(path.dirname(String(from)))==='.staging')fault();
    if(['pointer-rename','primary-and-cleanup'].includes(phase)&&String(to)===prior.pointerPath)fault();
    return original.rename(from,to);
  };
  fs.promises.open=async(file,...args)=>{if(phase==='pointer-write'&&path.basename(String(file)).startsWith('.current-'))fault();return original.open(file,...args);};
  fs.promises.unlink=async file=>{if(['cleanup','primary-and-cleanup'].includes(phase)&&path.basename(String(file))==='.publish.lock')fault();return original.unlink(file);};
  syncBuiltinESMExports();let failure;
  try {await assert.rejects(build({...options,signal:controller.signal}),error=>{failure=error;return error.code==='AK_PUBLICATION_INCOMPLETE';});}
  finally {Object.assign(fs.promises,original);syncBuiltinESMExports();}
  assert.equal(fired,true);assert.equal(failure.phase,phase==='cleanup'?'post-publication':phase==='primary-and-cleanup'?'pointer-rename':phase);assert.doesNotMatch(failure.message,/PRIVATE/);
  const releases=await readdir(path.join(options.outputRoot,'releases'));
  if(phase==='release-rename'){assert.equal(releases.length,1);assert.equal((await readdir(path.join(options.outputRoot,'.staging'))).length,1);}
  else {assert.equal(releases.length,2);await verify(path.join(options.outputRoot,'releases',failure.releaseId,'manifest.json'));}
  if(phase!=='cleanup')assert.deepEqual(await readFile(prior.pointerPath),pointer);
  else assert.equal(JSON.parse(await readFile(prior.pointerPath)).release_id,failure.releaseId);
});

test('AK postpublication logger error and concurrent abort preserve committed pointer',async t=>{
  const options=await fixture(t),controller=new AbortController();let failure;
  await assert.rejects(build({...options,signal:controller.signal,logger(message){if(message.startsWith('Published ')){controller.abort();throw Error('PRIVATE LOGGER');}}}),error=>{failure=error;return error.code==='AK_PUBLICATION_INCOMPLETE'&&error.phase==='post-publication';});
  const pointer=JSON.parse(await readFile(path.join(options.outputRoot,'current.json')));assert.equal(pointer.release_id,failure.releaseId);
  await verify(path.join(options.outputRoot,pointer.manifest));assert.doesNotMatch(failure.message,/PRIVATE/);
});
