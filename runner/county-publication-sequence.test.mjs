import test from 'node:test';
import assert from 'node:assert/strict';
import { countyPublicationSequence } from './county-publication-sequence.mjs';

test('staging-time binding drift prevents publication', async () => {
  const calls = [];
  await assert.rejects(countyPublicationSequence({
    revalidate: async () => { calls.push('revalidate'); throw Error('policy drift'); },
    publish: async () => calls.push('publish'), inspect: async () => calls.push('inspect'),
  }), /policy drift/);
  assert.deepEqual(calls, ['revalidate']);
});
test('cancellation after revalidation does not publish', async () => {
  const controller = new AbortController(); let published = false;
  await assert.rejects(countyPublicationSequence({ signal: controller.signal,
    revalidate: async () => controller.abort(), publish: async () => { published = true; },
  }), { name: 'AbortError' });
  assert.equal(published, false);
});
test('post-publication cancellation and inspection failures retain recovery identity', async () => {
  for (const cancelled of [true, false]) {
    const controller = new AbortController(), calls = [];
    const recovery = { manifest: 'synthetic-manifest', run_id: 'synthetic-run', expected_sha256: 'synthetic-hash' };
    await assert.rejects(countyPublicationSequence({ signal: controller.signal, recovery,
      revalidate: async () => calls.push('revalidate'),
      publish: async () => { calls.push('publish'); if (cancelled) controller.abort(); },
      inspect: async () => { calls.push('inspect'); throw Error('private diagnostic'); },
    }), error => {
      assert.deepEqual(error.recovery, { ...recovery, status: 'published-inspection-required', retry_authorized: false });
      assert.equal(Object.isFrozen(error.recovery), true);
      assert.equal(error.message.includes('private diagnostic'), false); return true;
    });
    assert.deepEqual(calls, cancelled ? ['revalidate', 'publish'] : ['revalidate', 'publish', 'inspect']);
  }
});
test('success follows revalidation, publication, then inspection', async () => {
  const calls = [];
  const result = await countyPublicationSequence({ revalidate: async () => calls.push('revalidate'),
    publish: async () => calls.push('publish'), inspect: async () => { calls.push('inspect'); return 'verified'; } });
  assert.equal(result, 'verified'); assert.deepEqual(calls, ['revalidate', 'publish', 'inspect']);
});
