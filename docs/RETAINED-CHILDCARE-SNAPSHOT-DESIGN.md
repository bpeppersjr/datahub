# Retained childcare snapshot: implementation contract

Status: snapshot storage, CLI and [managed-operation/API integration](RETAINED-CHILDCARE-MANAGED-OPERATION.md) passed focused and full release checks. Live dispatch and map integration remain pending.

## Purpose and boundaries

Build the seven-source retained childcare comparison once in a Co*Tive worker and publish an immutable, checksummed snapshot. Map reads should validate the snapshot's integrity without replaying the Utah PDF and six other source pipelines on every request. No source download, national release pointer mutation, new business identity claim or national completeness claim is part of this job.

`ManagedOperations` now includes a dedicated `cohort-snapshot` kind alongside collections and exports. Its focused tests cover persistence/load, child dispatch, cancellation, verification and the authenticated API route. This is not a national acquisition. Catalog/UI discovery and live dispatch remain separate work; no scheduled recurrence is implied.

## Publication contract

Storage module: `runner/retained-childcare-cohort-snapshot.mjs`.

- Builder accepts a scoped output root, operation/run identity and cancellation signal; it must not accept caller-supplied counts or transport overrides.
- Allocate `<outputRoot>/jobs/<UUID>/` under datahub. Produce `view.json` and publish `manifest.json` last.
- Manifest binds UUID, operation identity, build start/finish timestamps, view byte count and SHA-256, view implementation version, seven enrollment identities/hashes and retained source receipt/normalized-manifest hashes.
- Build through the existing serial offline view builder. Recheck enrollment bindings before publication. Reject changed bindings; do not silently refresh or restart.
- Record whether a source was available, unavailable or not enrolled. Do not call missing data a zero cohort or a completed seven-source replay.
- Preserve original source observation/publication/update/normalization/adoption times. Snapshot build time is not source freshness, and serial reads are not proof of a simultaneous cross-source snapshot.

Use the existing bounded, single-link, app-contained reader/writer helpers. Verify temporary manifest and artifact bytes, then use a no-overwrite commit. Mutable operation receipts can use `writeReconciliationReceipt`; immutable manifests must not use a replacement writer.

## Reader proof boundary

The cheap reader must receive a manifest path and an independently pinned expected manifest hash, validate exact schema/roster, UUID, bounded bytes, checksums, and source/cohort conservation. It returns explicit proof fields:

- `snapshot_integrity_verified: true`
- `source_replay_performed_this_read: false`
- recorded build verification time and scope, separately labeled as historical

A checksum is not source authentication. Persisted `artifact_verification_performed` describes the original build, not the current map read. Keep expensive retained-source replay as an explicit separate verification operation. A small comparison enrollment may pin the snapshot; never reuse a national production pointer for that purpose.

## Cancellation and recovery acceptance

Before commit, cancellation cleans only demonstrably owned unpublished outputs and leaves no live decoder. After commit, preserve the snapshot and return its manifest descriptor so the parent can record it even if cancellation arrives. Unexpected files, changed ownership, incomplete manifests and unresolved live workers require explicit inspection rather than deletion or automatic rebuild.

Tests must exercise publication interruption, tampering including rehashed structural inconsistencies, stale enrollment, missing sources, cancellation before/after commit, concurrent workers, path aliases, parent receipt recovery and cheap reader no-replay behavior. The app operation ID and persisted receipt establish handoff; an agent shell does not.

## Delivery sequence

Finish release checks for the existing comparison view, implement snapshot builder/reader with negative tests, add the complete managed-operation lifecycle, then bind the map to an explicitly labeled retained-cohort snapshot. Do not change or relaunch the previously denied production plan or any of its 82 pinned files. Business-name drilldowns require verified row-level access beyond this aggregate snapshot.

## Current storage entry points

`node scripts/build-retained-childcare-cohort-snapshot.mjs [--output ABSOLUTE_DIRECTORY]` builds from fixed installed enrollments and returns a compact manifest descriptor. Default output is `data/retained-childcare-cohorts`; the optional `INDUSTRY_SEGMENT_RUN_ID` binds a parent identity but is not proof of a managed operation. No actual production snapshot or app handoff is claimed by adding this CLI.

`node scripts/verify-retained-childcare-cohort-snapshot.mjs --manifest ABSOLUTE_MANIFEST --sha256 EXPECTED_HASH` checks persisted snapshot integrity without replaying source files. Keep the expected hash in independently retained app/enrollment evidence; recomputing it from the file being checked is not a trust anchor.

The separate fixture builder is restricted to `data/tmp` and publishes `fixture-root-offline-build` evidence. Native snapshots use `native-root-offline-build` and remain outside that fixture area. An interrupted lock is not automatically stolen. Full repository release checks and managed parent receipt recovery tests are still required before calling the entire app workflow complete.

Postcommit failures carry `RETAINED_CHILDCARE_SNAPSHOT_COMMITTED_REQUIRES_INSPECTION` and the committed descriptor, requiring integrity verification before use. The build CLI preserves this descriptor on stdout but exits nonzero; it is not a success receipt. Deterministic tests now verify cancellation immediately after manifest linking, failed temporary unlink, and failed lock cleanup. Parent recovery integration remains to be implemented and tested.

Focused validation: eleven snapshot tests pass, covering fixture publication, independent reads without input files, missing sources, invalid arguments, rehashed structural tampering, concurrency/cancellation, fixture/native separation, postcommit faults and enrollment drift during publication. Eight comparison tests passed with installed seven-source offline replay enabled, including persisted-view reconstruction. Full repository checks, managed-operation wiring and map integration remain pending. No collection refresh occurred.

## Verified native storage build

Development CLI build `31f83308-3393-4c6c-9475-22f6b9c67d61` published `data/retained-childcare-cohorts/jobs/31f83308-3393-4c6c-9475-22f6b9c67d61/manifest.json`, SHA-256 `11bd15a08f1cc1ea7bac74b025abb635bc9bed77290cab5f954425f042c8e9ed`. Execution mode is `native-root-offline-build`; `industry_run_id` is null. This proves standalone snapshot storage, not a managed-operation handoff.

The build ran from `2026-09-09T03:00:40.480Z` through `2026-09-09T03:01:17.609Z` and stored a 260,625-byte view. All seven source cohorts were available: PA 4,995; CT 1,390; MD 1,772; VT 503; CO 1,648; UT 422; IA 1,476 accepted rows. These remain source-separated counts, not deduplicated active businesses.

A separate hash-pinned reader invocation with network access disabled verified snapshot integrity in 38 ms in one local measurement. It reported `source_replay_performed_this_read: false`; this is not a repeated-source verification or a performance guarantee. Reuse this retained snapshot for downstream integration tests instead of rebuilding it merely for promotion.
