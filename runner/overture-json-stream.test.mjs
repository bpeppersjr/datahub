import test from 'node:test';
import assert from 'node:assert/strict';
import { streamOvertureJsonRows } from './overture-json-stream.mjs';

function fixture(values) {
  let fetches = 0, interrupts = 0, streams = 0;
  const connection = { interrupt() { interrupts++; }, async stream() {
    streams++; return { columnCount: 1, columnName: () => 'record_json', async fetchChunk() {
      fetches++;
      if (fetches > 1) return null;
      return { columnCount: 1, rowCount: values.length, getColumnVector: () => ({ getItem: index => values[index] }) };
    } };
  } };
  return { connection, counts: () => ({ fetches, interrupts, streams }) };
}

test('JSON stream fetches lazily and interrupts an early consumer return', async () => {
  const f = fixture(['{"id":1}', '{"id":2}']);
  const rows = streamOvertureJsonRows({ connection: f.connection, query: 'trusted internal fixture' });
  assert.equal(f.counts().streams, 0);
  assert.equal((await rows.next()).value, '{"id":1}');
  assert.equal(f.counts().fetches, 1);
  await rows.return();
  assert.equal(f.counts().interrupts, 1);
  assert.equal(f.counts().fetches, 1);
});

test('JSON stream completes without interrupt and keeps engine errors private', async () => {
  const f = fixture(['{"id":1}']);
  const result = [];
  for await (const row of streamOvertureJsonRows({ connection: f.connection, query: 'trusted' })) result.push(row);
  assert.deepEqual(result, ['{"id":1}']);
  assert.equal(f.counts().interrupts, 0);
  f.connection.stream = async () => { throw Error('PRIVATE_CAPABILITY'); };
  await assert.rejects(streamOvertureJsonRows({ connection: f.connection, query: 'trusted' }).next(), error => !error.message.includes('PRIVATE_CAPABILITY'));
});

test('JSON stream rejects unexpected columns, nonstrings and preabort', async () => {
  const f = fixture([12]);
  await assert.rejects(streamOvertureJsonRows({ connection: f.connection, query: 'trusted' }).next());
  const controller = new AbortController(); controller.abort(Error('PRIVATE_ABORT'));
  const other = fixture(['{}']);
  await assert.rejects(streamOvertureJsonRows({ connection: other.connection, query: 'trusted', signal: controller.signal }).next(), error => !error.message.includes('PRIVATE_ABORT'));
  assert.equal(other.counts().streams, 0);
  assert.equal(other.counts().interrupts, 0);
  other.connection.stream = async () => ({ columnCount: 2 });
  await assert.rejects(streamOvertureJsonRows({ connection: other.connection, query: 'trusted' }).next());
});

test('JSON stream cancellation interrupts and drains its pending fetch', { timeout: 5000 }, async () => {
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const controller = new AbortController();
  let interrupts = 0;
  const connection = { interrupt() { interrupts++; }, async stream() {
    return { columnCount: 1, columnName: () => 'record_json', async fetchChunk() { entered(); await gate; return null; } };
  } };
  const rows = streamOvertureJsonRows({ connection, query: 'trusted', signal: controller.signal });
  let settled = false;
  const pending = assert.rejects(rows.next()).then(() => { settled = true; });
  try {
    await ready; controller.abort(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false); assert.ok(interrupts > 0);
  } finally { release(); await pending; await rows.return(); }
});
