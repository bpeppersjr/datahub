# Disk-backed Overture identity check

`checkOvertureIdentities({output, ids, signal?, rowLimit?, keyFormat?})` is a local normalization component. `ids` is a sequential async iterable of canonical lowercase GERS UUID strings by default. Explicit `keyFormat: "source-value"` supports bounded source keys as described in [the integration contract](OVERTURE-DISK-IDENTITY-INTEGRATION.md). It records IDs in a run-owned DuckDB table, then checks for duplicates and reconciles the row count. It does not retain a whole-source JavaScript `Set` or build a primary-key index. Only one producer result is held at a time; the native appender is flushed every 8,192 rows.

Duplicate checking uses an aggregate that can use the engine's spill storage. The 20,000-row native fixture proves normal operation and cross-batch duplicate rejection, not production-scale spill performance. A duplicate or engine/resource failure produces a fixed error and must prevent later normalization publication.

## Boundaries

- Up to 20 million keys. `rowLimit` can only tighten that limit. UUID mode rejects malformed IDs; source-value mode permits nonempty roundtrippable UTF-8 strings up to 512 bytes without NUL. This helper neither guesses IDs nor quarantines records itself.
- One database thread, 512 MiB engine memory setting and 4 GiB spill setting, checked against running engine settings. This is not an OS process-memory cap.
- External access and automatic/unsigned/community extensions disabled. No source requests, runtime downloads or new package dependencies.
- Eight GiB free-disk preflight, sampled five GiB headroom thereafter; database and WAL size sampled at flush/finalization against two GiB. Sampled checks detect overshoot, not a hard filesystem quota. Engine spill has its own configured cap.
- Exclusive UUID run directory under the supplied in-repository output, with owned home/extensions/spill directories and database identity/link checks. These checks are not a race-free operating-system sandbox.
- Cooperative cancellation interrupts the database, drains pending producer work, and attempts independent appender/connection/instance closure. A noncooperative producer can delay cleanup; no hard deadline is claimed.

The temporary database is preserved after success or failure. It is not a restart checkpoint or a independently verified normalized-dataset receipt. A successful return establishes uniqueness only for the IDs supplied by the caller; the future managed normalizer must bind that stream and returned count to its verified selected-source input.

## Integration status

This component is now [wired into the legacy builder and verifier](OVERTURE-DISK-IDENTITY-INTEGRATION.md). A managed normalization endpoint, bounded output/aggregate processing and acquisition/ZBP provenance binding remain required, as described in [the normalization handoff review](OVERTURE-NORMALIZATION-HANDOFF.md). The verifier removes its own scratch directory after the component closes; the builder retains its private working database.

Rollback is removal of this unused component and its tests. No production releases, source data or pointers are changed by this release. Temporary fixtures are created and removed within `datahub`; no large acquisition is dispatched.

## Verification — September 9, 2026

Six focused tests pass, covering a 20,000-ID native local run, duplicates across flushes, invalid admission, lower row budgets, invalid IDs, producer failure, cancellation and draining a late producer. These are local component tests, not an app-normalization operation or a production-scale benchmark.

`npm run check` passed: 1,663 tests, 1,652 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-identity-check-full-check.log`. TypeScript passed and the production dependency audit found zero vulnerabilities. All 82 protected production-plan file hashes remained unchanged. Co*Tive's local development service was restored afterward.
