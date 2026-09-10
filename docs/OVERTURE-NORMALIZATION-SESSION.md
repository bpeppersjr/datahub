# Receipt-bound retained normalization session

The new session composes the acquisition input resolver, verified pinned Census baseline, bounded source copy, normalization and source-to-output replay. It performs local work only and always retains output without promotion.

Native inputs are exactly an operation UUID and its `output` directory, an acquisition operation UUID with expected receipt hash, a baseline manifest path with expected hash, and optional cancellation. Caller-supplied readers, minimum-count overrides, source paths and publication flags are rejected. Native normalization keeps the builder's one-million selected-record minimum; a separately named test entry uses a one-record minimum and explicitly synthetic readers.

## Evidence chain

The session re-verifies the acquisition and its original metadata reference. It derives the legacy prepared metadata from that verified reference, including the source asset's observation date, and retains the complete acquisition binding inside it. That same binding is copied into the normalized release's internal source metadata. It is not replaced by unbound caller-authored metadata.

The final `overture-normalization-session@1` receipt records:

- acquisition selection and operation/manifest/plan/journal/metadata/runtime/selected-file hash binding;
- pinned baseline selection;
- normalized staging-run and release IDs and exact normalized-manifest hash;
- `normalized-retained-not-promoted` status, with publication and nationwide completeness false.

The independently invoked session reader re-resolves acquisition evidence and baseline selection, verifies the normalized release and replay, reconstructs expected prepared metadata from the original reference, compares every prepared-metadata field and the selected artifact's bytes/hash/count, and rechecks receipt and normalized-manifest hashes/identities. It also compares the retained baseline's hash, bytes and record count directly with the verified original Census `derived/zip-coverage.jsonl` artifact. A copied baseline's self-consistent checksums alone are insufficient. It rejects unexpected top-level session files and synthetic mode through the native entry point.

The wrapper receipt is the cross-source binding authority for this workflow. Downstream workers must retain it and verify its descriptor; promoting or exporting only the inner legacy manifest would lose the operation-level chain. This session does not establish publisher authenticity against a malicious local writer and does not independently replay the remote Parquet query.

## Failure and cancellation

Acquisition or baseline changes before finalization prevent a completed session receipt. Manifest publication uses an exclusive link after a flushed, verified temporary receipt. Failure after that publication returns an inspection descriptor in `error.recovery`, not success. A future manager must treat recovery as inspection-required and must not advertise readiness solely because a manifest exists.

Cancellation is passed into the builder, copy and baseline admission. Existing snapshot, Census and final session verification still contain non-interruptible intervals; checks occur at stage boundaries and no hard deadline is claimed. Managed cooperative/forced cancellation enrollment remains required. The session does not provide automatic retry, restart resume, promotion or queue management.

## Nested Windows path fix

The first session test failed in the disk-backed identity check when its database was nested under operation/session/build/check UUID directories. Moving that working database to the existing short app-owned `data/tmp/overture-verification-identities/<build-run-id>` namespace made the same integration pass. This avoids adding the operation/session nesting to DuckDB's working path.

Successful build identity scratch is now removed after native handles close, with canonical directory ownership checks. Failed build scratch remains for inspection. Verifier scratch keeps its existing cleanup behavior. These databases are recomputable working state, not normalized artifacts or resume checkpoints. Existing retained databases from earlier code are not deleted or migrated.

## Verification

All 24 focused tests passed with app-contained TEMP/TMP after fixing the nested identity placement and copied-baseline binding. The new baseline regression first reproduced acceptance of a changed, consistently rehashed copy, then passed after comparison with the original pinned artifact was added. Session tests execute actual local copying, pinned baseline verification, normalization and replay, with synthetic acquisition/metadata adapters and an explicitly structural baseline fixture. They cover rehashed metadata and baseline tampering, unexpected files, native/test separation, forbidden overrides, changed acquisition binding, pre-abort, cancellation after normalization, and post-manifest failure recovery. Existing source replay, duplicate, retention and promotion tests also pass. A successful native acquisition-backed normalization has not been observed because the retained production acquisition remains failed.

Final `npm run check` passed: 1,700 tests, 1,689 passed, 11 skipped, zero failures, followed by lint, build and desktop control-plane smoke checks. Evidence: `data/tmp/overture-normalization-baseline-bound-full-check.log`. `npm audit --omit=dev` reported zero vulnerabilities and `npx tsc --noEmit` passed. All 82 protected production-plan pins remained unchanged. The earlier 1,699-test run preceded the added baseline regression and is not the final validation evidence.

Independent read-only review confirmed that the original-artifact comparison closes the reproduced copied-baseline gap, with no further concrete blocker found in this changed scope.

## Compatibility and rollback

Existing builder callers retain their explicit publication behavior. The new session is additive and never changes a current-release pointer. Its wrapper receipt is a new contract, not a retrofit or authenticity claim for older releases. To roll back, revert this code change while preserving all retained operation evidence; do not delete or rewrite existing manifests, acquisition files or failed-run artifacts. No dependency or database schema migration is required.

## App operation enrollment

The authenticated local API now accepts `POST /api/data-operations/overture-normalizations` with exactly `acquisitionOperationId`, `baselineReleaseId` and `baselineSha256`. Admission copies the selection, requires the fixed native operation store, computes the acquisition receipt hash itself, independently verifies acquisition evidence, and resolves the baseline only under `data/business-baselines/census-zbp/releases/<release-id>/manifest.json`. It verifies both the hash and release ID before allocating an operation. Callers cannot supply arbitrary paths, readers, count overrides, downloads or promotion flags.

The new `source-normalization` operation uses the existing shared managed-operation slot, persisted queued/running/terminal receipts, fixed `scripts/run-overture-normalization-session.mjs` child, IPC cancellation and existing forced-termination grace. The manager independently verifies the child session and compares both input selections to its dispatch record. `normalizationReady` means verified retained output, not publication. Nonzero exit, cancellation, recovery or verification failure cannot advertise readiness. Artifacts stay private, including after restart. Interrupted work is failed or ownership-unknown, never automatically retried. This does not add a parallel normalization queue or automatic resume.

The existing operations API can list and cancel this operation. No dedicated normalization UI selector is added yet. Native success and managed successful-output/cancellation end-to-end execution remain unobserved because there is no successful production acquisition available. The synthetic session tests prove copying/replay, not a native acquisition. New managed tests cover invalid input/accessors, fixed-store admission, missing acquisition without output allocation, reservation release, restart privacy/readiness, and CLI argument rejection. Independent review found no concrete blocker in this scope.

Enrollment validation: `npm run check` passed (1,704 tests: 1,693 passed, 11 skipped, zero failures), including lint, build and desktop smoke. Log: `data/tmp/overture-normalization-enrollment-full-check.log`. Dependency audit found zero vulnerabilities, TypeScript passed, and all 82 protected pins were unchanged. After restarting the app, a native authenticated request selecting failed acquisition `a8ff9f6d-b2be-4d56-905b-17984788b1d5` returned HTTP 409. The failed receipt hash and complete operation inventory were unchanged; no output operation was allocated. The UI returned HTTP 200. The existing refresh-scheduler warning remains unresolved and refreshes were not enabled.

Resource hardening of remaining prerequisite/verifier stages is still outstanding. Co*Tive remains local; no cloud deployment, production download, production normalization or promotion occurred.
