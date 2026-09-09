# Retained-runtime bounded extraction engine

September 9, 2026. `runOvertureBoundedEngine` composes retained runtime validation, fixed selection SQL, chunked JSON and verified gzip output. It is an internal application-worker component, not yet a managed acquisition operation or refresh schedule. Large acquisition remains off.

## Admission and runtime reuse

Exact, copied options bind the output root, retained prerequisite descriptor/output/operation, bridge URLs and optional cancellation signal. Caller SQL, engine overrides, cancelled-publication descriptors, malformed paths and invalid bridge URLs are rejected. The runtime reader verifies existing artifact hashes and provenance; no installer or download fallback is called. Platform, architecture, package version and the live engine version/platform are checked before explicitly loading the retained core extension with unsigned/community extensions disabled.

An app-contained exclusive UUID directory owns `home`, `extensions`, `spill` and `selected` subdirectories. Canonical paths and directory identities are checked before execution, afterward and after handle closure. At least 10 GiB of available disk is required before run-directory creation. Failed run artifacts are preserved for inspection rather than published or deleted.

## Fixed controls and result

The engine is in-memory with one thread, a 2 GiB engine memory limit and 4 GiB spill limit. Home, extension and spill paths belong to the run. Automatic extension installation/loading are disabled. HTTP retries and full-download fallback are disabled; forced download is off, its threshold is zero, HTTP timeout is 30 seconds, and both supported certificate-verification flags are enabled. A fixed whitelist of live settings is read back and compared before the query. Returned settings normalize sizes and replace directory paths with ownership labels.

Only the shared fixed streaming projection runs; a public connection or arbitrary-query API is not returned. Its bridge URLs must come from the calling worker's own bridge. Output uses the capped writer, which has separate raw/compressed/row limits and sampled disk checks. The runtime is verified again after extraction without refetching it. The result includes the selected artifact descriptor, query fingerprint, verified runtime operation/run/manifest hash and normalized engine settings—but not bridge capabilities or query text.

Cancellation interrupts the owned connection and awaits pending operations. Connection and instance closure are attempted independently; a query, verification or close failure prevents a success descriptor. Native memory limits do not cover every process allocation, and the spill limit is not a global disk quota. This component provides neither an OS sandbox nor a hard process deadline; its result explicitly denies process-memory-cap and native-acquisition claims. Directory checks and before/after runtime verification do not provide race-free protection against hostile concurrent filesystem mutation.

## Evidence

The native fixture now uses this engine component for extraction, rather than configuring its extraction connection inside the test. A separate small engine creates six synthetic Parquet inputs and closes before extraction. The bounded engine, retained httpfs, loopback bridge, injected transport, journal and gzip writer select the expected three records. Assertions check selected fields, statuses, source identifiers, ZIP5/ZIP4 normalization, query/runtime references and live resource-setting readback.

A second native invocation uses a wrong bridge capability. It fails with a fixed error and causes no upstream transport calls; no successful output descriptor is returned. Negative tests reject malformed options, runtime cancellation/hash claims, private URLs, getters, pre-abort and missing retained evidence before output creation. Native handle-close fault injection is not implemented; independent closure is reviewed in code and exercised on normal/query-failure paths.

## Remaining handoff

The caller still owns bridge, transport, journal, source preflight/authorization, and final receipt publication. Next bind those components and their hashes to one managed acquisition lifecycle, including uncertainty on interruption and independent verification before promotion. The existing direct preparation command remains unchanged and is not a substitute for that handoff. No national dataset, source release or production pointer changes here. Rollback is a code-only revert of this internal component/tests; retain all prerequisite and business data.

## Release checks

Both focused tests passed: grouped negative-admission checks and native full composition with success/failure cases. Full `npm run check` passed with 1,628 tests: 1,617 passed, 11 skipped, zero failures, followed by lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/overture-bounded-engine-full-check.log`. TypeScript passed and the production dependency audit found zero vulnerabilities. All 82 protected production pins remained unchanged. The idle development service was stopped for verification and restored afterward; no managed source acquisition was dispatched.
