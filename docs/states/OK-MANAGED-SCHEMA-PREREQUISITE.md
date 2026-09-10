# Oklahoma app-owned schema prerequisite

This extends the [bounded standalone validation](OK-CHILDCARE-BOUNDED-SCHEMA-2026-09-09.md) into Co*Tive's authenticated managed-operation framework. It uses the same [narrow public-lookup policy basis](OK-SOURCE-USE-2026-09-09.md), fixed ZIP/center query, three serial requests and aggregate-only output. It is not a statewide collector, refresh schedule, provider roster, or source of active-business totals.

## Contract

- Authenticated `POST /api/data-operations/source-prerequisites` accepts exactly `{"sourceId":"ok-childcare-schema"}`. Co*Tive allocates a durable `source-prerequisite` operation and launches its fixed CLI worker. Extra URL, ZIP, path, policy or approval inputs are rejected. Nebraska remains independently blocked.
- The catalog labels Oklahoma `READY_SCHEMA_PREREQUISITE`, with collection/export/current-operation claims false. This is API catalog visibility, not a new rendered UI control.
- The app passes only `--output <operation-directory>/output --operation-id <operation-UUID>`. The CLI validates an absolute app-contained, non-aliased path bound to that UUID before requesting any source. Existing no-argument standalone use remains available.
- Native managed manifests live at `<operation-directory>/output/jobs/<run-UUID>/manifest.json` and include the operation ID. Synthetic process receipts cannot cross the managed writer boundary. No provider values or raw HTML are persisted.
- Child stdout supplies a fixed six-field descriptor. A zero exit code alone cannot mark success. The supervisor independently checks the exact path, operation/run IDs, receipt hash, native mode, timestamps, client pins, request budgets, strict fields, false quality claims and count conservation, including consistency between row counts and field-type histograms. Unrecognized or inconsistent metadata fails closed.
- This reader establishes byte integrity and structural consistency, not remote authenticity or replay of discarded source rows. Structural test fixtures are explicitly fabricated; only a separately identified live app operation proves actual handoff.
- Operation success means the bounded schema prerequisite completed. It does not mean collection readiness, verified active businesses, ZIP coverage, public export rights or statewide completeness. No downloadable artifacts are exposed through the generic artifact route.

## Cancellation and recovery

The app owns the child process and existing cancellation grace period. It prevents overlapping managed operations with its reservation mechanism. Before publication, cancellation prevents receipt commit. After publication, the child completes local verification and reports late cancellation. The supervisor retains a valid committed descriptor even when cancellation, a nonzero exit, or subsequent integrity failure requires inspection; it never turns such an outcome into success. Uncertain publication uses a distinct recovery envelope and fixed, redacted diagnostics.

On service restart, existing owner checks classify interrupted operations as failed or unknown; they do not automatically repeat source requests. Retained receipt references remain available for inspection. There is no unattended retry, recurring refresh, or automatic source-wide continuation in this increment.

## Verified native handoff — September 9, 2026

The authenticated app API returned HTTP 202 for operation `ec134ac1-f1ea-4a2f-b6d8-6b5bd8c3735f`. Its app-owned worker completed successfully at `2026-09-09T06:16:25.478Z` (started `2026-09-09T06:16:24.685Z`). The persisted operation receipt SHA-256 is `e505455baef507c254ec9a6eddc767b0a62b1ad3c5f5f3e2c7b6b07c11e01321`.

The bound aggregate manifest is `data/managed-operations/ec134ac1-f1ea-4a2f-b6d8-6b5bd8c3735f/output/jobs/a4fd7dfa-2028-4e0c-9b30-0291a012f568/manifest.json`, SHA-256 `feba9740fccd856c0b51822e32a6a4cfc711d993a742ebd72fc9462c5ad3c61b`. A separate bounded reader invocation verified the stored manifest after app completion. It reports four center rows and four in-range numeric coordinate pairs; inspection is not required. Collection readiness and statewide completeness remain false. This was one bounded handoff-validation operation, not an ongoing agent download loop or production sweep.

Release verification: full `npm run check` passed with 1,540 tests passing, 11 skipped and zero failures, plus lint, web/desktop builds and desktop smoke (`data/tmp/ok-managed-schema-full-check.log`). The late-added restart regression was separately included in a seven-test passing reader/operation run; it is not included in the full-suite count. TypeScript and production dependency audit passed; zero vulnerabilities and all 82 protected production pins unchanged. The idle app was stopped for checks and restored before the native handoff.

## Remaining acquisition work

Validate source-wide delivery limits/completeness and address/ZIP parsing, preserve ZIP5 and ZIP4 separately, establish identifier and temporal semantics, then build an independently verified collection contract. One center-only ZIP result is not evidence that other ZIPs are empty or covered. Businesses continue to require points only, not per-business polygons.

September 10 successor: [retained app collection](OK-RETAINED-APP-COLLECTION-2026-09-10.md) implements the fixed search's internal business-field projection and offline replay. It preserves unknown completeness/currentness and does not replace this historical aggregate prerequisite or claim statewide enrollment.

The protected production plan, source pins and national pointers are unchanged. Rollback reverts the Oklahoma managed branch, catalog entry, reader and CLI binding while preserving any retained operation receipts and manifests for inspection. Do not delete downloaded evidence as part of rollback.
