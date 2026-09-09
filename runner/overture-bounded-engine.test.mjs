import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { runOvertureBoundedEngine } from './overture-bounded-engine.mjs';
import { OVERTURE_HTTPFS_RUNTIME } from './overture-httpfs-runtime.mjs';

test('bounded engine rejects options, runtime claims and bridge URLs before output creation', async t => {
  const base = path.join(APP_ROOT, 'data/tmp'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, 'bounded-engine-negative-'));
  const operationId = randomUUID(), run = randomUUID(), runtimeOutput = path.join(directory, operationId, 'output');
  const options = { output: path.join(directory, 'engine'), runtimeOutput, runtimeOperationId: operationId,
    runtimeDescriptor: { run_id: run, operation_id: operationId, manifest: path.join(runtimeOutput, 'jobs', run, 'manifest.json'), sha256: 'a'.repeat(64),
      status: OVERTURE_HTTPFS_RUNTIME.status, cancellation_after_publication: false },
    bridgeUrls: [`http://127.0.0.1:12345/${'a'.repeat(64)}/0`] };
  t.mock.method(globalThis, 'fetch', () => assert.fail('no source fetch'));
  try {
    for (const value of [null, {}, { ...options, SQL: 'PRIVATE' }, { ...options, output: 'relative' },
      { ...options, runtimeDescriptor: { ...options.runtimeDescriptor, cancellation_after_publication: true } },
      { ...options, runtimeDescriptor: { ...options.runtimeDescriptor, sha256: 'PRIVATE' } },
      { ...options, bridgeUrls: ['https://PRIVATE.example.com/asset'] },
      { ...options, get runtimeOutput() { assert.fail('getter'); } }]) {
      await assert.rejects(runOvertureBoundedEngine(value), error => !error.message.includes('PRIVATE'));
      assert.deepEqual(await readdir(directory), []);
    }
    const controller = new AbortController(); controller.abort(Error('PRIVATE_ABORT'));
    await assert.rejects(runOvertureBoundedEngine({ ...options, signal: controller.signal }), error => !error.message.includes('PRIVATE'));
    await assert.rejects(runOvertureBoundedEngine(options));
    assert.deepEqual(await readdir(directory), []);
  } finally {
    assert.equal(path.dirname(directory), base); assert.ok(path.basename(directory).startsWith('bounded-engine-negative-'));
    await rm(directory, { recursive: true, force: true });
  }
});
