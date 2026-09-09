# Controlled local Overture asset bridge

September 9, 2026. This connects the bounded transport library to native httpfs in a local compatibility test. It is not yet connected to the production preparation command or managed acquisition worker. No Overture place assets were downloaded.

## Boundary

`startOvertureAssetBridge({transport, assetCount, signal})` in `runner/overture-asset-bridge.mjs` starts an ephemeral HTTP server bound only to `127.0.0.1`. A random 256-bit path capability and exact Host check restrict each URL to one numeric asset index. URLs are private, ephemeral runtime values: do not put them in logs, manifests, receipts or query error output. This is an internal composition primitive with a trusted supplied transport, not a public arbitrary proxy or an authorization API.

Only HEAD and closed single-range GET requests are accepted. Queries, alternate paths, origins, cookies, authorization headers, request bodies, full GETs, open/suffix/multiple ranges and out-of-bounds indices/ranges are rejected without upstream I/O. No remote URL comes from an HTTP request. HEAD caches metadata pinned through the transport; GET still uses its original upstream ETag condition and delivery validation. Response payload is streamed with writable backpressure rather than accumulated as a complete asset.

Admission is bounded to 32 active handlers and 32 sockets, with bounded headers and socket/request timeouts. Closing the bridge stops admission, destroys local sockets, starts transport cancellation and drains owned handler promises. A client disconnect during an admitted request fails the session. Supplied callbacks must settle; this is not an OS sandbox or hard process deadline. Counts are aggregate diagnostics, not durable receipts or a cross-process budget.

## Native compatibility evidence

`runner/overture-asset-bridge-native.test.mjs` requires an explicitly selected retained runtime operation via `DATAHUB_TEST_OVERTURE_RUNTIME_OPERATION`. It verifies that operation's runtime manifest/artifact binding with the existing reader, explicitly loads the retained signed core extension with automatic extension installation/loading disabled, and generates Parquet locally. The original two-row protocol fixture has been [expanded to six inputs and three selected outputs](OVERTURE-STREAMING-QUERY.md). Native DuckDB reads the file through loopback and the bounded transport's **injected** source implementation, observing HEAD and ranged GET calls.

The successful fixture used retained operation `b4ae8318-e786-4ac8-bf7b-e673c6d00ae1`. It used no dependency download fallback, external source request or acquisition authorization. Temporary home, extension, spill and fixture paths were inside `datahub/data/tmp`; test-owned files were removed after handles closed. Failure output redacts the native query exception because it may contain a capability URL. This proves local native protocol compatibility, not upstream source authenticity, national data coverage, production resource enforcement or managed-worker completion.

## Remaining integration

The existing direct `prepareOvertureUsPlacesSource` path remains unchanged and must not substitute for a governed worker. Next combine bridge lifecycle with retained-runtime admission, controlled selected-field SQL, operation-bound accounting/receipts, engine/output/disk limits and managed dispatch. Persist immutable upstream asset identities and sanitized query contracts, never local capability URLs. Large acquisition remains unauthorized and off.

Rollback is code-only reversion of these currently unreferenced bridge modules/tests. Do not delete retained runtime artifacts or source releases.

## Release checks

Eight focused tests passed, including the opt-in native compatibility test. Full `npm run check` with that same retained-runtime selection passed: 1,607 tests, 1,596 passed, 11 skipped, zero failures, followed by lint, web/desktop builds and desktop control-plane smoke. Evidence: `data/tmp/overture-asset-bridge-full-check.log`. TypeScript passed and the production dependency audit found zero vulnerabilities. All 82 protected production pins remained unchanged. The idle development service was stopped for checks and restored afterward; no production acquisition or pointer promotion was dispatched.
