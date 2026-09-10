import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNhBrowserNetworkGuard as guard } from './nh-childcare-browser-network.mjs';
function route(url = 'https://new-hampshire.my.site.com/nhccis/NH_ChildCareSearch', status = 200, fail = false) {
  const calls = [];
  return { calls, request: () => ({ url: () => url }),
    fetch: async options => { calls.push('fetch'); assert.deepEqual(options, { maxRedirects: 0, maxRetries: 0, timeout: 15000 });
      if (fail) throw Error('PRIVATE'); return { status: () => status, dispose: async () => { calls.push('dispose'); } }; },
    fulfill: async () => { calls.push('fulfill'); }, abort: async () => { calls.push('abort'); } };
}
test('NH browser rejects redirect chains and access denial without following or leaking details', async () => {
  for (const status of [301, 302, 307, 308, 401, 403, 429]) {
    const g = guard(), r = route(undefined, status); await g.route(r);
    assert.deepEqual(r.calls, ['fetch', 'abort', 'dispose']); assert.equal(g.snapshot().denied, true);
  }
  const g = guard(), r = route(); await g.route(r);
  assert.deepEqual(r.calls, ['fetch', 'fulfill', 'dispose']); assert.deepEqual(g.snapshot(), { requests: 1, denied: false });
});
test('NH browser rejects credential/port/host/protocol escapes, cancellation and request overflow before fetching', async () => {
  for (const url of ['http://new-hampshire.my.site.com/', 'https://new-hampshire.my.site.com:444/',
    'https://PRIVATE@new-hampshire.my.site.com/', 'https://new-hampshire.my.site.com.evil.test/', 'file:///PRIVATE']) {
    const g = guard(), r = route(url); await g.route(r); assert.deepEqual(r.calls, ['abort']);
  }
  const cancelled = route(); await guard(AbortSignal.abort()).route(cancelled); assert.deepEqual(cancelled.calls, ['abort']);
  const g = guard(); for (let i = 0; i < 120; i++) await g.route(route());
  const overflow = route(); await g.route(overflow); assert.deepEqual(overflow.calls, ['abort']);
  const failed = route(undefined, 200, true); await guard().route(failed); assert.deepEqual(failed.calls, ['fetch', 'abort']);
});
