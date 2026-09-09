import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { createOvertureAssetTransportForTest } from './overture-asset-transport.mjs';
import { createOvertureAcquisitionJournal, inspectOvertureAcquisitionJournal } from './overture-acquisition-journal.mjs';

const asset = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-08-19.0/theme=places/type=place/part-00000-11111111-1111-4111-8111-111111111111-c000.zstd.parquet';
async function setup(action) {
  const temporary = path.join(APP_ROOT, 'data', 'tmp');
  await mkdir(temporary, { recursive: true });
  const output = await mkdtemp(path.join(temporary, 'overture-journal-test-'));
  const operationId = randomUUID();
  try { await action({ output, operationId }); }
  finally { await rm(output, { recursive: true, force: true }); }
}
const metadata = () => new Response(null, { headers: { 'content-length': '4', etag: '"fixture"' } });

test('transport reservations are persisted before fetch and inspected without a success claim', async () => setup(async ({ output, operationId }) => {
  const journal = await createOvertureAcquisitionJournal({ output, operationId, executionMode: 'injected-test-transport', assetCount: 1 });
  let fetches = 0;
  const transport = createOvertureAssetTransportForTest({ assetUrls: [asset], limits: { minIntervalMs: 0 }, onEvent: journal.onEvent,
    fetchImpl: async (unused, init) => {
      const evidence = await inspectOvertureAcquisitionJournal(journal.directory, { operationId });
      fetches++;
      assert.equal(evidence.counters.requests_reserved, fetches);
      assert.equal(evidence.pending_request, fetches);
      assert.equal(evidence.claims.native_acquisition_verified, false);
      if (init.method === 'HEAD') return metadata();
      return new Response(Uint8Array.of(1, 2, 3, 4), { status: 206, headers: { 'content-length': '4', etag: '"fixture"', 'content-range': 'bytes 0-3/4' } });
    },
  });
  try {
    await transport.head(0);
    const chunks = [];
    await transport.read(0, { start: 0, end: 3 }, async chunk => { chunks.push(...chunk); });
    assert.deepEqual(chunks, [1, 2, 3, 4]);
    await transport.close(); await journal.close();
    const evidence = await inspectOvertureAcquisitionJournal(journal.directory, { operationId });
    assert.equal(evidence.status, 'incomplete-acquisition-evidence');
    assert.equal(evidence.pending_request, null);
    assert.deepEqual(evidence.counters, { requests_reserved: 2, requests_completed: 2, bytes_reserved: 4, bytes_observed: 4, bytes_delivered: 4 });
    assert.equal(evidence.claims.restart_resume_supported, false);
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
    const serialized = await readFile(path.join(journal.directory, 'events.jsonl'), 'utf8');
    assert.ok(!serialized.includes(asset));
    assert.ok(!serialized.includes('http://'));
  } finally { await transport.close(); await journal.close(); }
}));

test('failed fetch retains its reservation for offline inspection without retry or resume', async () => setup(async ({ output, operationId }) => {
  const journal = await createOvertureAcquisitionJournal({ output, operationId, executionMode: 'injected-test-transport', assetCount: 1 });
  let fetches = 0;
  const transport = createOvertureAssetTransportForTest({ assetUrls: [asset], onEvent: journal.onEvent,
    fetchImpl: async () => { fetches++; throw Error('PRIVATE_REMOTE_VALUE'); },
  });
  try {
    await assert.rejects(transport.head(0), error => !error.message.includes('PRIVATE_REMOTE_VALUE'));
    await transport.close(); await journal.close();
    const evidence = await inspectOvertureAcquisitionJournal(journal.directory, { operationId });
    assert.equal(fetches, 1);
    assert.equal(evidence.pending_request, 1);
    assert.equal(evidence.counters.requests_completed, 0);
    assert.equal(evidence.status, 'incomplete-acquisition-evidence');
    await assert.rejects(inspectOvertureAcquisitionJournal(journal.directory, { operationId: randomUUID() }));
  } finally { await transport.close(); await journal.close(); }
}));

test('closed accounting prevents any fetch and separate runs never overwrite old evidence', async () => setup(async ({ output, operationId }) => {
  const journal = await createOvertureAcquisitionJournal({ output, operationId, executionMode: 'injected-test-transport', assetCount: 1 });
  await journal.close();
  const before = await readFile(path.join(journal.directory, 'events.jsonl'));
  const transport = createOvertureAssetTransportForTest({ assetUrls: [asset], onEvent: journal.onEvent, fetchImpl: () => assert.fail('fetch forbidden') });
  try { await assert.rejects(transport.head(0)); }
  finally { await transport.close(); }
  const next = await createOvertureAcquisitionJournal({ output, operationId, executionMode: 'injected-test-transport', assetCount: 1 });
  await next.close();
  assert.notEqual(next.directory, journal.directory);
  assert.deepEqual(await readFile(path.join(journal.directory, 'events.jsonl')), before);
}));
