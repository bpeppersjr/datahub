# Wisconsin durable injected acquisition journal

The journal is an app-worker prerequisite, not native enrollment or permission to acquire Wisconsin facilities. `buildWiChildcareAcquiredJournalWithTransport` requires an explicitly supplied trusted test transport and uses the fixed-policy-bound Wisconsin path. There is no native fetch default, production run command, schedule or resume command. All receipts declare injected mode and false source-use authorization, source authenticity, native enrollment, public export and national integration.

## Durable ordering

A run creates a UUID directory under `jobs` and records its start before transport begins. Each attempt—including metadata requests and transport retries—gets a sequential immutable request-intent file before fetch is invoked. Attempt cancellation is rechecked after the file syncs. The intent label is `possible-not-proven`: persistence proves an intended attempt, not that it reached the source. A timeout may leave an intent even when no fetch occurred.

The initial full, policy-validated preflight is retained before provider IDs. Each validated inventory/page observation is retained before the transport can proceed. On success, final metadata and acquisition evidence are stored, then a terminal receipt is published and independently inspected. ZIP5/ZIP4 and provider-returned point semantics remain those of the existing Wisconsin acquisition/replay contract; no entity geometry or current-operation claim is added.

File publication uses exclusive temporary writes, sync, read/hash checks and a hard-link commit. Pending writes are serialized and drained before terminal sealing and lock release. An intent persistence failure stops fetch; late timeout completion cannot issue a request after its signal was aborted. The trusted `beforePersist` seam is for injected fault tests, not a native/API parameter.

The wrapper adds no retries, but the existing transport can make up to three attempts per logical request. Each is separately journaled. Do not label this single-attempt acquisition. The ownership lock excludes concurrent runs using the same output root only; a future native app wrapper still needs publisher-wide exclusion across outputs and its own authorization binding. It never steals unknown locks.

## Failure and inspection

Failure/cancellation preserves existing intent and observation files and attempts to publish a terminal receipt with null record count. It does not delete potentially issued-request evidence or promote partial data. A partial write, ownership uncertainty or post-publication inspection/cleanup failure returns the exact run/directory/receipt recovery identity. Preserve the evidence; no automatic retry, resume or lock reclamation is supported. Missing terminal receipt or unexpected files remain inspection-required, not proof that nothing was sent.

The standalone read-only command is:

```powershell
node scripts/inspect-wi-childcare-acquired-journal.mjs --receipt ABSOLUTE_PATH
```

Successful inspection reconstructs acquisition evidence, both policy-bound preflights, each retained observation and the retry-aware request itinerary. It checks enclosing run times and requires intents to precede corresponding observations in time and artifact order. Adjacent identical count URLs can admit more than one retry partition; no exact delivery attribution is inferred.

Failed/cancelled inspection verifies the saved artifact roster, hashes, chronological intent ordinals, strict allowed URLs and available observation-prefix semantics. It does **not** prove a full legal request-itinerary prefix when the source/preflight failed before sufficient metadata was retained, nor prove actual delivery. Such evidence remains possible-delivery history with no acquired record count and cannot be used as a successful release.

All files remain inside `datahub/data`; output roots inside jobs, releases, staging or existing manifest-bearing datasets are rejected. The default root is the separate `data/business-sources/wi-dhs-licensed-group-childcare/injected-acquired` area. A 600 MB available-disk prerequisite and bounded artifact totals apply; this is not a storage reservation. Historical Wisconsin offline-review bundles and their false authority claims are unchanged.

## Verification and remaining work

Focused tests cover intent-before-fetch, storage failure, timeout during a held intent, draining before sealing, concurrent ownership, policy rejection, successful offline replay, CLI inspection, transport retry identities, cancellation, observation-retention failure and rehashed timestamp/order/content tampering. Success cases use retained policy metadata plus two synthetic rows; no Wisconsin facility request was made.

Full release validation on September 10, 2026 passed: `npm run check` completed with 1,842 tests, 1,831 passed, 11 skipped and zero failures, followed by lint, web/desktop builds and desktop control-plane smoke. The retained Wisconsin policy test and both retained county versions were enabled. Log: `data/tmp/wi-acquired-journal-full-check-rerun.log`. TypeScript passed and the production dependency audit reported zero vulnerabilities. Independent read-only review found and verified the correction of a success-itinerary chronology gap; rehashed timestamp/order regression tests now cover that gap. No native enrollment, source-policy authorization or production pointer changed.

The first full run had one test-expectation failure: an attempt timeout could already produce `FAILED` before a later cancellation during draining. The test now accepts either first-observed terminal reason while still requiring zero late fetches, stable sealed receipt bytes and a null acquired record count. This did not require changing the journal's terminal-state behavior. That run is retained in `data/tmp/wi-acquired-journal-full-check.log`; it is not a clean full-suite result.

The [development app lifecycle](WI-CHILDCARE-DEVELOPMENT-APP.md) now connects this journal to isolated offline normalization, durable app checkpoints and explicit retained reuse. Its cross-output-root lock covers the development app entry, not arbitrary calls to this lower-level journal. Native collection, native publisher/resource policy and managed enrollment remain separate unfinished work. The operator's scoped source-use decision remains pending. Do not relabel these injected journals as native runs or repull an eventual verified release merely to normalize or promote it.

The local management preview was restored after validation and returned HTTP 200. No browser visual inspection was performed; the existing scheduler-unavailable state was left unchanged.

Rollback removes the new wrapper/inspector/CLI while preserving any journal directories and existing sources. No national pointers or source policies are changed by this increment.
