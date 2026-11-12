import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {BROAD_ORGANIZATION_ZIP_SUMMARY_TEST_HOOKS} from './broad-organization-zip-summary.mjs';

const json=async relative=>JSON.parse(await readFile(new URL(`../${relative}`,import.meta.url),'utf8'));

test('historical summary cohort replay remains pinned after the current cohort is promoted',async()=>{
 const registration=await json('config/datasets/national-broad-organization-zip-summary.json');
 const manifest=await json(registration.retained_release.manifest);
 const historical=await BROAD_ORGANIZATION_ZIP_SUMMARY_TEST_HOOKS.loadCohort(APP_ROOT,manifest.bindings.cohort);
 const current=await BROAD_ORGANIZATION_ZIP_SUMMARY_TEST_HOOKS.loadCohort(APP_ROOT);
 assert.equal(historical.manifest_path,manifest.bindings.cohort.manifest_path);
 assert.equal(historical.manifest_sha256,manifest.bindings.cohort.manifest_sha256);
 assert.equal(historical.artifact_sha256,manifest.bindings.cohort.artifact_sha256);
 assert.notEqual(historical.manifest_sha256,current.manifest_sha256);
 assert.equal(historical.rows.size,48194);
 assert.equal(current.rows.size,48194);
 for(const zip5 of historical.rows)assert.equal(current.rows.has(zip5),true,`promoted cohort lost ${zip5}`);
});

test('historical summary cohort replay rejects a changed immutable pin',async()=>{
 const registration=await json('config/datasets/national-broad-organization-zip-summary.json');
 const manifest=await json(registration.retained_release.manifest);
 await assert.rejects(
  BROAD_ORGANIZATION_ZIP_SUMMARY_TEST_HOOKS.loadCohort(APP_ROOT,{...manifest.bindings.cohort,artifact_sha256:'0'.repeat(64)}),
  /ZIP cohort artifact pin/,
 );
});
