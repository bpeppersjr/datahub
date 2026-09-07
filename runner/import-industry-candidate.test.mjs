import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { importIndustryCandidate } from './import-industry-candidate.mjs';
import { buildNyRetailFoodStores, NY_RETAIL_FOOD_SCHEMA, verifyNyRetailFoodStores } from './ny-retail-food-stores.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const candidateRelative = 'data/migrations/normalized-us-postal-fields-v1/sources/nyRetailFoodStores';

async function fixture(t) {
  const temporaryRoot = path.join(APP_ROOT, 'data', 'tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, 'candidate-import-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'config/migrations'), { recursive: true });
  await copyFile(path.join(APP_ROOT, 'config/migrations/normalized-us-postal-fields-v1.json'), path.join(root, 'config/migrations/normalized-us-postal-fields-v1.json'));
  const baselineRoot = path.join(root, 'baseline');
  await mkdir(path.join(baselineRoot, 'derived'), { recursive: true });
  const baseline = Buffer.from(`${JSON.stringify({ zip_code: '12054', coverage_status: 'zbp-and-zcta', current_usps_validity: { status: 'unverified' }, geography: { status: '2020-zcta-polygon-available', geo_id: 'zcta:12054', geoid: '12054' } })}\n`);
  await writeFile(path.join(baselineRoot, 'derived/zip-coverage.jsonl'), baseline);
  await writeFile(path.join(baselineRoot, 'manifest.json'), JSON.stringify({ dataset_id: 'census-zbp-baseline', release_id: 'fixture-baseline', complete_national_release: true, geography_dependency: { dataset_id: 'us-census-geography', release_id: 'fixture-geography' }, artifacts: [{ path: 'derived/zip-coverage.jsonl', bytes: baseline.length, sha256: digest(baseline) }] }));
  await writeFile(path.join(baselineRoot, 'current.json'), JSON.stringify({ manifest: 'manifest.json' }));
  const sourceRoot = path.join(root, 'data/industry-refresh/fixture');
  const built = await buildNyRetailFoodStores({
    outputRoot: sourceRoot,
    zbpPointer: path.join(baselineRoot, 'current.json'),
    catalogMetadata: { id: '9a8c-vfzj', name: 'Retail Food Stores', attribution: 'New York State Department of Agriculture and Markets', provenance: 'official', publicationStage: 'published', license: null, rowsUpdatedAt: 1759245315, columns: NY_RETAIL_FOOD_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })), metadata: { custom_fields: { 'Dataset Summary': { Organization: 'Division of Food Safety & Inspection', 'Time Period': 'Current', 'Posting Frequency': 'Annually', Coverage: 'Statewide', Granularity: 'Licensed entity' } } }, selectedRecordCount: 1, distinctLicenseCount: 1 },
    sourceRecords: [{ county: 'ALBANY', license_number: '010008', operation_type: 'Store', estab_type: 'AC', entity_name: 'FIXTURE MARKET LLC', dba_name: 'FIXTURE MARKET', street_number: '624', street_name: 'DELAWARE AVE', city: 'DELMAR', state: 'NY', zip_code: '12054', square_footage: '2800', georeference: { type: 'Point', coordinates: [-73.85206, 42.61512] } }],
    minimumRows: 1, logger: () => {},
  });
  const sourcePointer = path.join(sourceRoot, 'current.json');
  const sourcePointerBytes = await readFile(sourcePointer);
  const manifestBytes = await readFile(path.join(built.releaseDirectory, 'manifest.json'));
  const candidateRoot = path.join(root, candidateRelative);
  await mkdir(candidateRoot, { recursive: true });
  const previousPointer = Buffer.from('{"release_id":"old-candidate","manifest":"releases/old/manifest.json"}\n');
  await writeFile(path.join(candidateRoot, 'current.json'), previousPointer);
  const productionPath = path.join(root, 'data/business-sources/ny-retail-food-store-license-sites/current.json');
  await mkdir(path.dirname(productionPath), { recursive: true });
  await writeFile(productionPath, 'production-pointer-must-not-change');
  return { root, built, sourcePointer, sourcePointerBytes, manifestBytes, candidateRoot, previousPointer, productionPath, options: { root, sourceKey: 'nyRetailFoodStores', sourcePointer, expectedReleaseId: built.manifest.release_id, expectedManifestSha256: digest(manifestBytes) } };
}

