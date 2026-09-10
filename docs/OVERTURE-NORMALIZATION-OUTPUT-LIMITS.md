# Normalization output and summary limits

The Overture builder now shares one resource budget across its 16 normalized gzip partitions and quarantine gzip. Native construction accepts no limit overrides; reduced limits are available only through an explicitly named test helper.

- At most 17 files and 20 million normalized/quarantine records combined.
- At most 16 MiB per JSON line, excluding its LF delimiter.
- At most 16 GiB raw and 4 GiB compressed per file.
- At most 32 GiB raw and 8 GiB compressed across the group.
- At least 10 GiB free disk at setup, sampled every 64 MiB of reserved raw output, and checked at file finalization.

Raw bytes are reserved before writing to gzip. A compressed-stream transform reserves bytes before passing them to the output file. Failed reservations are not refunded and close the budget to later writes. Stream pipelines propagate compression/output errors, accept cancellation and are drained during cleanup. Backpressure waits listen for drain, close and error with listener cleanup, rather than hanging on a closed writer. Final compressed byte counts are compared with the actual artifact digest before a successful result is finalized.

The source summary records the successful group's reservations and fixed limits. These counters are operational evidence, not an independent proof of resource use. No OS memory cap, filesystem quota or hard deadline is claimed. Other processes can consume disk between samples; the limit does not reserve free space.

Summary counters also reject keys over 512 UTF-8 bytes and more than 100,000 distinct keys per map. This bounds map growth while retaining all accepted keys; it does not truncate or group unsupported values into guessed categories. Budget failures stop the build without a complete manifest or pointer update. Partial staging output remains for inspection.

## Scope and remaining work

The limits cover normalized and quarantine gzip output, not prepared-source copying, fixture input creation, metadata/NOTICE/ZIP/summary sidecar writes, the duplicate-check database or all process allocations. Those components have separate guards or still require managed-worker hardening. Input records are already bounded by the gzip reader; duplicate checking has its own database/spill limits. Existing release verification does not yet independently enforce every new summary-budget counter.

This is not yet a completed managed normalizer: verified acquisition binding, bounded prerequisite/metadata intake, source-to-normalized replay, and durable app operation/recovery enrollment remain required. No new acquisition or production normalization/promotion was executed.

## Verification and migration

Focused tests cover combined and per-file ceilings, row/line/file limits, fail-closed reservations, rejected native overrides, cancellation admission, actual compressed-byte accounting across all 17 outputs, and summary-key failure without publication. All 16 focused tests passed. Full `npm run check` passed: 1,681 tests, 1,670 passed, 11 skipped, zero failed, plus lint, web/desktop builds and desktop control-plane smoke. The local log is `data/tmp/overture-normalization-output-limits-full-check.log`. `npx tsc --noEmit` passed; `npm audit --omit=dev` found zero vulnerabilities. All 82 protected plan pins were unchanged.

Existing releases remain unchanged. New inputs exceeding the limits fail rather than being silently truncated. Rolling back removes these guards and should not be used as an automatic retry or budget-bypass mechanism.
