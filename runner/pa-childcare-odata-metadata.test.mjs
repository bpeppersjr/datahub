import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { PA_CHILDCARE_FIELDS } from './pa-childcare-preflight.mjs';
import { PA_CHILDCARE_ODATA_METADATA_URL, parsePaChildcareOdataMetadata, preflightPaChildcareOdataMetadata, validatePaChildcareOdataMetadataReceipt, writePaChildcareOdataMetadataReceipt, verifyPaChildcareOdataMetadataReceiptFile, readRegisteredPaChildcareOdataMetadata } from './pa-childcare-odata-metadata.mjs';

function fixture() {
  const fields = ['__id', ...PA_CHILDCARE_FIELDS].map(name => `<Property Name="${name}" Type="${name === 'geocoded_column' ? 'Edm.GeographyPoint' : 'Edm.String'}"${name === '__id' ? ' Nullable="false"' : ''}/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="socrata" xmlns="http://docs.oasis-open.org/odata/ns/edm"><EntityType Name="ajn5-kaxt"><Key><PropertyRef Name="__id"/></Key>${fields}<Property Name="responsible_person_first" Type="Edm.String"/></EntityType><EntityType Name="unselected"><Property Name="PRIVATE_SYNTHETIC_FIELD" Type="Edm.String"/></EntityType><EntityContainer Name="Container"><EntitySet Name="ajn5-kaxt" EntityType="socrata.ajn5-kaxt"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
}
const response = body => new Response(body, { headers: { 'content-type': 'application/xml' } });
const good = () => preflightPaChildcareOdataMetadata({ fetchImpl: async (url, options) => {
  assert.equal(url, PA_CHILDCARE_ODATA_METADATA_URL); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
  return response(fixture());
}, now: () => new Date('2026-10-07T18:00:00.000Z') });

test('PA OData requests only service CSDL and retains selected keys/types/nullability', async () => {
  const receipt = await good(); validatePaChildcareOdataMetadataReceipt(receipt);
  assert.equal(receipt.schema.selected_properties.length, 19);
  assert.deepEqual(receipt.schema.keys, ['__id']);
  assert.equal(receipt.schema.entity_type, 'socrata.ajn5-kaxt');
  assert.equal(receipt.schema.selected_properties[0].nullable, false);
  assert.equal(receipt.schema.selected_properties[1].nullable, true);
  assert.equal(receipt.claims.entity_endpoint_requests, 0);
  assert.equal(receipt.claims.pagination_verified, false);
  assert.equal(receipt.claims.null_values_verified, false);
  assert.equal(receipt.claims.acquisition_authorized, false);
  assert.equal(JSON.stringify(receipt).includes('responsible_person'), false);
  assert.equal(JSON.stringify(receipt).includes('PRIVATE_SYNTHETIC'), false);
});

test('PA CSDL rejects namespace spoofing, DTD, entities, truncated XML and selected drift', () => {
  for (const body of [
    fixture().replace('http://docs.oasis-open.org/odata/ns/edm"', 'https://example.invalid/edm"'),
    '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///secret">]>' + fixture(),
    fixture().replace('Name="mpi_id"', 'Name="mpi&unknown;_id"'),
    fixture().slice(0, -12),
    fixture().replace('Name="mpi_id" Type="Edm.String"', 'Name="mpi_id" Type="Edm.Decimal"'),
    fixture().replace('Name="__id" Type="Edm.String" Nullable="false"', 'Name="__id" Type="Edm.String" Nullable="true"'),
    fixture().replace('Name="mpi_id"', 'Name="different"'),
    fixture().replace('<EntitySet Name="ajn5-kaxt" EntityType="socrata.ajn5-kaxt"/>', '<EntitySet Name="ajn5-kaxt" EntityType="socrata.ajn5-kaxt"/><EntitySet Name="ajn5-kaxt" EntityType="socrata.ajn5-kaxt"/>'),
    ...['socrata.other-type', 'socrata..ajn5-kaxt', '.ajn5-kaxt', 'socrata/ajn5-kaxt', '1socrata.ajn5-kaxt', 'socrata.ajn5-kaxt.extra'].map(type => fixture().replace('EntityType="socrata.ajn5-kaxt"', `EntityType="${type}"`)),
    fixture().replace('<Property Name="mpi_id" Type="Edm.String"/>', '<Property Name="mpi_id" Type="Edm.String"/><Property Name="mpi_id" Type="Edm.String"/>'),
    fixture().replace('Type="Edm.String"/>', 'Type="Edm.String" Nullable="invalid"/>'),
  ]) assert.throws(() => parsePaChildcareOdataMetadata(body));
});

test('PA receipt rejects forged readiness, extra fields and schema changes', async () => {
  const receipt = await good();
  for (const mutate of [
    value => { value.claims.pagination_verified = true; },
    value => { value.claims.provider_rows_retained = 1; },
    value => { value.claims.current_operations_verified = true; },
    value => { value.schema.selected_properties[1].sample = 'PRIVATE_SYNTHETIC'; },
    value => { value.schema.selected_properties[1].name = 'responsible_person_first'; },
    value => { value.unresolved_gates = []; },
    value => { value.response.url += '?$top=0'; },
    value => { value.configuration['config/connectors/pa-childcare-odata-metadata.json'] = '0'.repeat(64); },
  ]) { const changed = structuredClone(receipt); mutate(changed); assert.throws(() => validatePaChildcareOdataMetadataReceipt(changed)); }
});

test('PA OData rejects option URLs and rows before transport, defers once, never retries', async () => {
  let calls = 0;
  for (const extra of [{ url: 'https://example.invalid' }, { rows: true }, { pagination: true }]) await assert.rejects(preflightPaChildcareOdataMetadata({ fetchImpl: () => { calls++; }, ...extra }));
  assert.equal(calls, 0);
  await assert.rejects(preflightPaChildcareOdataMetadata({ fetchImpl: () => { calls++; return new Response(null, { status: 429 }); } }), { code: 'PA_ODATA_METADATA_DEFERRED' });
  assert.equal(calls, 1);
});

test('PA OData rejects non-XML entity responses, redirects and declared/streamed bounds', async () => {
  for (const value of [
    Response.json({ value: [{ PRIVATE_SYNTHETIC_PERSON: true }] }),
    new Response(null, { status: 302, headers: { location: 'https://example.invalid' } }),
    new Response(fixture(), { headers: { 'content-type': 'application/xml', 'content-length': '2000001' } }),
    response(' '.repeat(2_000_001)),
    new Response(fixture(), { headers: { 'content-type': 'application/xml', 'content-length': String(Buffer.byteLength(fixture()) + 1), 'content-encoding': ' IDENTITY ' } }),
  ]) await assert.rejects(preflightPaChildcareOdataMetadata({ fetchImpl: async () => value }), { code: 'PA_ODATA_METADATA_FAILED' });
});

test('PA OData aborts early and pending transport and cancels a late response', async () => {
  const early = new AbortController(); early.abort();
  await assert.rejects(preflightPaChildcareOdataMetadata({ signal: early.signal, fetchImpl: () => assert.fail('unexpected request') }), { name: 'AbortError' });
  const controller = new AbortController(); let resolve, cancelled = 0;
  const pending = preflightPaChildcareOdataMetadata({ signal: controller.signal, fetchImpl: () => new Promise(done => { resolve = done; controller.abort(); }) });
  await assert.rejects(pending, { name: 'AbortError' });
  resolve(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await new Promise(done => setImmediate(done)); assert.equal(cancelled, 1);
});

test('PA metadata writer publishes immutable receipts, rejects unsafe roots and pre-abort', async () => {
  const receipt = await good(), root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/pa-odata-test-'));
  try {
    const outputRoot = path.join(root, 'receipts');
    const [first, second] = await Promise.all([writePaChildcareOdataMetadataReceipt(receipt, { outputRoot }), writePaChildcareOdataMetadataReceipt(receipt, { outputRoot })]);
    assert.notEqual(first.path, second.path);
    assert.deepEqual(JSON.parse(await readFile(first.path)), receipt);
    assert.equal((await readdir(outputRoot)).length, 2);
    await assert.rejects(writePaChildcareOdataMetadataReceipt(receipt, { outputRoot: APP_ROOT }));
    await assert.rejects(writePaChildcareOdataMetadataReceipt(receipt, { outputRoot: path.dirname(APP_ROOT) }));
    await mkdir(path.join(root, 'target')); await symlink(path.join(root, 'target'), path.join(root, 'alias'), 'junction');
    await assert.rejects(writePaChildcareOdataMetadataReceipt(receipt, { outputRoot: path.join(root, 'alias') }));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(writePaChildcareOdataMetadataReceipt(receipt, { outputRoot, signal: controller.signal }), { name: 'AbortError' });
    assert.equal((await readdir(outputRoot)).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('PA OData cancels a pending body read without retaining partial metadata', async () => {
  const controller = new AbortController(); let cancelled = 0;
  await assert.rejects(preflightPaChildcareOdataMetadata({ signal: controller.signal, fetchImpl: async () => new Response(new ReadableStream({
    start(stream) { stream.enqueue(new TextEncoder().encode('<edmx:Edmx')); setImmediate(() => controller.abort()); },
    cancel() { cancelled++; },
  }), { headers: { 'content-type': 'application/xml' } }) }), { name: 'AbortError' });
  await new Promise(done => setImmediate(done)); assert.equal(cancelled, 1);
});

test('PA registered live metadata receipt independently verifies its pinned bytes and schema', async () => {
  const result = await readRegisteredPaChildcareOdataMetadata();
  assert.equal(result.verified, true);
  assert.equal(result.receipt_bytes, 2546);
  assert.equal(result.receipt_sha256, 'c4a330dc7935d6459c84ca211489fbc38bed6923b21bcbe31263b5aeb3faf01f');
  assert.equal(result.receipt.schema.entity_type, 'socrata.ajn5-kaxt');
  assert.equal(result.receipt.response.body_bytes, 431474);
  assert.equal(result.receipt.response.body_sha256, 'a13bfbddd5a770fcd2a764612d668717217abaeda952ab2a96173f1a1bafa230');
  assert.equal(result.registration.current_pointer, null);
  assert.equal(result.registration.production_enrollment, false);
  assert.equal(result.receipt.claims.entity_endpoint_requests, 0);
});

test('PA retained metadata verification rejects wrong path, hash, size and rehashed false claims', async () => {
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/pa-odata-verifier-test-'));
  try {
    const receipt = await good(), saved = await writePaChildcareOdataMetadataReceipt(receipt, { outputRoot: path.join(root, 'receipts') });
    const expected = { path: path.relative(APP_ROOT, saved.path).split(path.sep).join('/'), bytes: saved.bytes, sha256: saved.sha256 };
    assert.equal((await verifyPaChildcareOdataMetadataReceiptFile(saved.path, { expected })).verified, true);
    for (const changed of [{ ...expected, path: '../outside.json' }, { ...expected, bytes: expected.bytes + 1 }, { ...expected, sha256: '0'.repeat(64) }]) await assert.rejects(verifyPaChildcareOdataMetadataReceiptFile(saved.path, { expected: changed }));
    const forged = structuredClone(receipt); forged.claims.acquisition_authorized = true;
    const file = path.join(root, 'forged.json'), raw = Buffer.from(JSON.stringify(forged) + '\n');
    await writeFile(file, raw, { flag: 'wx' });
    await assert.rejects(verifyPaChildcareOdataMetadataReceiptFile(file, { expected: { path: path.relative(APP_ROOT, file).split(path.sep).join('/'), bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') } }));
    const registration = JSON.parse(await readFile(path.join(APP_ROOT, 'config/datasets/pa-childcare-odata-metadata.json')));
    registration.acquisition_authorized = true;
    const registrationPath = path.join(root, 'forged-registration.json'); await writeFile(registrationPath, JSON.stringify(registration), { flag: 'wx' });
    await assert.rejects(readRegisteredPaChildcareOdataMetadata({ registrationPath }));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(verifyPaChildcareOdataMetadataReceiptFile(saved.path, { expected, signal: controller.signal }), { name: 'AbortError' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
