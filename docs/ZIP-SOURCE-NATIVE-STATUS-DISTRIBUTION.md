# ZIP source-native status distribution

This pointer-free local derivative replays the 100 declared registry location-profile partitions and groups exact records by reported ZIP5, source release, and an opaque digest of the recursively canonical source-native status. Missing, null, empty-object, and present statuses remain distinct. The raw status and record identifiers are never returned by the bounded reader.

Counts use `registry-location-profile` units and conserve to the registry, resolution, and coverage releases. They are source-specific evidence only: statuses are not normalized into a universal active flag and establish neither current operation, unique businesses, USPS validity, ZCTA membership, nor completeness. Denominator-only ZIP rows remain outside this derivative.

The manifest binds the recursive key-sorted JSON canonicalization version and implementation digest. Per-source conservation records total profiles; missing, null, empty-object and present status counts; observed-at presence and range; and a canonical global source-status distribution digest compatible with the temporal conservation audit. Profile IDs are capped at 512 UTF-8 bytes and checked for cross-partition duplicates using a contained, disk-backed DuckDB aggregate with a 512 MiB engine-memory and 4 GiB spill ceiling; the publisher does not retain an eight-million-ID JavaScript set.

Each ZIP2 data bucket has a checksummed positional index. Runtime reads one bounded index plus the exact selected ZIP byte range, verifies its range digest, and rechecks the registration, manifest, current registry/resolution/coverage lineage and file identities. Not-enrolled, unavailable, incompatible-lineage and corrupt-release remain distinct unavailable states. Exact small cells are retained only under `local-review-only`; the UI exposes no public export and never reveals raw native status values or record/profile identifiers.

Publication is immutable, content-addressed, manifest-last, and creates no current pointer or production enrollment. Inputs are retained local releases; the operation performs no network request or acquisition.
