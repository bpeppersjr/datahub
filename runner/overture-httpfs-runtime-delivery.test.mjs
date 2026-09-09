import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { OVERTURE_HTTPFS_RUNTIME as C, prepareOvertureHttpfsRuntime } from './overture-httpfs-runtime.mjs';

test('fixed native entry rejects hostile delivery without publishing runtime readiness', { skip: process.platform !== 'win32' || process.arch !== 'x64' }, async t => {
  const base = path.join(APP_ROOT, 'data/tmp');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'httpfs-delivery-'));
  // Synthetic failed deliveries only. Local engine metadata is queried; no
  // extension can reach LOAD because these cases fail before decompression.
  const cases = [
    () => new Response('denied', { status: 403 }),
    () => new Response('redirect', { status: 302, headers: { location: 'https://private.invalid' } }),
    () => new Response('encoded', { headers: { 'content-encoding': 'gzip' } }),
    () => new Response('oversize', { headers: { 'content-length': String(C.compressed_cap + 1) } }),
    () => new Response('bad length', { headers: { 'content-length': 'not-a-number' } }),
    () => new Response(new Uint8Array(0)),
    () => new Response(new Uint8Array(C.compressed_cap + 1)),
  ];
  try {
    for (const response of cases) {
      let requests = 0;
      const mocked = t.mock.method(globalThis, 'fetch', async (url, options) => {
        requests++;
        assert.equal(url, C.url);
        assert.equal(options.redirect, 'error');
        assert.equal(options.credentials, 'omit');
        assert.equal(options.headers['Accept-Encoding'], 'identity');
        return response();
      });
      const operationId = randomUUID(), output = path.join(root, operationId, 'output');
      await assert.rejects(prepareOvertureHttpfsRuntime({ output, operationId }));
      assert.equal(requests, 1);
      const jobs = path.join(output, 'jobs');
      for (const run of await readdir(jobs)) {
        assert.ok(!(await readdir(path.join(jobs, run))).includes('manifest.json'));
      }
      mocked.mock.restore();
    }
  } finally {
    assert.equal(path.dirname(root), base);
    await rm(root, { recursive: true, force: true });
  }
});
