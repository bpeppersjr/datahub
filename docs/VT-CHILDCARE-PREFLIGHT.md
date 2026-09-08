# Vermont childcare executable prerequisites

This metadata-only prerequisite prepares the Vermont `ctdw-tmfz` center cohort for a future app-owned connector. It does not acquire provider records, authorize record-level exports, start a recurring schedule or update national coverage. [Source discovery and aggregate observations](states/VT-CHILDCARE-METADATA-2026-09-08.md) establish why source period, home-provider exclusions and deliberately jittered coordinates require explicit handling.

## Contract

```powershell
node scripts/preflight-vt-childcare.mjs
```

The CLI accepts no source URL, query, credentials or scope overrides. Successful output identifies the new receipt path, byte size and SHA-256. Receipts live under `data/business-sources/vt-childcare/preflights`; the exported validator replays the selected evidence offline.

The fixed source is Vermont Child Care Provider Data, attributed to DCF Child Development Division, on `data.vermont.gov`. The proposed center cohort is `license_type='Licensed Provider' AND provider_program_type IN('CBCCPP','CBCCPP - Non-Recurring')`. Afterschool programs and registered/licensed family homes remain separately counted source categories, not inferred missing businesses.

The six-request sequence is metadata, reporting-file/program/license groups, center aggregate, center aggregate, groups, metadata. Paired evidence must agree. Selected schema, descriptions, publisher identity, ODbL notice and source clocks are validated before deriving readiness. The initial contract accepts one reporting file only; multiple periods must fail pending an explicit selection contract rather than mixing historical snapshots. A file name is preserved as source text, not silently promoted into a verified date.

Center counts and distinct non-null license counts must agree; group totals are conserved. Missing license start/end values remain visible in aggregates. A successful check confirms this source prerequisite, not unique identities, address verification or current-day operation. Monthly cohort semantics remain separate from catalog modification and observation timestamps.

## Privacy, transport and retention

Only selected catalog schema/semantics and bounded aggregate rows are retained. Catalog cached examples, personal/contact values and raw catalog bodies are discarded before receipt retention. Body hashes and projected-payload hashes are distinct: the receipt can replay the selected evidence but cannot reconstruct discarded HTTP bodies or independently attest publisher authenticity.

The source's latitude/longitude descriptions identify deliberate jitter. Those descriptions are readiness evidence; their point values are not requested or placed into exact-geocode fields. Owner/contact/person identifiers, home-provider records and mailing fields are outside record acquisition because this prerequisite acquires no provider records at all.

Requests are serial and paced, with fixed endpoints, finite byte/time/count limits, no redirects, endpoint fallback or automatic retries. HTTP deferral, malformed data, incompatible source changes or cancellation stop processing. Successful receipts are immutable UUID-scoped files within datahub, published only after validation. Existing receipts and production pointers are not replaced; uncertain publication requires inspection before any retry.

Limits are six requests, one-second spacing, 30 seconds per response and 120 seconds overall, 2,000,000 bytes per response and 20,000 source rows. Groups request page size 201 but accept at most 200; the aggregate requests two rows but must return exactly one. Unknown program/license combinations, duplicate groups and multiple reporting files fail rather than being ignored. Source-policy and connector semantic hashes are checked during acquisition/publication and against imported configuration during offline validation.

## Native verification — September 8, 2026

The fixed native transport completed all six requests and published `data/business-sources/vt-childcare/preflights/e18cf7b8-7283-4e3f-b2a7-c6955f268a40.json` (14,993 bytes; SHA-256 `145d13797929c02ede10dd40f4cfcddcf2a27d0a2bc6841816ceeca9cc7d5b1b`). Independent offline validation passed. Paired observations confirmed 503 center rows and distinct licenses within 1,057 total grouped rows; all 503 had license-start and license-end values. The reporting file remains `Provider_Report_07012026_08012026.xlsx`, with no inferred reporting date.

Readiness correctly remains `acquisition_ready=false`, `acquisition_authorized=false`, `app_enrolled=false`, and `scheduled=false`. No provider records were requested. The focused preflight, registry and management-security tests passed 14/14.

Full `npm run check` passed: 1,307 tests, 1,296 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Evidence: `data/tmp/vt-childcare-preflight-full-check.log`. Type checking passed, production dependency audit reported zero vulnerabilities, and all 82 pending production pins remained unchanged. The idle development service was restored after verification. This does not authorize or launch national production.

## Remaining acquisition work

The [subsequent selected-delivery review](states/VT-CHILDCARE-SELECTED-DELIVERY-2026-09-08.md) proved bounded POST field suppression and identified GET's unexpected system columns. It also distinguishes unknown reporting date/address role as retained quality gaps rather than collection blockers. Historical metadata-only receipts remain unchanged. The separate [bounded acquisition stage](VT-CHILDCARE-ACQUISITION.md), [normalizer](VT-CHILDCARE-NORMALIZATION.md) and [app lifecycle](VT-CHILDCARE-APP.md) provide the later stages; only a recorded operation proves app handoff.

A passing receipt alone is not a completed collection: the acquisition stage must run and verify, followed by postal normalization with separate ZIP5 and ZIP4, provenance and gap conservation, and app-worker enrollment. Retain ODbL attribution and source-policy separation; public combined exports require their own compatibility assessment. Do not use a provider's BFIS Person Record as a business identity or claim precise premises from jittered coordinates.

Rollback disables this prerequisite's future use while preserving earlier receipts. No existing source release needs to be downloaded again merely for downstream promotion.
