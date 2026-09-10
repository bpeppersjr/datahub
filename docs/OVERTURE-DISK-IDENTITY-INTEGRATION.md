# Disk-backed Overture duplicate checking

The legacy normalization builder and release verifier now use `checkOvertureIdentities` instead of source-wide JavaScript identity sets. This integrates the existing disk-backed component; it does not resolve identities across providers or assert that source places are unique real-world businesses.

## Builder

The builder streams each selected source record through normalization and the native duplicate checker in one pass. It retains its former key semantics: trim/string conversion, lowercase, and `<blank>` for missing identifiers. Duplicate detection occurs after the stream is consumed, before quality finalization, a completed manifest or promotion. Duplicate rows may therefore be present in unfinished staging output, but the build fails and cannot publish that output. Source count must match the completed identity count.

To preserve quarantine handling for malformed source IDs, the checker adds explicit `keyFormat: "source-value"`. It accepts nonempty UTF-8-roundtrippable strings up to 512 bytes and rejects NUL. Oversized/invalid-encoding keys fail the build rather than being silently truncated, hashed or accepted as UUIDs. The default checker mode remains UUID-only. Duplicate keys are passed through the native appender, not interpolated into SQL, and errors do not print identifiers.

Builder working databases remain private under `<outputRoot>/.identity-checks/<stagingRunId>/<checkRunId>`. They are diagnostic working files, not normalized artifacts, source receipts or reusable successful checkpoints. No automatic cleanup or resume is claimed for these retained builder files.

## Verifier

The verifier streams normalized identifiers across all normalized partitions through UUID-mode checking, retaining its existing field, count, policy and provenance checks. Rehashed duplicate records still fail even when their byte counts and artifact hashes match. Verification allocates a unique scratch directory under `data/tmp/overture-verification-identities`, closes the producer/database handles, verifies root ownership and removes only that scratch directory. Failure to clean up is a verification failure, not silently ignored success. Original source and release files are not modified.

## Resource and proof limits

Both paths inherit one DuckDB thread, a 512 MiB engine memory setting, 4 GiB spill setting, a sampled 2 GiB database/WAL ceiling, an 8 GiB free-disk preflight and 5 GiB sampled floor, and at most 20 million keys. The append batch is 8,192 rows. No global primary-key index is built; duplicate grouping can spill. These are not operating-system RAM/disk quotas, a hard cancellation deadline, or a production-scale spill benchmark. Verification now requires native DuckDB and writable scratch space; it is no longer purely memory-only processing.

Normalization still has aggregate maps, unbounded output writers and incomplete managed acquisition-receipt binding. The verifier does not independently replay every normalized field from source. This change removes the two full-source identity sets, not every memory or governance gap. Normalization continues to retain by default; no source acquisition, production build or promotion was executed here.

## Verification and migration

Focused tests exercise multiple native append batches, duplicate keys across batch boundaries, strict UUID and bounded malformed-source modes, cancellation/producer cleanup, real builder database output, duplicate missing IDs, and rehashed duplicates across normalized partitions.

`npm run check` passed: 1,678 tests, 1,667 passed, 11 skipped and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-disk-identity-integration-full-check.log`. TypeScript passed, production dependency audit reported zero vulnerabilities, and all 82 protected production-plan pins remained unchanged. No production-scale spill benchmark or production normalization is claimed.

No existing datasets are migrated. Rollback restores in-memory duplicate sets and must not be used to bypass native resource or duplicate checks. Preserve any existing private builder working files for inspection.
