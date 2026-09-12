import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {readSelectedIrsStateSummary as read,validateIrsStateSummary as validate} from './irs-eo-state-summary.mjs';
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const summary=()=>({region_records:{'eo1.csv':2,'eo2.csv':1,'eo3.csv':0,'eo4.csv':0},accepted_organizations:3,excluded_outside_supported_us_scope:0,quarantined_records:0,quarantine_reasons:{},observed_source_code_values:{},unknown_ruling_date_000000_records:0,unknown_accounting_period_00_records:0,exempt_status_codes:{'01':3},subsection_codes:{'03':3},states_and_territories:{IL:2,PR:1}});
const coverage=()=>({accepted_current_exempt_organizations:3,excluded_outside_supported_us_scope:0,quarantined_records:0,unknown_ruling_date_000000_records:0,unknown_accounting_period_00_records:0,states_and_territories:2,source_records:3,source_page_claimed_records:3});
async function fixture(t){
 const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/irs-summary-'));t.after(async()=>{assert.equal(path.dirname(root),path.join(APP_ROOT,'data/tmp'));await rm(root,{recursive:true,force:true});});
 const files={pointer:path.join(root,'data/business-coverage-views/current.json'),cov:path.join(root,'data/business-coverage-views/releases/coverage-fixture/manifest.json'),sources:path.join(root,'data/business-coverage-views/releases/coverage-fixture/views/sources.jsonl'),registry:path.join(root,'data/business-registry/releases/registry-fixture/manifest.json'),irs:path.join(root,'data/business-sources/irs-eo-bmf-organizations/releases/irs-fixture/manifest.json'),summary:path.join(root,'data/business-sources/irs-eo-bmf-organizations/releases/irs-fixture/derived/source-summary.json')};
 const write=async(file,value)=>{await mkdir(path.dirname(file),{recursive:true});const raw=JSON.stringify(value)+'\n';await writeFile(file,raw);return {bytes:Buffer.byteLength(raw),sha256:hash(raw)};};
 const sourceRow={source_key:'irs_eo_bmf_organizations',lineage:{registry_release_id:'registry-fixture'},release_metadata:{source_release_id:'source-fixture',source_posting_date:'2026-08-11'},zip_level_counts:{organization_filing_address_count:3}};
 const s=await write(files.summary,summary());
 const irs={schema_version:'1.0.0',connector:{id:'irs-eo-bmf',version:'1.0.1'},dataset_id:'irs-eo-bmf-organizations',release_id:'irs-fixture',status:'published',complete_current_eo_bmf_snapshot:true,source_release_id:'source-fixture',source_posting_date:'2026-08-11',retrieved_at:'2026-09-03T00:34:47.217Z',coverage:coverage(),artifacts:[{path:'derived/source-summary.json',artifact_type:'irs-eo-bmf-source-summary',...s}]};
 const im=await write(files.irs,irs),registry={schema_version:'1.0.0',dataset_id:'national-business-registry',release_id:'registry-fixture',status:'published-partial',dependencies:[{dataset_id:irs.dataset_id,release_id:irs.release_id,manifest_sha256:im.sha256}]};
 const rmeter=await write(files.registry,registry),smeter=await write(files.sources,sourceRow);
 const cov={schema_version:'1.0.0',dataset_id:'national-business-coverage-views',release_id:'coverage-fixture',status:'published-partial-local-aggregate',dependencies:[{dataset_id:registry.dataset_id,release_id:registry.release_id,manifest_sha256:rmeter.sha256}],artifacts:[{path:'views/sources.jsonl',artifact_type:'source-coverage-view-jsonl',...smeter}]};
 await write(files.cov,cov);await write(files.pointer,{dataset_id:cov.dataset_id,release_id:cov.release_id,manifest:'releases/coverage-fixture/manifest.json'});
 return {root,files,write,cov,irs,registry,options:{root,pointerPath:files.pointer,coverageManifest:cov,sourceRow}};
}
test('selected IRS summary follows production pins without current source pointer or source replay',async t=>{
 const f=await fixture(t),result=await read(f.options);assert.deepEqual(result.counts,{IL:2,PR:1});assert.equal(result.evidenceKind,'organization-filing-address');assert.equal(result.sourceReplayPerformedThisRead,false);assert.equal(result.sourcePostingDate,'2026-08-11');
 await f.write(path.join(f.root,'data/business-sources/irs-eo-bmf-organizations/current.json'),{manifest:'wrong'});assert.deepEqual(await read(f.options),result);
 await assert.rejects(read({...f.options,sourceRow:{...f.options.sourceRow,zip_level_counts:{organization_filing_address_count:99}}}));
});
test('IRS summary rejects missing, changed, escaped, duplicated and unsupported selected evidence',async t=>{
 const f=await fixture(t);
 await f.write(f.files.summary,{...summary(),states_and_territories:{IL:1,PR:2}});await assert.rejects(read(f.options));await f.write(f.files.summary,summary());
 await f.write(f.files.irs,{...f.irs,schema_version:'future'});await assert.rejects(read(f.options));await f.write(f.files.irs,f.irs);
 await f.write(f.files.cov,{...f.cov,dependencies:[...f.cov.dependencies,...f.cov.dependencies]});await assert.rejects(read({...f.options,coverageManifest:{...f.cov,dependencies:[...f.cov.dependencies,...f.cov.dependencies]}}));
 await f.write(f.files.cov,{...f.cov,release_id:'changed'});await assert.rejects(read(f.options));await f.write(f.files.cov,f.cov);
 await f.write(f.files.pointer,{dataset_id:'national-business-coverage-views',release_id:'coverage-fixture',manifest:'../../outside.json'});await assert.rejects(read(f.options));
});
test('IRS summary conservation rejects unknown states, totals, negative counts and extra schema fields',()=>{
 assert.deepEqual(validate(summary(),coverage()),{IL:2,PR:1});
 for(const value of [{...summary(),extra:true},{...summary(),states_and_territories:{ZZ:3}},{...summary(),states_and_territories:{IL:-1,PR:4}},{...summary(),accepted_organizations:4},{...summary(),states_and_territories:{IL:3,PR:1}}])assert.throws(()=>validate(value,coverage()));
});
