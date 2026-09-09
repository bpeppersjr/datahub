import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { DuckDBInstance } from '@duckdb/node-api';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';
import { readOvertureHttpfsRuntime } from './overture-httpfs-runtime.mjs';
import { createOvertureAssetTransportForTest } from './overture-asset-transport.mjs';
import { startOvertureAssetBridge } from './overture-asset-bridge.mjs';
import { createOvertureAcquisitionJournal, inspectOvertureAcquisitionJournal } from './overture-acquisition-journal.mjs';
import { streamOvertureJsonRows } from './overture-json-stream.mjs';
import { writeOvertureSelectedOutput } from './overture-selected-output.mjs';

const operationId = process.env.DATAHUB_TEST_OVERTURE_RUNTIME_OPERATION;
const quote = value => `'${value.replaceAll('\\', '/').replaceAll("'", "''")}'`;

test('native retained httpfs reads a local Parquet through the bounded asset bridge', {
  skip: !operationId && 'Requires an explicitly selected retained app runtime; no dependency download fallback.',
  timeout: 30000,
}, async () => {
  assert.match(operationId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const operation = path.join(APP_ROOT, 'data', 'managed-operations', operationId);
  const receipt = JSON.parse(await readFile(path.join(operation, 'receipt.json'), 'utf8'));
  assert.equal(receipt.status, 'SUCCEEDED');
  const descriptor = receipt.result.prerequisite;
  await readOvertureHttpfsRuntime(descriptor, { output: path.join(operation, 'output'), operationId });
  const temporary = path.join(APP_ROOT, 'data', 'tmp');
  await mkdir(temporary, { recursive: true });
  const directory = await mkdtemp(path.join(temporary, 'overture-bridge-native-'));
  let instance, connection, bridge, journal, timer;
  try {
    for (const name of ['home', 'extensions', 'spill']) await mkdir(path.join(directory, name));
    instance = await DuckDBInstance.create(':memory:', {
      threads: '1', memory_limit: '128MB', max_temp_directory_size: '128MB',
      home_directory: path.join(directory, 'home'), extension_directory: path.join(directory, 'extensions'),
      temp_directory: path.join(directory, 'spill'), autoinstall_known_extensions: 'false',
      autoload_known_extensions: 'false', allow_unsigned_extensions: 'false', allow_community_extensions: 'false',
    });
    connection = await instance.connect();
    await connection.run(`LOAD ${quote(path.join(path.dirname(descriptor.manifest), 'httpfs.duckdb_extension'))}`);
    await connection.run('SET auto_fallback_to_full_download=false; SET force_download=false; SET http_retries=0; SET http_timeout=5;');
    const parquet = path.join(directory, 'fixture.parquet');
    await connection.run(`COPY (SELECT 1 AS id, 'local-fixture' AS name UNION ALL SELECT 2, 'second-fixture') TO ${quote(parquet)} (FORMAT PARQUET)`);
    const bytes = await readFile(parquet);
    const calls = [];
    journal = await createOvertureAcquisitionJournal({ output: path.join(directory, 'accounting'), operationId,
      executionMode: 'injected-test-transport', assetCount: 1 });
    const transport = createOvertureAssetTransportForTest({
      assetUrls: ['https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-08-19.0/theme=places/type=place/part-00000-11111111-1111-4111-8111-111111111111-c000.zstd.parquet'],
      limits: { minIntervalMs: 0, maxRequests: 20, maxBytes: 1024 * 1024 },
      onEvent: journal.onEvent,
      fetchImpl: async (unused, init) => {
        calls.push(init.method);
        const headers = { etag: '"local-fixture"', 'content-length': String(bytes.length) };
        if (init.method === 'HEAD') return new Response(null, { headers });
        const match = /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range);
        assert.ok(match);
        const start = Number(match[1]), end = Number(match[2]);
        headers['content-range'] = `bytes ${start}-${end}/${bytes.length}`;
        headers['content-length'] = String(end - start + 1);
        return new Response(bytes.subarray(start, end + 1), { status: 206, headers });
      },
    });
    bridge = await startOvertureAssetBridge({ transport, assetCount: 1 });
    timer = setTimeout(() => connection.interrupt(), 10000);
    let rows, selected;
    try {
      const query = `SELECT to_json(selected)::VARCHAR AS record_json FROM (SELECT id, name FROM read_parquet(${quote(bridge.urls[0])}) ORDER BY id) selected`;
      selected = await writeOvertureSelectedOutput({ rows: streamOvertureJsonRows({ connection, query }), output: path.join(directory, 'selected') });
      const compressed = await readFile(path.join(selected.directory, selected.artifact.path));
      assert.equal(compressed.length, selected.artifact.bytes);
      assert.equal(createHash('sha256').update(compressed).digest('hex'), selected.artifact.sha256);
      rows = gunzipSync(compressed).toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    } catch { throw Error('Native local bridge query failed; capability and engine exception redacted.'); }
    assert.deepEqual(rows, [{ id: 1, name: 'local-fixture' }, { id: 2, name: 'second-fixture' }]);
    assert.equal(selected.record_count, 2);
    assert.equal(selected.claims.native_acquisition_verified, false);
    assert.ok(calls.includes('HEAD'));
    assert.ok(calls.includes('GET'));
    assert.equal(transport.snapshot().execution_mode, 'injected-test-transport');
    await bridge.close(); await journal.close();
    const accounting = await inspectOvertureAcquisitionJournal(journal.directory, { operationId });
    assert.equal(accounting.counters.requests_reserved, calls.length);
    assert.equal(accounting.counters.requests_completed, calls.length);
    assert.equal(accounting.pending_request, null);
    assert.equal(accounting.claims.native_acquisition_verified, false);
  } finally {
    clearTimeout(timer);
    try { await bridge?.close(); }
    finally {
      try { await journal?.close(); }
      finally {
        try { connection?.closeSync(); }
        finally { instance?.closeSync(); }
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
});
