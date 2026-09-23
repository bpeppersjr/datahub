import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import test from 'node:test';
import { createOrganizationZipEvidenceReader } from './organization-zip-evidence-reader.mjs';
import { organizationZipEvidenceHttp } from './organization-zip-evidence-http.mjs';
import { exportOrganizationZipEvidence, verifyOrganizationZipEvidenceExport } from './organization-zip-evidence-export.mjs';

const json = value => `${JSON.stringify(value)}\n`;
const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture(t, { count = 4 } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'org-zip-reader-')); t.after(() => rm(root, { recursive: true, force: true }));
  const release = 'fixture-release'; const directory = path.join(root, 'data/business-sources/broad-organization-zip-evidence/releases', release); await mkdir(path.join(directory, 'derived/organizations'), { recursive: true });
  const sourceContract = {
    FL: { record_kind: 'organization', address_field: 'reported_principal_address', normalized_source_id: 'fl-source', source_release_id: 'fl-release', policy_id: 'fl-policy', policy_version: '1.0.0', redistribution: 'public' },
    DE: { record_kind: 'organization', address_field: 'reported_business_address', normalized_source_id: 'de-source', source_release_id: 'de-release', policy_id: 'de-policy', policy_version: '1.0.0', redistribution: 'local review only', field_export_policy: { normalized_record_level_organizations_addresses_assertions_and_match_profiles: 'local-review-only' } },
    OR: { record_kind: 'registration', address_field: 'principal_place_addresses', normalized_source_id: 'or-source', source_release_id: 'or-release', policy_id: 'or-policy', policy_version: '1.0.0', redistribution: 'public' },
  };
  const rows = Array.from({ length: count }, (_, index) => {
    const state = index === count - 1 ? 'DE' : index === count - 2 ? 'OR' : 'FL'; const contract = sourceContract[state]; const field = contract.address_field;
    const address = { street: '1 Main', unit_or_additional: null, city: 'Wilmington', state_code: state === 'FL' ? 'NY' : state, zip_code: '12345', zip4: '6789', eligible_for_us_zip_coverage: true };
    const recordKind = state === 'OR' ? 'brand' : 'organization';
    return { schema_version: 'broad-organization-zip-evidence@1.0.0', row_id: `${state}-id-${index}:address:0`, state, record_kind: recordKind, display_name: `${state} ${index}`, address_field: field, address_index: 0, source_record: { normalized_record_id: `${state}-id-${index}`, [field]: state === 'OR' ? [address] : address, source_status: { status: 'Active', status_class: 'source-reported', semantics: 'not current operation' }, observed_at: '2026-09-01T00:00:00.000Z', provenance: { source_id: contract.normalized_source_id, source_release_id: contract.source_release_id, source_record_id: `id-${index}`, transformation_version: 'test@1.0.0', policy_id: contract.policy_id } }, zip_partition: 'eligible-zip5-prefix', zip_partition_reason: null, zip_fields: { zip5: '12345', zip4: '6789', eligible_for_zip_partition: true }, export_policy: state === 'DE' ? 'local-review-only' : 'public' };
  });
  const artifactBytes = await new Promise((resolve, reject) => { const gzip = createGzip(); const chunks = []; gzip.on('data', chunk => chunks.push(chunk)); gzip.on('end', () => resolve(Buffer.concat(chunks))); gzip.on('error', reject); gzip.end(rows.map(json).join('')); });
  const artifactPath = 'derived/organizations/zip-prefix=12.jsonl.gz'; await writeFile(path.join(directory, artifactPath), artifactBytes);
  const manifest = { dataset_id: 'broad-organization-zip-evidence', release_id: release, status: 'published', claims: { network_requests_performed: 0, contributes_to_general_business_or_site_totals: false }, dependencies: { sources: Object.fromEntries(Object.keys(sourceContract).map(state => [state, { transformation: 'test@1.0.0' }])) }, source_contract: sourceContract, artifacts: [{ path: artifactPath, artifact_type: 'broad-organization-zip-jsonl-gzip', bytes: artifactBytes.length, sha256: hash(artifactBytes), record_count: rows.length }] };
  const manifestBytes = Buffer.from(json(manifest)); await writeFile(path.join(directory, 'manifest.json'), manifestBytes);
  const selection = { release_id: release, manifest_sha256: hash(manifestBytes) };
  await mkdir(path.join(root, 'config'), { recursive: true });
  await writeFile(path.join(root, 'config/broad-organization-zip-evidence-selection.json'), json({ schema_version: 'broad-organization-zip-evidence-selection@1.0.0', dataset_id: 'broad-organization-zip-evidence', ...selection }));
  return { root, directory, manifest, artifactPath, selection };
}

