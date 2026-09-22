import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {createOvertureHeatmapReadiness,projectOvertureHeatmapReadiness} from './overture-heatmap-readiness.mjs';
import {overtureHeatmapReadinessHttp} from './overture-heatmap-readiness-http.mjs';

test('exact retained Overture evidence projects zero-admission Heatmap readiness',async()=>{
 const value=await createOvertureHeatmapReadiness({now:()=>new Date('2026-09-22T12:00:00Z')});
 assert.equal(value.declared_global_rows,73631092);assert.equal(value.declared_row_scope,'global-not-us');assert.equal(value.asset_count,16);
 assert.deepEqual(value.admission,{named_rows:0,state_rows:0,zip5_rows:0,category_counts_available:false,geocodes:0});
 assert.equal(value.selected_output.bytes,0);assert.equal(value.resumable,false);assert.equal(value.acquisition_authorized,false);
});

test('projection rejects receipt, STAC, selected output and journal tampering',async()=>{
 const ready=await import('./overture-readiness.mjs').then(m=>m.inspectOvertureReadiness({now:()=>new Date('2026-09-22T12:00:00Z')}));
 for(const change of [
  v=>{v.metadata.current_replay=false;},v=>{v.metadata.stac_fingerprint='0'.repeat(64);},v=>{v.failed_acquisition.selected_output.bytes=1;},
  v=>{v.failed_acquisition.selected_output.sha256='0'.repeat(64);},v=>{v.failed_acquisition.journal.completed_requests=24;},v=>{v.failed_acquisition.journal.delivered_bytes++;}
 ]){const value=structuredClone(ready);change(value);assert.throws(()=>projectOvertureHeatmapReadiness(value),/evidence rejected/);}
});

test('native selected artifact is the exact retained zero-byte failed output',async()=>{
 const file=path.join(APP_ROOT,'data/managed-operations/a8ff9f6d-b2be-4d56-905b-17984788b1d5/output/jobs/f61be1eb-be2e-47b5-8c8b-5873094228d1/engine/a64d2b2c-9acd-4eeb-a8e0-ea862b988ba5/selected/7c32f3d1-4c64-419b-87c6-065053ad6f04/selected-us-places.jsonl.gz');
 assert.equal((await readFile(file)).length,0);
});

test('read-only HTTP contract serves verified projection and fails closed',async()=>{
 const invoke=async(method,loader)=>{let result;await overtureHeatmapReadinessHttp({method},{},loader,(_response,status,value)=>{result={status,value};});return result;};
 const value={status:'metadata-only-no-place-admission',admission:{named_rows:0,state_rows:0,zip5_rows:0}};
 assert.deepEqual(await invoke('GET',async()=>value),{status:200,value});
 assert.equal((await invoke('POST',async()=>value)).status,405);
 const failed=await invoke('GET',async()=>{throw new Error('tampered');});assert.equal(failed.status,503);assert.match(failed.value.error,/No source data was admitted/);
});
