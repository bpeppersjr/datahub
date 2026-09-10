# Private acquisition failure diagnostics

Failed Overture sessions now attempt to retain `failure.json` in their owned immutable run directory after resource cleanup. It uses schema `overture-acquisition-failure@1.0.0` and records operation/run IDs, execution mode, timestamp, a fixed processing phase, cancellation state, cleanup-failure flag, and bounded transport/bridge snapshots. `snapshot_ready` is always false.

Transport diagnostics distinguish budget checks, reservation journaling, pacing, fetch, response/HEAD/range validation, body reads/validation, consumer writes and completion journaling. They retain the first failed request's index, asset index, method, numeric HTTP status when available, and whether its request timer fired. No remote body, headers, ETag, URL, arbitrary error string/stack or cancellation reason is copied. Snapshot failure objects are defensive copies.

Session phases distinguish plan/transport setup, asset HEAD checks, bridge setup, engine execution, accounting verification, prerequisite reverification and manifest publication. A phase identifies where failure was observed, not necessarily its root cause. For example, a consumer-write failure could result from a downstream disconnect; generic engine failures remain generic. Transport counters can include a partially transferred request absent from the completed journal totals. Closing resources does not turn incomplete data into a usable snapshot.

## Retention and limitations

- Diagnostics use exclusive file creation with fsync, ownership checks and readback. Existing files are not replaced.
- Writing is best-effort: unsafe/unavailable storage, process termination or failure before an owned run directory exists can leave no complete diagnostic. Do not infer success from its absence.
- No diagnostic is added after an acquisition manifest is published, preserving its verified inventory and existing recovery descriptor. Failed diagnostic writes never mask the original fixed failure.
- This is private troubleshooting evidence, not a signed receipt, resumable checkpoint or proof of remote authenticity. No current pointer, publication, automatic retry or public artifact route is added.
- Existing failed runs are unchanged; the new record cannot reconstruct missing details from an earlier attempt.
- Native acquisition still requires separate explicit authorization. Tests use synthetic responses and existing local fixtures, not a new source download.

## Verification

Focused tests cover fixed-stage discrimination, numeric status, timeout, defensive copying, private-error redaction, source/engine failures, cancellation draining and existing-file preservation: all 24 focused checks pass. TypeScript passes, production dependency audit reports zero vulnerabilities, and all 82 protected production-plan pins are unchanged.

The first two full runs did **not pass**. Both `data/tmp/overture-failure-diagnostics-full-check.log` and `data/tmp/overture-failure-diagnostics-full-check-repeat.log` report the development-supervisor startup wait exceeding 20 seconds before the UI became ready. The shutdown assertions were not reached. The unchanged supervisor tests passed in isolation (2 tests; successful startup/shutdown test about 16.8 seconds). Both full runs report 1,667 tests, 1,655 passed, 11 skipped and one failure. Their lint/build stages consequently did not run. These failures remain recorded rather than waived; the follow-up below addresses the startup allowance.

Rollback may remove diagnostic emission while retaining all existing evidence files; no dataset migration is required.

## Startup-test follow-up

The lifecycle test now permits 90 seconds for cold startup under concurrent suite load, fails immediately when its supervisor exits before readiness, and retains its five-second post-exit shutdown check and all exit-code, receipt and lock assertions. This changes a test setup allowance, not application timeouts or download budgets. Both supervisor tests pass in isolation after the adjustment. The test requires the normal development app to be stopped because vinext enforces one development server per checkout; the new early-exit check also reports that conflict without waiting out the startup allowance.

The final `npm run check` passed: 1,667 tests, 1,656 passed, 11 skipped and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-failure-diagnostics-startup-full-check.log`. The supervisor lifecycle test passed in about 21.9 seconds under full-suite load, with shutdown assertions reached and satisfied. TypeScript and production dependency audit passed; all 82 protected pins remained unchanged. No native acquisition was dispatched during validation.
