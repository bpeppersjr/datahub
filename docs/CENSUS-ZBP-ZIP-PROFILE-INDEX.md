# Census ZBP ZIP-first industry profile index

`census-zbp-zip-profile-index@1.0.0` is an immutable, pointer-free local derivative of the exact selected retained 2023 Census ZIP Business Patterns release. It never downloads, changes `current.json`, enrolls production, or supplies GDP estimates. Dedicated implementation uses the supported Astra fallback; Spark was unavailable.

## Contract

The publisher binds exact source pointer/manifest hashes, all ten normalized gzip partition descriptors, ZIP coverage and NAICS catalog artifacts, current compatible geography pointer/manifest and original geography dependency, and tracked Census source policy hash/version. It groups exact publication codes by ZIP without adding hierarchical rows. A profile includes the complete retained ZIP coverage row and sorted industry rows with establishments, all nine size counts and corresponding suppression codes. Publisher city/state/county labels are separate from geographic assignment. ZIP4 is null. Current operation, GDP and all-business completion remain false/null.

Every ZIP in the source coverage union receives a profile, including denominator-only ZIPs with no published industry detail. An absent lookup is distinct from an existing profile with no industry rows, a suppressed value, and a published numeric zero. Historical annual employer establishments exclude the nonemployer universe and do not establish current USPS validity. A dataset publication code is not automatically equivalent to the app's evidence categories.

## Layout and verification

Local releases live beneath `data/census-zbp-zip-profile-index/releases/<content-id>/`. Each of ten first-digit partitions has a canonical JSONL profile shard plus an offset/length/SHA-256 index. A content-addressed manifest is written last in owned staging; complete verification precedes atomic rename. Existing exact releases are independently verified before reuse. No mutable pointer is written.

The independent verifier streams every retained source partition again, regenerates each ZIP profile and all offsets, and compares the entire deterministic manifest/artifact checksums. It rejects omissions, duplicate ZIP/code pairs, changed ordering, rehashed false profiles, extra files and source drift. The bounded lookup trusts an explicit exact manifest pin supplied by a reviewed registration, reads one index bucket and one positional profile range, and never decompresses the source. A caller-supplied rehashed pin is not a substitute for full verification/registration.

Canonical app-contained paths, single-link files, exact directory inventories, bounded reads, identity/timestamp checks before/after I/O, cancellation and exclusive scoped locks apply. Failed prepublication work cleans only owned files. Published/reused releases survive errors; lock-close/ownership/unlink failures report inspection-required recovery with release/staging identity and publication state, preserving a primary error and never deleting replacement locks. Abandoned locks require inspection, not automatic takeover.

## Resource envelope

Source maximums: ten partitions, 32 MB compressed and 128 MB decoded per partition, 600,000 rows per partition, four million detail rows total, 50,000 ZIP-union rows and 2,500 distinct publication codes. One partition is grouped in memory at a time, alongside the bounded ZIP coverage map; memory is not a fixed OS cap. Profile maximum4 MB, derivative shard maximum512 MB, index bucket maximum2 MB, manifest maximum100 KB. Lookup positional payload is at most4 MB plus one at-most2 MB index bucket and bounded metadata. Publication performs a second complete replay for verification.

Before native lock/staging creation, admission measures available blocks with `statfs` on the canonical index directory (or canonical `data` filesystem if the index does not yet exist). It requires **12 GiB free disk**, covering two worst-case ten-shard generations (10.24 GB), their indexes and additional headroom. It also requires **8 GiB total physical memory and 6 GiB currently free memory**. The free-memory allowance conservatively budgets 32× the128 MB decoded partition for object/map/string expansion plus over1 GiB for the ZIP-coverage map, compressed input, parser buffers and profile serialization. These are admission floors, not a proof of peak heap usage or an OS reservation; memory/disk may change after admission. A suitably sized Node heap must still be selected for a reviewed native run.

The installed `APP_ROOT` cannot opt out, including a root containing a resolved `.` segment. There are no override options. Only distinct canonical app-contained fixture trees skip host floors; they still enforce every source, decoded-byte, row, profile and output ceiling. Tests expose admission/stream internals only through an owned isolated module copy, not production exports. Low disk, low total/free memory, exact boundaries, native no-bypass, and a high-cardinality long-label128 MB stream are covered. Native build and verification evidence is recorded below.

Entry points: `publishCensusZbpZipProfileIndex({createdAt,signal})`, `verifyCensusZbpZipProfileIndex(manifestPath,{signal})`, and `readCensusZbpZipProfile({manifestPath,manifestSha256,zip5,signal})`. App-contained fixture roots are supported; there are no arbitrary source/output overrides. This module does not integrate API/UI or change runtime pointers.

## Native release evidence

The integrator completed pointer-free native publication and independent full
verification of
`census-zbp-zip-profile-index-330d1c58516ff3a85003c06e717d00071cda259f13dbcc624b863fd601952c58`.
Manifest SHA-256:
`485f19b9715eb3807ef4d6dfa5a98c353645690f47c3b55a52b16487933e316d`.
The explicit build clock is `2026-10-02T21:30:00.000Z`. Twenty artifacts total
2,015,507,248 bytes and retain 2,974,116 source industry rows in 37,828 ZIP
profiles. This verifies retained-source profile reconstruction, not currently
operating businesses, GDP, or authoritative USPS validity. No current pointer
was written and no production enrollment or network request occurred.

Tracked metadata-only registration and its narrower reconciliation tests are
described in `docs/CENSUS-ZBP-ZIP-PROFILE-REGISTRATION.md`; those tests do not
repeat the full native replay.
