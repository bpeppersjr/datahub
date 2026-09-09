# Overture asset transport core

September 9, 2026. This is a library increment, not an acquisition handoff. The existing direct DuckDB preparation path does **not** use it yet. No place assets were requested to develop or test this increment.

## Contract

`runner/overture-asset-transport.mjs` accepts an immutable list of up to 32 distinct canonical Places Parquet URLs from one release on the fixed Overture S3 host. Native construction requires the existing large-acquisition authorization and an accounting callback. It exposes `head(index)`, `read(index, {start, end}, onChunk)`, `snapshot()` and asynchronous `close()`.

Each instance serializes requests, including awaited accounting, sinks and cleanup. HEAD pins a positive object length and strong ETag; ranged GET requires exact 206, length, Content-Range and matching ETag. Requests omit credentials, request identity encoding, reject redirects and never retry. Invalid calls, invalid delivery, callback failures and queue overflow close the instance. Errors contain no remote response values.

Native limits are 100,000 reserved requests, 32 GiB reserved range payload, 64 MiB per range, 32 GiB per object, 32 queued requests, at least 250 ms between fetch starts, 30-second cooperative request timeout and four-hour cooperative session deadline. Reservations occur before fetch and are not refunded. HEAD requests consume a request reservation but no payload reservation.

`request-reserved` and `request-completed` events contain fixed aggregate counters and asset indices. These hooks do not themselves persist receipts. Snapshots distinguish reserved, observed and delivered bytes and actual fetch calls. Delivered means exposed to the sink, not safely stored. An offending oversized chunk is observed but not forwarded; a short body can expose partial bytes before the operation fails.

## Ownership and limits of proof

Cancellation closes admission and rejects queued work immediately, but `close()` drains owned fetches, late-response cancellation, readers and callbacks before releasing the active slot. Callbacks must settle; they must not await this same transport's close or queued requests. This is cooperative cancellation, not a hard process deadline.

The byte limit is not a TCP/wire-byte quota: headers and network buffering are outside its accounting. Serial admission and budgets are per instance, not shared across processes. There is no durable accounting, restart recovery, disk/output quota or engine memory limit in this module. Snapshot claims explicitly report those boundaries as unenforced.

The separate injected test factory is marked `injected-test-transport`, supports only tighter limits (or shorter pacing) and produces no native receipt. Its tests are synthetic HTTP-response fixtures, not proof of a native asset acquisition.

## Integration still required

Route the query engine through an app-owned controlled asset bridge, consume the already verified retained httpfs runtime, persist operation-bound accounting and receipts, enforce extraction/storage budgets and enroll the worker in managed operations. Only then can an authorized acquisition be handed off with a real operation ID. Do not run the existing direct preparation command as a substitute for those controls.

No schema, production pointer or retained release changes in this increment. Rollback is code-only removal/reversion of this currently unreferenced library and its tests; retain all existing downloaded data and prerequisite receipts.

## Release verification

Sixteen focused synthetic tests passed. Full `npm run check` passed with 1,599 tests: 1,588 passed, 11 skipped, zero failures, followed by lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/overture-asset-transport-full-check.log`. TypeScript passed and `npm audit --omit=dev` reported zero vulnerabilities. All 82 protected production pins remained unchanged. The idle development service was stopped for verification and restored afterward. No native place acquisition, managed download operation or production promotion was dispatched.
