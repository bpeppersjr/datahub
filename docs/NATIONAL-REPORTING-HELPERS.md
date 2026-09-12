# National reporting helper implementation

This isolated backend slice adds helpers only. It does not change the existing six-source projection, API store, UI, executable industry configuration or production pointers.

## Integration interface

1. Call `readNationalReportingCatalog({signal})` from `runner/national-reporting-catalog.mjs`. It returns `{catalog, sha256}` with a closed eight-entry mapping, explicit `national-reporting-eight@1.0.0` denominator and local-review-only output ceiling. No scripts or acquisition options are accepted.
2. Call `readNationalReportingSnapshot({pointerPath, signal})` from `runner/national-reporting-snapshot.mjs`. It returns `{manifest, states, sources, evidence}`. Pass the selected store pointer, not source-current pointers. The helper reads only the pointer, selected manifest and small state/source aggregates. It supports the inspected coverage transformation `national-business-coverage-views@2.11.0`; another transformation requires explicit review, not wildcard compatibility.
3. Project the catalog against these returned state/source rows. IRS still requires the existing `readSelectedIrsStateSummary` and its independent binding against this exact manifest/source row. Do not substitute profile counts for IRS filing addresses.
4. Use `nationalReportingCount` and `summarizeNationalReportingCounts` to preserve missing/null versus measured zero. Counts must be nonnegative safe integers. Empty or entirely unknown sets return null percentage; all-business completeness always remains null.
5. Include catalog hash/version and snapshot evidence in the response. Keep output no less restrictive than the snapshot's `internal` or `local-review-only` policy. UI migration from six collection datasets to eight reporting datasets must be explicit and version-labelled; this slice does not perform it.

Snapshot reads are bounded (16 KB pointer, 2 MB manifest, 8 MB per selected aggregate; at most 100 state and 1,000 source rows), canonical non-symlink single-link files. Artifact bytes/hash/counts, duplicate descriptors, selected dependency lineage, complete-business false flags and safe counts are checked. All selected inputs are reread/rehash-checked before return. No cache means same-ID replacement is revalidated. Pointer and manifest hashes establish local snapshot identity, not cryptographic publisher authenticity. No raw-source replay is claimed.

The helper does not certify the complete coverage schema, source licensing, current operations, acquisition eligibility or every business in a state. It does not infer address geocodes, join ZIP4, select DUNS, or allocate business polygons. Callers must project only approved aggregate fields rather than returning all internal rows directly to a public export.

Focused offline tests cover the eight-source catalog, rejected executable/unknown fields, null/zero/invalid counts, real filesystem aggregate validation, no-network reads, pre-abort, same-ID mutation, duplicate descriptors, byte mismatch, policy escalation, dependency mismatch and junction rejection. Fixtures are generated inside this checkout's data folder; no production data is copied or replayed.
