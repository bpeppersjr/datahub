# Minnesota retained selected-data bundles

`buildMnConstructionRetainedSelection` now stores a caller-supplied CSV stream as an independently replayed local bundle. This is durable processing infrastructure, **not a native source acquisition, source-use approval, production promotion or scheduled app job**. No live source records were fetched for this change. The existing local app architecture and hosting configuration are preserved.

## Stored artifacts

Each build creates a new UUID directory under `data/business-sources/mn-dli-construction/retained` by default. It contains:

- `selected.jsonl`: accepted selected fields and redacted rejected-row dispositions from the [stream processor](MN-CONSTRUCTION-SELECTED-STREAM.md).
- `selection-receipt.json`: measured input hash/bytes, canonical frame hash, counts and explicit proof limits.
- `normalized.jsonl`: accepted records reconstructed from the retained selected frames using the measured source hash.
- `manifest.json`: the final acceptance marker, with exact artifact paths, bytes, SHA-256 values, line counts and conservation totals.

Contacts, rejected personal values, the full CSV and business polygons are not stored. ZIP5 and ZIP4 remain separate; address-role, point, identity and operation uncertainty stay unchanged from [normalization](MN-CONSTRUCTION-NORMALIZATION.md). Record-level outputs remain local-review-only. The manifest explicitly denies native-acquisition verification, source authenticity, replay of discarded private values, public-export authorization and national reporting integration.

## Write and publication lifecycle

Input/context validation and output-path checks occur before consuming the source. Output roots must be absolute, canonical, app-contained directories without links, reserved release/staging ancestry, ambiguous Windows suffixes or an existing manifest-bearing ancestor. The builder requires at least 1.5 GB free disk before creating the run directory. This is measured headroom, not a reservation; later disk exhaustion still fails the build.

Files are created exclusively and flushed before close. Selected frames are written with awaited backpressure, then replayed from disk into the normalized file. The verifier reconstructs normalized records from selected evidence, checks exact correspondence, row conservation, file rosters and actual artifact bytes. The receipt checksum covers the same bytes that were parsed, not a second independent read.

The manifest is first written as `manifest.tmp`. The builder rereads and verifies it, verifies the whole bundle, checks identities and metadata snapshots, then rehashes all artifacts before publication. A hard-link/no-overwrite operation publishes `manifest.json`, followed by removal of the temporary manifest. No current production pointer is written. Unique build directories allow independent builds without overwriting prior accepted evidence.

The manifest link is the cooperative commit boundary. Cancellation before it removes only recorded owned files in the original non-aliased run directory; previous bundles, unrelated entries and substituted files are preserved. Ordinary failures retain incomplete evidence without an accepted manifest. Once the manifest is linked, cancellation cannot clean the bundle. A process termination or disk failure between link and unlink can leave an extra temporary link; the verifier rejects that state for inspection. Automatic crash cleanup, restart/resume and uninterrupted durability across power loss are not claimed.

All file reads are canonical, bounded and single-link, with filesystem identities and size/time snapshots compared. Selected frames are limited to 200 MB, normalized records to 1 GB, receipt/manifest JSON to 100 KB and JSON-lines records to 65,536 bytes. Line processing and normalization are streamed; no national-sized record array is built. Read-only verification rechecks cross-file stability and the manifest. These protections detect the tested accidental/concurrent mutations; they do not claim immunity to an arbitrary hostile process racing writes after checks.

## Replay and provenance boundaries

`verifyMnConstructionRetainedSelection(manifestPath)` reads existing artifacts only. It verifies accepted transformations, exact output membership, counts and retained checksums without another CSV download. Rehashed normalized mutations still fail against retained source selection. It does not recover discarded personal values, prove every rejection reason against the original CSV, authenticate a caller-supplied source, or establish active-business completeness. A future acquisition wrapper must bind current source-use evidence and transport identity to this retained selection.

The bundle keeps caller-provided source/run identifiers distinct from its storage UUID. A valid retained bundle is not an app acquisition receipt, and must not be presented as one. Native transport, source policy/retention binding, an app operation lifecycle and industry enrollment remain required before unattended source downloads. Downstream builds should reuse these verified artifacts rather than repull data merely for promotion.

## Verification and rollback

Eight offline tests cover complete disk replay without network, no personal/contact leakage, separate ZIP4, unique bundle publication and prior preservation, rehashed normalized tampering, extra artifacts, failed-source retention, cancellation cleanup, unsafe outputs, hardlinks, disk headroom, initialization-handle cleanup and mutation after replay but before commit. That last regression failed with metadata-only guards on this machine and passed after precommit artifact rehashing was added. Independent review identified the publication-stability and initialization-handle issues before release.

Rollback removes the new builder/verifier and tests plus the stream context-validator export. Preserve retained evidence; do not delete source data or rewrite prior manifests. No source policy, production pointer, pending production implementation pin or schedule was changed.

Verification on September 8, 2026: `npm run check` passed all 1,017 tests, lint, web/desktop builds and desktop control-plane smoke. `npm audit --omit=dev` reported zero vulnerabilities. The 82 code/configuration pins in pending plan `production-oh-memory-20260908-02` remained unchanged. Full-check log: `data/tmp/mn-construction-retained-selection-check.log`. Local preview restored with HTTP 200; no browser visual QA or native source acquisition was performed.
