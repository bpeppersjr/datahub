# Minnesota privacy-selected stream and replay

`processMnConstructionSelectedStream` processes a caller-supplied Node readable CSV stream. It is an implementation building block, not a downloader, persisted release, native connector, source-use authorization or app job. No live data was requested for this work.

## Input accounting and selection

The processor validates run/release/cohort/observation context before consuming input, snapshots that context and reads strict UTF-8. It requires the exact pinned 18-column header, proper CSV quoting and consistent row width. The existing [CSV stream parser](https://csv.js.org/parse/api/stream/) handles split chunks, BOMs, escaped quotes and quoted newlines. Its [record-buffer limit](https://csv.js.org/parse/options/max_record_size/) is set to 65,536; the stream separately permits at most 50,000,000 consumed source bytes and 250,000 data rows. These are input ceilings, not a reservation or a guarantee of a particular process RSS.

Each complete row emits exactly one sequence-numbered frame:

- Accepted: the twelve selected source strings needed by [normalization](MN-CONSTRUCTION-NORMALIZATION.md), preserving original whitespace and postal/date values for replay. Contacts, type/subtype and enforcement/renewal fields are omitted.
- Rejected: only ordinal, disposition and a finite fixed reason. No rejected business/person name, address, credential identifier, contact, raw row or per-row hash is retained.

Private columns necessarily pass through the in-memory CSV parser, but never reach the output callback. Source SHA-256 covers all consumed original bytes, including BOM/contact bytes; the full source is not retained by this processor. The receipt binds a separate canonical JSON-lines frame digest and source/accepted/rejected/reason counts. No receipt is returned on incomplete quoted records, malformed UTF-8/schema/width, source limits, input/sink errors or cancellation. Empty header-valid input returns explicit zero counts, not population completeness.

The callback is awaited for each frame, allowing a durable writer to apply backpressure. No whole-file array is accumulated by the processor. Upstream chunking and parser buffering still affect memory. The caller receives a copy of each frame; modifying it cannot silently alter the internal receipt digest. A durable writer must verify the bytes it actually saved.

## Retained replay and proof limits

`replayMnConstructionSelectedStream` accepts a frame array or parsed-frame Node readable plus a completed receipt. It validates exact envelopes, bounded counts, contiguous ordinals, accepted field membership, finite rejection reasons, canonical digest and count conservation. It reconstructs accepted normalized records using the measured source checksum and original row ordinal. The provisional all-zero checksum used internally during the first pass is never emitted; it serves only to validate selection before a complete file digest is available.

Discarded rejected values cannot be reconstructed or independently semantically revalidated. Their reasons are acquisition-time ledger assertions; replay proves frame membership/counts and accepted transformation, not the correctness of every discarded reason. A source-file checksum in a receipt does not authenticate the publisher or prove that selected values were present in that file against a maliciously forged receipt. HTTP identity, source use, measured transport and immutable retention must be bound by the future native acquisition/release wrapper.

Replay emits accepted normalized records incrementally **before** final digest/count validation. Its output callback must write only to uncommitted staging, then publish only after successful return and independent durable-artifact verification. An end-of-input mismatch can invalidate all staged outputs. Neither processing nor replay offers a publication pointer, atomic release, crash recovery or retry mechanism.

Both paths accept cancellation. Input processing uses the abort-aware pipeline; replay attaches the signal to Node readable input so stalled reads are destroyed on abort. Arbitrary async iterators are rejected because their stalled `next()` cannot be safely controlled here. Callback writes remain trusted and must honor the supplied signal; cancellation is not claimed to interrupt arbitrary uncooperative callback code. Upstream HTTP deadlines belong to the future transport wrapper. Unexpected parser, input and callback failures are redacted; ordinary cancellation propagates the caller's abort reason.

## Integration still required

Next bind reviewed source-use and retention policy, app-contained run-isolated selected-frame storage, measured receipt publication, retained-source replay and independently verified normalized artifacts. Keep ordinary failure evidence distinct from an accepted release. Dispatch only after native app enrollment and an actual operation receipt; do not give routine download supervision to an agent. Current code performs no file writes, source requests, geocoding, national reporting or public export.

Eight offline tests cover source/frame hashes and conservation, all row dispositions, split UTF-8/quoted CSV, malformed and oversized input, frame/claim forgery, stalled-input/replay cancellation, field exclusion, redacted failures, snapshot isolation, awaited callbacks, credential cohorts and the actual row ceiling. Independent review identified and closed the stalled-replay cancellation gap. Rollback removes only the stream/replay module and tests, preserving the earlier normalization and preflight receipts. No pending production-plan pin was changed.

Verification on September 8, 2026: all 1,009 repository tests, lint, web/desktop builds and desktop control-plane smoke passed in `npm run check`; the production dependency audit reported zero vulnerabilities. All 82 code/configuration pins in pending national plan `production-oh-memory-20260908-02` remain unchanged. Log: `data/tmp/mn-construction-selected-stream-check.log`. Local preview restored with HTTP 200; no browser visual QA or live acquisition performed.