test('candidate import preserves a real verified release and leaves source/production pointers untouched', async (t) => {
  const f = await fixture(t);
  const result = await importIndustryCandidate(f.options);
  assert.equal(result.pointerPath, path.join(f.candidateRoot, 'current.json'));
  assert.deepEqual(await readFile(path.join(result.releaseDirectory, 'manifest.json')), f.manifestBytes);
  assert.deepEqual(await readFile(f.sourcePointer), f.sourcePointerBytes);
  assert.equal(await readFile(f.productionPath, 'utf8'), 'production-pointer-must-not-change');
  const pointer = JSON.parse(await readFile(result.pointerPath, 'utf8'));
  assert.equal(pointer.release_id, f.built.manifest.release_id);
  const verified = await verifyNyRetailFoodStores(path.join(result.releaseDirectory, 'manifest.json'));
  assert.equal(verified.coverage.organizations_published, 1);
  assert.deepEqual(JSON.parse(await readFile(result.receiptPath, 'utf8')), result.receipt);
  for (const artifact of f.built.manifest.artifacts) {
    assert.deepEqual(await readFile(path.join(result.releaseDirectory, artifact.path)), await readFile(path.join(f.built.releaseDirectory, artifact.path)));
  }
  await assert.rejects(importIndustryCandidate(f.options), /exist|already|collision/i);
});

test('candidate import rejects a mismatched manifest pin and altered artifacts before publication', async (t) => {
  const f = await fixture(t);
  await assert.rejects(importIndustryCandidate({ ...f.options, expectedManifestSha256: '0'.repeat(64) }), /hash|sha|manifest|pin/i);
  const artifact = f.built.manifest.artifacts[0];
  await writeFile(path.join(f.built.releaseDirectory, artifact.path), 'altered');
  await assert.rejects(importIndustryCandidate(f.options), /hash|sha|artifact|verify|mismatch|verification/i);
  assert.deepEqual(await readFile(path.join(f.candidateRoot, 'current.json')), f.previousPointer);
});

test('candidate import refuses unknown sources, wrong release pins, and paths outside datahub', async (t) => {
  const f = await fixture(t);
  await assert.rejects(importIndustryCandidate({ ...f.options, sourceKey: 'arbitrary-source' }), /source|allow/i);
  await assert.rejects(importIndustryCandidate({ ...f.options, expectedReleaseId: 'wrong-release' }), /release|pin/i);
  await assert.rejects(importIndustryCandidate({ ...f.options, sourcePointer: path.resolve(f.root, '../outside/current.json') }), /outside|escape|inside|contain/i);
  assert.deepEqual(await readFile(path.join(f.candidateRoot, 'current.json')), f.previousPointer);
});

test('candidate import honors cancellation and preserves concurrent candidate pointer changes', async (t) => {
  const f = await fixture(t);
  const signal = AbortSignal.abort();
  await assert.rejects(importIndustryCandidate({ ...f.options, signal }), /abort|cancel/i);
  const concurrentPointer = '{"release_id":"concurrent-owner"}';
  await assert.rejects(importIndustryCandidate({ ...f.options, dependencies: { beforePublish: async () => writeFile(path.join(f.candidateRoot, 'current.json'), concurrentPointer) } }), /pointer|changed|drift|concurrent/i);
  assert.equal(await readFile(path.join(f.candidateRoot, 'current.json'), 'utf8'), concurrentPointer);
  assert.deepEqual(await readFile(f.sourcePointer), f.sourcePointerBytes);
});

test('candidate import refuses an existing staging directory without overwriting it', async (t) => {
  const f = await fixture(t);
  const staging = path.join(f.candidateRoot, '.staging', f.built.manifest.run_id);
  await mkdir(staging, { recursive: true });
  await writeFile(path.join(staging, 'owner.txt'), 'existing-owner');
  await assert.rejects(importIndustryCandidate(f.options), /exist|collision|staging/i);
  assert.equal(await readFile(path.join(staging, 'owner.txt'), 'utf8'), 'existing-owner');
  assert.deepEqual(await readFile(path.join(f.candidateRoot, 'current.json')), f.previousPointer);
});

