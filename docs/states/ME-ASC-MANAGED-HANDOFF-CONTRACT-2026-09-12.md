# Maine ASC managed preflight handoff contract

This is the reviewed integration design for the next coding slice, not an implemented registration or an authorization to contact the source. The standalone Maine metadata preflight was implemented in commit `89a3363` and integrated into main by `ba2db7e`. Its [implementation note](ME-ASC-PREFLIGHT-IMPLEMENTATION-2026-09-12.md) and [source observations](ME-MEDICAL-PROVIDER-CONTRACT-2026-09-12.md) remain the source-contract boundaries. No native Maine session was executed during development or this design review.

## Minimal integration

Follow the existing Oklahoma schema prerequisite pattern. Reuse `POST /api/data-operations/source-prerequisites` with exactly `{sourceId:'me-asc-preflight'}`. Registration alone must not dispatch a session. No server route change, dependent acquisition, industry collector enrollment, schedule, or new UI is needed for the minimal handoff.

| File | Required change |
| --- | --- |
| `runner/source-acquisition-gates.mjs` | Add the fixed `me-asc-preflight` metadata prerequisite entry with Maine state, exact source root, review document and bounded metadata scope. Keep collection readiness, public-export permission and completeness false. |
| `runner/managed-operations.mjs` | Allow the fixed source ID with native operation storage; use the existing reservation and ownership lifecycle; dispatch the Maine CLI with operation-bound output; route the result through a dedicated independent Maine receipt verifier. |
| `scripts/preflight-me-asc.mjs` | Accept only the paired `--output` and `--operation-id` managed arguments, validated before browser/source access. Preserve standalone mode, fixed endpoints, and the existing shared cancellation helper. |
| `runner/me-asc-preflight-receipt.mjs` | Add strict managed output validation. Publish bundles beneath `<operation>/output/jobs/<run-id>/`, bind the operation ID in the manifest, and return the run ID and operation ID in the managed descriptor. Return a bounded recovery descriptor when publication becomes uncertain. |
| `runner/me-asc-preflight-reader.mjs` | Add strict managed path, operation, start-time and native-mode validation while preserving standalone reads and all existing structural validations. |

The current standalone descriptor lacks run and operation IDs, and its bundle is not operation-bound. The current publication error preserves files but does not return a recovery descriptor. Those are required handoff changes; merely adding the source ID to dispatch is insufficient.

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

This document changes no runtime registration or worker behavior. Managed output binding, recovery descriptors, independent managed validation and integration tests remain to be implemented. After that implementation, run focused tests and the required repository integration checks. The integrator owns the full-check/audit evidence and final commit. An appropriately authorized native validation and its persisted application operation receipt remain separate future evidence; this contract, successful fixture tests, or automatic continuation do not authorize a source session or provider acquisition.
