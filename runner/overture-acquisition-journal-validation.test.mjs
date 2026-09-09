import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, appendFile, readFile, writeFile, link } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { createOvertureAcquisitionJournal as create, inspectOvertureAcquisitionJournal as inspect } from './overture-acquisition-journal.mjs';

const event = (type, index = 1) => ({ type, execution_mode: 'injected-test-transport', request_index: index,
  asset_index: 0, method: 'GET', reserved_bytes: 4, observed_bytes: type === 'request-completed' ? 4 : 0, delivered_bytes: type === 'request-completed' ? 4 : 0 });
async function fixture() {
  const base = path.join(APP_ROOT, 'data/tmp'); await mkdir(base, { recursive: true });
  const output = await mkdtemp(path.join(base, 'overture-journal-')), operationId = randomUUID();
  const journal = await create({ output, operationId, executionMode: 'injected-test-transport', assetCount: 1 });
  return { output, operationId, journal };
}
async function cleanup(f) {
  await f.journal.close(); assert.equal(path.dirname(f.output), path.join(APP_ROOT, 'data/tmp'));
  assert.ok(path.basename(f.output).startsWith('overture-journal-')); await rm(f.output, { recursive: true, force: true });
}
test('journal serializes durable prefixes and remains incomplete after complete event pairs', async () => {
  const f = await fixture();
  try {
    const reservation = event('request-reserved');
    const first = f.journal.onEvent(reservation); reservation.reserved_bytes = 999;
    const second = f.journal.onEvent(event('request-completed')); await Promise.all([first, second]);
    await f.journal.close(); const result = await inspect(f.journal.directory, { operationId: f.operationId });
    assert.equal(result.status, 'incomplete-acquisition-evidence'); assert.equal(result.counters.bytes_reserved, 4);
    assert.equal(result.pending_request, null); assert.equal(result.claims.native_acquisition_verified, false);
    await assert.rejects(f.journal.onEvent(event('request-reserved', 2)));
  } finally { await cleanup(f); }
});
test('invalid event closes permanently without leaking arbitrary values or getters', async () => {
  const f = await fixture();
  try {
    await f.journal.onEvent(event('request-reserved'));
    await assert.rejects(f.journal.onEvent({ ...event('request-completed'), get PRIVATE() { assert.fail('getter'); } }), error => !error.message.includes('PRIVATE'));
    await assert.rejects(f.journal.onEvent(event('request-completed'))); await f.journal.close();
    const result = await inspect(f.journal.directory, { operationId: f.operationId }); assert.equal(result.pending_request, 1);
  } finally { await cleanup(f); }
});
test('inspector rejects torn records and incorrect operation binding with fixed errors', async () => {
  const f = await fixture();
  try {
    await f.journal.close(); await assert.rejects(inspect(f.journal.directory, { operationId: randomUUID() }));
    await appendFile(path.join(f.journal.directory, 'events.jsonl'), 'PRIVATE_TORN');
    await assert.rejects(inspect(f.journal.directory, { operationId: f.operationId }), error => !error.message.includes('PRIVATE'));
  } finally { await cleanup(f); }
});
test('same-size external edit and hardlinks invalidate journal ownership', async () => {
  for (const kind of ['edit', 'link']) {
    const f = await fixture();
    try {
      const file = path.join(f.journal.directory, 'events.jsonl');
      if (kind === 'edit') { const raw = await readFile(file, 'utf8'); await writeFile(file, raw.replace('header', 'HEADER')); }
      else await link(file, path.join(f.output, 'alias'));
      await assert.rejects(f.journal.onEvent(event('request-reserved')));
      assert.equal(f.journal.snapshot().state, 'failed');
    } finally { await cleanup(f); }
  }
});
test('creation snapshots options before await and final close detects external rewrite', async () => {
  const base = path.join(APP_ROOT, 'data/tmp'); await mkdir(base, { recursive: true });
  const output = await mkdtemp(path.join(base, 'overture-journal-')), operationId = randomUUID();
  const options = { output, operationId, executionMode: 'injected-test-transport', assetCount: 1 };
  const pending = create(options); options.operationId = randomUUID(); options.assetCount = 2;
  const journal = await pending;
  try {
    await journal.onEvent(event('request-reserved')); await journal.onEvent(event('request-completed'));
    const file = path.join(journal.directory, 'events.jsonl');
    const before = await inspect(journal.directory, { operationId }); assert.equal(before.counters.requests_completed, 1);
    const raw = await readFile(file, 'utf8'); await writeFile(file, raw.replace('header', 'HEADER'));
    await assert.rejects(journal.close()); assert.equal(journal.snapshot().state, 'failed');
  } finally {
    await journal.close().catch(() => {});
    assert.equal(path.dirname(output), base); await rm(output, { recursive: true, force: true });
  }
});
