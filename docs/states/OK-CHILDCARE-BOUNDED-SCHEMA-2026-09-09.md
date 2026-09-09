# Oklahoma childcare bounded schema prerequisite

This implements a standalone application-code prerequisite, not a statewide collector or managed-queue enrollment. It follows the [published filter contract](OK-CHILDCARE-FILTER-CONTRACT-2026-09-09.md) and [narrow source-use assessment](OK-SOURCE-USE-2026-09-09.md). No source records are committed to Git.

## Observed delivery

At 2026-09-09T05:47:43.093Z, one native GET of the ordinary [center-only ZIP 73102 search](https://childcarefind.okdhs.org/providers?zip-code=73102&facility-type=childcare-center) returned HTTP 200, 28,961 decoded bytes and SHA-256 `92f04caba0920767ad20c26826b1cad22608998098c29e6027bc1d6c2477ffad`. This diagnostic capped the body at 1 MB, rows at 100 and request time at 20 seconds, rejected redirects and inspected only inert JSON in memory. It did not execute scripts, request maps, follow provider details or save the HTML/provider values. The already inspected shared client was rechecked immediately beforehand and its published hash was unchanged.

The `/providers` payload contained `childcareProviders`, `mapCenter` and `route`; its query keys were `zip-code` and `facility-type`. Four rows were delivered, all with `facilityType` equal to the published center value. All four had these top-level shapes:

| Field | Observed type |
|---|---|
| address, facilityType, name, officialDoingBusinessAs, vendorId | string |
| addressLines, hours | array |
| coordinates | object |
| distance | null |
| isSubsidyAccepted | boolean |

These are delivered source rows, not independently verified active businesses. No dedicated license/status/update or ZIP5/ZIP4 fields were present in that top-level schema. Embedded address strings need a separately verified parser; do not infer ZIP equality from the submitted search or invent ZIP4. Coordinate members, datum, accuracy and address matching were not established by this diagnostic. No pagination or statewide completeness claim follows from four results. The raw body was deliberately discarded, so its checksum identifies the transient observation but does not support later replay of its provider values.

## Executable prerequisite

`node scripts/probe-ok-childcare-schema.mjs --help` is offline. With no arguments, the CLI performs a fixed three-request itinerary: pinned shared client, the one fixed center/ZIP HTML, then the same pinned client. It does not accept alternative URLs, ZIPs, paths, credentials or retries. Request limits are 20 seconds and 1 MB each, with a 90-second overall deadline and a 100-row cap. The byte/hash pin prevents using a changed client contract silently. HTML is parsed as inert data, never evaluated; there are no browser, geocoder, map or detail requests.

Receipts contain known field/type counts, aggregate type/point observations, fixed request URLs, timestamps and checksums. Unknown field names and all provider values are excluded. Synthetic transport evidence is explicitly labeled and stored under `data/tmp`, separate from native evidence under `data/business-sources/ok-childcare/schema-probes`. Only unchanged, process-issued receipts can be persisted. Publication uses unique run directories, bounded ownership-checked I/O and an atomic no-overwrite manifest. Cancellation before publication prevents commit; after publication the CLI finishes local verification and reports that cancellation arrived late. Uncertain published evidence supplies a recovery reference and must be inspected, not automatically retried.

## Remaining work and proof boundary

The executable native prerequisite completed at `2026-09-09T05:52:11.052Z` as run `28593b49-d3bf-47f2-be3e-b38bc867afb1`. Its manifest is `data/business-sources/ok-childcare/schema-probes/28593b49-d3bf-47f2-be3e-b38bc867afb1/manifest.json`, SHA-256 `98caee9ce4f71b97d80e3a09b7877fe8e9494e5f8b073a4aaba2d9b8e2dfe556`, independently reread through bounded ownership-checked I/O. All three requests completed with HTTP 200, both client pins matched, and the results-body hash matched the earlier diagnostic. It observed four center rows, no unknown top-level row fields, and four coordinate objects with finite `latitude`/`longitude` in numeric geographic ranges. This adds coordinate-member shape evidence, not datum, accuracy or geocoding validation. The immutable receipt explicitly leaves collection readiness, active status, statewide completeness, public export and app enrollment false. No routine download loop was started.

This CLI is reusable Co*Tive code and does not require an AI model, but is not yet enrolled in the management queue or a refresh schedule. A CLI run ID is not a managed operation ID. Before handing routine acquisition to the app, add operation-bound output verification and queue integration, then validate source-wide limits/coverage, address parsing, identifiers and temporal semantics. Do not run a ZIP sweep from this prerequisite. Retain unknown currentness and coverage explicitly; unknown quality does not mean zero businesses.

No protected production plan, acquisition configuration or national pointer is changed. No production acquisition or public export is authorized by this prerequisite. Rollback is reverting the new module, receipt layer, CLI, tests and this note; preserve any previously published manifests as evidence.
