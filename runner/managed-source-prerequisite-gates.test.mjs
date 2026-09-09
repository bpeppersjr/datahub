import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { ManagedOperations } from './managed-operations.mjs';
import { APP_ROOT } from './paths.mjs';
import { getSourcePrerequisiteGates } from './source-acquisition-gates.mjs';

test('source prerequisite hold creates no operation, receipt, child or network request', async t => {
  const base = path.join(APP_ROOT, 'data/tmp'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'managed-source-gates-'));
  const manager = new ManagedOperations({ root, executor: () => assert.fail('child forbidden'),
    receiptWriter: () => assert.fail('receipt forbidden'), idFactory: () => assert.fail('allocation forbidden'),
    configLoader: async () => ({ industries: {}, states: [] }) });
  try {
    await manager.ready;
    t.mock.method(globalThis, 'fetch', () => assert.fail('network forbidden'));
    await assert.rejects(manager.startSourcePrerequisite({ sourceId: 'ne-childcare-pdf' }), error => error.statusCode === 409 && error.code === 'SOURCE_POLICY_UNRESOLVED');
    assert.deepEqual(await manager.list(), []); assert.deepEqual(await readdir(root), []);
    assert.equal(manager.running.size, 0); assert.ok(!manager.reserved);
    assert.deepEqual((await manager.catalog()).sourcePrerequisites, getSourcePrerequisiteGates());
    const accessor = Object.defineProperty({}, 'sourceId', { get: () => assert.fail('getter forbidden'), enumerable: true });
    for (const input of [undefined, null, {}, [], { sourceId: 'other' }, { sourceId: 'ne-childcare-pdf', output: 'private' }, Object.create({ sourceId: 'ne-childcare-pdf' }), accessor, { sourceId: 'ne-childcare-pdf', [Symbol('extra')]: true }]) {
      await assert.rejects(manager.startSourcePrerequisite(input), error => error.statusCode === 400);
    }
    assert.deepEqual(await readdir(root), []);
  } finally {
    await manager.close(); assert.equal(path.dirname(root), base); await rm(root, { recursive: true, force: true });
  }
});
