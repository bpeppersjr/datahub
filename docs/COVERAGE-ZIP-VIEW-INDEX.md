# Pointer-free coverage ZIP-view lookup index

`runner/coverage-zip-view-index.mjs` implements
`coverage-zip-view-index@1.0.0` alongside the existing coverage store. It does not
change that store, server, UI, coverage release, enrollment, or any current pointer.
It performs no network requests. Native build and independent verification evidence
is recorded below; neither changed a production pointer.

## Interfaces and source selection

- `publishCoverageZipViewIndex({createdAt, root?, signal?})`: explicit canonical
  UTC clock; publish under `data/coverage-zip-view-index/releases/`.
- `verifyCoverageZipViewIndex(manifestPath, {root?, signal?})`: independently
  reconstruct the full positional index from the selected source artifact.
- `readCoverageZipViewLookup({manifestPath, manifestSha256, zip5, root?, signal?})`:
  return the exact original coverage row, or truthful selected-evidence absence.

Production entry points do not accept injected contracts or loaders. The source
is the registered `national-business-coverage-views` current verified manifest,
its current pointer, and its `views/zips.jsonl` descriptor. Selection binds exact
catalog bytes, coverage/registry/geography pointer and manifest hashes, the entire
coverage dependency declaration, spatial denominator declaration, and ZIP artifact
hash/size/count/policy. Current registry and geography dependencies must agree,
including registry-to-geography lineage. Declared other dependency hashes are
retained, not independently replayed. Current-pointer drift requires rebuilding
against a newly reviewed selection; there is no historical-source resolver.

The installed metadata identifies 48,194 rows in a 712,218,883-byte source with
SHA-256 `b24a6dc7026a3bec96cea4cd4cb227aa58d11be9beebd633d8229ca5ee37a6dd`.
Focused tests read only its metadata, not its payload. A separate one-line read
confirmed canonical encoding and the original nested `registry_coverage.status`
shape; this is not native full verification.

## Representation and proof boundary

Each bucket contains sorted entries `{zip5, offset, bytes, sha256}`. Offsets and
hashes reference original canonical UTF-8 JSONL row bytes, including LF. No source
counts, coordinates, temporal facts, ZIP fields or source metadata are copied into
the index. A full scan checks the source artifact hash/size/count, unique exact
ZIP5 keys, canonical encoding, partial-business claim and registry coverage-status
shape. Unknown fields and nested evidence remain unchanged in the returned row.

The independent verifier streams the complete selected artifact, regenerates all
entries and the manifest, and compares every stored bucket. It catches rehashed
omissions, wrong offsets, altered row digests or upgraded index claims. The source
is bounded to 1 GB and 100,000 rows; individual rows are at most 65,536 bytes.
At most 100 buckets, each at most 200,000 bytes and 1,000 entries, are supported.
The full scan retains only bounded positional metadata, not all source rows.

One-ZIP lookup reads bounded metadata, one bucket, and at most one 65,536-byte
source range. It verifies the range digest bound by the caller-pinned index and
checks the original ZIP identity. It does **not** hash the full 712 MB source or
certify unrelated rows. The caller-held index manifest pin must originate from
successful publication/full verification; an arbitrary rehashed manifest is not
its own trust bootstrap. `full_source_replay_performed: false` remains explicit.
An absent row is not an invalid-USPS assertion or measured zero.

Source-reported ZIP membership, Census ZCTA membership, denominator-only status,
source counts and null baselines remain distinct original evidence. No category
map is introduced. No current operation, complete-business universe, operational
USPS denominator or geography is inferred. ZIP4 remains separate. Source artifact
`internal`/`local-review-only` export policy is preserved, never relaxed.

## Publication and failure behavior

Files are synced and manifest-written-last in uniquely owned staging, then fully
verified before atomic rename. Content identity binds metadata, clocks and ordered
bucket inventory. Exact existing releases are fully verified for reuse. Exclusive
per-release guards prevent simultaneous installs; crash-held guards are never
automatically reclaimed. Closed index inventories, app-contained canonical paths,
single-link regular files, directory identities and pre/post-read file checks
reject observed links, replacement, mutation and unknown entries. These checks
are not an OS security boundary against a privileged writer racing every syscall.

AbortSignal cancellation is checked while scanning, reading ranges and publishing.
Before publication, only provably owned staging is removed. After installation,
the immutable release remains inspectable; cancellation reports inspection needed.
Lock close/unlink/ownership failures preserve ambiguous state and report structured
recovery, without replacing an earlier primary error. No pointer is created.

Run `node --test runner/coverage-zip-view-index.test.mjs`. Synthetic tests cover
exact reconstruction/reuse, zero/null semantics, bounded lookup, rehashed tampering,
duplicates, malformed source rows, links, drift, cancellation, concurrent install,
source replacement and lock recovery. Native build/verification was performed
separately as recorded below; fixture tests do not repeat it. No source acquisition
or runtime integration is performed by this module. Supported Astra fallback
was used, not Spark. Full repository checks remain the integrator's release gate.

## Native release evidence

The integrator completed pointer-free publication and independent full verification
of `coverage-zip-view-index-84ab1aff4d30eb285f59f21f20a8c06f6cef7b529a88b1a7ac4672c2adc09dce`.
Manifest SHA-256:
`a10a0ae018d76b3923e7f2a788cfb7611e2c5a8616cf49fc93ea26bcae217b6e`.
The explicit build clock is `2026-10-02T20:00:00.000Z`; 100 buckets total
6,065,062 bytes and index 48,194 unchanged coverage rows. Network requests and
production-pointer changes were zero. This verifies source/index reconstruction,
not raw-source provenance or currently operating businesses.

The metadata-only registration and narrower reconciliation check are documented
in `docs/ZIP-POSTAL-COVERAGE-INDEX-REGISTRATIONS.md`.
