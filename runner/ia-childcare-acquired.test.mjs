import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile, readdir, writeFile, unlink, rmdir} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {IA_CHILDCARE_URLS, IA_CHILDCARE_TEST_CLIENT} from './ia-childcare-acquisition.mjs';
import {buildIaChildcareAcquired, buildIaChildcareAcquiredWithTestTransport as build, verifyIaChildcareAcquired as verify} from './ia-childcare-acquired.mjs';
const ROOT = path.join(APP_ROOT, 'data/tmp/ia-childcare-acquired-test');
const payload = [{businessType: 'building', businessName: 'Synthetic center', address: '1 Test St', city: 'Test',
  zipCode: 50301, latitude: 41, longitude: -93, referral: true},
{businessType: 'home', businessName: 'EXCLUDED_PRIVATE_NAME', address: 'EXCLUDED_PRIVATE_ADDRESS'}];
const response = url => new Response(url === IA_CHILDCARE_URLS.client ? IA_CHILDCARE_TEST_CLIENT : JSON.stringify(payload));
async function removeTestRelease(result) {
  const directory = path.dirname(result.manifest_path);
  assert.equal(path.dirname(directory), ROOT);
  const names = await readdir(directory);
  assert.deepEqual(names.sort(), ['client-after.json', 'client-before.json', 'evidence.json', 'manifest.json', 'selected-response.json']);
  for (const name of names) await unlink(path.join(directory, name));
  await rmdir(directory);
}

test('Iowa durable release fsyncs checkpoints before next request and independently verifies selected-only evidence', async () => {
  const before = await readdir(ROOT).catch(error => {if (error.code === 'ENOENT') return []; throw error;});
  let calls = 0;
  const result = await build(async url => {
    calls++;
    const ids = (await readdir(ROOT)).filter(name => !before.includes(name) && !name.startsWith('.'));
    assert.equal(ids.length, 1);
    const files = await readdir(path.join(ROOT, ids[0]));
    if (calls >= 2) assert.ok(files.includes('client-before.json'));
    if (calls >= 3) assert.ok(files.includes('selected-response.json'));
    assert.ok(!files.includes('manifest.json'));
    return response(url);
  });
  try {
    assert.equal(calls, 3); assert.equal(result.manifest.execution_mode, 'injected-test-transport');
    assert.deepEqual(await verify(result.manifest_path), result);
    const directory = path.dirname(result.manifest_path);
    for (const entry of result.manifest.artifacts) {
      const text = await readFile(path.join(directory, entry.path), 'utf8');
      assert.doesNotMatch(text, /EXCLUDED_PRIVATE_NAME|EXCLUDED_PRIVATE_ADDRESS/);
    }
    const evidencePath = path.join(directory, 'evidence.json'), original = await readFile(evidencePath);
    const changed = JSON.parse(original); changed.selection.rows[0].source.businessName = 'tampered';
    await writeFile(evidencePath, JSON.stringify(changed) + '\n');
    await assert.rejects(verify(result.manifest_path), /verification failed/);
    await writeFile(evidencePath, original); assert.deepEqual(await verify(result.manifest_path), result);
    const manifestBytes = await readFile(result.manifest_path), manifest = JSON.parse(manifestBytes);
    manifest.claims.current_business_status_verified = true;
    await writeFile(result.manifest_path, JSON.stringify(manifest));
    await assert.rejects(verify(result.manifest_path), /verification failed/);
    await writeFile(result.manifest_path, manifestBytes);
  } finally {await removeTestRelease(result);}
});

test('Iowa failure and cancellation remove owned unpublished checkpoints and release publisher lock', async () => {
  const before = (await readdir(ROOT)).sort(); let calls = 0;
  await assert.rejects(build(async url => {calls++; return calls === 2 ? new Response('private', {status: 403}) : response(url);}));
  assert.equal(calls, 2); assert.deepEqual((await readdir(ROOT)).sort(), before);
  const controller = new AbortController(); calls = 0;
  await assert.rejects(build(async url => {calls++; if (calls === 2) controller.abort(); return response(url);}, {signal: controller.signal}));
  assert.deepEqual((await readdir(ROOT)).sort(), before);
});

test('Iowa overlapping publisher run cannot issue another request', async () => {
  let entered, release;
  const ready = new Promise(resolve => {entered = resolve;});
  const gate = new Promise(resolve => {release = resolve;});
  const first = build(async url => {entered(); await gate; return response(url);});
  await ready;
  try {await assert.rejects(build(async () => assert.fail('locked run must not request')));}
  finally {release();}
  const result = await first; await removeTestRelease(result);
});

test('Iowa durable public API rejects caller paths and pre-abort without acquisition', async () => {
  for (const options of [null, {outputRoot: ROOT}, {transport: () => {}}, {signal: {}}, Object.create({}),
    Object.defineProperty({}, 'signal', {get() {assert.fail('accessor');}})]) await assert.rejects(buildIaChildcareAcquired(options));
  await assert.rejects(buildIaChildcareAcquired({signal: AbortSignal.abort()}), {name: 'AbortError'});
  await assert.rejects(verify(path.join(APP_ROOT, 'data/tmp/not-a-release/manifest.json')));
});