test('reader verifies complete shard and pages minimized rows with public/local-review policy separation', async t => {
  const data = await fixture(t); const reader = createOrganizationZipEvidenceReader({ root: data.root, selection: data.selection });
  const first = await reader.get({ zip5: '12345', policyMode: 'public-only', limit: 1 });
  assert.equal(first.page.total_matching_rows, 3); assert.equal(first.rows.length, 1); assert.ok(first.page.next_cursor);
  assert.equal(first.policy_excluded_row_count, 1); assert.match(first.policy_excluded_row_semantics, /not missing or zero evidence/);
  assert.equal(Object.hasOwn(first.rows[0], 'source_record'), false); assert.equal(first.rows[0].publisher_jurisdiction, 'FL'); assert.equal(first.rows[0].address_state, 'NY');
  assert.deepEqual(first.rows[0].address, { street: '1 Main', unit_or_additional: null, city: 'Wilmington', zip5: '12345', zip4: '6789' });
  assert.equal(first.rows[0].claims.contributes_to_general_business_or_site_totals, false); assert.equal(Object.hasOwn(first.source_policy_summary, 'DE'), false);
  const second = await reader.get({ zip5: '12345', policyMode: 'public-only', limit: 1, cursor: first.page.next_cursor }); assert.equal(second.rows.length, 1); assert.ok(second.page.next_cursor);
  const third = await reader.get({ zip5: '12345', policyMode: 'public-only', limit: 1, cursor: second.page.next_cursor }); assert.equal(third.rows[0].record_kind, 'brand'); assert.equal(third.page.next_cursor, null);
  await assert.rejects(reader.get({ zip5: '12345', policyMode: 'local-review', limit: 1, cursor: first.page.next_cursor }), /Cursor does not match/);
  const local = await reader.get({ zip5: '12345', policyMode: 'local-review', limit: 10 });
  assert.equal(local.page.total_matching_rows, 4); assert.equal(local.rows[0].record_kind, 'organization'); assert.equal(local.rows[0].policy.local_review_only, false);
  const oregon = await reader.get({ zip5: '12345', policyMode: 'public-only', publisherState: 'OR' }); assert.equal(oregon.rows[0].record_kind, 'brand');
  const delaware = await reader.get({ zip5: '12345', policyMode: 'local-review', publisherState: 'DE' }); assert.equal(delaware.page.total_matching_rows, 1); assert.equal(delaware.rows[0].policy.local_review_only, true);
});

