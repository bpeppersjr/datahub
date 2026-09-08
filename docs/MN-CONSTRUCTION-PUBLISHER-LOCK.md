# Shared Minnesota publisher gate

Implemented September 8, 2026. The two Minnesota construction cohorts now have a shared exclusion primitive for app-owned workers. It prevents overlapping acquisition work within one Co*Tive installation and preserves a one-second handover gap. Native app enrollment and dispatch are still pending.

## Contract

`withMnConstructionPublisherLock({ runId, cohort, signal }, work)` in `runner/mn-construction-publisher-lock.mjs` uses one fixed path:

`data/business-sources/mn-dli-construction/runtime/publisher.lock`

The same path covers registrations and residential contractors. There is no per-call lock-path override. The runtime root remains the app's existing `APP_ROOT`; tests use isolated child-process roots inside `datahub/data/tmp` so they never contend with a production gate.

Before invoking work, the gate creates an exclusive file, writes and fsyncs a bounded ownership record, and verifies its contents and filesystem identity. The record contains a unique lease ID, app run ID, cohort, publisher budget key, PID and acquisition time. These are ownership evidence, not proof that a process is currently alive, an accepted app operation, or source-use authorization.

The awaited callback receives `{ lease, signal, assertHeld }`. Its native request wrapper must check `assertHeld` before provider requests, and it must await all requests, parsing and cancellation disposal before returning. The gate cannot make detached work safe or force a non-cooperative callback to stop. Do not launch detached downloads inside the callback.

After the callback settles, the gate waits one second before release, including callback failure and cancellation. That small delay intentionally ignores cancellation so a cancelled job cannot let the next job skip provider pacing. The existing per-request one-second spacing and provider byte/deadline limits remain independently required.

## Contention, failure and recovery boundaries

Exclusive creation rejects a competing worker before its callback runs. The typed `MN_PUBLISHER_BUSY` error means the gate is occupied or needs inspection; it does not prove a live process or terminal failure. The app must coordinate waiting jobs or serialize these two sources itself. This primitive does not poll, retry downloads or schedule another attempt.

On normal completion, callback failure or cooperative cancellation, only the gate's own verified lock is removed. Replaced directories/files, hardlinks and modified complete records are preserved and release fails. A complete record that becomes corrupted during initialization is not downgraded to inode-only cleanup: work never starts, and the evidence remains for inspection. Partial owned files from an incomplete write may be cleaned by identity when safe; uncertain ownership is never removed.

A crash-left or unfamiliar file is never automatically taken over, regardless of a recorded PID. No stale-lock timeout, PID-based deletion or automatic recovery is implemented. Investigation must verify the actual process and operation state before any separately authorized recovery action. Lease release does not delete source data, receipts, checkpoints or completed bundles.

This is a per-installation coordination mechanism, not a machine-wide, multi-installation or distributed publisher rate limiter. All app acquisition entry points must use this same root/gate. Merely importing the module or writing a lock record does not establish runtime enforcement by an unenrolled connector.

## Verification and next step

Eleven isolated-process tests exercise durable ownership before work, real one-second timing, same-process and separate-process contention, cooperative cancellation, error redaction, invalid/pre-cancelled input, crash-left gates, substituted records, hardlinks, modified contents and corruption during initialization. They issue no network requests.

Full validation passed: 1,054 tests discovered, 1,043 passed, 11 skipped and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. `npm audit --omit=dev` reported zero vulnerabilities. All 82 pending national memory-plan code/configuration pins remained unchanged. The local preview was restored after validation.

Next wire the gate around the complete Minnesota app operation lifecycle: current notices/schema, acquisition, durable parent evidence and terminal operation receipt. Add two fixed cohort entry points and the industry contracts, ensuring contention is represented by app scheduling rather than a Codex polling loop. No full download, source refresh, national promotion or coverage increase occurred in this step.

Rollback is to stop calling the new primitive. Do not remove an occupied gate as a rollback shortcut; inspect its owning work first. Existing data and pending national rebuild pins are unchanged.
