# Oklahoma retained search collection

## Implemented scope

This is a successor to the completed aggregate schema prerequisite and [delivery review](OK-DELIVERY-NEXT-2026-09-10.md), not another schema-only probe. Co*Tive can retain a versioned, internal business-field projection from one ordinary center-only ZIP `73102` search. It is not a statewide collector, source-wide refresh or active-business census.

Authenticated `POST /api/data-operations/ok-childcare-collections` accepts exactly `{}`. The fixed scope is also described in the management catalog's `boundedSourceCollections` entry. This is API/catalog visibility; no new rendered button or automatic schedule is claimed. The app reserves its operation slot, persists its operation receipt and launches `scripts/collect-ok-childcare-retained.mjs` with only the bound operation output path and UUID. The collector accepts no URL, ZIP, transport or policy override.

The worker makes three serial GETs: the previously reviewed, byte/hash-pinned public client; the ordinary fixed search page; the same pinned client again. It does not execute website scripts, follow provider profiles, fetch reports/maps, call undocumented endpoints or retry requests. Each response is bounded to 1 MB of accepted decoded bytes, with a 20-second request timeout and a 90-second collection deadline. Overflow is rejected before appending the next chunk; the byte counter describes accepted decoded bytes, not a hard compressed-wire quota. There is no paid API or dependency installation.

The retained-field policy is `ok-public-center-lookup-internal-selected-business-fields@1.0.0`, based on the existing [narrow public-lookup review](OK-SOURCE-USE-2026-09-09.md). This implemented internal projection is not a general website-copying or redistribution grant. Source-wide automated scope and redistribution remain unestablished. No public export is authorized.

## Versioned evidence and derivation

Each run creates `output/jobs/<run-UUID>/intent.json` before requesting the source. The intent pins the exact contract, policy, run/operation identity and execution mode. After source validation, `selected.jsonl` retains only these source business fields, when present: `vendorId`, `name`, `officialDoingBusinessAs`, `addressLines`, `facilityType`, and coordinate latitude/longitude. Missing versus explicitly null source fields remain distinguishable in the projection. Contacts, hours, subsidy status, distance, map center, narratives, arbitrary unknown fields and raw HTML are not retained.

Each source row has a contiguous one-based ordinal. Every row is preserved, including blank or repeated vendor IDs; no identifier-based merge is performed. Any home or unknown facility type rejects the entire response instead of publishing a hidden partial subset. Empty and cap-sized responses remain observations with unknown search/ZIP/state completeness, not proof of zero businesses or complete delivery.

`candidates.jsonl` records separate names/DBA, the conservative address parser's source lines and result, ZIP5 and separate ZIP4, numeric-range-checked points, and source-response provenance. Query ZIP is never substituted for a reported ZIP. Datum, accuracy, physical-address association, source-ID lifecycle and current operating status remain unknown. First/last seen both describe this observation, not the publisher's update time or historical opening date. These rows are not eligible for identity matching, verified physical sites, active-business totals or public export.

The final manifest, `ok-childcare-retained-search@1.0.0`, pins all three artifact hashes/counts and the request hashes/timestamps. It is atomically linked only after the files are complete. It reports source-ID collisions, ZIP matches/mismatches/unresolved counts, point availability, and explicit delivery uncertainty. The immutable source projection allows future local reprocessing without another source download.

An independent reader checks exact schemas, run/operation/path bindings, native-versus-synthetic mode, client pins, chronology, artifact hashes and roster, then recomputes every candidate and count from the selected rows. It rereads the manifest and checks every file's identity/size/timestamps after the bundle-wide read. This verifies retained projection integrity and derivation—not independent remote authenticity or the intentionally discarded original HTML. All output artifacts remain internal; the generic management artifact-download route exposes none of them.

## Cancellation and restart

