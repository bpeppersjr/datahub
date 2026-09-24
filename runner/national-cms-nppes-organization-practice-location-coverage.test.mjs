import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { cp, link, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  buildNationalCmsNppesOrganizationPracticeLocationCoverage,
  getNationalCmsNppesCoverageRuntimeMetricsForTest,
  lookupNationalCmsNppesOrganizationZip5,
  publishNationalCmsNppesOrganizationPracticeLocationCoveragePointerForTest,
  readNationalCmsNppesOrganizationPracticeLocationCoverage,
  resetNationalCmsNppesCoverageRuntimeCacheForTest,
  verifyNationalCmsNppesOrganizationPracticeLocationCoverage,
} from './national-cms-nppes-organization-practice-location-coverage.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const root = path.join(process.cwd(), 'data', `.test-cms-nppes-coverage-${process.pid}-${Date.now()}`);
let built;
before(async () => { built = await buildNationalCmsNppesOrganizationPracticeLocationCoverage({ outputRoot: root }); });
after(() => rm(root, { recursive: true, force: true }));

test('publishes the exact governed CMS NPPES organization practice-location envelope', async () => {
  assert.deepEqual(built.coverage, {
    source_main_rows: 9726865,
    active_organization_npis: 1959633,
    active_individual_npis_excluded: 7415294,
    deactivated_npis_limited: 351911,
    organization_primary_locations_with_us_zip: 1958089,
    organizations_without_valid_us_primary_zip: 1544,
    source_practice_location_rows: 1241921,
    accepted_non_primary_practice_locations: 130691,
    excluded_practice_locations: 1109593,
    rejected_practice_locations: 31,
    source_other_name_rows: 859461,
    accepted_other_names: 808030,
    excluded_other_names: 51431,
    quarantined_main_rows: 27,
    source_zip_codes: 28056,
    zip_union_records: 38686,
    states_and_territories: 61,
    unique_taxonomy_codes: 869,
    deduplicated_practice_location_rows: 1606,
    jurisdiction_rows: 61,
    state_dc_rows: 51,
    territory_rows: 5,
    military_rows: 3,
    associated_state_rows: 2,
    positive_zip5_rows: 28056,
    zip5_union_rows: 38686,
    denominator_only_zip5_rows: 10630,
    positive_source_zip_without_zcta: 2177,
    practice_location_records_without_zcta: 7054,
    positive_source_zip_without_published_zbp: 1465,
  });
  const summary = JSON.parse(await readFile(path.join(built.releaseDirectory, 'coverage-summary.json'), 'utf8'));
  assert.equal(summary.practice_location_count, 2088780);
  assert.equal(summary.primary_practice_location_count, 1958089);
  assert.equal(summary.non_primary_practice_location_count, 130691);
  assert.equal(summary.reported_zip4_location_count, 1908009);
  assert.equal(summary.location_zcta_count, 2081726);
  assert.equal(summary.location_nonpolygon_count, 7054);
});

