import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { buildIndustryPlan } from './industry-segments.mjs';
import { createManagedRefreshScheduler } from './managed-refresh-scheduler.mjs';
import { createManagedOperations } from './managed-operations.mjs';

const input = { industries: ['retail'], states: ['TX'], intervalHours: 24 };
async function fixture(t) {
  const temp = path.join(APP_ROOT, 'data/tmp'); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(path.join(temp, 'refresh-scheduler-test-')); const instances = [];
  t.after(async () => { for (const item of instances) await item.close().catch(() => {}); await rm(root, { recursive: true, force: true }); });
  let clock = '2026-09-07T00:00:00.000Z', calls = 0, busy = false;
  const records = new Map();
  const config = { version: 1, max_concurrency: 1, states: ['TX', 'GA'], industries: { retail: ['fixture-source'], other: ['other-source'] }, sources: {
    'fixture-source': { script: 'scripts/build-usda-snap-retailers.mjs', scope: 'national', states: 'all', state_filter_supported: false, prerequisites: [] },
    'other-source': { script: 'scripts/build-fdic-bankfind.mjs', scope: 'national', states: 'all', state_filter_supported: false, prerequisites: [] },
  } };
  const operations = {
    plan: async (selection) => buildIndustryPlan(config, selection),
    get: async (id) => records.get(id) ?? null,
    startScheduledCollection: async (_selection, { operationId }) => {
      if (busy) throw Object.assign(new Error('busy'), { code: 'OPERATION_CONFLICT', retryable: true });
      calls += 1; const operation = { id: operationId, status: 'RUNNING' }; records.set(operationId, operation); return operation;
    },
  };
  const make = (options = {}) => { const instance = createManagedRefreshScheduler({ root: path.join(root, 'scheduler'), operations, now: () => clock, autoStart: false, ...options }); instances.push(instance); return instance; };
  return { root, make, operations, records, config, setTime: (value) => { clock = value; }, setBusy: (value) => { busy = value; }, calls: () => calls };
}
test('refresh schedules default disabled and require explicit bounded selections', async (t) => {
  const f = await fixture(t), scheduler = f.make();
  const schedule = await scheduler.create(input); assert.equal(schedule.enabled, false);
  await scheduler.tick(); assert.equal(f.calls(), 0); assert.equal((await scheduler.list()).length, 1);
  for (const value of [{ ...input, intervalHours: 1 }, { ...input, states: [] }, { ...input, industries: [] }, { ...input, enabled: 'yes' }, { ...input, command: 'anything' }]) await assert.rejects(scheduler.create(value));
});
test('simultaneous ticks dispatch exactly one durable occurrence', async (t) => {
  const f = await fixture(t), scheduler = f.make();
  const created = await scheduler.create({ ...input, enabled: true });
  const original = f.operations.startScheduledCollection;
  f.operations.startScheduledCollection = async (selection, options) => {
    const state = JSON.parse(await readFile(path.join(f.root, 'scheduler/state.json')));
    assert.equal(state.schedules[0].lastOccurrence.status, 'DISPATCHING');
    assert.equal(state.schedules[0].lastOccurrence.operationId, options.operationId);
    return original(selection, options);
  };
  await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()]); assert.equal(f.calls(), 1);
  const schedule = (await scheduler.list()).find((s) => s.id === created.id); assert.match(schedule.lastOccurrence.operationId, /^refresh-[a-f0-9]{48}$/);
});
test('restart adopts completed operation and schedules next interval without redownloading', async (t) => {
  const f = await fixture(t), first = f.make(); await first.create({ ...input, enabled: true }); await first.tick();
  const id = (await first.list())[0].lastOccurrence.operationId; await first.close();
  f.records.get(id).status = 'SUCCEEDED'; f.setTime('2026-09-08T12:00:00.000Z');
  const restarted = f.make(); await restarted.tick(); assert.equal(f.calls(), 1);
  assert.equal((await restarted.list())[0].nextDueAt, '2026-09-09T12:00:00.000Z');
  await restarted.tick(); assert.equal(f.calls(), 1);
});
test('unresolved dispatch or failed operation pauses rather than replaying', async (t) => {
  for (const status of ['missing', 'FAILED', 'UNKNOWN']) {
    const f = await fixture(t), first = f.make(); await first.create({ ...input, enabled: true }); await first.tick();
    const id = (await first.list())[0].lastOccurrence.operationId; await first.close();
    if (status === 'missing') f.records.delete(id); else f.records.get(id).status = status;
    const restarted = f.make(); await restarted.tick(); await restarted.tick();
    const schedule = (await restarted.list())[0]; assert.equal(schedule.enabled, false); assert.equal(schedule.status, 'PAUSED'); assert.equal(f.calls(), 1);
  }
});
test('enabled schedules reject overlapping national source across different states', async (t) => {
  const f = await fixture(t), scheduler = f.make(); await scheduler.create({ ...input, enabled: true });
  await assert.rejects(scheduler.create({ ...input, states: ['GA'], enabled: true }), /share|overlap/i);
  const disabled = await scheduler.create({ ...input, states: ['GA'] });
  await assert.rejects(scheduler.setEnabled(disabled.id, true), /share|overlap/i);
  await scheduler.create({ ...input, industries: ['other'], enabled: true });
});
test('busy operation defers the occurrence without consuming it', async (t) => {
  const f = await fixture(t), scheduler = f.make(); await scheduler.create({ ...input, enabled: true }); f.setBusy(true);
  await scheduler.tick(); assert.equal(f.calls(), 0); assert.equal((await scheduler.list())[0].lastOccurrence, null);
  f.setBusy(false); await scheduler.tick(); assert.equal(f.calls(), 1);
});
test('plan drift pauses before dispatch and cannot be silently accepted by reenabling', async (t) => {
  const f = await fixture(t), scheduler = f.make(); const created = await scheduler.create({ ...input, enabled: true });
  f.config.sources['fixture-source'].coverage_notes = ['Changed scope requires review.'];
  await scheduler.tick(); assert.equal(f.calls(), 0); assert.equal((await scheduler.list())[0].status, 'PAUSED');
  await assert.rejects(scheduler.setEnabled(created.id, true), /changed|drift/i);
});
test('missed intervals coalesce into one attempt and pause does not cancel its active operation', async (t) => {
  const f = await fixture(t), scheduler = f.make(); const created = await scheduler.create({ ...input, enabled: true });
  f.setTime('2026-10-07T00:00:00.000Z'); await scheduler.tick(); assert.equal(f.calls(), 1);
  await scheduler.setEnabled(created.id, false); await scheduler.tick(); assert.equal(f.calls(), 1);
  assert.equal([...f.records.values()][0].status, 'RUNNING');
});
test('ownership conflict never steals existing scheduler lock', async (t) => {
  const f = await fixture(t), first = f.make(); await first.ready;
  const before = await readFile(path.join(f.root, 'scheduler/owner.lock'));
  const second = f.make(); await assert.rejects(second.ready, /owner|lock/i);
  assert.deepEqual(await readFile(path.join(f.root, 'scheduler/owner.lock')), before);
});
test('null state and linked scheduler storage fail closed', async (t) => {
  const f = await fixture(t); await mkdir(path.join(f.root, 'scheduler')); await writeFile(path.join(f.root, 'scheduler/state.json'), 'null');
  const malformed = f.make(); await assert.rejects(malformed.ready, /state|malformed/i);
  const other = await fixture(t), redirect = path.join(other.root, 'redirect'); await mkdir(redirect); await symlink(redirect, path.join(other.root, 'scheduler'), 'junction');
  const linked = other.make(); await assert.rejects(linked.ready, /link|path/i);
});
test('local timer triggers a due occurrence without an external caller', async (t) => {
  const f = await fixture(t), scheduler = f.make({ autoStart: true, intervalMs: 10 });
  await scheduler.create({ ...input, enabled: true });
  for (let n = 0; n < 100 && f.calls() === 0; n++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.calls(), 1); await scheduler.close();
});
test('scheduler dispatches through real managed operations with stable persisted identity', async (t) => {
  const f = await fixture(t); let executions = 0;
  const operations = createManagedOperations({ root: path.join(f.root, 'operations'), configLoader: async () => f.config, executor: async () => { executions += 1; return { code: 0 }; } });
  t.after(() => operations.close());
  const scheduler = f.make({ operations }); await scheduler.create({ ...input, enabled: true }); await scheduler.tick();
  for (let n = 0; n < 100; n++) { await scheduler.tick(); if ((await scheduler.list())[0].lastOccurrence.status === 'SUCCEEDED') break; await new Promise((resolve) => setTimeout(resolve, 5)); }
  const occurrence = (await scheduler.list())[0].lastOccurrence; assert.equal(occurrence.status, 'SUCCEEDED'); assert.equal(executions, 1);
  const receipt = JSON.parse(await readFile(path.join(operations.root, occurrence.operationId, 'receipt.json'))); assert.equal(receipt.id, occurrence.operationId);
});

test('schedule persistence failure disables further dispatch until inspection', async (t) => {
  const f = await fixture(t), scheduler = f.make(); await scheduler.ready;
  const file = path.join(f.root, 'scheduler/state.json'), before = await readFile(file);
  await unlink(file); await mkdir(file);
  try {
    await assert.rejects(scheduler.create({ ...input, enabled: true }));
    await assert.rejects(scheduler.tick()); assert.equal(f.calls(), 0);
  } finally { await rmdir(file); await writeFile(file, before); }
  await scheduler.close(); const restarted = f.make(); assert.deepEqual(await restarted.list(), []);
});

test('ambiguous operation identity conflicts pause instead of being retried as busy', async (t) => {
  const f = await fixture(t), scheduler = f.make();
  let attempts = 0; f.operations.startScheduledCollection = async () => { attempts += 1; throw Object.assign(new Error('ambiguous existing receipt'), { code: 'OPERATION_CONFLICT', retryable: false }); };
  await scheduler.create({ ...input, enabled: true }); await scheduler.tick(); await scheduler.tick();
  assert.equal(attempts, 1); assert.equal((await scheduler.list())[0].enabled, false);
});
