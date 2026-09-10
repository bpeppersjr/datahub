import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectOkRetainedSearchWithTestTransport as collect, okRetainedSyntheticClient, okRetainedFetchSnapshot } from './ok-childcare-retained-fetch.mjs';

test('OK retained fetch rejects overflow, incomplete body, redirects and wrong content type without retries', async () => {
  for (const kind of ['overflow', 'partial', 'redirect', 'content-type']) {
    let calls = 0;
    const result = await collect(async () => {
      if (++calls === 1) return new Response(okRetainedSyntheticClient());
      if (kind === 'redirect') return { status: 200, redirected: true, body: new ReadableStream() };
      const body = kind === 'partial' ? new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.error(Error('PRIVATE')); } })
        : new Uint8Array(kind === 'overflow' ? 1000001 : 10);
      return new Response(body, { headers: { 'content-type': kind === 'content-type' ? 'application/json' : 'text/html' } });
    });
    assert.equal(result.status, 'rejected'); assert.deepEqual(result.selected, []); assert.equal(calls, 2);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});
test('OK retained fetch cancellation bounds stalled fetch and body reads and keeps issued receipts immutable', async () => {
  for (const body of [false, true]) {
    const controller = new AbortController(); let calls = 0;
    const pending = collect(async () => {
      calls++; if (body && calls === 1) return new Response(okRetainedSyntheticClient());
      setTimeout(() => controller.abort(), 10);
      return body ? new Response(new ReadableStream(), { headers: { 'content-type': 'text/html' } }) : new Promise(() => {});
    }, { signal: controller.signal });
    const result = await pending; assert.equal(result.status, 'rejected'); assert.equal(result.failure, 'cancelled-or-deadline');
    assert.ok(calls <= 2); okRetainedFetchSnapshot(result); result.status = 'accepted-internal-source-candidates';
    assert.throws(() => okRetainedFetchSnapshot(result));
  }
});
