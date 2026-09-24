import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { cp, link, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  buildNationalFsisActiveEstablishmentCoverage,
  lookupNationalFsisActiveEstablishmentZip5,
  publishNationalFsisActiveEstablishmentCoveragePointerForTest,
  readNationalFsisActiveEstablishmentCoverage,
  verifyNationalFsisActiveEstablishmentCoverage,
} from './national-fsis-active-establishment-coverage.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const root = path.join(process.cwd(), 'data', `.test-fsis-coverage-${process.pid}-${Date.now()}`);
let built;
before(async () => { built = await buildNationalFsisActiveEstablishmentCoverage({ outputRoot: root }); });
after(() => rm(root, { recursive: true, force: true }));

test('publishes the exact governed FSIS active-directory envelope', async () => {
  assert.deepEqual(built.coverage, {
    source_directory_records: 7237,
    source_demographic_records: 7237,
    accepted_active_establishments: 7237,
    quarantined_records: 0,
    jurisdiction_rows: 56,
    state_dc_rows: 51,
    territory_rows: 5,
    positive_zip5_rows: 4367,
    zip5_union_rows: 37859,
    denominator_only_zip5_rows: 33492,
    positive_source_zip_without_zcta: 72,
    active_establishment_records_without_zcta: 85,
    positive_source_zip_without_published_zbp: 100,
  });
  const summary = JSON.parse(await readFile(path.join(built.releaseDirectory, 'coverage-summary.json'), 'utf8'));
  assert.equal(summary.active_establishment_count, 7237);
  assert.equal(summary.reported_zip4_count, 113);
  assert.equal(summary.retained_coordinate_count, 7237);
  assert.equal(summary.record_zcta_count, 7152);
  assert.deepEqual(summary.active_grant_counts, { egg: 102, meat: 5688, poultry: 4546, voluntary: 2105 });
  assert.equal(Object.keys(summary.reported_activity_counts).length, 25);
});

