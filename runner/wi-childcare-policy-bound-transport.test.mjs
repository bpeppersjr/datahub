import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { payload } from './fixtures/wi-childcare.mjs';
import { batch } from './fixtures/wi-childcare-acquisition.mjs';
import { wiInventoryUrl } from './wi-childcare-acquisition.mjs';
import { wiPreflightUrl, validateWiChildcarePreflight } from './wi-childcare-preflight.mjs';
import { acquireWiChildcare, acquireWiChildcarePolicyBoundWithTransport } from './wi-childcare-transport.mjs';
import developmentPolicy from '../config/source-policies/wi-childcare-local-review.json' with { type: 'json' };

function fixture(notices = new Map(), change = () => {}) {
  const calls = [];
  return { calls, options: {
    now: () => new Date('2026-09-10T20:00:00.000Z'), sleep: async (_, { signal } = {}) => signal?.throwIfAborted(),
    fetchImpl: async url => {
      calls.push(url); const ids = new URL(url).searchParams.get('objectIds');
      let value = url === wiInventoryUrl() ? { objectIdFieldName: 'OBJECTID', objectIds: [1, 2] }
        : ids ? batch(ids.split(',').map(Number)) : structuredClone(notices.get(url) ?? payload(url));
      if (value.count) value.count = 2;
      value = change(value, url, calls.length) ?? value;
      if (url.endsWith('/metadata') && typeof value !== 'string') return new Response(Buffer.from(value.base64, 'base64'));
      return typeof value === 'string' ? new Response(value) : Response.json(value);
    },
  } };
}
test('unreviewed synthetic notices stop before hooks, IDs or records', async () => {
  const f = fixture(); let hooks = 0;
  await assert.rejects(acquireWiChildcarePolicyBoundWithTransport({ ...f.options, onPreflight: () => hooks++, onObservation: () => hooks++ }), /terms changed/);
  assert.equal(f.calls.length, 18); assert.equal(hooks, 0);
  assert(!f.calls.includes(wiInventoryUrl())); assert(!f.calls.some(url => new URL(url).searchParams.has('objectIds')));
});
test('policy replacement, hooks, native fetch fallback and early cancellation remain rejected', async () => {
  const f = fixture();
  for (const options of [{}, { ...f.options, policy: {} }, { ...f.options, validatePolicy() {} }, { ...f.options, onPreflight: true }]) {
    await assert.rejects(acquireWiChildcarePolicyBoundWithTransport(options));
  }
  await assert.rejects(acquireWiChildcarePolicyBoundWithTransport({ ...f.options, signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(f.calls.length, 0);
  await assert.rejects(acquireWiChildcare(), { code: 'WI_CHILDCARE_LIVE_NOT_ENROLLED' });
});
test('changing the imported development policy cannot change the fixed review binding', async () => {
  const original = structuredClone(developmentPolicy), f = fixture();
  try {
    for (const change of [() => { developmentPolicy.acquisition_authorized = true; },
      () => { developmentPolicy.terms_fingerprints.xml = 'a'.repeat(64); },
      () => { developmentPolicy.attribution = 'Changed'; }]) {
      Object.assign(developmentPolicy, structuredClone(original)); change();
      await assert.rejects(acquireWiChildcarePolicyBoundWithTransport(f.options), /fixed development policy changed/);
    }
  } finally { Object.assign(developmentPolicy, original); }
  assert.equal(f.calls.length, 0);
});
test('retained reviewed notices pass the gate without granting acquisition authority', {
  skip: !process.env.DATAHUB_TEST_WI_RETAINED_POLICY,
}, async () => {
  const file = path.join(APP_ROOT, 'data/business-sources/wi-dhs-licensed-group-childcare/preflights/b868758e-3ff7-429c-8625-57bac5367a9e.json');
  const saved = JSON.parse(await readFile(file, 'utf8')); validateWiChildcarePreflight(saved);
  const kinds = ['service-item', 'layer-item', 'iteminfo', 'notice-data', 'xml'];
  const notices = new Map(kinds.map(kind => [wiPreflightUrl(kind), saved.observations.find(row => row.kind === kind).payload]));
  const f = fixture(notices), phases = [];
  const result = await acquireWiChildcarePolicyBoundWithTransport({ ...f.options, onPreflight: ({ phase, preflight }) => {
    phases.push(phase); preflight.observations.length = 0;
  } });
  assert.equal(f.calls.length, 39); assert.deepEqual(phases, ['before', 'after']); assert.equal(result.features.length, 2);
  assert.equal(result.policy_validation.phases.length, 2); assert.equal(result.policy_validation.source_use_authorized, false);
  assert.equal(result.source.acquisition_authorized, false); assert.equal(result.transport.source_authenticity_verified, false);
  const failed = fixture(notices);
  await assert.rejects(acquireWiChildcarePolicyBoundWithTransport({ ...failed.options, onPreflight: () => { throw Error('retention failed'); } }), /retention failed/);
  assert.equal(failed.calls.length, 18);
  for (const kind of kinds) {
    const changed = fixture(notices, (value, url) => {
      if (url !== wiPreflightUrl(kind)) return;
      if (kind === 'xml') return Buffer.from(value.base64, 'base64').toString('utf8').replace('</metadata>', '<!-- Changed notice. --></metadata>');
      if (kind === 'notice-data') value.markdown_cards[0] += ' Changed notice.';
      else value.licenseInfo += ' Changed notice.';
    });
    await assert.rejects(acquireWiChildcarePolicyBoundWithTransport(changed.options), /terms changed/);
    assert.equal(changed.calls.length, 18);
  }
  const missing = fixture(notices, (_, url) => url === wiPreflightUrl('notice-data') ? {} : undefined);
  await assert.rejects(acquireWiChildcarePolicyBoundWithTransport(missing.options)); assert.equal(missing.calls.length, 7);
  const controller = new AbortController(), cancelled = fixture(notices);
  await assert.rejects(acquireWiChildcarePolicyBoundWithTransport({ ...cancelled.options, signal: controller.signal, onPreflight: () => controller.abort() }), { name: 'AbortError' });
  assert.equal(cancelled.calls.length, 18);
  const finalDrift = fixture(notices, (value, url, call) => {
    if (call > 21 && url === wiPreflightUrl('service-item')) value.licenseInfo += ' Changed notice.';
  });
  const retained = [];
  await assert.rejects(acquireWiChildcarePolicyBoundWithTransport({ ...finalDrift.options, onObservation: row => retained.push(row.kind) }), /metadata\/count drift/);
  assert.equal(finalDrift.calls.length, 39); assert.deepEqual(retained, ['inventory', 'features', 'inventory']);
});
