# Pointer-free ZIP qualification lookup index

`runner/zip-active-evidence-index.mjs` implements
`zip-active-evidence-index@1.0.0`. It is an offline library layer, with no API,
UI, CLI, scheduler, acquisition, source enrollment or current pointer. Coding and
fixture verification used the supported Astra fallback, not Spark.

## Binding and interfaces

- `publishZipActiveEvidenceIndex({createdAt, root?, signal?})` requires an explicit
  canonical UTC build clock no earlier than the source derivative's clock.
- `verifyZipActiveEvidenceIndex(manifestPath, {root?, signal?})` independently
  scans every registered source shard and every index entry.
- `readZipActiveEvidenceLookup({manifestPath, manifestSha256, zip5, root?, signal?})`
  requires an exact caller-held index manifest SHA-256 and a five-digit ZIP.

The caller's index pin must come from successful publication or full independent
verification. A supplied hash is not its own trust bootstrap: bounded lookup does
not independently certify every omitted ZIP in an arbitrarily rehashed index.

Production entry points always load the fixed dataset registrations and enforce
the authored category-map version and semantic hash. Alternate roots do not
bypass this check. Unknown options, injected contexts/loaders and arbitrary
mapping overrides are rejected. App-contained roots support filesystem
isolation, not alternate native taxonomy trust. Fixture mechanics are private;
tests instrument a memory-only module copy rather than exporting a bypass.

Bindings retain the exact qualification registration file hash, registered
release and manifest hash, ordered artifact inventory hash, projection hash,
category registration and authored-file hashes, authored semantic hash, mapping
version and taxonomy version. The existing category-map validator checks pinned
coverage source identities and conservation. No selected current pointer is
rewritten or adopted. Index build time does not refresh source evidence dates.

## Representation and bounded lookup

An immutable content-addressed release lives under
`data/zip-active-evidence-index/releases/zip-active-evidence-index-<sha256>/`.
Its closed manifest contains only bindings, claims, build clock, counts and
checksummed bucket descriptors. Up to 100 `zip-NN.json` buckets hold sorted ZIP
entries with `row_count` and ordered source-shard byte ranges. Rows and raw source
metadata stay exclusively in the registered qualification shards.

Each bucket is at most 2 MB and contains at most 1,000 ZIP entries. Each ZIP is
bounded to 1,000 source rows and eight referenced shards, with each source shard
already limited to 2 MB. Lookup loads one bucket and verifies the complete hashes
of only its referenced shards (at most 16 MB of source payload), not the entire
roughly 2.29 GB release. Bounded registration, manifest, projection, mapping and
coverage-source metadata reads are additional. Directory inventory enumeration
does not read unrelated source payloads. A requested ZIP spanning shard boundaries
is reconstructed in original source-key order with unchanged source rows and
separate bound category IDs. Source clocks and binding identities accompany it.

`status: present` includes explicitly measured zero values without replacing
unmeasured/null eligibility. `status: absent-from-source-rows` means no pair was
indexed; it does not mean an invalid ZIP, zero businesses or complete coverage.
ZIPs with no contributed source rows are not invented from a geographic universe.
The lookup carries null business/completeness denominators, false current-operation
verification and `full_source_replay_performed: false`. Unrelated shard tampering
is detected by full verification, not claimed to be detected by a bounded lookup.

The observed installed release has 29 rows per ZIP, a maximum of two shards per
ZIP and 1,349 shard-crossing ZIPs (integrator read-only audit). These observations
are not universal semantics or hardcoded admission requirements. These measurements
are retained-source audit evidence, not fixture-test output. Native index build
and verification evidence is recorded below.

## Publication, verification and recovery

The builder scans every source shard with exact declared hash/bytes/count checks,
requires canonical JSONL encoding, verifies strictly sorted unique ZIP/source
pairs, reconciles per-source typed totals and positive-ZIP membership, and creates
byte ranges without copying source metadata. The independent verifier repeats
this traversal and reconstructs all index entries; rehashed omissions, changed
offsets, counts, claims or categories cannot be authorized by index hashes alone.
Full verification is source-shard/index reconciliation, not raw publisher replay
or proof of currently operating businesses.

Publication writes synced buckets and then the manifest into a uniquely owned
staging directory, independently verifies it, and atomically renames it. A
per-release exclusive guard serializes cooperative publishers. Existing exact
valid releases are independently verified for reuse; invalid output is never
overwritten. Closed inventories, canonical containment, single-link regular files,
directory identities, repeated identity checks and metadata pins reject observed
link substitution, drift and TOCTOU changes. The final source identities are
rechecked after installation. As with the source publisher, these checks are not
an OS-level defense against a privileged writer racing every syscall.

Cancellation before publication removes only provably owned staging entries.
Unknown entries or changed ownership preserve staging for inspection. Cancellation
after rename leaves the immutable release inspectable; retry verifies/reuses it.
Guard close/inspection/unlink or ownership failure produces structured
inspection-required recovery with release ID and publication/reuse state. A
primary cancellation/error remains authoritative. Replacement locks are never
removed, and there is no automatic crash-lock recovery. Cancellation is cooperative,
not a hard wall-clock deadline.

## Validation boundary

Focused synthetic tests cover cross-shard ZIP lookup, category identity, explicit
zero versus absence, source conservation, exact reuse/concurrency, tamper and
rehashed index mutations, closed inventories, links, bad pins/options, alternate
root mapping rejection, cancellation, input drift and cleanup failure recovery.
The fixture tests do not perform a production-sized build or full native scan.
Separate native build and verification evidence is recorded below. Full repository
verification remains an integration gate.

`DATAHUB_TEST_ZIP_INDEX_NATIVE_SCAN=1` explicitly opts into a read-only scan of all
installed source shards and checks the current 29-row/two-shard/1,349-crossing
audit observations. It publishes nothing, but reads roughly 2.29 GB and is not
enabled by the default focused tests.

## Native release evidence

The integrator completed native pointer-free publication and independent full
index verification for release
`zip-active-evidence-index-9eec9bff35e6abbad453fcfdac14aba3fcebb4f578bbbfcf9abc6faf136bb27b`.
The exact manifest SHA-256 is
`046780ab2f0fb3532360c631d06300a8153469dd58d48f5dbae556be65b7d040`.
Its recorded build clock is `2026-10-02T17:45:00.000Z`; 100 bucket artifacts
total 4,861,616 bytes and index 1,397,626 rows across 48,194 ZIP labels.
The operation performed zero network requests and no production-pointer changes.
This is source-shard/index reconciliation, not publisher source replay or verified
current business operation. Export remains `local-review-only`.

The tracked metadata-only registration and its narrower checks are described in
`docs/ZIP-ACTIVE-EVIDENCE-INDEX-REGISTRATION.md`. They do not repeat this full scan
or enroll the index into a runtime current pointer or national denominator.
