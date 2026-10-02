# ZIP active-evidence qualification (offline contract)

`runner/zip-active-evidence-qualification.mjs` implements `zip-active-evidence-qualification@1.0.0`. This is a read-only, source-level temporal qualification projection, not an active-business count or a new national denominator. Implementation/testing used the supported Astra fallback; no Spark execution is claimed.

## Inputs and proof boundary

`buildZipActiveEvidenceQualification({root, asOf, createdAt, signal})` requires explicit canonical UTC clocks. It reads the existing coverage snapshot, verifies its registry dependency against the selected registry pointer/manifest, checks the published location-profile conservation totals, and streams the pinned ZIP coverage artifact. It validates hashes, bytes, record counts, lineage, source release metadata, each source-defined count unit, and positive-ZIP membership against source summaries. All selected inputs are rechecked before return. Inputs are bounded, app-contained, non-aliased single-link files. No network, source acquisition, enrollment, publication, artifact write, or pointer change occurs.

This is published aggregate integrity/conservation, **not** a raw-source replay or an independent per-record `source_status` distribution replay. The separate `business-temporal-conservation-audit` remains the contract for that broader registry/resolution audit. This projection does not reinterpret an active resolution decision as an active business.

Export policy is the most restrictive of the verified snapshot, ZIP artifact and explicit source-row export policies, with a `local-review-only` ceiling. Any `internal` input keeps the entire projection `internal`; an otherwise local-review ZIP artifact cannot relax it. Unknown policy values are rejected. `bindings.export_policy` records each applicable policy and the effective result, and replay verification checks both these bindings and `claims.export_policy`.

Bounds: 2 GB ZIP input, 64 KiB per JSONL record, 100,000 ZIP members, 1,000 source summaries and 750,000 ZIP/source output pairs. Oversize or unsupported input fails rather than truncating. The ZIP artifact is streamed twice for integrity; the returned projection is held in memory. This module is an explicit offline operation, not suitable for a request-time UI read. Cancellation is checked through the bounded shared readers and before return.

## Per ZIP/source output

- ZIP5, source key/release, source kind and policy evidence type remain explicit.
- `temporal_status` carries the existing temporal policy version, reference field/value/date, review window, date basis and available observation-only context. Source metadata is retained separately.
- `evidence_counts_by_unit` preserves every source count without adding overlapping units or sources.
- `eligible_evidence_counts_by_unit` means **internal source temporal-review qualification only**: within-window counts remain counts; review-due counts are zero eligible while original stale counts remain visible; missing/invalid/future/unconfigured timing produces null eligibility, not zero.
- An explicit observed zero remains zero. Absent ZIP/source pairs are not manufactured as zeros. Source summaries without ZIP count units are not allocated to ZIPs.
- Every row retains `current_operations_verified:false`, null current-operating-business counts, null all-business denominators and null completeness percentages. An elapsed review window is not closure; an unexpired one is not current operation.

`asOf` determines assessment age. `createdAt` records derivative construction only and cannot be earlier than `asOf`; changing it alone never refreshes references or qualification. Collection observation timestamps do not substitute for missing publisher currency. Geography remains source-reported ZIP5: no ZIP+4 joins, USPS claims, polygons or demographic inference.

## Verification and integration

`verifyZipActiveEvidenceQualification(value,{root,signal})` independently rebuilds from the same currently selected published chain using the projection's explicit clocks and rejects any changed qualification, metadata, counts or claims. Production callers must retain the returned bindings with the value. No UI/API, scheduler, native build dispatch, durable publisher or enrollment is added in this slice. No production-sized build is executed by the focused tests.

Focused tests cover mixed/stale/unmeasured source evidence, observation-only and future dates, build-clock invariance, null versus zero, overlapping units, duplicate ZIP/source identities, metadata substitution, typed-count and membership conservation, file/hash/registry drift, rehashed counts, replay forgery, internal-policy propagation, and cancellation. A deterministic shared-reader test aborts after the first emitted ZIP-sized record and confirms iterator termination and file cleanup/replacement; the builder also checks cancellation at each streamed record. Synthetic fixtures stay under `data/tmp` and are cleaned up by the tests.
