# Maryland licensed-center acquisition

This stage implements bounded acquisition and immutable retained evidence for the literal `Provider_Type='Child Care Center'` subset. It is not yet a normalized business dataset or an app-enrolled download job. The publisher cohort date remains February 13, 2026; acquisition and source edit timestamps do not establish current operation.

## Source contract and scope

The separate acquisition policy permits bounded internal source-candidate retention under the public item's distribution notice. The existing metadata-only preflight remains unchanged. Full item metadata and notices accompany evidence unchanged; selected layer schema is explicitly a projection rather than full layer metadata. See [verified prerequisite and public-use context](MD-CHILDCARE-PREFLIGHT.md).

Only nine source attributes are requested: `OBJECTID`, `Facility_Name`, `DBA_Name`, `License_Number`, `Provider_Type`, `Street_Address`, `City`, `State`, and `Zip_Code`. Phones, household-provider categories, duplicate `USER_*` fields and unnecessary geocoder attributes are excluded. Missing reported names, addresses, states and licenses remain evidence gaps rather than silently removed rows. Neither names nor licenses establish unique-business identity.

The source `Zip_Code` integer is retained as supplied. Later normalization must produce separate ZIP5 and ZIP4 fields; it cannot populate ZIP4 from geocoder `PostalExt`. Source points are requested using `outSR=4326`, and response/point coordinate references must agree. Only point coordinates are requested for businesses, never polygons. A returned point is not verified address accuracy, premises status or Census polygon membership.

## Acquisition and durable reuse

The bounded sequence uses an initial preflight, baseline ID inventory, sorted ID batches, final inventory and final preflight. This follows the [ArcGIS query contract](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/) for retrieving IDs and then subsets of matching features. Every batch is checked against its requested membership; final inventory and preflight must reconcile before publication. Stable observations are not transactional snapshot isolation.

Requests are serial with one-second minimum spacing. Limits cover all acquisition and preflight requests: 220 requests, 150 million decoded response bytes, eight million bytes per record page, two million bytes per other response, 100 IDs per batch, 4,000 URL bytes, 20,000 source rows, 30 seconds per request and a 15-minute cooperative whole-operation deadline. No automatic retries or fallback endpoints are used. Available RAM does not increase publisher request rates.

The immutable writer requires at least 500 million observed free disk bytes; this is a prerequisite, not a disk reservation. It retains and verifies the initial preflight before requesting IDs and awaits each observation journal before the next request. Output-root ownership excludes overlapping writes to the same destination. A future app worker must supply publisher-wide exclusion across destinations.

Completed acquisitions have UUID-scoped manifests under `data/business-sources/md-childcare/acquired/jobs`. Manifests are published last and bind evidence, prerequisite and journal hashes. Offline verification replays scope, membership, chronology, budgets and source configuration; merely rehashing a changed file cannot substitute for semantic verification. Native and injected-test modes remain separate and linked consistently; recorded native mode is not independent network attestation.

```powershell
node scripts/verify-md-childcare-acquired.mjs --manifest <absolute-retained-manifest>
```

No acquisition is performed by this verification command. The library entry points `buildMdChildcareAcquiredRelease` and `buildMdChildcareAcquiredReleaseWithTransport` distinguish fixed native collection from synthetic transport. A verified retained acquisition can later feed normalization without another download.

Cancellation aborts transport/pacing and drains retained writes before ownership is released. Only owned incomplete cancellation output is eligible for cleanup. Ordinary failed journals remain inspectable; uncertain publication is preserved and reported, not blindly retried. Prior releases and unrelated files remain untouched. Partial journals are not an automatic restart/resume promise.

## Remaining app handoff

Normalization must preserve raw provenance, nullable coordinates, separate ZIP fields, source/license distinctions and missing-field reasons. The subsequent app wrapper must implement fixed native and retained modes, publisher-wide exclusion, durable terminal receipts and managed cancellation. Only an accepted Co*Tive operation ID plus persisted receipt completes the download handoff; agent development or synthetic tests are not proof of a live collection.

Rollback disables future use of this acquisition module and contract while retaining existing immutable evidence. No current-source or national production pointer is modified by this stage.

## Delivery-envelope validation — September 8, 2026

A single bounded center-response sample at `2026-09-08T19:08:27.551Z` returned 1,832 bytes and one source record. Only envelope, field-schema and coordinate-key metadata were inspected; facility values were not retained as acquired evidence. The sample's `exceededTransferLimit=true` is expected for its one-record diagnostic limit and is not acceptable for a complete acquisition batch. A separate `where=1=0` check at `19:08:41.182Z` returned 131 bytes and zero records to confirm the `uniqueIdField` metadata. A zero-result ID-envelope check at `19:10:26.016Z` returned 49 bytes: the exact `objectIdFieldName=OBJECTID` and empty `objectIds` array, without obtaining an actual source inventory.

Observed delivery uses `OBJECTID`, `uniqueIdField={name:OBJECTID,isSystemMaintained:true}`, an empty global-ID field name, and EPSG:4326 in both `wkid` and `latestWkid`. Selected field metadata uses exact name/alias, `sqlTypeOther`, null domain/default value and length 8000 for strings only. Feature attributes contain the exact nine selected fields; points contain `x`/`y`. Tests model this observed envelope rather than a narrower invented fixture. These checks are source validation, not a managed bulk job or a retained release; no sampled record is counted as collected coverage.

Eight focused acquisition/storage test groups passed using synthetic transport. They cover 101 source rows across two 100-ID-bounded pages, repeated license preservation, null addresses/points and finite coordinate anomalies, schema/privacy/CRS/transfer-limit rejection, rehashed evidence tampering, noncooperative transport cancellation, drained hooks, durable prerequisite/page ordering, output-root exclusion and offline verification. Publication fault injection confirms that a postcommit unlink failure with concurrent cancellation preserves ambiguous output and reports it for inspection rather than claiming a clean rollback. The independent reviewer checked the repaired field-length validation and found no remaining concrete blocker.

The full `npm run check` passed: 1,280 tests, 1,269 passed, 11 explicitly skipped and zero failed, followed by lint, builds and desktop control-plane smoke. Type checking passed; the dependency audit returned zero findings after the separately documented CSV parser fix. Registry inventory is 61 connectors and 52 source-policy profiles. All 82 pending production implementation/script/source pins remained unchanged; no claim is made that the upgraded dependency environment is identical. Log: `data/tmp/md-childcare-acquisition-full-check.log`.

This release contains no native bulk acquisition or app operation. Source validation sampled one center response without retaining its record values; all full acquisition/storage tests used synthetic transport. Normalization and managed worker enrollment remain required before production collection and coverage claims.
