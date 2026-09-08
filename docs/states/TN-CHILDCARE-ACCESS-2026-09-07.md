# Tennessee childcare access validation — 2026-09-07

## Outcome and scope

An anonymous, queryable Tennessee state GIS source supports a bounded **center-only** connector. Observed center-filter count: **1,863 source records**, not verified unique businesses or an all-Tennessee childcare denominator. This is source validation only: no connector, enrollment, schedule, acquisition release or production pointer was changed. Existing historical holds remain unchanged.

Seven direct bounded HTTP GETs fetched layer/item/organization metadata, total count, category counts, filtered count, and exactly **one** privacy-selected center record. Each direct response was capped at 1 MB with a 30-second header/body timeout and redirects rejected. No IDs inventory, bulk download, account, bypass, contact fields, family-home addresses or group-home addresses were requested. Primary informational pages were also inspected. No runtime files were written.

## Primary evidence and publisher identity

- [TDHS Find Child Care](https://www.tn.gov/humanservices/for-families/child-care-services/find-child-care.html) links both a public locator and a provider-list document; its scope includes TDHS and TDOE options.
- [Official locator](https://onedhs.tn.gov/csp?id=tn_cc_prv_maps+) rendered only a loading shell in the text reader. No private endpoint discovery or authentication was attempted.
- [Provider-list README, revised November 15, 2024](https://www.tn.gov/content/dam/tn/human-services/documents/Agency%20WebProvider%20List%20README_2024-11-15.pdf) distinguishes street from mailing addresses and describes a monthly list with provider/regulator classifications. It also lists telephone/contact/regulatory-individual fields. The workbook was **not fetched**, avoiding unfiltered residential/contact ingestion.
- [Regulated-care definitions](https://www.tn.gov/humanservices/for-families/child-care-services/child-care-types-of-regulated-care.html) distinguish centers, family homes, group homes and drop-in centers. Treat these as separate source categories.
- [State STS-GIS](https://www.tn.gov/finance/sts-gis.html) identifies the state GIS program.
- [ArcGIS organization metadata](https://www.arcgis.com/sharing/rest/portals/YuVBSS7Y1of2Qud1?f=json): organization `YuVBSS7Y1of2Qud1`, name `State of Tennessee STS GIS`, URL key `tnmap`, with links back to state GIS pages.
- [Service](https://services1.arcgis.com/YuVBSS7Y1of2Qud1/ArcGIS/rest/services/Active_ChildCare_Locations/FeatureServer) and [layer metadata](https://services1.arcgis.com/YuVBSS7Y1of2Qud1/ArcGIS/rest/services/Active_ChildCare_Locations/FeatureServer/0?f=pjson).
- [Item metadata](https://www.arcgis.com/sharing/rest/content/items/bfe29552601b4d8793b1fba580c2e3fd?f=pjson): ID `bfe29552601b4d8793b1fba580c2e3fd`, owner `kwinchester_sts`, matching organization, public access, Feature Service, title `Active Statewide Childcare Locations`, credit to TN Department of Human Services. Item URL points to the same service (lowercase `arcgis` path spelling).

The item describes a monthly DHS-derived active-location extract, excluding education-department facilities and records under review; STS-GIS identifies DHS as data owner. This is narrower than the official locator and workbook. Crucially, aggregate inspection also found one Authorized Provider outside the item's stated childcare-only scope: **never rely on the service title/description as a row filter**.

## Observed metadata and category counts

Layer ID `0`, name `Active_ChildCare_Master`, Feature Layer, object ID `OBJECTID`, point geometry, WKID/latestWKID `4326`, capabilities `Query,Extract`, maxRecordCount `2000`. Statistics, ordering, pagination and aggregate pagination are advertised. No attachments; `hasMetadata=true` (raw metadata XML not fetched or validated in this task).

All three editingInfo epochs were `1788460779896` = `2026-09-03T18:39:39.896Z`; item modified `1788460782000` = `2026-09-03T18:39:42.000Z`. These are service/item change observations, **not** license dates, a certified publisher snapshot date, or operating-business freshness proof.

Count query: `/0/query?f=json&where=1%3D1&returnCountOnly=true` returned 2,304. A bounded count aggregate grouped by `Provider_Status,Provider_Type,Child_Care_Type` returned:

| Status | Provider type | Childcare type | Rows |
|---|---|---|---:|
| Active | Child Care | Child Care Center | 1,863 |
| Active | Child Care | Drop-in Child Care Center | 9 |
| Active | Child Care | Family Child Care Home | 148 |
| Active | Child Care | Group Child Care Home | 283 |
| Active | Authorized Provider | empty string | 1 |

These five groups sum to 2,304. No names or addresses were included in aggregates. Initial connector scope excludes all four non-center groups, including drop-in centers; any later expansion requires a separately versioned scope.

## Fixed request/field contract to implement next

Proposed dataset `tn-dhs-active-childcare-centers`; fixed layer above and exact SQL:

```sql
Provider_Status = 'Active' AND Provider_Type = 'Child Care' AND Child_Care_Type = 'Child Care Center'
```

Server-side filtered count returned 1,863. Never accept caller URL/SQL or `outFields=*`.

Selected field catalog (all domains null): `OBJECTID` esriFieldTypeOID, nullable false; `Provider_ID` esriFieldTypeInteger, nullable true; the following ten are esriFieldTypeString, length 8000, nullable true:

`Provider_Status, Provider_Type, Child_Care_Type, Provider_Name, Street_Address, Street_Address_2, City, State, Zip, County`.

One request used exactly those twelve fields, the fixed filter, `returnGeometry=true`, `outSR=4326`, `orderByFields=OBJECTID ASC`, `resultRecordCount=1`. It returned one center with provider ID, name, premises street/city/state, ZIP5, county, null second street line, and numeric point coordinates. ZIP+4 presence is **not established** by this sample. Its `exceededTransferLimit=true` is expected for this deliberately truncated inspection; production batch acquisition must not accept truncated responses as complete. The sample is not duplicated into this document or a runtime artifact.

Normalize ZIP5 as a five-character string and ZIP4 as separate nullable four-character string when explicitly supplied; do not enrich/guess ZIP4. Preserve provider ID as a typed source identifier, never a license number without supporting evidence. Retain source status literally and interpret it only as inclusion in the publisher's active-center extract. No ownership, chain affiliation, capacity, license issue/expiry dates or operating verification are supported by this layer's selected schema. Canonical businesses get latitude/longitude only, not polygons/GeoJSON; source point evidence remains immutable upstream. County is a source label, not verified county-boundary membership.

## Implementation gates and standalone handoff

1. Metadata-only preflight pins item/organization/service identity, selected schema, query capabilities, point CRS and exact filter. Preserve full metadata and terms, including raw publisher metadata if available, without executing XML. Reject schema/identity drift or changed category scope.
2. Acquire fixed-filter count and ID inventory, then bounded ordered ID batches; repeat IDs/count and stable item/layer metadata after acquisition. Require exact memberships, no duplicate/omitted rows, unchanged editingInfo, exact selected scalar fields and point shape. Retain full selected-response evidence. Suggested ceilings: 20,000 rows, 100 IDs and 2,000 URL bytes per batch, 8 MB/response and 100 MB cumulative selected JSON.
3. Cancellation covers headers/body/pacing/retries and filesystem publication. Suggested rate is one request per second, three transient attempts, 30-second request timeout; Retry-After above 60 seconds defers the job. These are conservative app limits, **not** a publisher rate promise.
4. Quarantine absent/invalid premises details, non-TN state, invalid postal values, or implausible coordinates; reject nested/private fields or scope drift before retaining business payloads. Missing geocode must remain missing, not trigger hidden paid geocoding. Offline tests cover home-type leakage, private-field injection, nullable fields, ZIP split, truncation, mutation during pagination, cancellation, retries and immutable release replay.
5. Source-record-scoped provisional site and establishment evidence only; preserve publisher observation separately from ingest time. No automatic matching or nationwide denominator/completeness claim. After verified connector/policy/release code exists, Co*Tive's own worker handles future downloads without an active AI task.

## Policy and remaining gaps

Item terms disclaim accuracy/fitness, put verification responsibility on the user, and include an as-is/liability notice. Public accessibility and `Extract` capability are **not** legal approval or an unrestricted redistribution license. Proposed initial profile: local governed review, retain attribution and full notices, no public export until the application policy explicitly authorizes it. No legal determination was made.

There is no technical access blocker for bounded connector implementation. Remaining gates are full metadata/terms retention, policy implementation, stability checks and offline tests—not another ZIP-by-ZIP search or an account. This source cannot establish coverage of TDOE facilities, pending/review records, excluded care types, verified open businesses, or all Tennessee childcare licenses. All readiness flags remain false until implementation and verification: `connector_ready=false`, `scheduled=false`, `export_authorized=false`.
