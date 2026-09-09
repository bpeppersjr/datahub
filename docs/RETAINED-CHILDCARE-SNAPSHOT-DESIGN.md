# Retained childcare snapshot: implementation contract

Status: reviewed design, not an implemented or dispatched application operation.

## Purpose and boundaries

Build the seven-source retained childcare comparison once in a Co*Tive worker and publish an immutable, checksummed snapshot. Map reads should validate the snapshot's integrity without replaying the Utah PDF and six other source pipelines on every request. No source download, national release pointer mutation, new business identity claim or national completeness claim is part of this job.

The existing `ManagedOperations` implementation supports collection and export only. A comparison snapshot must not be described as already supported. Prefer a dedicated operation kind rather than disguising a local reporting build as a national acquisition; implement persistence/load, dispatch, cancellation, child verification and API/catalog handling together. No scheduled recurrence is implied.

## Publication contract

Proposed module: `runner/retained-childcare-cohort-snapshot.mjs`.

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
