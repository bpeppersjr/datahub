# Wisconsin development app lifecycle and retained reuse

`runner/wi-childcare-app.mjs` connects the durable Wisconsin journal to the existing five-artifact offline release builder. It adds durable app-level start/checkpoint/terminal records, independent lineage verification, cooperative cancellation and cross-output-root acquisition exclusion. It does **not** enroll native Wisconsin collection, authorize source use, schedule refreshes or add Wisconsin businesses to national reporting.

## Available entry points

- `runWiChildcareAppJob({retainedJournalReceipt, outputRoot?, signal?})` independently inspects an explicitly selected successful journal, reuses its saved acquisition evidence and creates a separate local normalization. It makes no source requests. Omitting the retained input rejects before filesystem I/O with `WI_CHILDCARE_LIVE_NOT_ENROLLED`; no automatic download fallback exists.
- `runWiChildcareAppJobWithTransport(...)` is the trusted development/testing entry. It runs the fixed-policy-bound journal followed by offline normalization. All outputs retain injected or offline-review claims. Transport, clock, persistence, logger and `buildRelease` overrides are test seams, not native/API/CLI options.
- `verifyWiChildcareAppJob(receiptPath)` reads saved evidence only. It verifies successful lineage or a complete failed/cancelled app receipt. Missing checkpoints, pending files, changed hashes or uncertain ownership require inspection, not inferred success.

Standalone commands, with absolute paths inside `datahub`:

```powershell
node scripts/run-wi-childcare-app.mjs --help
node scripts/run-wi-childcare-app.mjs --retained-journal ABSOLUTE_JOURNAL_RECEIPT --output ABSOLUTE_NEW_APP_ROOT
node scripts/run-wi-childcare-app.mjs --verify ABSOLUTE_APP_RECEIPT
```

There is no acquisition, retry, resume or force-unlock command. The app lifecycle is not yet registered in the managed-operation API or management UI. A direct Node command is standalone local processing, not evidence of accepted managed dispatch.

## Data and ownership boundaries

App records live at `appRoot/jobs/<UUID>`. Child journal and normalization outputs live separately at `appRoot/runs/<UUID>/acquired` and `normalized`. Work roots must be new; arbitrary existing normalized roots are rejected. The existing release builder's `current.json` is confined to that one new child root. Shared source and national pointers are unchanged.

The injected app acquires both its output-root ownership lock and a fixed development source lock at `data/business-sources/wi-dhs-licensed-group-childcare/development-runtime/publisher.lock`. This excludes injected app acquisitions using different output folders. Local retained reprocessing does not take that source lock. The bare lower-level injected journal remains separately callable and is not represented as sharing this app lock. No native publisher lock or native request path is claimed.

Locks remain held while child calls, persistence hooks, terminal writes and final verification drain. Unknown or changed ownership is never reclaimed. The app adds no retries; its injected child transport may make up to three attempts per logical request, each with a durable intent. There is no automatic restart or retry after partial failure.

A 30-minute cooperative deadline and 1 GB available-disk prerequisite apply. The disk figure is storage, not RAM or reserved capacity. Existing bounded response/journal/release limits still apply; this is not an OS-enforced process memory ceiling. Native dispatch still requires a separately verified process/resource policy.

## Checkpoints, publication and inspection

`start.json` binds the execution mode and fixed contract/policy digest. `acquired.json` binds the independently inspected journal receipt and its exact hash. Evidence reads compare the acquisition artifact's byte/hash descriptor and re-inspect its parent journal before normalization.

`normalization-start.json` persists the exact child output root before the child runs. This matters when a child publishes an immutable release but throws during finalization: a null normalized checkpoint means **unverified output**, not “nothing was published.” The app records `normalization_state: inspection-required`, preserves the child root and does not retry. If a committed child returns, its manifest identity is captured before a later cancellation is honored.

`normalized.json` binds the independently replayed immutable release. Successful terminal publication first verifies a candidate receipt, then exclusively publishes `receipt.json` and verifies it again. Verification checks exact checkpoint rosters, chronology, injected/retained modes, child paths, original journal evidence and equality of normalized `source-observation.json` with the journal acquisition. A valid unrelated release with the same row counts is insufficient.

Failures preserve their app directory and isolated work directory. Error recovery identifies those paths and any known published normalization. A missing terminal receipt, leftover candidate/pending file or unknown child output requires inspection; do not delete evidence or repeat a download. Existing source journals survive normalization cancellation independently of the old release builder's cleanup of its own unpublished staging.

ZIP5 and ZIP4 remain separate. Coordinates and addresses preserve the existing unverified provider-point/address semantics; no business polygons, inferred ZIPs, source authenticity, verified current operations, unique-business identity or national completeness are introduced. Original observation time remains separate from new local processing time.

## Validation and remaining work

Eight focused tests passed with retained Wisconsin notice fixtures and synthetic provider rows. They cover the closed native entry; invalid options/roots; failure identity; cross-root exclusion and cancellation draining; offline reuse; acquired/normalized stop boundaries; changed authority/chronology/lineage; existing child-root rejection; and actual child publication followed by an injected failure. Independent review found the post-publication recovery ambiguity and verified its correction. These are development fixtures, not acquired Wisconsin businesses.

Full repository validation passed on September 10, 2026: `npm run check` completed with 1,850 tests, 1,839 passed, 11 skipped and zero failures, plus lint, web/desktop builds and desktop control-plane smoke. Retained Wisconsin policy and both retained county versions were enabled. Log: `data/tmp/wi-development-app-full-check.log`. TypeScript passed and `npm audit --omit=dev` reported zero vulnerabilities. The preview was restored after validation and returned HTTP 200 once startup completed; no browser visual inspection was performed, and the scheduler-unavailable state was left unchanged. No source acquisition, national promotion, authorization change or managed dispatch was performed.

A separate standalone CLI smoke run also succeeded and was independently verified: `data/tmp/wi-app-cli-smoke-20260910-01/jobs/d2dc482b-fa71-4873-b770-94712a11c1c9/receipt.json`, SHA-256 `b692e4d671ac6e2998f2b670661f627839c8365b133e5a242e1a1542504f5e16`. This local run reused the two-row synthetic journal `ca50c6f4-78db-4c68-9800-f4f187b273e5`; it did not fetch records. Its observation time remains the fixture time, not the CLI processing time. Neither this app receipt nor its child pointer is a production dataset or managed-operation dispatch receipt.

Next implement a separately versioned native acquisition/source-use binding and managed-operation enrollment after the operator's scoped source-use decision. Do not change historical injected journal or offline-release authority claims to enable native use. Actual handoff requires an accepted application operation ID and persisted receipt, not this module or its tests alone.

Rollback removes the new app wrapper, standalone CLI and tests, while preserving app/child evidence. Existing Wisconsin modules, source policy, retained datasets and national pointers remain unchanged.
