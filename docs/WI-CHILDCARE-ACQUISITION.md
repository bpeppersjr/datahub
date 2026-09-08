# Wisconsin selected-record acquisition contract

This increment implements the offline replay and query-building core for a future app-owned Wisconsin licensed-group childcare collector. **It is not a network downloader, CLI acquisition command, installed worker, schedule, normalized release or acquisition authorization.** No Wisconsin facility rows were fetched to build or test it.

## Source-use decision and policy binding

`config/source-policies/wi-childcare-local-review.json` records the publisher, selected fields/category, attribution, retention, field export boundaries, privacy constraints and exact retained notice/XML fingerprints. Its acquisition authorization remains false. The user has been asked whether Co*Tive may collect the selected data for internal/local-review use under the publisher's notice; no answer or agreement acceptance is inferred.

The retained notice says use constitutes acceptance of its conditions. It includes liability/warranty exclusions, possible staleness, restrictions on endorsement, Wisconsin governing law and third-party rights; the layer notice excludes legal/engineering/surveying reliance. No payment, account or explicit defense/indemnification requirement was found in that retained material. This differs from Michigan's wording but does not itself grant permission or establish legal approval. The original public source remains [Wisconsin DHS GIS](https://data.dhsgis.wi.gov/pages/gis-data-disclaimer).

`validateWiSourcePolicy` first reconstructs the complete v1.1 preflight, then checks the service-item, layer-item and iteminfo notice strings as UTF-8 SHA-256, the entire disclaimer-card array as JSON SHA-256, and exact raw XML SHA-256. It returns the installed policy's fingerprint and false authorization flags. Changed terms require renewed review; policy hashes do not substitute for an operator decision. Actual retained receipt `ee0e8dca-5843-4867-a20f-78cf75b13e67` passes this comparison. Synthetic notices do not.

## Offline acquisition evidence

`runner/wi-childcare-acquisition.mjs` supplies:

- Fixed selected-ID and feature URLs. Feature queries use only the 12-field business/address allowlist, exact LICENSED GROUP selection, EPSG:4326 point output, no Z/M and no quantization, generalization or precision reduction.
- Strict source OID inventory checks and deterministic sorted batches, at most 100 IDs and 2,000 URL bytes. A state view is collected once, not once per ZIP.
- Exact field membership/type/length checks, selected category/state checks, optional returned schema checks and rejection of contacts, other extra fields, transfer-limit flags, missing/duplicate/substituted IDs or conflicting CRS.
- Replay of before/after metadata/count/notice/XML evidence, before/after ID inventories, request URLs, observation times and payload hashes. Each response is bounded by eight million claimed/serialized bytes; both cumulative measures are bounded by 100 million bytes. These are offline evidence ceilings, not an implemented streamed HTTP budget.
- Nullable point evidence for missing/empty points, out-of-world-range coordinates, `(0,0)` and a deliberately padded Wisconsin plausibility envelope (longitude -94 to -86, latitude 42 to 48). This envelope is not a governed state polygon or address verification. Partial/nonnumeric points, rings, Z/M or incompatible spatial references are rejected. Source features remain intact even when derived coordinate pairs are null.

Replay requires exact paired metadata/count and ID inventory consistency, not a claimed transactional snapshot. Hashes prove retained-evidence consistency, not publisher authenticity. `reported_successful_response_bytes` is explicitly unverified caller-reported transport accounting; `serialized_payload_bytes` is independently recomputed from retained payloads. It never grants acquisition/export/legal approval and does not enforce a caller-supplied policy. A future live dispatcher must use the installed policy check before requesting rows.

Source strings, leading-zero provider/location/facility IDs, padded names and nullable fields are retained unchanged. Raw source `ZipCode` may contain a combined value because raw evidence must remain faithful. **No normalized dataset is emitted here.** The subsequent normalization step must emit separate ZIP5/ZIP4 fields and reasoned unavailable values; it must not infer a ZIP, county, address, parent or operational status from the point or source inclusion. Only latitude/longitude belongs on normalized business entities; raw source point evidence is separate.

## Remaining work

Follow-up: [offline normalization is now implemented](WI-CHILDCARE-NORMALIZATION.md), including separate ZIP5/ZIP4 and accepted/quarantine conservation. The first increment's scope above remains historical; no actual normalized source release or live downloader has been published.

Obtain the source-use decision without accepting an agreement on the user's behalf. Then implement bounded network acquisition with provider pacing, retries, cancellation, cumulative streamed budgets and retained run evidence; normalize postal values and entities; verify immutable releases and failure cleanup; enroll the complete connector in Co*Tive. Only after an actual app operation/receipt handoff should agents leave downloading to the app. Existing retained national and Tennessee data must not be repulled for this work.

## Verification and rollback

Eight new offline tests cover exact source ID reconciliation and ordering, preserved source values, fixed private-field exclusions, batch limits, missing/duplicate/substituted IDs, scope/CRS/metadata drift, spoofed evidence, point-quality reasons, optional schema mismatches, policy rejection and cancellation. Existing preflight fixtures now live in `runner/fixtures/wi-childcare.mjs`; they remain synthetic and contain no actual facility records. No fixture is a source release.

The full `npm run check` attempt ran 815 tests: 814 passed and the known preview-conflicting lifecycle test failed. After the build and graceful preview stop, the two lifecycle tests plus all 22 Wisconsin tests passed together (24/24); desktop smoke passed and the preview was restored with HTTP 200. This is combined evidence for 815 tests, not a single clean full-check exit. Lint, TypeScript, final web/desktop builds and production audit passed (zero reported vulnerabilities). Logs are `data/tmp/wi-acquisition-full-check.log`, `wi-acquisition-focused-check.log`, `wi-acquisition-desktop-check.log` and `wi-acquisition-final-build.log` in the same directory. Parallel read-only review tightened returned field domain/default metadata and made unverified transport-byte reporting explicit. The actual retained metadata receipt passed the installed policy's fingerprint check while returning acquisition/export/legal approval false.

Rollback removes the new development policy and offline acquisition module/tests, restores inline preflight test fixtures if desired, and retains historical live metadata receipts. This changes no source pointers, business records, schedules or production-pinned modules.
