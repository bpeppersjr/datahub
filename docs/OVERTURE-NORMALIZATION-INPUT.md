# Acquisition receipt binding for normalization

`readOvertureNormalizationInput` resolves a selected acquisition from the fixed native `data/managed-operations` root. Its inputs are an operation UUID, an expected operation-receipt SHA-256 and an optional cancellation signal. Native callers cannot inject a storage root, reader, source URL or source path.

The operation receipt is read through bounded, canonical, single-link, identity-checked I/O with a 1 MiB ceiling. Admission requires a successful `source-acquisition` for Overture, verified receipt integrity, `snapshotReady: true`, no inspection requirement, no post-publication cancellation, internal export policy and no normalization/publication or completeness claim. The snapshot descriptor must point to that operation's own immutable run.

The resolver independently invokes the existing native acquisition reader rather than trusting readiness flags alone. That reader checks retained snapshot artifacts, selected fields, source filters, metadata/runtime prerequisites, plan, journal and accounting. The resolver additionally matches prerequisite references against the operation details and rechecks the operation receipt's hash and identity after snapshot verification.

Its private result contains the retained selected-file path and a versioned binding carrying operation-receipt, acquisition-manifest, plan, journal, metadata-manifest, runtime-manifest and selected-file hashes, plus operation/run identities and selected byte/row counts. Publication, source-authenticity proof and national completeness remain false. This is local evidence-chain integrity, not cryptographic authentication against a malicious local writer.

## Tests and current retained state

Four focused tests passed. Positive binding uses an explicitly injected synthetic snapshot reader and reports `synthetic-test-only`; it is not proof of successful native acquisition. Tests cover hash preservation, failed/cancelled/incomplete/wrong-source receipts, dependency mismatch, selected-path escape, receipt mutation during inspection, stale receipt hash, accessors, pre-abort, and rejection of test hooks by the native entry point.

The native resolver was also run against actual operation `a8ff9f6d-b2be-4d56-905b-17984788b1d5`, using the freshly calculated hash of its existing receipt. Its status remains `FAILED`; the resolver rejected it before attempting normalization. Its retained evidence was not changed. No successful native snapshot was manufactured or inferred from this check.

Full `npm run check` passed: 1,694 tests, 1,683 passed, 11 skipped, zero failed, plus lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/overture-normalization-input-full-check.log`. TypeScript passed; the production dependency audit found zero vulnerabilities. All 82 protected production-plan pins were unchanged.

## Remaining integration

This is an input-resolution component, not an enrolled managed normalization job. The builder must still consume this binding, retain it alongside derived metadata, invoke the bounded selected-file copy, preserve dependencies in its output, and reread the pinned acquisition receipt before finalization. Its worker must combine that with pinned baseline verification and source replay, durable operation results and explicit promotion.

The acquisition snapshot reader does not yet accept this resolver's cancellation signal internally; cancellation is checked before and after that verification, so cancellation is not immediate during its existing file work. No hard deadline is claimed. The returned absolute paths are private runtime values, not public/exportable API data.

No acquisition, production normalization, promotion or scheduler change was made. This component can be rolled back without modifying retained operation data; downstream callers must not substitute loose paths or flags if it rejects an input.
