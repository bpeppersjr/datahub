import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { checkOvertureIdentities } from './overture-identity-check.mjs';

const BASE = path.join(APP_ROOT, 'data/tmp/overture-identity-tests');
async function workspace(t) { await mkdir(BASE, { recursive: true }); const root = await mkdtemp(path.join(BASE, 'run-'));
  t.after(async () => { assert.equal(path.dirname(root), BASE); await rm(root, { recursive: true, force: true }); }); return root; }
const id = index => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
async function* values(count) { for (let i = 0; i < count; i++) yield id(i); }

test('native local identity check streams more than one flush without global JS identity storage', async t => {
  const output = await workspace(t), result = await checkOvertureIdentities({ output, ids: values(20000) });
  assert.equal(result.record_count, 20000); assert.equal(result.unique, true);
  assert.equal(result.claims.normalized_businesses_published, false); assert.equal(result.claims.process_memory_cap_enforced, false);
  assert.ok((await readdir(result.directory)).includes('identity.duckdb'));
});
test('duplicates across flush boundaries reject without disclosing identifiers', async t => {
  const output = await workspace(t);
  async function* rows() { yield* values(9000); yield id(0); }
  await assert.rejects(checkOvertureIdentities({ output, ids: rows() }), error => /duplicate source identities/.test(error.message) && !error.message.includes(id(0)));
});
test('invalid options and pre-cancellation reject before run allocation', async t => {
  const output = await workspace(t);
  for (const options of [{ output, ids: [] }, { output, ids: values(1), memory: 'unlimited' }, { output, ids: values(1), signal: AbortSignal.abort() }, { output, ids: values(1), rowLimit: 20000001 }]) await assert.rejects(checkOvertureIdentities(options));
  assert.deepEqual(await readdir(output), []);
});
test('row budgets only tighten and malformed IDs cannot enter the local table', async t => {
  const output = await workspace(t);
  await assert.rejects(checkOvertureIdentities({ output, ids: values(3), rowLimit: 2 }));
  async function* invalid() { yield "PRIVATE'; DROP TABLE identities; --"; }
  await assert.rejects(checkOvertureIdentities({ output, ids: invalid() }), error => !error.message.includes('PRIVATE'));
});
test('cancellation drains a pending producer callback before native handles are released', { timeout: 5000 }, async t => {
  const output = await workspace(t), controller = new AbortController(); let entered, release, returned = false, settled = false;
  const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  async function* rows() { try { entered(); await gate; yield id(0); } finally { returned = true; } }
  const pending = checkOvertureIdentities({ output, ids: rows(), signal: controller.signal }).finally(() => { settled = true; });
  const rejected = assert.rejects(pending);
  try { await ready; controller.abort(); await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false); }
  finally { release(); }
  await rejected; assert.equal(returned, true);
});
test('source failure and cancellation close producer and native handles', async t => {
  for (const cancel of [false, true]) {
    const output = await workspace(t), controller = new AbortController(); let returned = false;
    async function* rows() { try { yield id(0); if (cancel) controller.abort(); else throw Error('PRIVATE_SOURCE'); yield id(1); } finally { returned = true; } }
    await assert.rejects(checkOvertureIdentities({ output, ids: rows(), signal: controller.signal }), error => !error.message.includes('PRIVATE_SOURCE'));
    assert.equal(returned, true);
  }
});