test('strict JSON schema validates every generated row shape', async () => {
  const require = createRequire(import.meta.url);
  const Ajv2020 = createRequire(require.resolve('ajv-formats/package.json'))('ajv/dist/2020.js').default;
  const schema = JSON.parse(await readFile(path.join(process.cwd(), 'config/schemas/national-fsis-active-establishment-coverage.schema.json'), 'utf8'));
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  const summary = JSON.parse(await readFile(path.join(built.releaseDirectory, 'coverage-summary.json'), 'utf8'));
  const jurisdictions = (await readFile(path.join(built.releaseDirectory, 'jurisdictions.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const zips = (await readFile(path.join(built.releaseDirectory, 'zip5-coverage.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  for (const row of [summary, ...jurisdictions, ...zips]) assert.equal(validate(row), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...jurisdictions[0], dataset_id: 'national-fsis-active-establishment-coverage' }), false);
  assert.equal(validate({ ...zips[0], unexpected: true }), false);
});

test('stable readers expose temporal provenance and aggregate-only ZIP evidence', async () => {
  const pointerPath = path.join(root, 'current.json');
  const result = await readNationalFsisActiveEstablishmentCoverage({ pointerPath });
  assert.equal(result.summary.source_date, '2026-08-24');
  assert.equal(result.verified.retrieved_at, '2026-09-03T00:22:10.046Z');
  assert.equal(result.jurisdictions.length, 56);
  const zip = await lookupNationalFsisActiveEstablishmentZip5('00501', { pointerPath });
  assert.equal(zip.row.code, '00501');
  await assert.rejects(lookupNationalFsisActiveEstablishmentZip5('501', { pointerPath }), /exactly five digits/);
  const text = (await readFile(path.join(built.releaseDirectory, 'zip5-coverage.jsonl'), 'utf8')).toLowerCase();
  for (const key of ['other_names', 'street', 'telephone', 'coordinates', 'geometry', 'establishment_id', 'normalized_record_id']) assert.equal(text.includes(`"${key}"`), false);
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
    manifest.release_id = `national-fsis-active-establishment-coverage-${hash(Buffer.concat(parts)).slice(0, 16)}`;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(verifyNationalFsisActiveEstablishmentCoverage(manifestPath, { allowStaging: true }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('rejects rehashed privacy, count, and ZCTA forgeries', async () => {
  await forge('privacy', 0, (value) => { value.address = 'leak'; });
  await forge('count', 1, (value) => { value[0].active_establishment_count += 1; });
  await forge('zcta', 2, (value) => { value[0].zcta_membership = { status: '2020-zcta-polygon-available', geoid: '99999' }; });
});

test('CAS replacement and first-publication races preserve concurrent pointers', async () => {
  for (const first of [false, true]) {
    const directory = path.join(process.cwd(), 'data', `.test-fsis-cas-${first}-${Date.now()}`);
    const next = Buffer.from('{"next":true}\n');
    await mkdir(directory, { recursive: true });
    if (!first) await writeFile(path.join(directory, 'current.json'), '{"old":true}\n');
    try {
      await assert.rejects(publishNationalFsisActiveEstablishmentCoveragePointerForTest(directory, built.manifest, built.manifestSha256, { afterCompare: async ({ target }) => writeFile(target, next) }), /changed after compare|appeared during CAS/);
      assert.deepEqual(await readFile(path.join(directory, 'current.json')), next);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('cancellation checkpoints leave no pointer or locks', async () => {
  for (const stage of [null, 'beforeStaging', 'betweenWrites', 'beforePointerCas']) {
    const directory = path.join(process.cwd(), 'data', `.test-fsis-cancel-${stage}-${Date.now()}`);
    const controller = new AbortController();
    const hooks = {};
    if (stage) hooks[stage] = async () => controller.abort(); else controller.abort();
    try {
      await assert.rejects(buildNationalFsisActiveEstablishmentCoverage({ outputRoot: directory, signal: controller.signal, hooks }), (error) => error.name === 'AbortError');
      await assert.rejects(readFile(path.join(directory, 'current.json')), (error) => error.code === 'ENOENT');
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('release lock rejects concurrent publication and unexpected inventory', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-fsis-lock-${Date.now()}`);
  const release = path.join(directory, 'releases', built.manifest.release_id);
  const lock = `${release}.publish-lock`;
  await mkdir(lock, { recursive: true });
  try {
    await assert.rejects(buildNationalFsisActiveEstablishmentCoverage({ outputRoot: directory }), /release publication locked/);
    assert.deepEqual(await readdir(lock), [], 'foreign release lock remains owned by the other publisher');
  }
  finally { await rm(directory, { recursive: true, force: true }); }
  const unexpected = path.join(built.releaseDirectory, 'unexpected');
  try { await writeFile(unexpected, 'x'); await assert.rejects(verifyNationalFsisActiveEstablishmentCoverage(path.join(built.releaseDirectory, 'manifest.json')), /release inventory/); }
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
    await assert.rejects(verifyNationalFsisActiveEstablishmentCoverage(path.join(directory, 'manifest.json'), { allowStaging: true }), /unsafe file/);
  } finally { await rm(directory, { recursive: true, force: true }); await rm(outside, { force: true }); }
  const rollbackRoot = path.join(process.cwd(), 'data', `.test-fsis-rollback-${Date.now()}`);
  const prior = Buffer.from('{"prior":true}\n');
  await mkdir(rollbackRoot, { recursive: true });
  await writeFile(path.join(rollbackRoot, 'current.json'), prior);
  try {
    await assert.rejects(publishNationalFsisActiveEstablishmentCoveragePointerForTest(rollbackRoot, built.manifest, '0'.repeat(64)));
    assert.deepEqual(await readFile(path.join(rollbackRoot, 'current.json')), prior);
  } finally { await rm(rollbackRoot, { recursive: true, force: true }); }
});

test('preserves later pointers at install and rollback boundaries', async () => {
  for (const hook of ['afterOldMove', 'afterNewInstall', 'beforeRollbackRestore']) {
    const directory = path.join(process.cwd(), 'data', `.test-fsis-window-${hook}-${Date.now()}`);
    const prior = Buffer.from('{"prior":true}\n');
    const later = Buffer.from(`{"later":"${hook}"}\n`);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'current.json'), prior);
    const hooks = hook === 'beforeRollbackRestore'
      ? { afterOldMove: async () => { throw new Error('fail after move'); }, beforeRollbackRestore: async ({ target }) => writeFile(target, later, { flag: 'wx' }) }
      : { [hook]: async ({ target }) => { if (hook === 'afterNewInstall') await rm(target); await writeFile(target, later, { flag: 'wx' }); } };
    try {
      await assert.rejects(publishNationalFsisActiveEstablishmentCoveragePointerForTest(directory, built.manifest, built.manifestSha256, hooks));
      assert.deepEqual(await readFile(path.join(directory, 'current.json')), later);
      assert.deepEqual((await readdir(directory)).filter((name) => name.includes('.rollback-')), []);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('readers return only bytes bound to the verified manifest', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-fsis-reader-bind-${Date.now()}`);
  await cp(root, directory, { recursive: true });
  const pointerPath = path.join(directory, 'current.json');
  const pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
  const summaryPath = path.join(directory, pointer.manifest.replaceAll('/', path.sep), '..', 'coverage-summary.json');
  try {
    const result = await readNationalFsisActiveEstablishmentCoverage({ pointerPath, hooks: { afterVerification: async () => writeFile(summaryPath, '{"forged":true}\n') } });
    assert.equal(result.summary.active_establishment_count, 7237);
    assert.equal(result.summary.forged, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('post-verification staging mutation cannot publish an installed release pointer', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-fsis-post-verify-${Date.now()}`);
  try {
    await assert.rejects(buildNationalFsisActiveEstablishmentCoverage({ outputRoot: directory, hooks: { afterVerification: async ({ staging }) => writeFile(path.join(staging, 'coverage-summary.json'), '{"forged":true}\n') } }), /artifact bytes changed/);
    await assert.rejects(readFile(path.join(directory, 'current.json')), (error) => error.code === 'ENOENT');
    assert.deepEqual(await readdir(path.join(directory, 'releases')), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('installed release mutation before pointer CAS cannot publish a pointer', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-fsis-pre-cas-${Date.now()}`);
  try {
    await assert.rejects(buildNationalFsisActiveEstablishmentCoverage({ outputRoot: directory, hooks: { beforePointerCas: async ({ release }) => writeFile(path.join(release, 'coverage-summary.json'), '{"forged":true}\n') } }), /artifact bytes changed/);
    await assert.rejects(readFile(path.join(directory, 'current.json')), (error) => error.code === 'ENOENT');
    assert.deepEqual(await readdir(path.join(directory, 'releases')), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('two identical builds converge on the same content-addressed release on Windows', async () => {
  const directory = path.join(process.cwd(), 'data', `.test-fsis-idempotent-${Date.now()}`);
  try {
    const first = await buildNationalFsisActiveEstablishmentCoverage({ outputRoot: directory });
    const second = await buildNationalFsisActiveEstablishmentCoverage({ outputRoot: directory });
    assert.equal(second.manifest.release_id, first.manifest.release_id);
    assert.equal(second.manifestSha256, first.manifestSha256);
    assert.deepEqual((await readdir(path.join(directory, 'releases'))).filter((name) => !name.endsWith('.publish-lock')), [first.manifest.release_id]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rejects redirected staging and release ancestors without writing outside', async () => {
  for (const child of ['.staging', 'releases']) {
    const directory = path.join(process.cwd(), 'data', `.test-fsis-redirect-${child.replace('.', '')}-${Date.now()}`);
    const outside = path.join(process.cwd(), `.test-fsis-redirect-outside-${child.replace('.', '')}-${Date.now()}`);
    await mkdir(directory, { recursive: true });
    await mkdir(outside);
    await symlink(outside, path.join(directory, child), 'junction');
    try {
      await assert.rejects(buildNationalFsisActiveEstablishmentCoverage({ outputRoot: directory }), /ancestry redirected/);
      assert.deepEqual(await readdir(outside), []);
    } finally { await rm(directory, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  }
});

test('rejects redirected output ancestry before writing outside governed data', async () => {
  const outside = path.join(process.cwd(), `.test-fsis-outside-${Date.now()}`);
  const linked = path.join(process.cwd(), 'data', `.test-fsis-linked-${Date.now()}`);
  await mkdir(outside);
  await symlink(outside, linked, 'junction');
  try {
    await assert.rejects(buildNationalFsisActiveEstablishmentCoverage({ outputRoot: linked }), /ancestry redirected/);
    assert.deepEqual(await readdir(outside), []);
  } finally { await rm(linked, { force: true }); await rm(outside, { recursive: true, force: true }); }
});
