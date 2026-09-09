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
import { OVERTURE_SELECTED_FIELDS, normalizeOvertureUsPlace, overtureStreamingQueryFingerprint } from './overture-us-places.mjs';
import { runOvertureBoundedEngine } from './overture-bounded-engine.mjs';

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
    const parquet = path.join(directory, 'fixture.parquet');
    await connection.run(`COPY (
      SELECT printf('11111111-1111-4111-8111-%012d', i + 1) AS id, 1::BIGINT AS version,
        CASE i WHEN 1 THEN 'permanently_closed' WHEN 3 THEN NULL WHEN 4 THEN 'temporarily_closed' ELSE 'open' END AS operating_status,
        'grocery_store' AS basic_category,
        {'primary':'grocery_store','hierarchy':['shopping','grocery_store'],'alternates':['supermarket']} AS taxonomy,
        0.8::DOUBLE AS confidence, {'primary':'Local fixture ' || i, 'common':map(['en'],['Fixture'])} AS names,
        ['https://example.invalid'] AS websites,
        {'names':{'primary':'Fixture brand','common':map(['en'],['Fixture brand'])},'wikidata':'Q1'} AS brand,
        CASE WHEN i=5 THEN [] ELSE [
          {'freeform':'Foreign address','locality':'Foreign locality','postcode':'A1A 1A1','region':'ON','country':'CA'},
          {'freeform':'123 Fixture Road','locality':'Fixture City','postcode':'00501-0123','region':'NY','country':CASE WHEN i=2 THEN 'CA' ELSE 'US' END}
        ] END AS addresses,
        {'xmin':-73.0,'xmax':-73.0,'ymin':40.0,'ymax':40.0} AS bbox,
        [{'dataset':'AllThePlaces','record_id':'local-' || i,'update_time':'2026-09-09T00:00:00Z','confidence':0.9}] AS sources,
        'PRIVATE_GEOMETRY' AS geometry, ['PRIVATE_EMAIL'] AS emails, ['PRIVATE_PHONE'] AS phones, ['PRIVATE_SOCIAL'] AS socials
      FROM range(6) AS fixture(i)
    ) TO ${quote(parquet)} (FORMAT PARQUET)`);
    const bytes = await readFile(parquet);
    // The fixture producer is not the extraction engine under test.
    connection.closeSync(); connection = null;
    instance.closeSync(); instance = null;
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
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 10000);
    let rows, selected;
    try {
      const execution = await runOvertureBoundedEngine({ output: path.join(directory, 'extraction'), runtimeDescriptor: descriptor,
        runtimeOutput: path.join(operation, 'output'), runtimeOperationId: operationId, bridgeUrls: bridge.urls, signal: controller.signal });
      selected = execution.selected;
      assert.equal(execution.query_fingerprint, overtureStreamingQueryFingerprint(1));
      assert.deepEqual(execution.runtime_reference, { operation_id: operationId, run_id: descriptor.run_id, manifest_sha256: descriptor.sha256 });
      assert.equal(execution.claims.native_acquisition_verified, false);
      assert.equal(execution.claims.process_memory_cap_enforced, false);
      assert.equal(execution.engine_settings.threads, '1');
      assert.equal(execution.engine_settings.memory_limit, '2GiB');
      assert.equal(execution.engine_settings.max_temp_directory_size, '4GiB');
      assert.equal(execution.engine_settings.http_retries, '0');
      assert.equal(execution.engine_settings.auto_fallback_to_full_download, 'false');
      assert.equal(execution.engine_settings.enable_curl_server_cert_verification, 'true');
      assert.ok(!JSON.stringify(execution).includes(new URL(bridge.urls[0]).pathname));
      const compressed = await readFile(path.join(selected.directory, selected.artifact.path));
      assert.equal(compressed.length, selected.artifact.bytes);
      assert.equal(createHash('sha256').update(compressed).digest('hex'), selected.artifact.sha256);
      rows = gunzipSync(compressed).toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    } catch { throw Error('Native local bridge query failed; capability and engine exception redacted.'); }
    rows.sort((left, right) => left.id.localeCompare(right.id));
    assert.equal(selected.record_count, 3);
    assert.deepEqual(rows.map(row => row.primary_name), ['Local fixture 0', 'Local fixture 3', 'Local fixture 4']);
    assert.deepEqual(rows.map(row => row.operating_status), ['open', null, 'temporarily_closed']);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), [...OVERTURE_SELECTED_FIELDS].sort());
      assert.equal(row.address_freeform, '123 Fixture Road');
      assert.equal(row.address_country, 'US');
      assert.equal(row.latitude, 40); assert.equal(row.longitude, -73);
      assert.equal(row.version, 1); assert.equal(row.confidence, 0.8);
      assert.deepEqual(row.common_names, { en: 'Fixture' });
      assert.equal(row.brand_primary_name, 'Fixture brand');
      assert.deepEqual(row.sources, [{ dataset: 'AllThePlaces', record_id: 'local-' + row.primary_name.at(-1),
        update_time: '2026-09-09T00:00:00Z', confidence: 0.9 }]);
      assert.ok(!JSON.stringify(row).includes('PRIVATE_'));
      const normalized = normalizeOvertureUsPlace(row, { baselineByZip: new Map(), sourceReleaseId: 'local-fixture',
        runId: 'local-fixture', releaseObservedAt: '2026-09-09T00:00:00Z', retrievedAt: '2026-09-09T00:00:00Z' });
      assert.equal(normalized.reported_address.zip_code, '00501');
      assert.equal(normalized.reported_address.zip4, '0123');
      assert.deepEqual(normalized.geocode, { latitude: 40, longitude: -73, source: 'overture-place-point' });
      assert.equal(normalized.classification.commercial_business_asserted, false);
    }
    assert.equal(selected.claims.native_acquisition_verified, false);
    assert.ok(calls.includes('HEAD'));
    assert.ok(calls.includes('GET'));
    assert.equal(transport.snapshot().execution_mode, 'injected-test-transport');
    const requestsBeforeFailure = calls.length;
    const liveCapability = new URL(bridge.urls[0]).pathname.split('/')[1];
    const wrongCapability = (liveCapability[0] === 'a' ? 'b' : 'a').repeat(64);
    await assert.rejects(runOvertureBoundedEngine({ output: path.join(directory, 'rejected-extraction'), runtimeDescriptor: descriptor,
      runtimeOutput: path.join(operation, 'output'), runtimeOperationId: operationId,
      bridgeUrls: [bridge.urls[0].replace(liveCapability, wrongCapability)], signal: controller.signal }),
    error => error.message === 'Overture bounded engine failed; preserve run outputs for inspection.');
    assert.equal(calls.length, requestsBeforeFailure);
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
