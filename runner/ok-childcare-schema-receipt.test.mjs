import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, rm, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { APP_ROOT } from './paths.mjs';
import { runOkChildcareSchemaProbeWithTestTransport } from './ok-childcare-schema-probe.mjs';
import { persistOkChildcareSchemaReceipt, persistOkChildcareSchemaReceiptWithTestHook } from './ok-childcare-schema-receipt.mjs';

const root = path.join(APP_ROOT, 'data/tmp/ok-schema-receipt-tests');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function issued() {
  let requests = 0;
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: '/providers', query: { 'zip-code': '73102', 'facility-type': 'childcare-center' }, props: { pageProps: { childcareProviders: [
    { facilityType: 'childcare-center', name: 'SYNTHETIC_PRIVATE_NAME', vendorId: 'SYNTHETIC_PRIVATE_ID', address: 'SYNTHETIC_PRIVATE_ADDRESS', coordinates: null },
  ] } } })}</script>`;
  const receipt = await runOkChildcareSchemaProbeWithTestTransport(async () => {
    requests++;
    return new Response(requests === 2 ? html : 'Oklahoma schema probe synthetic client fixture v1', { status: 200, headers: { 'Content-Type': requests === 2 ? 'text/html' : 'application/javascript' } });
  });
  assert.equal(requests, 3);
  assert.equal(receipt.status, 'schema-observed-not-collection-ready');
  assert.equal(receipt.execution_mode, 'injected-test-transport');
  return receipt;
}
function ownedDirectory(value) {
  const resolved = path.resolve(value);
  assert.equal(path.dirname(resolved), root);
  assert.match(path.basename(resolved), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  return resolved;
}
async function cleanup(directory) {
  if (directory) await rm(ownedDirectory(directory), { recursive: true, force: true });
}

test('Oklahoma synthetic schema receipt publishes one checksummed aggregate-only manifest', async () => {
  const receipt = await issued(); let directory;
  try {
    const result = await persistOkChildcareSchemaReceipt(receipt);
    const manifest = path.resolve(APP_ROOT, result.manifest);
    directory = ownedDirectory(path.dirname(manifest));
    assert.equal(path.basename(directory), result.run_id);
    assert.deepEqual(await readdir(directory), ['manifest.json']);
    const bytes = await readFile(manifest), value = JSON.parse(bytes);
    assert.equal(hash(bytes), result.sha256);
    assert.deepEqual(value, { run_id: result.run_id, ...receipt });
    assert.equal(value.schema.counts.rows, 1);
    assert.equal(result.cancellation_after_publication, false);
    assert.equal(value.claims.provider_values_retained, false);
    assert.equal(value.claims.public_export_authorized, false);
    assert.doesNotMatch(bytes.toString(), /SYNTHETIC_PRIVATE/);
  } finally { await cleanup(directory); }
});

test('Oklahoma persistence rejects forged, copied and mutated process receipts', async () => {
  await assert.rejects(persistOkChildcareSchemaReceipt({ execution_mode: 'native-fetch' }));
  const receipt = await issued();
  await assert.rejects(persistOkChildcareSchemaReceipt(JSON.parse(JSON.stringify(receipt))));
  receipt.execution_mode = 'native-fetch';
  await assert.rejects(persistOkChildcareSchemaReceipt(receipt));
  receipt.execution_mode = 'injected-test-transport';
  receipt.claims.public_export_authorized = true;
  await assert.rejects(persistOkChildcareSchemaReceipt(receipt));
  await assert.rejects(persistOkChildcareSchemaReceiptWithTestHook(receipt, null));
});

test('Oklahoma prepublication cancellation removes the owned unpublished directory', async () => {
  const receipt = await issued(), controller = new AbortController(); let directory;
  try {
    await assert.rejects(persistOkChildcareSchemaReceiptWithTestHook(receipt, async (stage, files) => {
      assert.equal(stage, 'before-publication'); directory = ownedDirectory(files.directory); controller.abort();
    }, { signal: controller.signal }), error => error.code === 'OK_SCHEMA_PUBLICATION_FAILED' && !error.recovery);
    assert.ok(directory);
    await assert.rejects(lstat(directory), error => error.code === 'ENOENT');
  } finally { await cleanup(directory); }
  await assert.rejects(persistOkChildcareSchemaReceipt(receipt, { signal: AbortSignal.abort() }));
});

test('Oklahoma postpublication cancellation completes verification rather than losing publication', async () => {
  const receipt = await issued(), controller = new AbortController(); let directory;
  try {
    const result = await persistOkChildcareSchemaReceiptWithTestHook(receipt, async (stage, files) => {
      directory = ownedDirectory(files.directory);
      if (stage === 'after-publication') controller.abort();
    }, { signal: controller.signal });
    assert.equal(result.cancellation_after_publication, true);
    assert.equal(hash(await readFile(path.resolve(APP_ROOT, result.manifest))), result.sha256);
    assert.deepEqual(await readdir(directory), ['manifest.json']);
  } finally { await cleanup(directory); }
});

test('Oklahoma postpublication tamper returns recovery descriptor and preserves evidence', async () => {
  const receipt = await issued(); let directory, expected;
  try {
    await assert.rejects(persistOkChildcareSchemaReceiptWithTestHook(receipt, async (stage, files) => {
      directory = ownedDirectory(files.directory);
      if (stage === 'after-publication') {
        expected = hash(await readFile(files.manifest));
        await writeFile(files.manifest, '{"tampered":true}\n');
      }
    }), error => {
      assert.equal(error.code, 'OK_SCHEMA_PUBLICATION_UNCERTAIN');
      assert.equal(error.recovery.expected_sha256, expected);
      assert.equal(path.resolve(APP_ROOT, error.recovery.manifest), path.join(directory, 'manifest.json'));
      assert.equal(error.recovery.run_id, path.basename(directory));
      assert.doesNotMatch(error.message, /SYNTHETIC_PRIVATE/);
      return true;
    });
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'manifest.json'))), { tampered: true });
  } finally { await cleanup(directory); }
});

test('Oklahoma CLI help and malformed arguments never request the network', () => {
  const guard = 'data:text/javascript,' + encodeURIComponent('globalThis.fetch = () => { process.stderr.write("UNEXPECTED_NETWORK_CALL"); throw Error("Network forbidden"); };');
  for (const args of [['--help'], ['--unknown'], ['--help', '--unknown'], ['--url', 'https://invalid.example/'], ['--zip', '73102']]) {
    const result = spawnSync(process.execPath, ['--import', guard, 'scripts/probe-ok-childcare-schema.mjs', ...args], {
      cwd: APP_ROOT, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, TEMP: path.join(APP_ROOT, 'data/tmp'), TMP: path.join(APP_ROOT, 'data/tmp') },
    });
    assert.ifError(result.error);
    assert.equal(result.status, args.length === 1 && args[0] === '--help' ? 0 : 1);
    assert.doesNotMatch(result.stdout + result.stderr, /UNEXPECTED_NETWORK_CALL/);
    if (result.status === 0) assert.match(result.stdout, /Usage:/);
    else assert.match(result.stderr, /Invalid Oklahoma schema prerequisite arguments/);
  }
});
