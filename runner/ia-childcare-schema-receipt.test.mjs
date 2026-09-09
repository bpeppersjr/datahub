import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink, rmdir, lstat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { runIaChildcareSchemaProbeWithTestTransport } from './ia-childcare-schema-probe.mjs';
import { persistIaChildcareSchemaReceipt, persistIaChildcareSchemaReceiptWithTestHook as persist } from './ia-childcare-schema-receipt.mjs';
const receipt = () => runIaChildcareSchemaProbeWithTestTransport(async () => new Response('denied', {status:403}));
async function cleanup(directory) {
  if (!directory) return;
  assert.equal(path.dirname(directory),path.join(APP_ROOT,'data/tmp/ia-schema-receipt-tests'));
  for (const name of await readdir(directory).catch(()=>[])) { assert.ok(['manifest.json','manifest.tmp'].includes(name)); await unlink(path.join(directory,name)); }
  await rmdir(directory).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
test('Iowa receipt publication conserves checksum, evidence mode, uniqueness, and manifest-last roster', async () => {
  const directories=[];
  try {
    const input=await receipt();
    for(let i=0;i<2;i++) {
      const result=await persist(input, async(stage,paths)=>{ if(stage==='before-publication') {directories.push(paths.directory); assert.deepEqual(await readdir(paths.directory),['manifest.tmp']);} });
      const raw=await readFile(path.join(APP_ROOT,result.manifest));
      assert.equal(createHash('sha256').update(raw).digest('hex'),result.sha256);
      assert.equal(JSON.parse(raw).execution_mode,'injected-test-transport'); assert.equal(JSON.parse(raw).status,'rejected');
      assert.deepEqual(await readdir(directories.at(-1)),['manifest.json']);
    }
    assert.notEqual(directories[0],directories[1]);
  } finally { for(const directory of directories) await cleanup(directory); }
});
test('Iowa receipt refuses arbitrary JSON and mutated issued evidence before creating output', async () => {
  await assert.rejects(persistIaChildcareSchemaReceipt({provider:'PRIVATE'}),/not issued unchanged/);
  const input=await receipt(); input.claims.collection_ready=true;
  await assert.rejects(persist(input,()=>{}),/not issued unchanged/);
});
test('Iowa receipt detects same-size staging mutation and cleans only unpublished owned files', async () => {
  let directory;
  await assert.rejects(persist(await receipt(),async(stage,paths)=>{
    if(stage==='before-publication') { directory=paths.directory; const raw=await readFile(paths.temporary,'utf8'); await writeFile(paths.temporary,raw.replace('rejected','REJECTED')); }
  }),/persistence failed/);
  await assert.rejects(lstat(directory),{code:'ENOENT'});
});
test('Iowa receipt never overwrites a pre-existing manifest and preserves unexpected evidence', async () => {
  let directory;
  try {
    await assert.rejects(persist(await receipt(),async(stage,paths)=>{if(stage==='before-publication'){directory=paths.directory;await writeFile(paths.manifest,'existing',{flag:'wx'});}}),/persistence failed/);
    assert.equal(await readFile(path.join(directory,'manifest.json'),'utf8'),'existing');
    assert.deepEqual(await readdir(directory),['manifest.json']);
  } finally {await cleanup(directory);}
});
test('Iowa receipt detects post-publication mutation but preserves the committed evidence for inspection', async () => {
  let directory;
  try {
    await assert.rejects(persist(await receipt(),async(stage,paths)=>{if(stage==='after-publication'){directory=paths.directory;await writeFile(paths.manifest,'tampered');}}),/persistence failed/);
    assert.equal(await readFile(path.join(directory,'manifest.json'),'utf8'),'tampered');
  } finally {await cleanup(directory);}
});
