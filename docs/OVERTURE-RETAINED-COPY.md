# Bounded retained-source copy

Overture's prepared-source normalization path now uses `copyOvertureRetainedSource` instead of hashing a source and then performing an unchecked ordinary copy. Prepared metadata is read through the canonical, single-link, identity-checked JSON reader with a 4 MiB ceiling. Declared source record counts must be safe integers from zero through 20 million; existing minimum-count gates still apply.

The copy requires absolute app-contained source/destination paths, an expected SHA-256 and exact expected byte count from 1 byte through 4 GiB. It rejects source aliases/hardlinks, unsupported options, accessors, an existing destination, and a changed source identity/size/timestamps. It checks both parent paths through canonical traversal.

Data moves through a 64 KiB buffer with cancellation checks between reads and partial writes. The input bytes are hashed as they are copied. The output is flushed, read back through its owned handle, and independently hashed against the expected digest; output identity, size and timestamps are checked before final naming. Final naming uses an exclusive hard link, so a concurrently created destination cannot be overwritten. The temporary name is then removed and final identity checked. Successful output has one link.

Before copying, free disk must cover the full declared output plus 10 GiB. Every 64 MiB copied, the check requires the remaining output plus 10 GiB; finalization checks the 10 GiB floor again. This is sampled free-space admission, not a disk reservation or quota. Other processes may consume space between checks.

All owned handles are closed on success or failure. Partial temporary files remain for inspection. Cancellation after final naming may leave a complete source artifact, but the enclosing build fails and does not claim successful normalization. This is not a resumable copy, an OS memory limit, a hard deadline or a dataset publication transaction. It cannot prevent later modification of retained files by another process; downstream verification and managed ownership are still required.

## Verification

Focused tests passed for exact retained bytes, single-link output, no overwrite, wrong size/hash, hardlinked inputs, escaping/relative paths, unsupported/accessor options, pre-abort and cancellation after staging opens with handle closure. An end-to-end test rebuilds from a previous retained fixture's prepared gzip and metadata, preserving source release identity without network access. The 18 focused tests passed before the final early existing-destination admission check was added.

Full `npm run check` passed: 1,690 tests, 1,679 passed, 11 skipped, zero failed, plus lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/overture-retained-copy-full-check.log`. TypeScript passed and the production dependency audit found zero vulnerabilities. All 82 protected plan pins remained unchanged. A comment-only clarification after the run does not change tested behavior.

## Integration and migration

Existing valid prepared sources inside datahub continue to work. Inputs outside datahub, aliased inputs and sources above the limits now fail; do not copy or bypass them silently. Output checks remain paired with record parsing and full source-to-normalized replay, which occur after copying.

The source metadata hash is still caller-selected legacy evidence. This copy does not authenticate publisher provenance or bind an acquisition operation. Managed acquisition descriptor binding and durable normalization enrollment remain necessary. No production download, normalization, promotion or refresh schedule was executed for this change. Rolling back removes these protections and should not be used as an automatic retry mechanism.