Cancellation before accepted publication stops writes or the pre-commit boundary, leaving an intent and any partial artifacts for inspection, not an accepted manifest. Rejected diagnostic publication may finish after cancellation so its failure is recorded durably. The descriptor's cancellation flag is conservative for rejected diagnostic publication; managed cancellation always prevents operation success. Cancellation after accepted commit retains the descriptor, completes local verification and marks the operation for inspection.

On restart, the existing managed-operation ownership checks preserve completed evidence and classify interrupted work as failed or unknown. Unknown ownership blocks duplicate execution. There is no automatic retry or automatic continuation to another ZIP. A nonzero child exit, malformed descriptor, synthetic mode, hash/derivation failure or uncertain publication cannot become a successful acquisition.

## Integration boundary

An accepted run means an internal, replayable source-candidate observation. It does not publish a national registry release, update map shading, establish state completeness, renew an industry's sources or enable a scheduler. National reporting integration must select and pin an accepted retained operation and reuse it locally. It must not re-download merely to promote these candidates.

Rollback removes the new endpoint, bounded catalog entry, worker, contract and verifier while preserving all operation receipts and retained artifacts. Existing aggregate schema evidence and production releases are unchanged. The local Sites app architecture and hosting configuration are preserved; there is no hosted deployment or UI redesign.

## Native app handoff and verification

One native dispatch through the authenticated app endpoint returned HTTP 202 for operation `a5f5ca7d-89b7-450a-9278-3430b436aff6`. The app-owned worker and supervisor completed successfully. The operation receipt is `data/managed-operations/a5f5ca7d-89b7-450a-9278-3430b436aff6/receipt.json`, SHA-256 `039da807177ea10983facb33e3d9f9c3a713a960a46e962da013fba63fa3d405`.

Native collection run `4acdd407-ae61-43fb-ba66-6464f3a5a2a4` ran from `2026-09-10T16:10:14.448Z` to `2026-09-10T16:10:18.636Z`; its source observation time is `2026-09-10T16:10:18.534Z`. It made exactly three requests totaling 97,995 accepted decoded bytes. Manifest: `data/managed-operations/a5f5ca7d-89b7-450a-9278-3430b436aff6/output/jobs/4acdd407-ae61-43fb-ba66-6464f3a5a2a4/manifest.json`, SHA-256 `bd26af2f1f0e83358188fea44cd553ac7d4ed55f022943c57527f6f332fe074b`.

The selected and derived artifacts contain four source-candidate rows, four distinct nonblank source IDs, four reported ZIP matches and four numeric coordinate pairs in range; no duplicate IDs or unresolved address ZIPs were found in this sample. Coordinate validity does not establish datum, accuracy or premises association. No pagination metadata was detected; search/ZIP/state completeness remains unknown. These are not verified currently active unique businesses.

After the app completed and its validation server stopped, a separate process invoked the native-required reader with the exact operation/path/hash bindings. All selected rows, derivations, counts and artifact-integrity checks passed without source access. `selected.jsonl` is 1,133 bytes with SHA-256 `7cbae0b85fbdcfad2940b3f37f07efaffa57416eaf622310ca8366321c4b4ee7`; `candidates.jsonl` is 5,199 bytes with SHA-256 `2b44939e419311a82a2fcd5a04c872c13d6e2ab43d755e44e7cac16f6724492a`. The operation is complete, not an ongoing download awaiting an agent. Retained rows stay local and internal; only implementation and aggregate evidence documentation are committed to Git.

Full `npm run check` passed: 1,744 total tests, 1,733 passed, 11 skipped, zero failures, followed by lint, application builds and desktop smoke. Installed PDF/Iowa/retained-cohort/Overture-runtime prerequisite tests were enabled. Log: `data/tmp/ok-retained-collection-check.log`. Fourteen focused tests cover the new contract, fetch, retained replay and managed lifecycle; the existing control-plane suite also covers authentication on the new endpoint. TypeScript passed and the production dependency audit reported zero vulnerabilities. The reviewed pre-publication cancellation and cross-file mutation issues were fixed and regression-tested before native dispatch.
