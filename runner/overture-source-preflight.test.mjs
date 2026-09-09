import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { APP_ROOT } from './paths.mjs';
import { probeOvertureSourcePreflightForTest as probe, readOvertureSourcePreflightForTest as inspect, readOvertureSourcePreflight } from './overture-source-preflight.mjs';

const root = 'https://stac.overturemaps.org';
const release = '2026-08-19.0';
const documents = [
  { type: 'Catalog', stac_version: '1.1.0', links: [{ rel: 'child', latest: true, href: `${root}/${release}/catalog.json` }] },
  { type: 'Collection', id: 'place', stac_version: '1.1.0', links: [{ rel: 'item', href: `${root}/${release}/places/place/00000/00000.json` }] },
  { type: 'Feature', id: '00000', properties: { num_rows: 10, num_row_groups: 1, datetime: '2026-08-19T00:00:00Z' }, assets: { aws: { href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/part-00000-abcdef-c000.zstd.parquet` } } },
];

async function fixture(t) {
  const operationId = randomUUID();
  const directory = path.join(APP_ROOT, 'data', 'tmp', 'overture-preflight-tests', operationId);
  const output = path.join(directory, 'output');
  await mkdir(directory, { recursive: true });
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  return { output, operationId, limits: { minIntervalMs: 0 }, fetchImpl: async (url, options) => {
    assert.equal(new URL(url).hostname, 'stac.overturemaps.org');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers['Accept-Encoding'], 'identity');
    return Response.json(documents[calls++]);
  } };
}

test('synthetic metadata persists and replays without asset requests or native claims', async t => {
  const options = await fixture(t);
  const descriptor = await probe(options);
  const result = await inspect(descriptor, { output: options.output, operationId: options.operationId });
  assert.equal(result.manifest.requests.length, 3);
  assert.equal(result.manifest.result.asset_count, 1);
  assert.equal(result.manifest.claims.native_acquisition_verified, false);
  await assert.rejects(readOvertureSourcePreflight(descriptor, { output: options.output, operationId: options.operationId }));
});

test('non200, encoding, malformed JSON and byte caps never retry or expose remote errors', async t => {
  for (const make of [() => new Response('PRIVATE', { status: 302 }), () => new Response('{}', { headers: { 'content-encoding': 'gzip' } }), () => new Response('PRIVATE'), () => new Response('x'.repeat(100))]) {
    const options = await fixture(t);
    let calls = 0;
    options.fetchImpl = async () => { calls++; return make(); };
    options.limits.maxBodyBytes = 50;
    await assert.rejects(probe(options), error => error.name === 'AbortError' && !error.message.includes('PRIVATE'));
    assert.equal(calls, 1);
  }
});

test('offline reader rejects extra files, tampering, clocks and wrong descriptor binding', async t => {
  for (const mutation of ['inventory', 'metadata', 'result', 'clock', 'binding']) {
    const options = await fixture(t), descriptor = await probe(options);
    const directory = path.dirname(descriptor.manifest);
    if (mutation === 'inventory') await writeFile(path.join(directory, 'extra'), 'x');
    if (mutation === 'metadata') await writeFile(path.join(directory, 'response-01.json'), '{}');
    if (mutation === 'binding') descriptor.operation_id = randomUUID();
    if (['result', 'clock'].includes(mutation)) {
      const manifest = JSON.parse(await readFile(descriptor.manifest, 'utf8'));
      if (mutation === 'result') manifest.result.asset_count = 2;
      else manifest.completed_at = '2099-01-01T00:00:00.000Z';
      const bytes = JSON.stringify(manifest);
      await writeFile(descriptor.manifest, bytes);
      descriptor.sha256 = createHash('sha256').update(bytes).digest('hex');
    }
    await assert.rejects(inspect(descriptor, { output: options.output, operationId: options.operationId }));
  }
});

test('abort drains late fetch response cancellation before rejecting', { timeout: 5000 }, async t => {
  const options = await fixture(t), controller = new AbortController();
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let cancelled = false, settled = false;
  options.signal = controller.signal;
  options.fetchImpl = async () => {
    entered(); await gate;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  };
  const pending = probe(options).finally(() => { settled = true; });
  const rejected = assert.rejects(pending);
  try {
    await started; controller.abort('PRIVATE');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
  } finally { release(); }
  await rejected;
  assert.equal(cancelled, true);
});

test('CLI help and malformed arguments never dispatch', () => {
  const script = path.join(APP_ROOT, 'scripts', 'probe-overture-source-preflight.mjs');
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /No place assets/);
  for (const args of [[], ['--private', 'PRIVATE'], ['--output', 'PRIVATE', '--output', 'PRIVATE']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes('PRIVATE'));
  }
});