test('strict JSON schema validates every generated row shape', async () => {
  const require = createRequire(import.meta.url);
  const Ajv2020 = createRequire(require.resolve('ajv-formats/package.json'))('ajv/dist/2020.js').default;
  const schema = JSON.parse(await readFile(path.join(process.cwd(), 'config/schemas/national-cms-nppes-organization-practice-location-coverage.schema.json'), 'utf8'));
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  const summary = JSON.parse(await readFile(path.join(built.releaseDirectory, 'coverage-summary.json'), 'utf8'));
  const jurisdictions = (await readFile(path.join(built.releaseDirectory, 'jurisdictions.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const zips = (await readFile(path.join(built.releaseDirectory, 'zip5-coverage.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  for (const row of [summary, ...jurisdictions, ...zips]) assert.equal(validate(row), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...jurisdictions[0], dataset_id: 'national-cms-nppes-organization-practice-location-coverage' }), false);
  assert.equal(validate({ ...zips[0], unexpected: true }), false);
});

test('stable readers expose temporal provenance and aggregate-only ZIP evidence', async () => {
  const pointerPath = path.join(root, 'current.json');
  const result = await readNationalCmsNppesOrganizationPracticeLocationCoverage({ pointerPath });
  assert.equal(result.summary.source_date, '2026-08-09');
  assert.equal(result.verified.retrieved_at, '2026-08-30T14:13:17.460Z');
  assert.equal(result.jurisdictions.length, 61);
  const zip = await lookupNationalCmsNppesOrganizationZip5('00501', { pointerPath });
  assert.equal(zip.row.code, '00501');
  await assert.rejects(lookupNationalCmsNppesOrganizationZip5('501', { pointerPath }), /exactly five digits/);
  const text = (await readFile(path.join(built.releaseDirectory, 'zip5-coverage.jsonl'), 'utf8')).toLowerCase();
  for (const key of ['name', 'address', 'street', 'telephone', 'npi', 'external_identifiers', 'source_record_id', 'healthcare_taxonomies']) assert.equal(text.includes(`"${key}"`), false);
});

test('repeated runtime reads use a verified ZIP index without source replay and honor abort', async () => {
  const pointerPath = path.join(root, 'current.json');
  resetNationalCmsNppesCoverageRuntimeCacheForTest();
  await readNationalCmsNppesOrganizationPracticeLocationCoverage({ pointerPath });
  await readNationalCmsNppesOrganizationPracticeLocationCoverage({ pointerPath });
  const zip = await lookupNationalCmsNppesOrganizationZip5('00501', { pointerPath });
  assert.equal(zip.row.code, '00501');
  assert.deepEqual(getNationalCmsNppesCoverageRuntimeMetricsForTest(), { sourceReplayCount: 0, runtimeLoadCount: 1, runtimeCacheHitCount: 2 });
  const controller = new AbortController();
  controller.abort();
  const started = Date.now();
  await assert.rejects(lookupNationalCmsNppesOrganizationZip5('00501', { pointerPath, signal: controller.signal }), { name: 'AbortError' });
  assert.ok(Date.now() - started < 1000);
  assert.equal(getNationalCmsNppesCoverageRuntimeMetricsForTest().sourceReplayCount, 0);
});

test('runtime cache invalidates when a verified aggregate artifact changes', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-runtime-invalidation-${Date.now()}`);
  await cp(root, directory, { recursive: true });
  const pointerPath = path.join(directory, 'current.json');
  const pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
  const summaryPath = path.join(directory, path.dirname(pointer.manifest), 'coverage-summary.json');
  try {
    resetNationalCmsNppesCoverageRuntimeCacheForTest();
    await readNationalCmsNppesOrganizationPracticeLocationCoverage({ pointerPath });
    await writeFile(summaryPath, '{"forged":true}\n');
    await assert.rejects(readNationalCmsNppesOrganizationPracticeLocationCoverage({ pointerPath }), /artifact bytes changed/);
    assert.equal(getNationalCmsNppesCoverageRuntimeMetricsForTest().sourceReplayCount, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

async function forge(name, artifactIndex, mutate) {
  const directory = path.join(root, `${name}.staging`);
  await cp(built.releaseDirectory, directory, { recursive: true });
  try {
    const names = ['coverage-summary.json', 'jurisdictions.jsonl', 'zip5-coverage.jsonl'];
    const filename = path.join(directory, names[artifactIndex]);
    const manifestPath = path.join(directory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const raw = await readFile(filename, 'utf8');
    const value = artifactIndex === 0 ? JSON.parse(raw) : raw.trim().split(/\r?\n/).map(JSON.parse);
    mutate(value);
    const bytes = artifactIndex === 0 ? Buffer.from(`${JSON.stringify(value, null, 2)}\n`) : Buffer.from(`${value.map(JSON.stringify).join('\n')}\n`);
    await writeFile(filename, bytes);
    manifest.artifacts[artifactIndex].bytes = bytes.length;
    manifest.artifacts[artifactIndex].sha256 = hash(bytes);
    const parts = await Promise.all(names.map((item) => readFile(path.join(directory, item))));
    manifest.release_id = `national-cms-nppes-organization-practice-location-coverage-${hash(Buffer.concat(parts)).slice(0, 16)}`;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(verifyNationalCmsNppesOrganizationPracticeLocationCoverage(manifestPath, { allowStaging: true }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('rejects rehashed privacy, count, and ZCTA forgeries', async () => {
  await forge('privacy', 0, (value) => { value.address = 'leak'; });
  await forge('count', 1, (value) => { value[0].practice_location_count += 1; });
  await forge('zcta', 2, (value) => { value[0].zcta_membership = { status: '2020-zcta-polygon-available', geoid: '99999' }; });
});

test('CAS replacement and first-publication races preserve concurrent pointers', async () => {
  for (const first of [false, true]) {
    const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-cas-${first}-${Date.now()}`);
    const next = Buffer.from('{"next":true}\n');
    await mkdir(directory, { recursive: true });
    if (!first) await writeFile(path.join(directory, 'current.json'), '{"old":true}\n');
    try {
      await assert.rejects(publishNationalCmsNppesOrganizationPracticeLocationCoveragePointerForTest(directory, built.manifest, built.manifestSha256, { afterCompare: async ({ target }) => writeFile(target, next) }), /changed after compare|appeared during CAS/);
      assert.deepEqual(await readFile(path.join(directory, 'current.json')), next);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('cancellation checkpoints leave no pointer or locks', async () => {
  for (const stage of [null, 'beforeStaging', 'betweenWrites', 'beforePointerCas']) {
    const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-cancel-${stage}-${Date.now()}`);
    const controller = new AbortController();
    const hooks = {};
    if (stage) hooks[stage] = async () => controller.abort(); else controller.abort();
    try {
      await assert.rejects(buildNationalCmsNppesOrganizationPracticeLocationCoverage({ outputRoot: directory, signal: controller.signal, hooks }), (error) => error.name === 'AbortError');
      await assert.rejects(readFile(path.join(directory, 'current.json')), (error) => error.code === 'ENOENT');
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('release lock rejects concurrent publication and unexpected inventory', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-lock-${Date.now()}`);
  const release = path.join(directory, 'releases', built.manifest.release_id);
  const lock = `${release}.publish-lock`;
  await mkdir(lock, { recursive: true });
  try {
    await assert.rejects(buildNationalCmsNppesOrganizationPracticeLocationCoverage({ outputRoot: directory }), /release publication locked/);
    assert.deepEqual(await readdir(lock), [], 'foreign release lock remains owned by the other publisher');
  }
  finally { await rm(directory, { recursive: true, force: true }); }
  const unexpected = path.join(built.releaseDirectory, 'unexpected');
  try { await writeFile(unexpected, 'x'); await assert.rejects(verifyNationalCmsNppesOrganizationPracticeLocationCoverage(path.join(built.releaseDirectory, 'manifest.json')), /release inventory/); }
  finally { await rm(unexpected, { force: true }); }
});

test('rejects hardlinked artifacts and invalid manifest pins without pointer mutation', async () => {
  const directory = path.join(root, 'hardlink.staging');
  const outside = path.join(root, 'linked-copy');
  await cp(built.releaseDirectory, directory, { recursive: true });
  try {
    const filename = path.join(directory, 'coverage-summary.json');
    const bytes = await readFile(filename);
    await rm(filename);
    await writeFile(outside, bytes);
    await link(outside, filename);
    await assert.rejects(verifyNationalCmsNppesOrganizationPracticeLocationCoverage(path.join(directory, 'manifest.json'), { allowStaging: true }), /unsafe file/);
  } finally { await rm(directory, { recursive: true, force: true }); await rm(outside, { force: true }); }
  const rollbackRoot = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-rollback-${Date.now()}`);
  const prior = Buffer.from('{"prior":true}\n');
  await mkdir(rollbackRoot, { recursive: true });
  await writeFile(path.join(rollbackRoot, 'current.json'), prior);
  try {
    await assert.rejects(publishNationalCmsNppesOrganizationPracticeLocationCoveragePointerForTest(rollbackRoot, built.manifest, '0'.repeat(64)));
    assert.deepEqual(await readFile(path.join(rollbackRoot, 'current.json')), prior);
  } finally { await rm(rollbackRoot, { recursive: true, force: true }); }
});

test('preserves later pointers at install and rollback boundaries', async () => {
  for (const hook of ['afterOldMove', 'afterNewInstall', 'beforeRollbackRestore']) {
    const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-window-${hook}-${Date.now()}`);
    const prior = Buffer.from('{"prior":true}\n');
    const later = Buffer.from(`{"later":"${hook}"}\n`);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'current.json'), prior);
    const hooks = hook === 'beforeRollbackRestore'
      ? { afterOldMove: async () => { throw new Error('fail after move'); }, beforeRollbackRestore: async ({ target }) => writeFile(target, later, { flag: 'wx' }) }
      : { [hook]: async ({ target }) => { if (hook === 'afterNewInstall') await rm(target); await writeFile(target, later, { flag: 'wx' }); } };
    try {
      await assert.rejects(publishNationalCmsNppesOrganizationPracticeLocationCoveragePointerForTest(directory, built.manifest, built.manifestSha256, hooks));
      assert.deepEqual(await readFile(path.join(directory, 'current.json')), later);
      assert.deepEqual((await readdir(directory)).filter((name) => name.includes('.rollback-')), []);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('ordinary post-install failure restores the prior pointer', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-own-pointer-rollback-${Date.now()}`);
  const prior = Buffer.from('{"prior":true}\n');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'current.json'), prior);
  try {
    await assert.rejects(publishNationalCmsNppesOrganizationPracticeLocationCoveragePointerForTest(directory, built.manifest, built.manifestSha256, { afterNewInstall: async () => { throw new Error('post-install failure'); } }), /post-install failure/);
    assert.deepEqual(await readFile(path.join(directory, 'current.json')), prior);
    assert.deepEqual((await readdir(directory)).filter((name) => name.includes('.rollback-')), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rollback refuses a substituted backup and never installs forged bytes', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-backup-swap-${Date.now()}`);
  const prior = Buffer.from('{"prior":true}\n');
  const forged = Buffer.from('{"forged":true}\n');
  let backupPath;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'current.json'), prior);
  try {
    await assert.rejects(publishNationalCmsNppesOrganizationPracticeLocationCoveragePointerForTest(directory, built.manifest, built.manifestSha256, {
      afterOldMove: async () => { throw new Error('force rollback'); },
      beforeRollbackRestore: async ({ backup }) => { backupPath = backup; await rm(backup); await writeFile(backup, forged); },
    }), (error) => error instanceof AggregateError && error.errors.some((item) => /backup identity changed before rollback/.test(item.message)));
    await assert.rejects(readFile(path.join(directory, 'current.json')), (error) => error.code === 'ENOENT');
    assert.deepEqual(await readFile(backupPath), forged);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('readers return only bytes bound to the verified manifest', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-reader-bind-${Date.now()}`);
  await cp(root, directory, { recursive: true });
  const pointerPath = path.join(directory, 'current.json');
  const pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
  const summaryPath = path.join(directory, pointer.manifest.replaceAll('/', path.sep), '..', 'coverage-summary.json');
  try {
    await assert.rejects(
      readNationalCmsNppesOrganizationPracticeLocationCoverage({ pointerPath, hooks: { afterVerification: async () => writeFile(summaryPath, '{"forged":true}\n') } }),
      /coverage artifacts changed during read/,
    );
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('post-verification staging mutation cannot publish an installed release pointer', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-post-verify-${Date.now()}`);
  try {
    await assert.rejects(buildNationalCmsNppesOrganizationPracticeLocationCoverage({ outputRoot: directory, hooks: { afterVerification: async ({ staging }) => writeFile(path.join(staging, 'coverage-summary.json'), '{"forged":true}\n') } }), /artifact bytes changed/);
    await assert.rejects(readFile(path.join(directory, 'current.json')), (error) => error.code === 'ENOENT');
    assert.deepEqual(await readdir(path.join(directory, 'releases')), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('installed release mutation before pointer CAS cannot publish a pointer', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-pre-cas-${Date.now()}`);
  try {
    await assert.rejects(buildNationalCmsNppesOrganizationPracticeLocationCoverage({ outputRoot: directory, hooks: { beforePointerCas: async ({ release }) => writeFile(path.join(release, 'coverage-summary.json'), '{"forged":true}\n') } }), /artifact bytes changed/);
    await assert.rejects(readFile(path.join(directory, 'current.json')), (error) => error.code === 'ENOENT');
    assert.deepEqual(await readdir(path.join(directory, 'releases')), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('two identical builds converge on the same content-addressed release on Windows', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-idempotent-${Date.now()}`);
  try {
    const first = await buildNationalCmsNppesOrganizationPracticeLocationCoverage({ outputRoot: directory });
    const second = await buildNationalCmsNppesOrganizationPracticeLocationCoverage({ outputRoot: directory });
    assert.equal(second.manifest.release_id, first.manifest.release_id);
    assert.equal(second.manifestSha256, first.manifestSha256);
    assert.deepEqual((await readdir(path.join(directory, 'releases'))).filter((name) => !name.endsWith('.publish-lock')), [first.manifest.release_id]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rejects redirected staging and release ancestors without writing outside', async () => {
  for (const child of ['.staging', 'releases']) {
    const directory = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-redirect-${child.replace('.', '')}-${Date.now()}`);
    const outside = path.join(process.cwd(), `.test-irs-eo-bmf-redirect-outside-${child.replace('.', '')}-${Date.now()}`);
    await mkdir(directory, { recursive: true });
    await mkdir(outside);
    await symlink(outside, path.join(directory, child), 'junction');
    try {
      await assert.rejects(buildNationalCmsNppesOrganizationPracticeLocationCoverage({ outputRoot: directory }), /ancestry redirected/);
      assert.deepEqual(await readdir(outside), []);
    } finally { await rm(directory, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  }
});

test('rejects redirected output ancestry before writing outside governed data', async () => {
  const outside = path.join(process.cwd(), `.test-irs-eo-bmf-outside-${Date.now()}`);
  const linked = path.join(process.cwd(), 'data', `.test-irs-eo-bmf-linked-${Date.now()}`);
  await mkdir(outside);
  await symlink(outside, linked, 'junction');
  try {
    await assert.rejects(buildNationalCmsNppesOrganizationPracticeLocationCoverage({ outputRoot: linked }), /ancestry redirected/);
    assert.deepEqual(await readdir(outside), []);
  } finally { await rm(linked, { force: true }); await rm(outside, { recursive: true, force: true }); }
});
