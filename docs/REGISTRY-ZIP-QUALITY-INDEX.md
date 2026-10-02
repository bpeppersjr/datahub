# Registry ZIP-quality lookup index

`runner/registry-zip-quality-index.mjs` provides an immutable, pointer-free access index for the registry artifact selected by `config/zip-quality-view-enrollment.json`. It does **not** replace `zipQualityView`, register a runtime endpoint, change the UI, create an enrollment, acquire data, or write `current.json`.

Implemented by the dedicated application/testing agent using the supported Astra fallback; Spark was unavailable for this workstream.

## Entry points

- `publishRegistryZipQualityIndex({createdAt, root?, signal?})`
- `verifyRegistryZipQualityIndex(manifestPath, {root?, signal?})`
- `readRegistryZipQualityLookup({manifestPath, manifestSha256, zip5, root?, signal?})`

The build clock is required explicitly and never refreshes source evidence. Paths and validators cannot be injected. `root` selects an app-contained workspace with the same fixed enrollment and registry layout; it does not select arbitrary source artifacts.

The native build and independent full verification are recorded below. The currently enrolled `derived/zip-coverage.jsonl` contains 503,302,423 bytes and 48,194 records. These measurements are not universal ZIP counts or proof of postal validity.

## Exact evidence binding

The content-addressed manifest binds enrollment bytes, cohort, registry pointer bytes, registry manifest bytes/release/publisher version, exact ZIP artifact SHA-256/byte/record counts, any governed USPS reconciliation artifact, and the existing ZIP denominator audit schema and implementation SHA-256. The manifest includes the reconstructed audit summary. The existing `auditRegistryZipRows` contract governs placeholder, source-reported, denominator-only, ZCTA, USPS-reason and separate ZIP4 semantics; failed contracts cannot publish. A retained USPS reconciliation, when present, must reconcile the exact listed member set against its manifest denominator.

Audit identity uses reviewed, fixed module and loaded-function digests plus schema version. It is not calculated from arbitrary current disk bytes and then assigned to a cached function. Canonical single-link audit code is bounded to 128,000 bytes, hashed against the reviewed digest at context load and completion, and included in stability rereads. An audit implementation change requires explicit pin review; drift fails closed. Isolated tests change only a fixture copy, never production source.

Manifest policy prose is retained verbatim as descriptive, **non-authorizing** provenance. The artifact's explicit `distribution_policy` is the scope authority; any recognized explicit `internal` restriction remains most restrictive. Only `internal` and `local-review-only` are accepted artifact policies. Both the index and returned source row inherit the effective restriction. There is no public export authorization.

## Storage and bounded retrieval

Release location: `data/registry-zip-quality-index/releases/registry-zip-quality-index-<content hash>/`.

Each occupied two-digit ZIP prefix has one small JSON index bucket. Entries contain only ZIP5, exact source byte offset, byte length and SHA-256. Full row data is **not copied** into the index. Source ordering need not be lexical; buckets are sorted, unique and fully reconstructed by verification.

Limits are exported as `REGISTRY_ZIP_QUALITY_INDEX_LIMITS`: source at most 1,000,000,000 bytes / 100,000 unique ZIP5 rows; row at most 1,048,576 bytes; at most 100 buckets / 1,000 entries each / 256,000 bytes each; manifest at most 100,000 bytes. Full scans use 64KiB chunks and keep only index entries plus compact audit inputs, not the entire source serialization. Exact boundary and over-bound behavior are tested.

A lookup reads bounded metadata, one bucket, and at most one source row using positional reads in chunks of at most 64KiB. It returns the complete parsed row, its exact UTF-8 JSONL bytes (including original whitespace/CRLF or missing final newline), the existing per-row audit detail, all bindings, policy and explicit non-completeness claims. Unknown fields are preserved, not normalized away. An absent ZIP returns `row:null`, not a zero-count row or invalid-USPS conclusion. `00000` remains an explicitly classified placeholder; low-number ZIPs are not guessed invalid. ZIP4 is never joined or treated as geometry.

Full scans enforce the declared artifact size and absolute source ceiling incrementally before hashing/parsing each chunk and before consuming each line. Reads are limited to remaining declared bytes; at the boundary an opened-handle size check rejects growth without consuming any appended byte. A deterministic append-during-first-read test proves bounded rejection, handle closure and absence of staging/locks.

The caller must obtain the exact manifest pin from successful publication/independent verification and ultimately a reviewed tracked registration. Arbitrary rehashed pins are not trusted. Lookup proves its selected range, **not** integrity of unread source ranges. Independent verification streams/hashes the complete source and reconstructs every entry, count and audit summary; it detects omitted/replaced entries and unrelated source tampering. `full_source_replay_performed:false` makes this lookup boundary explicit.

## Publication, cancellation and recovery

Publication uses owned staging, bounded exclusive-create files, synced writes, manifest-last completion, independent source reconstruction, an exclusive content-ID lock and atomic directory rename. An existing exact valid release is independently verified and reused; it is never overwritten. Closed inventories reject extra files. Canonical paths, single-link regular files, opened-handle identity, timestamps, byte hashes and post-read metadata rehashes reject aliases, hardlinks, tampering and input changes.

Cancellation is checked between bounded reads/writes and phases; opened handles close in `finally`. Only owned unchanged staging files may be removed. After publication, cancellation does not delete the release. Lock close/inspection/unlink failures and replaced ownership produce structured `inspection_required` recovery with release ID, `published`/`reused`/`not-published` state and cleanup issues; an existing primary error is preserved. Replacement locks are never deleted. Crash-left locks/staging require inspection, not automatic takeover or retry.

## Verification

Focused fixtures use real small enrolled registry chains under `data/tmp`, not alternate production validators. They cover exact bytes and classifications, policy, pin/path/link drift, genuinely omitted/replaced index entries, range forgery, unrelated source tampering, duplicate/malformed/postal-contract inputs, resource bounds, concurrent owners, cancellation, source mutation, lock replacement/unlink faults and primary-error preservation.

Run `node --test runner/registry-zip-quality-index.test.mjs` and scoped ESLint. These fixture checks do not repeat native full publication/verification or perform runtime integration.

## Native release evidence

The integrator completed pointer-free publication and independent full verification
of `registry-zip-quality-index-4b454f2383f5932e9cb89734e2c120ed7ec85276cc43f5e8fa65409583d4e430`.
Manifest SHA-256:
`1ecbc4cb23d59e584d4528a4f65c23ed9fe4f658e134864416731fc48130941c`.
Its explicit build clock is `2026-10-02T20:00:00.000Z`; 100 bucket artifacts total
6,051,556 bytes and index 48,194 ZIP labels. The audit passed with unresolved proof
gaps: all 48,194 USPS operational statuses remain unverified. Network requests and
production-pointer changes were zero. This is retained source/index/audit replay,
not proof of authoritative operational USPS membership or active businesses.

Metadata-only registration and its narrower checks are documented in
`docs/ZIP-POSTAL-COVERAGE-INDEX-REGISTRATIONS.md`.
