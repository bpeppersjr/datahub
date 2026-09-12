# Maine ASC managed preflight handoff contract

This document preserves the reviewed integration design and now records its implementation status. The standalone Maine metadata preflight was implemented in commit `89a3363` and integrated into main by `ba2db7e`. The subsequent managed registration and handoff have been implemented in the isolated development checkout and await the integrator's commit and repository validation. Its [implementation note](ME-ASC-PREFLIGHT-IMPLEMENTATION-2026-09-12.md) and [source observations](ME-MEDICAL-PROVIDER-CONTRACT-2026-09-12.md) remain the source-contract boundaries. No native Maine session was executed during development or review. Implementation is not an authorization to contact the source.

## Implementation status

The reviewed changes below are implemented: fixed prerequisite catalog/dispatch, operation-bound native publication, independent managed receipt verification, bounded recovery descriptors, strict paired CLI arguments and cancellation-aware status handling. False collection/acquisition/conservation/export/completeness flags are present from the queued state; retained evidence remains hidden from artifact download. No collector, dependent acquisition, schedule, source request or app operation was started by this implementation.

Focused offline regression passed 29/29 tests across Maine standalone/managed preflight, Oklahoma prerequisite compatibility, prerequisite gates and shared CLI cancellation. Owned-file ESLint and diff checks passed. Scratch and test-run directories were empty. Source-session tests used injected transports and offline Chromium; fabricated native-shaped managed fixtures verify structural binding only and do not establish native execution. Root and an independent read-only reviewer reported no blocking defect. These results do not replace final repository validation or native end-to-end evidence.

Limits are unchanged: at most 10 sequential requests, 1 MiB per decoded response, 10 MiB aggregate, 30 seconds per request, 330 seconds per session, 250 ms between request starts and 1,000 provider selections. Managed cancellation uses the existing 75-second supervisor grace period. Native Maine execution and its persisted application operation receipt remain unperformed.

The following sections retain the original design requirements for future maintenance; prospective wording describes the reviewed contract, not unfinished registration work.

## Minimal integration

Follow the existing Oklahoma schema prerequisite pattern. Reuse `POST /api/data-operations/source-prerequisites` with exactly `{sourceId:'me-asc-preflight'}`. Registration alone must not dispatch a session. No server route change, dependent acquisition, industry collector enrollment, schedule, or new UI is needed for the minimal handoff.

| File | Required change |
| --- | --- |
| `runner/source-acquisition-gates.mjs` | Add the fixed `me-asc-preflight` metadata prerequisite entry with Maine state, exact source root, review document and bounded metadata scope. Keep collection readiness, public-export permission and completeness false. |
| `runner/managed-operations.mjs` | Allow the fixed source ID with native operation storage; use the existing reservation and ownership lifecycle; dispatch the Maine CLI with operation-bound output; route the result through a dedicated independent Maine receipt verifier. |
| `scripts/preflight-me-asc.mjs` | Accept only the paired `--output` and `--operation-id` managed arguments, validated before browser/source access. Preserve standalone mode, fixed endpoints, and the existing shared cancellation helper. |
| `runner/me-asc-preflight-receipt.mjs` | Add strict managed output validation. Publish bundles beneath `<operation>/output/jobs/<run-id>/`, bind the operation ID in the manifest, and return the run ID and operation ID in the managed descriptor. Return a bounded recovery descriptor when publication becomes uncertain. |
| `runner/me-asc-preflight-reader.mjs` | Add strict managed path, operation, start-time and native-mode validation while preserving standalone reads and all existing structural validations. |

At design time the standalone descriptor lacked run and operation IDs, its bundle was not operation-bound, and publication errors preserved files without returning a recovery descriptor. The managed implementation now adds these bindings and recovery output while preserving standalone behavior; merely adding the source ID to dispatch would have been insufficient.

Use the Oklahoma implementations in `runner/ok-childcare-schema-receipt.mjs`, `runner/ok-childcare-schema-reader.mjs`, `scripts/probe-ok-childcare-schema.mjs`, and `runner/managed-ok-schema-prerequisite.test.mjs` as nearby patterns. Preserve Maine's separate two-file manifest/receipt bundle and its stricter source-specific session contract.

## Managed output and independent verification

The CLI must not accept caller-selected source URLs, counties, provider selections, transport injection, or other scope overrides. Managed options must contain only an absolute `output` path and a valid UUID `operationId`. The output basename must be `output`, its parent basename must equal the operation ID, and existing bounded canonical-path checks must reject aliases and escape paths before source access. The manager must require its exact operation output directory. Synthetic session results remain confined to test storage and must be rejected by managed publication.

The managed descriptor must have a fixed exact schema containing `run_id`, `operation_id`, `manifest`, `sha256`, `status`, `execution_mode`, and `cancellation_after_publication`. Require valid UUIDs, a SHA-256 digest, known status and execution-mode values, a boolean cancellation field, and the exact manifest path `<manager-root>/<operation-id>/output/jobs/<run-id>/manifest.json`. A recovery wrapper may contain only that descriptor under `recovery`; no raw errors, source bodies or alternate paths may enter the result.