test('candidate import rejects junction aliases and manifest artifact path traversal', async (t) => {
  const f = await fixture(t);
  const alias = path.join(f.root, 'data/source-alias');
  await symlink(path.dirname(f.sourcePointer), alias, 'junction');
  await assert.rejects(importIndustryCandidate({ ...f.options, sourcePointer: path.join(alias, 'current.json') }), /link|junction|symlink/i);
  const manifestPath = path.join(f.built.releaseDirectory, 'manifest.json');
  const manifest = JSON.parse(f.manifestBytes);
  manifest.artifacts[0].path = '../outside.json';
  const changed = JSON.stringify(manifest);
  await writeFile(manifestPath, changed);
  await assert.rejects(importIndustryCandidate({ ...f.options, expectedManifestSha256: digest(changed) }), /path|outside|escape|artifact|relative|verification/i);
  assert.deepEqual(await readFile(path.join(f.candidateRoot, 'current.json')), f.previousPointer);
});

test('candidate import rejects linked destination ancestry and a redirected migration root', async (t) => {
  const f = await fixture(t);
  const receiptAlias = path.join(f.root, 'data/migrations/normalized-us-postal-fields-v1/import-receipts');
  const target = path.join(f.root, 'receipt-target');
  await mkdir(target);
  await symlink(target, receiptAlias, 'junction');
  await assert.rejects(importIndustryCandidate(f.options), /link|junction|symlink/i);
  assert.deepEqual(await readdir(target), []);
  const definitionPath = path.join(f.root, 'config/migrations/normalized-us-postal-fields-v1.json');
  const definition = JSON.parse(await readFile(definitionPath, 'utf8'));
  definition.candidate_root = 'data/business-sources';
  await writeFile(definitionPath, JSON.stringify(definition));
  await assert.rejects(importIndustryCandidate(f.options), /root|migration|candidate|definition/i);
  assert.equal(await readFile(f.productionPath, 'utf8'), 'production-pointer-must-not-change');
});

test('candidate import serializes concurrent owners and records post-publication failure honestly', async (t) => {
  const f = await fixture(t);
  let entered;
  const atCommit = new Promise((resolve) => { entered = resolve; });
  let resume;
  const commitGate = new Promise((resolve) => { resume = resolve; });
  const first = importIndustryCandidate({ ...f.options, dependencies: { beforePublish: async () => { entered(); await commitGate; } } });
  await atCommit;
  try { await assert.rejects(importIndustryCandidate(f.options), /lock|active|busy|owner|concurrent/i); }
  finally { resume(); }
  await first;
  const second = await fixture(t);
  let verifyCalls = 0;
  const verify = async (manifest) => {
    verifyCalls += 1;
    if (verifyCalls === 3) throw new Error('Injected post-publication verification failure');
    return verifyNyRetailFoodStores(manifest);
  };
  let failure;
  try { await importIndustryCandidate({ ...second.options, dependencies: { verifiers: { nyRetailFoodStores: verify } } }); }
  catch (error) { failure = error; }
  assert.match(failure?.message ?? '', /post-publication/);
  assert.ok(failure.receiptPath);
  const receipt = JSON.parse(await readFile(failure.receiptPath, 'utf8'));
  assert.equal(receipt.status, 'published-unverified');
  assert.equal(JSON.parse(await readFile(path.join(second.candidateRoot, 'current.json'), 'utf8')).release_id, second.built.manifest.release_id);
});

test('candidate import rejects linked staging and staging manifest drift before the commit point', async (t) => {
  const f = await fixture(t);
  const stagingTarget = path.join(f.root, 'staging-target');
  await mkdir(stagingTarget);
  await symlink(stagingTarget, path.join(f.candidateRoot, '.staging'), 'junction');
  await assert.rejects(importIndustryCandidate(f.options), /link|junction|symlink/i);
  assert.deepEqual(await readdir(stagingTarget), []);
  const other = await fixture(t);
  await assert.rejects(importIndustryCandidate({ ...other.options, dependencies: { beforePublish: async () => {
    const stagedManifest = path.join(other.candidateRoot, '.staging', other.built.manifest.run_id, 'manifest.json');
    const value = JSON.parse(await readFile(stagedManifest, 'utf8'));
    value.modified_after_verification = true;
    await writeFile(stagedManifest, JSON.stringify(value));
  } } }), /manifest|hash|pin|changed/i);
  assert.deepEqual(await readFile(path.join(other.candidateRoot, 'current.json')), other.previousPointer);
});
