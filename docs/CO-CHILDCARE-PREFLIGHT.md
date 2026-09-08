# Colorado licensed-center preflight

This standalone prerequisite validates Colorado's public metadata and aggregate counts without fetching individual facility records or a license-ID inventory. It is not a business acquisition, industry enrollment, scheduled refresh, or national reporting promotion.

```powershell
node scripts/preflight-co-childcare.mjs --help
node scripts/preflight-co-childcare.mjs
node scripts/preflight-co-childcare.mjs --verify <absolute-receipt-path>
```

## Pinned source contract

The fixed source is CDEC dataset `a9rr-k8mu`, with the exact source description/disclaimer, owner, PDDL license metadata, 27 non-system field types and selected field descriptions in `config/co-childcare-source-contract.json`. A native metadata inspection at `2026-09-08T21:39:17.771Z` returned 79,475 bytes, raw SHA-256 `aeed8d74a82ea2e87b93299406280fa6b164ba8a6a43d683c1a72a76bab626af`; this preliminary inspection did not save raw metadata or provider samples and is not the immutable preflight receipt.

The initial cohort is exactly `provider_service_type = 'Child Care Center'`. Preschools, school-age centers, homes and other categories remain separately counted, not silently included. Provider licensing identifiers are not canonical business IDs. Source physical-address descriptions are retained without claiming independently verified sites or USPS assignments. The current schema contains no coordinates. Quality-rating dates are not license dates; unknown operating status and missing geocodes remain explicit gaps rather than fabricated values or artificial permission barriers.

PDDL permits reuse of covered rights, and the dataset notice disclaims accuracy/currentness and endorsement. This metadata-only policy does not implement facility acquisition or record export; those need their own tested connector and field-handling behavior, not a new legal agreement invented from the disclaimer. Preserve source attribution and all relevant notice text in the projected receipt. [Discovery evidence](states/CO-CHILDCARE-ACCESS-2026-09-08.md) remains historical context.

## Lifecycle and evidence

The six-request sequence pairs metadata, category groups and a center-only aggregate, then repeats in reverse order. Strict field/type/category/count checks reject drift. Nonnull address/ZIP/state counts are availability metrics, not validity or completeness proof. No cached provider sample or contact metadata is retained; raw HTTP hashes cannot reconstruct or independently authenticate discarded bodies.

Requests are serial, spaced at least one second apart, with two-million-byte response limits, 30-second request deadlines and a two-minute cooperative overall deadline. No redirect, credential, retry, endpoint fallback or account workflow is supported. Cancellation reaches pacing, headers, bodies and receipt publication. Unique immutable receipts remain under `data/business-sources/co-childcare/preflights`; no current pointer is replaced. Uncertain committed publication must be inspected, not blindly retried.

Offline verification checks the exact supported receipt contract and configuration, observation order, checksums of projected payloads, source clocks and count conservation. A preflight receipt proves only this bounded metadata/aggregate check. Next: selected-delivery validation, bounded acquisition, source-candidate normalization with split ZIP fields, then an accepted Co*Tive job and persisted handoff receipt. Rollback disables future preflight invocation while preserving existing receipts; it does not require deleting source data or changing production pins.

## Native preflight and offline replay — September 8, 2026

The standalone command completed six requests from `2026-09-08T21:44:44.238Z` through `2026-09-08T21:44:50.985Z`. It published `data/business-sources/co-childcare/preflights/4a754961-2b4e-480e-8eb3-958d6b4b4132.json`: 18,972 bytes, SHA-256 `1c208a4aef4a70cdca779f35ddb6f9313d580c5bb4eb5d74c2fd4153f040ba09`. A separate CLI `--verify` succeeded offline against that exact receipt.

Paired observations agreed on 4,528 total source rows and 1,648 center rows with 1,648 distinct license numbers. Nonnull address, ZIP and state counts were each 1,648; these are not field-validity or geographic-assignment checks. Source clocks were rows updated `2026-09-01T15:56:30.000Z`, view modified `2026-09-01T15:56:21.000Z`, and publication `2026-07-01T16:07:23.000Z`; none is an inferred license or operating date. The receipt retains no facility rows or identifier inventory and enables no app enrollment or schedule.

Semantic configuration pins (SHA-256 of `JSON.stringify` applied to parsed JSON): source contract `0093268d1148b81254fc571d5c568dfc56fc7aa3597fe786c91d1d12e957c700`, connector `dc8fd195d0e147942f17392aaa557458347ee23fcc096c0b0f3d51c0ee654e7c`, policy `cc0ce2a2915eff37f0077b6226fb6f45f2d7ef450ba764de0ee93676661e14c4`. Counts and update timestamps are observations, not permanent contract pins.

### Selected-delivery follow-on contract

Read-only implementation review recommends fixed GET selection of the nine configured fields, ordered by `provider_id ASC`, with bounded offset pages. Before fixing scalar validation, a bounded selected-field diagnostic must establish actual JSON representation of numeric license IDs and capacity, omission/null behavior and suppression of extra fields. Metadata alone does not establish string-versus-number serialization or integer grammar. Do not copy Vermont's all-string/SODA3 POST assumptions. Compare validated integral IDs numerically without precision loss, preserve original source values and reject ambiguous identity representations; do not infer a canonical business identity.

The eventual collector should pair full preflights around baseline-ID, selected-record and final-ID traversals, reconcile exact counts/order/membership and require an empty terminal page for each. Reconcile nonnull address/ZIP/state counts without treating blank strings as null. Journal prerequisites and observations before advancing. Missing or unusable postal/address/capacity data remains a quality gap, while unsafe identity or malformed delivery fails the acquisition contract. This describes subsequent work only: neither a selected-record diagnostic nor these traversals was run by the preflight implementation.

## Implementation verification

Three runtime test groups and three CLI groups passed, including successful offline CLI replay with a no-network process trap, malformed/oversized/aliased input rejection, changed schema/notice/count/claims, cached-value exclusion, immutable publication and noncooperative header/body cancellation. Seven registry tests passed. Independent read-only review found no remaining concrete blocker.

The first full check exposed stale management security-test inventory expectations (67 connectors / 54 policies rather than 68 / 55). Only those expected counts were updated; all three security tests then passed. The initial log remains `data/tmp/co-childcare-preflight-full-check.log`.

The corrected full `npm run check` passed: 1,348 tests, 1,337 passed, 11 skipped and zero failed; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/co-childcare-preflight-full-check-2.log`. Type checking passed and the production dependency audit found zero vulnerabilities. All 82 pending production pins remained unchanged. Both app queues were confirmed empty before stopping the development service for desktop verification; the service was restored afterward. No facility acquisition, refresh schedule or national production launch was submitted.
