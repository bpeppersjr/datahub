# Overture normalization handoff — September 9, 2026

The [app-owned acquisition session](OVERTURE-ACQUISITION-SESSION.md) is implemented. Native large acquisition still requires explicit approval; no places download was dispatched during this review. Normalization is not yet enrolled behind that managed snapshot contract.

## Verified numeric-evidence defect and fix

A synthetic in-memory call to `normalizeOvertureUsPlace` reproduced two defects: null latitude/longitude became the numeric point `(0, 0)`, and null source confidence became `0`. The cause was JavaScript numeric coercion, not supplied geographic evidence.

Transformation `overture-us-places@1.0.1` now requires finite numeric coordinates, a numeric nonnegative safe-integer source version, and numeric confidence when confidence is reported. Null/absent main confidence remains unreported. Optional nonnumeric source confidence stays null rather than becoming a number. Genuine numeric zero is preserved; this is not a rule that all zero coordinates are invalid or independently verified addresses.

Missing, boolean, string, array/object and nonfinite coordinates are rejected with the existing `missing-or-invalid-coordinate` quarantine reason. The independently invoked release verifier also rejects out-of-range normalized latitude/longitude, even after artifact hashes have been recomputed. Existing normalized output is not silently rewritten. Any future reprocessing must retain source evidence and record the new transformation version.

Focused fixtures demonstrate normalizing two valid records and quarantining two invalid records, including missing coordinates, with separate ZIP5 and ZIP4. They also test genuine zero, absent confidence, malformed numeric types and rehashed out-of-range normalized coordinates. No production dataset was built or promoted.

## Remaining app-normalization requirements

Inspection of the legacy `buildOvertureUsPlaces`, `verifyOvertureUsPlaces` and build CLI identified these next integration requirements:

1. **Retained acquisition provenance.** The legacy builder accepts separate gzip and metadata paths; it does not accept the new acquisition descriptor or preserve its plan/journal/runtime hashes in normalized dependencies. A managed adapter must independently verify a clean native acquisition and retain that chain alongside the verified ZBP dependency. Do not replace it with an unbound, newly assembled metadata file.
2. **Separate local normalization from promotion.** The legacy builder now [retains by default](OVERTURE-RETAIN-BEFORE-PROMOTION.md), with explicit promotion and additional finalization cancellation checks. A managed local normalization operation still needs an internal retained-result receipt, acquisition binding and managed recovery handling before any current-pointer mutation.
3. **Normalization resource limits.** The legacy gzip reader has since been replaced with the [bounded record reader](OVERTURE-BOUNDED-RECORD-READING.md), builder/verifier identity sets with [disk-backed duplicate checking](OVERTURE-DISK-IDENTITY-INTEGRATION.md), and normalized/quarantine output plus summary maps now have [explicit limits](OVERTURE-NORMALIZATION-OUTPUT-LIMITS.md). Prepared metadata and source copying now use [bounded retained-copy admission](OVERTURE-RETAINED-COPY.md). Other prerequisite intake, sidecars and managed operation-owned storage still need review before advertising a production-scale app normalization worker.

The verifier now performs [source-to-output replay](OVERTURE-SOURCE-REPLAY.md) against retained baseline/context evidence, in addition to checksums, counts and selected semantics. It compares every normalized/quarantine record and rejects the reproduced rehashed-name mismatch. This does not authenticate an unanchored source/context chain or replace acquisition/baseline app-receipt binding; managed normalization still needs those independent input references.

The builder also now accepts an explicit [pinned Census baseline selection](OVERTURE-PINNED-BASELINE.md), verified before use and again before finalization. The legacy pointer input remains weaker; managed integration should select the pinned path and must still establish app-owned receipt authority and finish the Census verifier's resource/cancellation hardening.

An [acquisition input resolver](OVERTURE-NORMALIZATION-INPUT.md) now verifies the selected native operation receipt and snapshot. The [retained normalization session](OVERTURE-NORMALIZATION-SESSION.md) consumes that resolver, carries its binding through prepared metadata, and records the exact verified normalized-manifest hash in a separate receipt. App worker/queue enrollment and managed result verification remain the next integration step. The actual failed acquisition is correctly rejected as an input.

The full national business objective remains incomplete. Neither a retained Overture snapshot nor this local defect fix establishes current business operation, valid USPS membership or nationwide completeness.

## Release verification

`npm run check` passed with 1,657 tests: 1,646 passed, 11 skipped and zero failures. Lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-numeric-evidence-full-check.log`. TypeScript passed and the production dependency audit reported zero vulnerabilities. All 82 protected production-plan file hashes remained unchanged. Co*Tive's local development service was restored after verification.

Rollback is a code rollback of the numeric normalization change; no existing releases were rewritten. Do not silently reinterpret previously retained zero coordinates as missing: the original selected source is needed to distinguish actual zeros from earlier coercion.
