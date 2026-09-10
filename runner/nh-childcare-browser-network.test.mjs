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
test('NH browser diagnostics distinguish policy, transport and shutdown errors without source details', async () => {
  const policy = guard(); await policy.route(route(undefined, 403));
  assert.deepEqual(policy.diagnostics(), [{ phase: 'response-policy', status: 403, cancelled: false }]);
  const transport = guard(); await transport.route(route(undefined, 200, true));
  assert.deepEqual(transport.diagnostics(), [{ phase: 'transport', status: null, cancelled: false }]);
  const copy = transport.diagnostics(); copy[0].phase = 'PRIVATE'; assert.equal(transport.diagnostics()[0].phase, 'transport');
  const disposal = guard(), r = route(); r.fetch = async () => ({ status: () => 200, dispose: async () => { throw Error('PRIVATE'); } });
  await disposal.route(r); assert.deepEqual(disposal.diagnostics(), [{ phase: 'dispose', status: 200, cancelled: false }]);
  assert.equal(JSON.stringify([policy.diagnostics(), transport.diagnostics(), disposal.diagnostics()]).includes('PRIVATE'), false);
});
test('NH local scope diagnostics expose only bounded DNS and categorical resource information', async () => {
  const g = guard(), r = route('https://assets.example.org/PRIVATE_PATH?token=PRIVATE_TOKEN');
  r.request = () => ({ url: () => 'https://assets.example.org/PRIVATE_PATH?token=PRIVATE_TOKEN', resourceType: () => 'image' });
  await g.route(r);
  assert.deepEqual(g.diagnostics(), [{ phase: 'request-scope', status: null, cancelled: false,
    scope_reason: 'unsupported-host', host: 'assets.example.org', resource_type: 'image' }]);
  assert.deepEqual(r.calls, ['abort']); assert.equal(JSON.stringify(g.diagnostics()).includes('PRIVATE'), false);
  const credential = guard(); await credential.route(route('https://PRIVATE@assets.example.org/PRIVATE'));
  assert.equal(credential.diagnostics()[0].scope_reason, 'credentials'); assert.equal(credential.diagnostics()[0].host, null);
  const protocol = guard(); await protocol.route(route('http://assets.example.org/PRIVATE'));
  assert.equal(protocol.diagnostics()[0].scope_reason, 'protocol');
});
