# Nebraska source follow-up — 2026-09-09

## Decision

**Authoritative statewide childcare service resolved; suitable for a bounded source-contract preflight, not yet an acquired or current-business cohort.** This advances the catalog-discovery limitation in `NE-CHILDCARE-TRIAGE-2026-09-08.md`. No runtime, connector configuration, production plan, enrollment, or coverage count is changed by this note.

The official NebraskaMAP browser was available in this pass. Searching its catalog for `child care` returned the actual DHHS dataset. This is stronger publisher evidence than a search-engine match with a DHHS-like title.

## Publisher and delivery chain

1. [DHHS parent information](https://dhhs.ne.gov/Pages/Search-for-Child-Care-Providers.aspx) links NebraskaMAP as a public data route for licensed childcare. It separately documents reCAPTCHA for the license search; that search is not an automated fallback.
2. [Official catalog search](https://www.nebraskamap.gov/search?q=child%20care) exposed [DHHS Licensed Child Care](https://www.nebraskamap.gov/maps/d3d3f44cb252424fb2f76e27162f534c), attributed to DHHS Public Health Informatics. The other result concerned residential child-caring agencies, a different industry cohort.
3. [Item metadata](https://www.arcgis.com/sharing/rest/content/items/d3d3f44cb252424fb2f76e27162f534c?f=pjson) returned HTTP 200, 3,004 bytes. It identifies owner `Builtin_User`, organization `Sj9eBhzWwOMzQCfI`, attribution `DHHS DPH Licensure, DHHS GIS`, and the service below. The official catalog-to-item-to-state-host chain establishes publisher context; the generic owner name alone does not.
4. [State-hosted service metadata](https://gis.ne.gov/Agency/rest/services/DHHS_Licensed_Child_Care/FeatureServer?f=pjson) returned HTTP 200, 4,744 bytes. It describes statewide licensed childcare/preschools sourced from static licensure lists, exposes layer 0, Query/Extract capability, and a 2,000-record response limit. Its internal service item ID is `4fce65a576fd49489db42f49b669fc79`, distinct from the public catalog item ID; preserve both rather than treating them as identical.
5. [Layer 0 metadata](https://gis.ne.gov/Agency/rest/services/DHHS_Licensed_Child_Care/FeatureServer/0?f=pjson) returned HTTP 200, 32,788 bytes. Only metadata was explicitly requested through the terminal: no feature query, count, ID inventory, or export.

Each terminal request rejected redirects, had a 15-second timeout and 1 MB response cap, and examined its response in memory. No metadata response file was saved. Browser navigation briefly reached the publisher's normal map explorer before following the details link; this note does not claim the browser performed zero background map requests. No provider table, download button, record popup, login, agreement, purchase, or CAPTCHA was used.

## Observed schema and limits

Layer 0 is a WGS84 (`4326`) point layer with `OBJECTID` as its object-ID field. Selected available fields are `Full_Name`, `License_Type`, `License_Number`, `Address`, `Address_2`, `City`, `State`, `County`, `Zip_Code1` (double), `Zip4` (string), `Issue_Date` (date), `Roster_Date` and `Geocoded_Date` (date-only), and `GIS_Status`. Pagination and ordered queries are advertised.

Exact ArcGIS types: `OBJECTID` is non-null `esriFieldTypeOID`; `Zip_Code1` is nullable `esriFieldTypeDouble` with default 0; `Issue_Date` is nullable `esriFieldTypeDate`; the two date-only fields are nullable `esriFieldTypeDateOnly`. All other selected fields above are nullable `esriFieldTypeString`, length 255. These selected fields have null domains; the named type templates are not coded-value domains.

Type templates distinguish `Child Care Center` and `Provisional Child Care Center`; family homes, preschools, and school-age centers have separate types. Templates are not an observed record inventory. There is no explicit license-status or expiration field in the inspected field roster. No layer `editingInfo` was returned. License-number uniqueness, address role, geocoding accuracy, record counts and actual date values remain unverified. Do not interpret GIS status as operating status or use `OBJECTID` as a permanent business identity.

## Policy and temporal evidence

The item notice describes data intended for DHHS GIS applications and public use through NebraskaMAP, warns that it can change without notice, and calls for caution during scheduled updates. Item documentation describes monthly processing around the 15th, with caution through the 17th; service documentation instead says updates are as needed. Retain both statements rather than resolving that discrepancy by assumption.

The rendered item displays an information/data update date of October 16, 2024. That is not proof that every current record dates from 2024, nor evidence of a current 2026 release. Actual `Roster_Date` values require separate validation. Licensing evidence is not independent confirmation that a business is currently open.

The catalog item's exact `modified` value is `1729097929000` (2024-10-16T16:58:49.000Z). The explorer labels its data update as October 16, 2024 at midnight CDT; do not collapse that UI date into the item timestamp. No current layer data-edit timestamp was established. The item notice did not expose a third-party/user-added data caveat; this is an observation of that notice, not a guarantee about all upstream records.

[DHHS's general disclaimer](https://dhhs.ne.gov/pages/disclaim.aspx) warns about accuracy and potentially outdated information. No dataset-specific retention duration, refresh rate limit, broad redistribution license, or commercial export grant was established. A proposed source profile can preserve official attribution and the explicit public-use notice while keeping initial output internal and withholding public redistribution pending its own review. Do not mistake an unspecified retention rule for a requirement to delete existing data.

## Rejected shortcut and alternate delivery

A search result named [DHHS_Filter](https://services8.arcgis.com/jzdN07B7ZhRTxuzU/ArcGIS/rest/services/DHHS_Filter/FeatureServer) is **not this authoritative service**. Its [item metadata](https://www.arcgis.com/sharing/rest/content/items/cd49a689842d4cd280a1234be359b777?f=pjson), fetched once with the same bounds (HTTP 200, 1,543 bytes), reports owner `jlee142_universityofne` with empty description, attribution and license. Do not substitute it for DHHS or enroll it based on its title.

The official [DHHS purchased-list service](https://www.nebraska.gov/hhs/lists/) offers downloadable CSV/ZIP lists after selection and payment, including license identifier/type/status, issue/expiration dates, entity name and address components. This is an alternate delivery lead, not permission to purchase or proof of exact childcare selection, price, address role or terms. No purchase workflow was entered. Prefer the resolved free official service preflight first.

## Next implementable action

Build an isolated, metadata-first NE center-source contract without modifying existing production pins. Initially permit only the exact official item/service/layer metadata and a small aggregate/count preflight after governance review. Validate selected fields and exact center types; measure roster-date range and category counts without gathering home-provider identities. Explicitly handle ArcGIS date-only values and preserve numeric ZIP input alongside validated ZIP5 text; keep ZIP4 separate, reject fractional/zero/out-of-range ZIPs, and never guess missing address state.

Proposed allowlist: the exact item JSON URL in step 3; service and layer JSON URLs in steps 4–5; and `https://gis.ne.gov/Agency/rest/services/DHHS_Licensed_Child_Care/FeatureServer/0/query` for tightly validated count/statistics parameters only. Reject redirects and arbitrary paths. A first preflight should allow at most three metadata GETs plus two aggregate GETs, one request at a time, at least one second apart, 15 seconds/request and 1 MB/response, no automatic retries. Proposed counts/date extrema should use only the two reviewed center types, `returnGeometry=false`, and fixed count/statistics expressions, with no feature/ID export fallback on unsupported queries. These are client-proposed limits, not asserted provider quotas. No query was run in this pass.

Before acquisition, establish a conservative source budget, snapshot-change detection, pagination/ID reconciliation, cancellation, and source-policy profile. Resolve any unknown category/status/date semantics before claims of active or complete coverage. Select only necessary center fields, excluding owner/manager names and telephone data. Preserve source points as lat/long, not business polygons, with accuracy unknown. Once implemented and verified, submit downloads through Co*Tive and retain the operation ID and receipt; agents should not conduct or supervise routine downloads.

Verification for this documentation-only change: official catalog observation and bounded metadata responses above; no runtime tests needed. Root integrator owns final review, release checks and commit.

## Integrator aggregate validation — 2026-09-09T05:04:39.097Z

After independently reading the layer schema and public-use item notice, the integrator made one metadata-derived aggregate request to the official layer's `/query` route. Request: `f=json`, `where=License_Type IN ('Child Care Center','Provisional Child Care Center')`, `returnGeometry=false`, `groupByFieldsForStatistics=License_Type`, with count of `OBJECTID`, count of `Roster_Date`, minimum and maximum `Roster_Date`. Transport rejected redirects, allowed 15 seconds and capped the response at 20,000 bytes. HTTP 200 returned 895 bytes, two aggregate rows and no geometry, provider IDs, names or addresses. No facility acquisition occurred.

| Exact source category | Source rows | Rows with roster date | Minimum roster date | Maximum roster date |
| --- | ---: | ---: | --- | --- |
| Child Care Center | 699 | 699 | 2025-10-15 | 2025-10-15 |
| Provisional Child Care Center | 51 | 51 | 2025-10-15 | 2025-10-15 |

This resolves a specific freshness question: the selected source rows are dated **October 15, 2025**, not the catalog's October 2024 metadata date, and not the September 2026 observation date. The 750 rows are a historical center/provisional-center cohort count, not current active businesses or an acquired dataset. The provisional category remains separate. No percentage of U.S. businesses or valid ZIP coverage can be derived from this response.

The response confirms date-only statistics are delivered as calendar strings; converting them to midnight UTC would add unsupported time semantics. Before a current-business connector is enrolled, resolve why the public roster is eleven months old and identify a publisher-supported current edition or preserve an explicit historical-only scope. The official free route is technically reachable; currentness, rather than guessed API access, is the immediate unresolved requirement. Do not purchase the alternate list or re-download this same cohort to solve freshness by assertion.

This recorded observation is not a durable app preflight receipt, independently replayable acquisition or refreshed production release. Runtime implementation and immutable metadata/aggregate capture remain necessary before unattended use.
