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
3. **Normalization resource limits.** The legacy gzip reader has since been replaced with the [bounded record reader](OVERTURE-BOUNDED-RECORD-READING.md), and builder/verifier identity sets have been replaced by [disk-backed duplicate checking](OVERTURE-DISK-IDENTITY-INTEGRATION.md). Output writers still lack byte/disk ceilings and aggregate maps remain. Acquisition limits do not automatically govern these components. Complete bounded output, aggregates and operation-owned storage before advertising a production-scale app normalization worker.

The current verifier performs checksum/count and selected semantic checks; it does not yet independently replay every normalized field from source evidence. The coordinate fix does not establish that broader property. The next normalization implementation must preserve deterministic source-to-output fidelity, not merely matching totals.

The full national business objective remains incomplete. Neither a retained Overture snapshot nor this local defect fix establishes current business operation, valid USPS membership or nationwide completeness.

## Release verification

`npm run check` passed with 1,657 tests: 1,646 passed, 11 skipped and zero failures. Lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-numeric-evidence-full-check.log`. TypeScript passed and the production dependency audit reported zero vulnerabilities. All 82 protected production-plan file hashes remained unchanged. Co*Tive's local development service was restored after verification.

Rollback is a code rollback of the numeric normalization change; no existing releases were rewritten. Do not silently reinterpret previously retained zero coordinates as missing: the original selected source is needed to distinguish actual zeros from earlier coercion.
