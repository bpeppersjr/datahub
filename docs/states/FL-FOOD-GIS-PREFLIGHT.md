# Florida FDACS retail-food metadata prerequisite

Latest evidence: the integrator subsequently ran and independently verified one native metadata preflight. [Native receipt and publisher-documentation follow-up](FL-FOOD-GIS-NATIVE-EVIDENCE-2026-09-12.md) records exact hashes and the remaining FE_TYPE mapping gap. Earlier unrun statements below describe the implementation-time boundary, not the latest dated result. No provider/count query followed.

Version `fl-food-gis-preflight@1.0.0` is a standalone app-owned metadata service, not an establishment collector. It makes only three fixed requests: the official service, retail layer0, and that layer's iteminfo. No counts, record queries, feature-ID inventory, exports, permit account, payment or agreement are involved. Existing Florida corporate registry and earlier DBPR food-service source holds remain unchanged.

## Official source and scope

The [FDACS public map service](https://gis.fdacs.gov/mapping/rest/services/DFS/DFS_FOOD_SAFETY_FACILITIES_PUBLIC_VIEW/MapServer) describes FDACS-permitted food establishments. Its publisher-controlled host and service description establish regulator provenance. Service item ID is `bd0fc3c55cac44f3bbd5f3c81346b48a`; layer0 is [Food Entities - Retail](https://gis.fdacs.gov/mapping/rest/services/DFS/DFS_FOOD_SAFETY_FACILITIES_PUBLIC_VIEW/MapServer/0), layer1 Food Entities - Manufacturing. Service subject describes active inspected establishments, but that is a publisher scope statement, not measured operation/license status or currentness.

[Official retail-permit guidance](https://www.fdacs.gov/Business-Services/Food-Establishments/Retail-Food-Establishment-Permit) covers grocery/supermarkets but also convenience stores, bakeries, vending and other businesses. [Regulator guidance](https://foodpermit.fdacs.gov/Alerts/07092024-FoodPermitsandAlcoholLicenses.html) distinguishes FDACS permits from DBPR restaurant/catering licensing. Retail layer membership does not make every record a grocery store, exclude every mobile/home-related activity, or establish all Florida food establishments. This is a distinct newly inspected FDACS route, not an alternate-host workaround for previously denied DBPR pages.

`FE_TYPE` is an opaque string field of width5 with no coded domain. A grocery crosswalk is unresolved. `FE_DESCRIPTION` is used by the renderer for HIGH/MEDIUM/LOW RISK, not grocery/restaurant categories. The prerequisite rejects changed type domains or unexpected risk labels so they require explicit source-contract review. No type code is guessed from a name or incidental inspection report.

The metadata lists `FOOD_ENTITY_NUM` string8 (not demonstrated unique or permanent), entity name/address/city, `ZIP` string6 and `ZIP_PLUS4` string4. ZIP fields remain separate; width6 is not a claim that observed values are valid ZIP5. No state field, license-status/date, expiration or current edition clock is established. The displayed layer extent extends well beyond Florida; a4326 CRS declaration is not coordinate accuracy, correct state placement or a verified physical site. No coordinates are acquired or assigned by this service.

## Privacy and policy

The source schema also exposes operating hours, contact names/emails/phones, owner key/contact fields and an FDA workplan indicator. These are excluded from the proposed provider-field selection and never requested as records here. Metadata may name those fields but contains no acquired contact values. Raw metadata and receipts are internal; no public export is authorized.

The [layer iteminfo](https://gis.fdacs.gov/mapping/rest/services/DFS/DFS_FOOD_SAFETY_FACILITIES_PUBLIC_VIEW/MapServer/0/iteminfo) has empty licenseInfo/accessInformation. The contract binds that observed empty state and fails if it changes; emptiness is not permission for record acquisition or redistribution. This source policy authorizes only public metadata assessment. Applicable provider-data reuse terms and grocery subtype semantics remain unresolved before any inventory acquisition. Missing explicit terms are not a fabricated statutory ban, and a metadata success is not acquisition readiness.

## Bounded observations

On September12,2026, three capped official metadata GETs returned200 with normalized type text/plain. They used fixed observed URLs,15-second deadlines,1MiB caps and no redirects or cookies. No query endpoint was requested. These were source-contract inspections before implementation, not native service receipts. Raw bodies were inspected in memory, not saved as a dataset.

| Response | Bytes | SHA-256 |
| --- | ---: | --- |
| Service | 5408 | `c6c95670b1bed3eb89aeb93f7fb1b79435a6bc1ad0e378ef0e2a9507154180b3` |
| Retail layer | 13981 | `c20aa08dcf782cb2e8af3bad3913c3345020d2f89e8a79e9d3d5b9e24c651709` |
| Layer iteminfo | 341 | `1eccb49007c12cac16a9fba5fcc4b4b0ff30daa2c5fa5c9033bef1868b959f75` |

An ordinary web reader could not render the linked XML metadata content type; that was not a publisher access denial. It was not retried or used as a reason to query records. No sourcewide reuse license or field codebook was inferred from it.

## Standalone operation

```powershell
node scripts/preflight-fl-food-gis.mjs
node scripts/preflight-fl-food-gis.mjs --verify "C:\absolute\datahub\data\business-sources\fl-food\gis-preflight\jobs\<UUID>\manifest.json" --sha256 <hash>
```

No source/query/output overrides. Three requests maximum, sequential with at least1second between completed response and next start;15seconds per request,90seconds job/verifier,1MiB per response/3MiB total. Only documented ArcGIS JSON media types application/json and text/plain are accepted, with fatal UTF-8/JSON parsing and exact source/schema checks. Bounded normalized media types omit header parameters; no cookie/header logging. Zero retries/redirects.

UUID intent and request records precede source access. Receipts preserve exact policy and complete raw metadata with hashes; partial/over-cap buffers are not published as complete responses. The verifier checks fixed paths, source mapping, full result replay, recorded timestamps/durations/spacing, file hashes/identities and directory ownership, then rereads before returning. Manifest is published last after verification. Output fields preserve unresolved policy, grocery mapping, status/date and count explicitly; `metadataContractValidated:true` can coexist with `acquisitionReady:false`, null business counts and no current-operation/completeness claim.

The source lease key is florida-fdacs-food-gis. Exclusive lease creation and exact payload/identity comparison prevent takeover or deleting a changed owner. Cooperative cancellation releases ownership; noncooperative fetch/body cleanup is bounded and retains an inspection-required quarantined lease, including after late response disposal. Restart does not retry/take over. Postpublication errors preserve receipt identity with inspection required. Policy identity/hash is reread before publication; retained output stability is rechecked independently.

## Acceptance and next step

Tests use synthetic metadata and isolated data/tmp inputs; native verifier rejects fixture paths/mode. Proof includes positive lifecycle, media-type diagnostics, timing, source/schema changes, cancellation, concurrency, policy drift, publication recovery and tampering. Actual15/90-second timer expiration is not claimed from caller-abort fixtures. No native service run or establishment inventory has been dispatched during development.

Focused verification: 13 tests passed in approximately 13 seconds; ESLint passed for the contract, lifecycle, tests and CLI. Main application checks and native dispatch remain with the integrator.

Following review, the app can invoke this CLI and retain/replay the metadata receipt without Codex. Queue/UI registration remains the app lane. Next source work is a documented FE_TYPE codebook and precise record-use/status/edition contract. A separately reviewed minimized aggregate could then establish observed type distribution, but is not part of this service and must not silently become a feature download. National reporting/production enrollment remains untouched.
