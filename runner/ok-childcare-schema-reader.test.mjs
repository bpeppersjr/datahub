import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { OK_CHILDCARE_SCHEMA_PROBE_CONTRACT as C, OK_CHILDCARE_SCHEMA_PROBE_VERSION } from './ok-childcare-schema-probe.mjs';
import { readOkChildcareSchemaReceipt } from './ok-childcare-schema-reader.mjs';

// Native-shaped synthetic bytes test the reader's bookkeeping only, not actual source access.
async function fixture() {
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/ok-schema-reader-test-'));
  const operationId = randomUUID(), runId = randomUUID(), operationRoot = path.join(root, operationId, 'output');
  const manifestPath = path.join(operationRoot, 'jobs', runId, 'manifest.json');
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const startedAt = '2026-09-09T00:00:00.000Z';
  const baseline = {
    run_id: runId, operation_id: operationId, schema_version: OK_CHILDCARE_SCHEMA_PROBE_VERSION,
    execution_mode: 'native-fetch', started_at: startedAt, finished_at: '2026-09-09T00:00:01.000Z',
    status: 'schema-observed-not-collection-ready',
    requests: [0, 1, 2].map(i => ({ method: 'GET', url: i === 1 ? C.results_url : C.client_url,
      status: 200, decoded_bytes: i === 1 ? 200 : C.client_bytes,
      decoded_sha256: i === 1 ? 'a'.repeat(64) : C.client_sha256, complete: true })),
    schema: { counts: { rows: 1, center_rows: 1, home_rows: 0, unknown_type_rows: 0, missing_type_rows: 0,
      unknown_field_occurrences: 0, point_missing: 0, numeric_point_in_range: 1, point_other: 0 },
    fields: [{ field: 'coordinates', present: 1, types: { object: 1 } }, { field: 'facilityType', present: 1, types: { string: 1 } }],
    unknown_page_field_count: 0, pagination: 'unknown', zip_field_semantics: 'unverified', center_filter_verified: true },
    claims: { collection_ready: false, source_authority_verified: false, current_business_status_verified: false,
      statewide_completeness_verified: false, public_export_authorized: false, provider_values_retained: false, app_enrolled: false },
  };
  return { root, operationId, operationRoot, manifestPath, startedAt, baseline,
    async save(value = baseline) {
      const bytes = Buffer.from(JSON.stringify(value)); await writeFile(manifestPath, bytes);
      return createHash('sha256').update(bytes).digest('hex');
    },
    async close() {
      assert.equal(path.dirname(path.resolve(root)), path.join(APP_ROOT, 'data/tmp'));
      assert.match(path.basename(root), /^ok-schema-reader-test-/);
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('Oklahoma reader verifies exact managed binding and rejects altered bytes and claims', async () => {
  const f = await fixture();
  try {
    const options = { operationId: f.operationId, operationRoot: f.operationRoot, startedAt: f.startedAt };
    const sha = await f.save();
    const read = await readOkChildcareSchemaReceipt(f.manifestPath, sha, options);
    assert.deepEqual(read.manifest, f.baseline);
    for (const changes of [{ operationId: randomUUID() }, { startedAt: '2026-09-09T00:00:00.001Z' }, { operationRoot: path.dirname(f.operationRoot) }]) {
      await assert.rejects(readOkChildcareSchemaReceipt(f.manifestPath, sha, { ...options, ...changes }));
    }
    await assert.rejects(readOkChildcareSchemaReceipt(f.manifestPath, 'b'.repeat(64), options));
    for (const mutate of [
      m => { m.operation_id = randomUUID(); }, m => { m.run_id = randomUUID(); },
      m => { m.execution_mode = 'injected-test-transport'; }, m => { m.claims.collection_ready = true; },
      m => { m.claims.public_export_authorized = true; }, m => { m.requests[1].url = C.client_url; },
      m => { m.requests[0].decoded_sha256 = 'c'.repeat(64); }, m => { m.schema.counts.center_rows = 0; },
      m => { m.schema.fields[0].types.object = 2; }, m => { m.extra = 'private'; },
    ]) {
      const changed = structuredClone(f.baseline); mutate(changed);
      const changedHash = await f.save(changed);
      await assert.rejects(readOkChildcareSchemaReceipt(f.manifestPath, changedHash, options));
    }
    const fresh = await f.save();
    await writeFile(path.join(path.dirname(f.manifestPath), 'unexpected.tmp'), 'owned test artifact');
    await assert.rejects(readOkChildcareSchemaReceipt(f.manifestPath, fresh, options));
  } finally { await f.close(); }
});

test('Oklahoma reader rejects impossible cross-histogram aggregates even with updated pins', async () => {
  const f = await fixture();
  try {
    for (const mutate of [
      m => { m.schema.fields = []; },
      m => { m.schema.fields = m.schema.fields.filter(x => x.field !== 'facilityType'); },
      m => { m.schema.fields = m.schema.fields.filter(x => x.field !== 'coordinates'); },
      m => { m.schema.fields.find(x => x.field === 'facilityType').types = { number: 1 }; },
      m => { m.schema.fields.find(x => x.field === 'coordinates').types = { null: 1 }; },
    ]) {
      const changed = structuredClone(f.baseline); mutate(changed);
      const sha = await f.save(changed);
      await assert.rejects(readOkChildcareSchemaReceipt(f.manifestPath, sha, {
        operationId: f.operationId, operationRoot: f.operationRoot, startedAt: f.startedAt,
      }));
    }
  } finally { await f.close(); }
});