test('reader rejects artifact mutation and observes cancellation while streaming', async t => {
  const data = await fixture(t); const reader = createOrganizationZipEvidenceReader({ root: data.root, selection: data.selection });
  await writeFile(path.join(data.directory, data.artifactPath), 'tampered');
  await assert.rejects(reader.get({ zip5: '12345', policyMode: 'public-only' }));
  const second = await fixture(t, { count: 100_000 }); const controller = new AbortController();
  const pending = createOrganizationZipEvidenceReader({ root: second.root, selection: second.selection }).get({ zip5: '12345', policyMode: 'public-only', signal: controller.signal });
  setTimeout(() => controller.abort(), 1);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('strict authenticated route contract rejects query drift and permits only exact GET selections', async () => {
  const route = async (method, query, requestExtras = {}) => { let result; await organizationZipEvidenceHttp({ method, ...requestExtras }, { setHeader() {} }, new URL(`http://local/api/business-map/organization-zip-evidence${query}`), { get: async value => value }, (_res, status, body) => { result = { status, body }; }); return result; };
  assert.deepEqual(await route('GET', '?zip=12345&policy_mode=public-only'), { status: 200, body: { zip5: '12345', policyMode: 'public-only', publisherState: null, limit: 50, cursor: null, signal: undefined } });
  assert.equal((await route('GET', '?zip=12345&policy_mode=public-only', { headers: { 'content-length': '0' } })).status, 200);
  assert.equal((await route('POST', '?zip=12345&policy_mode=public-only')).status, 405);
  for (const [method, query, extra] of [['GET', '?zip=12345', {}], ['GET', '?zip=12345&zip=12345&policy_mode=public-only', {}], ['GET', '?zip=12345&policy_mode=public-only&state=FL', {}], ['GET', '?zip=12345&policy_mode=secret', {}], ['GET', '?zip=12345&policy_mode=public-only&publisher_state=ZZ', {}], ['GET', '?zip=12345&policy_mode=public-only&limit=101', {}], ['GET', '?zip=12345&policy_mode=public-only', { headers: { 'content-length': '1' } }], ['GET', '?zip=12345&policy_mode=public-only', { headers: { 'transfer-encoding': 'chunked' } }], ['GET', '?zip=12345&policy_mode=public-only', { readableLength: 1 }], ['GET', '?zip=12345&policy_mode=public-only', { body: 'unexpected' }]]) assert.equal((await route(method, query, extra)).status, 400);
  const server = await readFile(new URL('./server.mjs', import.meta.url), 'utf8'); assert.ok(server.indexOf('controlPlane.authorize(request)') < server.indexOf("url.pathname === '/api/business-map/organization-zip-evidence'"));
});

test('run-scoped JSONL/CSV export publishes manifest last and independently replays the minimized projection', async t => {
  const data = await fixture(t); const reader = createOrganizationZipEvidenceReader({ root: data.root, selection: data.selection });
  const result = await exportOrganizationZipEvidence({ zip5: '12345', policyMode: 'local-review', format: 'both', root: data.root, outputRoot: 'data/exports/org-zip/jobs', reader, runId: '12345678-1234-4234-8234-123456789abc' });
  assert.equal(result.row_count, 4); assert.equal(result.status, 'verified');
  const manifest = JSON.parse(await readFile(result.manifest_path, 'utf8')); assert.equal(manifest.artifacts.length, 2); assert.equal(manifest.claims.physical_sites_asserted, false);
  assert.equal((await verifyOrganizationZipEvidenceExport(result.manifest_path, result.manifest_sha256, { root: data.root, reader, selection: data.selection })).rows, 4);
  await writeFile(result.artifact_paths[0], 'tampered');
  await assert.rejects(verifyOrganizationZipEvidenceExport(result.manifest_path, result.manifest_sha256, { root: data.root, reader, selection: data.selection }));
});

test('cancelled export removes only owned staging and never publishes a manifest', async t => {
  const data = await fixture(t, { count: 100_000 }); const reader = createOrganizationZipEvidenceReader({ root: data.root, selection: data.selection });
  const controller = new AbortController(); const pending = exportOrganizationZipEvidence({ zip5: '12345', policyMode: 'public-only', format: 'jsonl', root: data.root, outputRoot: 'data/exports/org-zip/jobs', reader, signal: controller.signal, runId: '22345678-1234-4234-8234-123456789abc' });
  setTimeout(() => controller.abort(), 1); await assert.rejects(pending, { name: 'AbortError' });
  const jobs = path.join(data.root, 'data/exports/org-zip/jobs'); assert.deepEqual(await import('node:fs/promises').then(fs => fs.readdir(jobs)), []);
});