Bind `operation_id` inside the manifest, in addition to its existing `run_id` and receipt descriptor. Extend the reader's strict manifest schema deliberately while preserving the standalone form. The manager must validate the descriptor first, retain a bounded reference with `receiptIntegrityVerified:false`, then independently read and rehash the bundle even when the executor is injected. Read verification must enforce:

- Exact operation ID, run ID, expected manifest hash, expected operation-root path, and `native-fetch` execution mode.
- A receipt start time at or after the operation's persisted `startedAt`, valid ordered timestamps, and the existing session deadline boundary without inventing source freshness.
- Exact bundle filenames, bounded single-link reads, canonical path and ownership checks, receipt byte/hash agreement, and a final manifest rehash.
- Existing fixed policy hash, limits, redacted claims, exact allowed request itinerary/statuses, required page and named-form metadata, linked counts, and verified cleanup.
- Agreement between descriptor and receipt status. Synthetic mode must fail even if hashes and paths otherwise match.

Verified `schema-observed-not-collection-ready` metadata may complete the prerequisite successfully. `inspection-required` metadata, a recovery wrapper, cancellation after publication, parent cancellation, or a nonzero child exit must leave the operation failed or cancelled and requiring inspection. Receipt integrity may still be recorded separately when verification succeeds. No descriptor or child exit code may itself establish readiness.

Expose only minimized internal evidence. Keep `collectionReady:false`, `acquisitionReady:false`, `conservationVerified:false`, public-export authorization false, and completeness/current-operation claims false. Preserve `artifacts:[]`; the ordinary artifact-download API must not expose this private evidence. Matching counts remain count comparisons, not proof that the same provider records were conserved. Independent reading establishes local structure and integrity, not remote authenticity or replay of discarded response bodies.

## Cancellation, recovery and restart

The Maine CLI already uses `createCliCancellation` for SIGINT, SIGTERM and app IPC `{type:'cancel'}`. Reuse the managed supervisor's existing 75-second cooperative cancellation grace period. The source session retains its existing request, session, parser, body-cleanup and scratch-removal limits. Outstanding or noncooperative transport and failed cleanup must continue to prevent clean receipt publication.

Cancellation before publication must not leave an unpublished owned bundle. Cancellation after publication must preserve the descriptor, finish independent verification without using the already-aborted caller signal to skip it, and retain the operation as `CANCELLED` with inspection required. If the child encounters an uncertain post-publication failure, preserve the published files and emit only the bounded recovery descriptor so the manager can retain and inspect the reference. Never turn recovery output into a successful operation.

Use existing manager exclusion and restart behavior: another operation or unresolved ownership blocks dispatch; interrupted ownership becomes `UNKNOWN`; restart must not retry source access automatically. This design adds no retries, refreshes or automatic dependent work.

## Offline acceptance tests

Add `runner/managed-me-asc-prerequisite.test.mjs`; extend Maine receipt/CLI tests and rerun `runner/managed-source-prerequisite-gates.test.mjs` and the shared cancellation tests. All execution in this coding slice should use fixtures/offline parsing; no native source session is needed to validate registration.

- Fixed source ID dispatch selects the exact CLI and paired operation-output arguments; valid structural metadata is independently verified and remains non-collection-ready.
- Wrong operation/run IDs, paths, hashes, stale start times, unexpected descriptor fields and synthetic execution modes fail. Rehashing a malformed receipt cannot bypass itinerary, status, page/form or count checks.
- Managed writer rejects synthetic results, invalid bindings and path aliases before source access. Unsupported CLI arguments produce no source request or browser setup.
- Artifacts remain hidden; receipt-integrity verification does not create an acquisition-ready or conservation claim.
- Cancellation before and after publication preserves the correct cleanup/output boundary. A committed reference survives cancellation and nonzero exit; uncertain-publication recovery remains inspection-required.
- Concurrent dispatch is excluded; completed evidence survives restart; interrupted ownership remains `UNKNOWN` and is never automatically retried.

Native-shaped fabricated managed fixtures may test structural validation, following the existing Oklahoma tests, but must be identified as fabricated evidence and must not be presented as native source execution. Do not weaken production mode checks or add a public injection switch to make tests pass.

## Remaining verification boundary

Managed output binding, recovery descriptors, independent managed validation and offline integration tests are implemented and passed the focused verification recorded above. This documentation update itself changes no runtime behavior. The integrator still owns the full-check/audit evidence, main integration and final commit. No native end-to-end publication was exercised, because native source execution was outside this slice. An appropriately authorized native validation and its persisted application operation receipt remain separate future evidence; this contract, successful fixture tests, implemented registration or automatic continuation do not authorize a source session or provider acquisition.
