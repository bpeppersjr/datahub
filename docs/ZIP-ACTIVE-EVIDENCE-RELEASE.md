# Immutable local ZIP qualification releases

`runner/zip-active-evidence-release.mjs` publishes the existing source-bound
`zip-active-evidence-qualification@1.0.0` projection without changing any pointer,
source enrollment, production artifact, national denominator, or UI. It performs
no network requests. This is an offline library operation, not a scheduled
acquisition or a managed API action.

## Interface and identity

Call `publishZipActiveEvidenceRelease({asOf, createdAt, signal})` with explicit
canonical UTC clocks. Neither clock defaults to now. Optional `root` is confined
to the existing app-owned filesystem boundary and is useful for isolated tests.
Verify through `verifyZipActiveEvidenceRelease(manifestPath, {root, signal})`.

Output is fixed beneath
`data/zip-active-evidence-qualification/releases/zip-active-evidence-<sha256>/`.
The digest covers exact projection metadata bytes followed by every sorted row's
JSONL bytes. Clocks, source bindings, policies, limitations, and conservation
metadata therefore participate in identity. No `current.json` is created.

`projection.json` retains all projection fields except rows; sequential
`rows-0000.jsonl` partitions retain every row unchanged. A closed-schema
`manifest.json` records schema, clocks, binding and claim copies, source/ZIP row
count, and each artifact's name, SHA-256, bytes, and record count. The manifest is
written last and synced, followed by independent verification and atomic staging
directory rename. Readers accept only the final fixed release location.

The most restrictive applicable upstream export policy remains bound and copied
unchanged. An internal source or snapshot cannot be downgraded to local review.
Neither local publication nor verification proves current business operation or
raw-source record-status replay. Existing null denominators, overlapping units,
source-reference dates and explicit unknown qualifications remain intact. Build
time cannot refresh evidence.

## Verification and resource bounds

The independent verifier validates closed file inventory and manifest shape,
rebuilds the projection from its bound published registry/coverage chain using
the recorded clocks, and compares complete metadata and every row. Hashes alone
cannot authorize rehashed false counts or claims. Source-pointer drift makes a
release fail verification against the currently selected chain; it is not a
historical archive resolver. Published bytes are preserved on failure.

Output partitions are at most 2,000,000 bytes and 1,000 rows, with individual
JSONL rows at most 65,536 bytes. At most 1,500 partitions, 4,000,000 metadata bytes,
and 1,000,000 manifest bytes are accepted. Serialization holds only one bounded
partition at a time. The shared exported `ZIP_ACTIVE_EVIDENCE_LIMITS` caps output
at 1,500,000 pairs and defines both partition-row and partition-count limits, so
projection and release admission cannot drift. Byte-size limits remain separate:
unusually large rows can exhaust the partition limit before the pair limit.
The projection builder still materializes its bounded row array, but per-source
metadata and temporal objects are immutable shared copies. Publication drops its
first array reference before independent replay; garbage collection timing is
Node's responsibility. This implementation does not claim constant-memory source
projection or a measured native memory peak. Verification rebuilds the array and
streams stored rows. The retained native build and independent verification have
now succeeded under a 12 GB Node memory profile, as recorded below; that profile
is not a measurement of peak process RAM.

Canonical containment, regular single-link file identities, exact inventory,
checksums, repeated reads, directory identity and pre/post-rename identity checks
reject links, unknown entries, tampering and observed concurrent mutation. A
cooperative exclusive per-release guard serializes publishers. A valid exact
existing release is independently verified and reused; invalid existing output
is never overwritten. There is no automatic stale-lock recovery: a crash-held
guard or ambiguous staging entry requires explicit operator inspection. Other
processes must not mutate these app-owned directories; filesystem checks are not
an OS-level defense against a privileged writer racing every system call.

Cancellation is checked during source reads, artifact processing and around
publication. Before publication, cleanup removes only the uniquely owned,
single-link staging files and directory. Unexpected entries or changed ownership
are preserved and reported with `inspection_required` and `staging_id`. After
atomic rename, cancellation preserves the inspectable immutable release and
reports `inspection_required` plus `release_id`; a later call can verify/reuse it.
No cancellation changes production pointers. Cancellation is cooperative, not a
hard wall-clock timeout.

Guard cleanup is secondary to the primary outcome. Close, inspection, unlink,
missing-lock or ownership failures produce a structured `recovery` object with
`inspection_required`, `release_id`, `publication_state` (`published`, `reused`,
or `not-published`), explicit `published`/`reused` booleans and fixed diagnostic
codes in `lock_cleanup.issues`. When publication/reuse otherwise succeeded, the
operation throws `ZIP_RELEASE_INSPECTION_REQUIRED` while preserving the release.
When publication or cancellation already failed, that original error object and
code remain authoritative and receive the recovery details; cleanup does not
replace them. A guard whose close failed or identity changed is never removed.
Inspection errors do not become proof of ownership. Replacement locks are left
untouched for explicit recovery, and raw cleanup exception text is not retained.

## Validation scope

Focused fixture tests exercise bounded partitioning, conservation, restrictive
policy, exact reuse, concurrent contenders, unexpected files, hardlinks and
directory aliases, forged/rehashed rows, changed source evidence, and cancellation
before staging, during writing, and after rename. Tests use app-contained scratch
roots and no network. Supported Astra fallback was used for coding/testing;
Spark was not claimed or used. Native evidence below is separate from the full
repository integration gate.

## Retained native build and independent verification — 2026-10-02

The initial authoritative retained build failed closed at the former 750,000-pair
limit and published no release. Read-only measurement then established exactly
1,397,626 ZIP/source pairs across 48,194 ZIP rows, with at most 29 sources per ZIP.
That evidence justified the shared 1,500,000-pair bound correction; no rows were
truncated or omitted to fit the earlier limit.

Following the correction, the native pointer-free build and a separate
independent verification both succeeded under the 12 GB Node memory profile.
The integrator supplied the following verified release evidence:

- Release ID: `zip-active-evidence-76630f473281f971dc8e588ad7cf918ef649ae6c3597f995118b1238223969d9`.
- Manifest SHA-256: `9872e4b46fe01fc529ac189cda20a5a8a28d0a39904c8742b931934a5ce0b493`.
- Source/ZIP rows: **1,397,626**.
- Both `asOf` and `createdAt`: `2026-10-02T16:30:00.000Z`.
- Effective export policy: `local-review-only`.
- Network requests: **0**; production pointers changed: **false**.

This is an immutable local derivative, not production enrollment, a new current
pointer, or proof of currently operating businesses. Existing source clocks,
overlaps, unknown denominators and qualification limitations remain unchanged.
