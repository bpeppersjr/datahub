# Retain normalized Overture output before promotion

`buildOvertureUsPlaces` now defaults to `publicationMode: "retain"`. After its existing normalization, quality checks and verification, it leaves the UUID run under `.staging`, returns `status: "verified-retained-not-promoted"`, `stagingRunId`, its manifest and directory, and `pointerPath: null`. It does not update `current.json` or move the dataset into `releases`.

This intentionally changes the former automatic-promotion default. Callers that explicitly want a build and promotion must pass `publicationMode: "publish"`; unknown modes fail before output setup. The build CLI also defaults to retention and requires `--publish` for promotion. Its JSON result includes status, staging ID and pointer, and its cancellation handler now reaches the builder. Retained data can be promoted separately through `publishOvertureUsPlacesStaging` with the returned run ID, without rebuilding or reacquiring source data.

The promotion helper validates the staging UUID and generated release-name format, keeps paths inside `datahub`, and re-verifies the retained manifest and artifacts before moving them. An expected release ID may be supplied to prevent choosing the wrong staged release. Explicit promotion updates the local Overture source pointer only; it does not rebuild or publish the national business registry or establish national completeness.

## Cancellation and recovery

The builder checks cancellation during writer finalization, around manifest verification and after logging, before choosing retention or promotion. Outstanding gzip writers are closed on finalization failures. Verification itself still runs to completion before its surrounding cancellation check; this is cooperative cancellation, not a hard deadline.

Promotion checks cancellation before release and pointer renames, including retries. A cancellation after pointer commit is reported as `cancellationAfterPublication` on the published result rather than implying the committed pointer was rolled back. If the release has moved but pointer commit fails, the error includes an inspection reference to the retained release and `publicationCommitted: false`. Files are preserved; no automatic retry or rollback is introduced. A failed/cancelled attempt can leave staging artifacts or a temporary pointer file for inspection.

## Limitations

This separates two legacy operations; it does not complete the managed normalization worker. Acquisition-descriptor binding, disk-backed identity integration, bounded output/aggregate processing, deterministic source-to-normalized replay and managed recovery remain required. Promotion is not a multi-writer transaction or compare-and-swap pointer update. The existing verifier's semantic scope is unchanged. Callers must not infer a resumable or authenticated release from a staging directory alone.

## Verification and migration

Tests cover retention with an existing pointer left byte-for-byte unchanged, separate explicit promotion, pre-cancelled promotion, cancellation after verification, invalid modes and staging IDs, CLI publication intent, and preservation of a moved release when pointer commit fails.

`npm run check` passed: 1,676 tests, 1,665 passed, 11 skipped and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-retain-before-promotion-full-check.log`. TypeScript passed, production dependency audit reported zero vulnerabilities, and all 82 protected production-plan pins remained unchanged. No production dataset was built or promoted.

Existing releases and pointers are unchanged by this code update. Update automation that intentionally relied on build-and-publish to request publication explicitly. Rollback restores the former automatic-promotion default and must therefore be treated as a behavior change, not a harmless retry workaround. Preserve all existing staging/release evidence.
