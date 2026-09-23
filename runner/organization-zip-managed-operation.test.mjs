import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { createManagedOperations } from './managed-operations.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const runId = '72828fd1-649a-4ef3-9c47-691438cd5de1';
const row = { row_id: 'fl:1', display_name: 'Example LLC' };
async function makeExport({ outputRoot, zip5, publisherState, policyMode, format, signal }) {
  signal?.throwIfAborted();
  const release = path.join(outputRoot, 'jobs', runId); await mkdir(release, { recursive: true });
  const formats = format === 'both' ? ['jsonl', 'csv'] : [format], artifacts = [];
  for (const ext of formats) {
    const name = `organization-addresses.${ext}`, bytes = Buffer.from(ext === 'jsonl' ? `${JSON.stringify(row)}\n` : 'row_id,display_name\nfl:1,"Example LLC"\n');
    await writeFile(path.join(release, name), bytes, { flag: 'wx' }); artifacts.push({ path: name, format: ext, bytes: bytes.length, sha256: sha(bytes), record_count: 1 });
  }
  const manifest = { schema_version: 'organization-zip-evidence-export@1.0.0', run_id: runId, row_count: 1,
    release_binding: { release_id: 'fixed-release', manifest_sha256: 'a'.repeat(64) }, selection: { zip5, publisher_state: publisherState, policy_mode: policyMode, format },
    claims: { reported_administrative_addresses_only: true, physical_sites_asserted: false, current_operations_asserted: false, general_business_or_site_totals_changed: false, source_acquisition_performed: false }, artifacts };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`); await writeFile(path.join(release, 'manifest.json'), manifestBytes, { flag: 'wx' });
  return { manifest_path: path.join(release, 'manifest.json'), manifest_sha256: sha(manifestBytes), run_id: runId, row_count: 1, status: 'verified', artifact_paths: artifacts.map(item => path.join(release, item.path)) };
}
async function fixture(t, options = {}) {
  const root = path.join(APP_ROOT,'data',`org-zip-managed-test-${randomUUID()}`); await mkdir(root,{recursive:true});
  const relative = path.relative(APP_ROOT, root); t.after(() => rm(root, { recursive: true, force: true }));
  const service = createManagedOperations({ root: relative, idFactory: randomUUID, organizationZipExporter: makeExport,
    organizationZipVerifier: async (manifestPath, manifestSha, { signal } = {}) => { signal?.throwIfAborted(); const bytes = await readFile(manifestPath); const manifest = JSON.parse(bytes); return { status: 'verified', run_id: manifest.run_id, rows: manifest.row_count, manifest_sha256: manifestSha }; }, ...options });
  t.after(() => service.close()); return service;
}
async function done(service, id) { for (let i=0;i<200;i++) { const op=await service.get(id); if (!['QUEUED','RUNNING'].includes(op.status)) return op; await new Promise(resolve=>setTimeout(resolve,5)); } throw new Error('Managed export did not settle.'); }

test('organization ZIP managed export is strict, fixed-scope, policy-bound, and slot-exclusive', async t => {
  let executions=0;const service = await fixture(t,{organizationZipExporter:options=>{executions++;return makeExport(options);}});
  for (const input of [{}, { zip5:'1234',policy_mode:'public-only',format:'both' }, {zip5:'12345',publisher_state:'ZZ',policy_mode:'public-only',format:'both'}, {zip5:'12345',policy_mode:'guess',format:'both'}, {zip5:'12345',policy_mode:'public-only',format:'xlsx'}, {zip5:'12345',policy_mode:'public-only',format:'both',output:'elsewhere'}]) await assert.rejects(service.startOrganizationZipEvidenceExport(input), {statusCode:400});
  const accessor = { zip5:'12345', policy_mode:'public-only', format:'jsonl' }; Object.defineProperty(accessor,'publisher_state',{enumerable:true,get(){assert.fail('accessor must not execute');}});
  await assert.rejects(service.startOrganizationZipEvidenceExport(accessor), {statusCode:400});
  assert.equal(executions,0,'invalid selections never reach the exporter');
  const op = await service.startOrganizationZipEvidenceExport({ zip5:'02110', publisher_state:'FL', policy_mode:'public-only', format:'both' });
  await assert.rejects(service.startExport({}), {code:'OPERATION_CONFLICT'});
  const final = await done(service, op.id); assert.equal(final.status,'SUCCEEDED'); assert.equal(final.kind,'organization-zip-export');
  assert.equal(executions,1);
  assert.equal(final.result.organizationZip5,'02110'); assert.equal(final.result.publisherState,'FL'); assert.equal(final.result.policyMode,'public-only');
  assert.equal(final.result.organizationZipRowCount,1); assert.equal(final.result.artifactIntegrityVerified,true); assert.equal(Object.hasOwn(final.result,'descriptor'),false);
  assert.deepEqual(final.artifacts.map(item=>item.name).sort(),['manifest.json','organization-addresses.csv','organization-addresses.jsonl']);
  for (const artifact of final.artifacts) assert.equal((await service.artifact(op.id,artifact.name)).bytes,artifact.bytes);
  const root=service.root; await service.close();
  const restarted=createManagedOperations({root:path.relative(APP_ROOT,root),organizationZipExporter:async()=>{assert.fail('completed operations are history, not resumed work');},
    organizationZipVerifier:async(manifestPath,manifestSha)=>{const bytes=await readFile(manifestPath);const manifest=JSON.parse(bytes);return{status:'verified',run_id:manifest.run_id,rows:manifest.row_count,manifest_sha256:manifestSha};}});
  const replay=await restarted.get(op.id);assert.equal(replay.status,'SUCCEEDED');assert.equal(replay.artifacts.length,3);assert.equal((await restarted.artifact(op.id,'organization-addresses.csv')).bytes,final.artifacts.find(item=>item.name==='organization-addresses.csv').bytes);await restarted.close();
});

test('organization ZIP downloads revalidate bytes and reject mutated artifacts', async t => {
  const service = await fixture(t); const op = await service.startOrganizationZipEvidenceExport({zip5:'02110',policy_mode:'local-review',format:'csv'}); const final = await done(service,op.id);
  assert.equal(final.result.policyMode,'local-review'); const target=final.artifacts.find(item=>item.name.endsWith('.csv'));
  const artifact=await service.artifact(op.id,target.name); await writeFile(artifact.path,'mutated');
  await assert.rejects(service.artifact(op.id,target.name),/independently verified/);
  assert.deepEqual((await service.get(op.id)).artifacts,[]); await service.close();
});

test('cancellation and restart never resume an interrupted organization ZIP scan', async t => {
  let started; const waitStarted=new Promise(resolve=>{started=resolve;});
  const service=await fixture(t,{organizationZipExporter:async({signal})=>{started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason??new Error('cancelled')),{once:true}));}});
  const op=await service.startOrganizationZipEvidenceExport({zip5:'02110',policy_mode:'public-only',format:'jsonl'}); await waitStarted;
  await service.cancel(op.id); assert.equal((await done(service,op.id)).status,'CANCELLED'); assert.equal((await service.get(op.id)).artifacts.length,0);
  const root=service.root; await service.close();
  const restarted=createManagedOperations({root:path.relative(APP_ROOT,root),organizationZipExporter:async()=>{assert.fail('restart must not resume the scan');}});
  const history=await restarted.get(op.id); assert.equal(history.status,'CANCELLED'); assert.equal(history.artifacts.length,0); await restarted.close();
});

test('failed organization ZIP export exposes no artifacts or downloadable files',async t=>{
  const service=await fixture(t,{organizationZipExporter:async()=>{throw new Error('private path must not escape');}});
  const op=await service.startOrganizationZipEvidenceExport({zip5:'02110',policy_mode:'public-only',format:'jsonl'});const failed=await done(service,op.id);
  assert.equal(failed.status,'FAILED');assert.equal(failed.artifacts.length,0);assert.equal(failed.result.artifactIntegrityVerified,false);assert.equal(await service.artifact(op.id,'manifest.json'),null);
  assert.doesNotMatch(JSON.stringify(failed),/private path/);await service.close();
});

test('restart quarantines unresolved organization ZIP ownership and preserves global-slot protection', async t => {
  const service=await fixture(t); await service.ready;
  const id='restart-proof', record={id,kind:'organization-zip-export',status:'RUNNING',createdAt:new Date().toISOString(),owner:{supervisorPid:process.pid},details:{zip5:'02110',publisherState:null,policyMode:'public-only',format:'jsonl'},result:{},artifacts:[]};
  await mkdir(path.join(service.root,id)); await writeFile(path.join(service.root,id,'receipt.json'),JSON.stringify(record));
  const restarted=createManagedOperations({root:path.relative(APP_ROOT,service.root),organizationZipExporter:async()=>{assert.fail('must not resume');}});
  assert.equal((await restarted.get(id)).status,'UNKNOWN'); await assert.rejects(restarted.startCollection({}),{code:'OPERATION_CONFLICT'}); await restarted.close(); await service.close();
});
