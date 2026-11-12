# ZIP source-native status distribution

This pointer-free local derivative replays the 100 declared registry location-profile partitions and groups exact records by reported ZIP5, source release, and an opaque digest of the recursively canonical source-native status. Missing, null, empty-object, and present statuses remain distinct. The raw status and record identifiers are never returned by the bounded reader.

Counts use `registry-location-profile` units and conserve to the registry, resolution, and coverage releases. They are source-specific evidence only: statuses are not normalized into a universal active flag and establish neither current operation, unique businesses, USPS validity, ZCTA membership, nor completeness. Denominator-only ZIP rows remain outside this derivative.

The manifest binds the recursive key-sorted JSON canonicalization version and implementation digest. Per-source conservation records total profiles; missing, null, empty-object and present status counts; observed-at presence and range; and a canonical global source-status distribution digest compatible with the temporal conservation audit. Profile IDs are capped at 512 UTF-8 bytes and checked for cross-partition duplicates using a contained, disk-backed DuckDB aggregate with a 512 MiB engine-memory and 4 GiB spill ceiling; the publisher does not retain an eight-million-ID JavaScript set.

Each ZIP2 data bucket has a checksummed positional index. Runtime reads one bounded index plus the exact selected ZIP byte range, verifies its range digest, and rechecks the registration, manifest, current registry/resolution/coverage lineage and file identities. Not-enrolled, unavailable, incompatible-lineage and corrupt-release remain distinct unavailable states. Exact small cells are retained only under `local-review-only`; the UI exposes no public export and never reveals raw native status values or record/profile identifiers.

Publication is immutable, content-addressed, manifest-last, and creates no current pointer or production enrollment. Inputs are retained local releases; the operation performs no network request or acquisition.

## November registry lineage

The selected release is `zip-source-native-status-185258ea949e094367778df8b6b2a567416b096b69a7dd3b4423c9a16846eef3` with manifest SHA-256 `18c7176a25bedea3862b22a4e249aeb47f05758e17fdb02b00182e377f302d96`. It conserves 8,011,213 profiles across 15 sources and 232,089 groups. Its 100 data buckets and 100 range indexes total 72,356,382 bytes, plus the 35,796-byte manifest. The repository retains the exact selected artifact bytes for local review.

The manifest pins the pointer and manifest hashes for `national-business-registry-20261112-005851952Z-44f0a338`, `business-entity-resolution-20261112-025152257Z-75c216bb`, and `national-business-coverage-views-20261112-025948835Z-76733954`. The coverage manifest supplies the reproducible build timestamp `2026-11-12T02:59:48.835Z`.

New York retail food was the only changed source conservation row. The refreshed annual publisher license snapshot dated October 14, 2026 contributes 23,608 registry location profiles, down 622 from 24,230 in the prior snapshot. The distribution leaves closures, current operation, and all-business completeness unassessed. The October registration is archived under `config/datasets/zip-source-native-status-distribution-v20261003.json` for historical industry-matrix replay.

For first publication, build locally with `npm run zip-source-status:build -- --created-at 2026-11-12T02:59:48.835Z`. Verify the retained release with `npm run zip-source-status:verify -- --manifest <registered-manifest-path>` using the `retained_release.manifest` path in the dataset registration.
