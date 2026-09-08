# Michigan childcare center access validation — 2026-09-07

## Decision and scope

An official, public, queryable State of Michigan GIS source exists for licensed childcare facilities. A center-only app connector is implementable, subject to the acceptance checks below. This is source validation, not enrollment or acquisition approval: no production configuration, source holds, or output datasets were changed. The separate Michigan corporate-registry hold remains unchanged.

This review made metadata and aggregate/count requests only. It retrieved **zero individual facility records** and no bulk file; it did not access provider accounts, automate the public licensing portal, contact anyone, or use a mirror.

## Primary evidence actually checked

- [State GIS export instructions](https://www.mcgi.state.mi.us/AGOOpenData/images/CCLB_Helpful_Hints.pdf) direct users to the Michigan GIS Open Data Portal and its Child Care dataset.
- [Official Child Care dataset](https://gis-michigan.opendata.arcgis.com/datasets/Michigan::child-care/about) identifies the public dataset. Its JavaScript page did not expose content through the text reader, so the exact item metadata was checked directly.
- [ArcGIS item metadata](https://www.arcgis.com/sharing/rest/content/items/a79c3b0caedf412599085941e2af91d4?f=json) returned owner `michigan_admin`, title `Child Care`, public access, and MiLEAP licensing attribution covering homes, group homes, and centers. Its dataset-specific terms permit use, reproduction, and distribution, subject to extensive disclaimers and user responsibility. Item modification time is `2026-04-10T19:55:38Z`, **not evidence of a licensing-data refresh on that date**.
- [Publisher-linked layer metadata](https://utility.arcgis.com/usrsvcs/servers/a79c3b0caedf412599085941e2af91d4/rest/services/CSS/CSS_LARA/MapServer/5?f=pjson) returned layer `BCHS_Child_Care`, point geometry, Query capability, pagination, statistics, ordering, and a 1,000-record response limit. No editing/time metadata was supplied.
- [Center-only count request](https://utility.arcgis.com/usrsvcs/servers/a79c3b0caedf412599085941e2af91d4/rest/services/CSS/CSS_LARA/MapServer/5/query?f=json&where=FacilityTypeCode%3D%27DC%27&returnCountOnly=true) returned **4,549**. A separate aggregate query grouped by `FacilityTypeCode,FacilityType`, with `count(OBJECTID)`, `where=FacilityTypeCode='DC'`, and `returnGeometry=false`, confirmed `DC / Center / 4549`. These are source rows, not verified unique sites, currently operating businesses, or a national completion denominator.
- [Michigan.gov terms](https://www.michigan.gov/som/footer/policies) restrict site automation and distinguish agency-specific data terms and external sites. The GIS dataset's explicit terms are the scoped basis here; they do not authorize scraping CCHIRP or other Michigan.gov pages.
- [CCHIRP introduction](https://www.michigan.gov/mileap/early-childhood-education/cclb/cchirp) describes public licensing search; it is not evidence of a bulk export/API contract. A search-indexed historical facility CSV dictionary URL returned HTTP 404 when opened, so it is **not** a current schema or delivery contract.

## Proposed minimal app contract

The dataset terms also contain a release of claims and a duty to defend, indemnify and hold the state harmless. Retain these material conditions in the policy review; the permission language is not unconditional and this assessment does not constitute legal approval or authority to accept a new agreement. Root independently rechecked the exact item metadata.

Use only the item-linked public endpoint above. Recheck and retain item terms and layer schema at preflight; fail closed on changed identity, policy, unexpected private fields, or missing capabilities. Do not fall back to a university mirror, portal scraping, login, or a different endpoint on failure.

Allowlist `OBJECTID`, `LicenseNumber`, `FacilityName`, `StreetAddress`, `City`, `State`, `ZIPCode`, `CountyCode`, `FacilityTypeCode`, `FacilityType`, `Capacity`, `Latitude`, and `Longitude`. Require `DC` and `Center` consistently on every row; exclude all other facility types before retrieval and again during validation. Do not request `*`, telephone, licensee/contact/address-owner information, or home-provider records. Center designation alone does not guarantee every name lacks personal information; retain review/restriction controls.

Preserve the premises address from the raw address fields. Do not silently substitute standardized-address fields or treat `AddressID` as a business identity. Split valid ZIP strings into the existing `zip_code` (five digits) and `zip4` (four digits or null) fields; never manufacture Plus4 or store a joined normalized ZIP. Reject/quarantine malformed values without dropping their provenance.

Request no geometry and use validated finite `Latitude`/`Longitude` as nullable business point coordinates. Reject out-of-range points and flag geographic inconsistencies; do not assume geocoding accuracy or silently repair coordinates. The layer's native geometry uses a projected CRS, so native geometry x/y must never be interpreted as longitude/latitude. No business polygons are needed.

Namespace license numbers by publisher and preserve them as strings. `OBJECTID` is acquisition reconciliation identity only; neither its stability nor license-to-premises uniqueness has been established. Keep license assertions separate from site entities. Duplicate licenses, shared addresses, and multiple licenses at one location require explicit reconciliation, not address-only merging or row-count claims of unique businesses.

Implement bounded deadlines/body limits, cancellation, retries, deterministic ordering/paging, duplicate detection, count reconciliation before/after acquisition, and incomplete/truncated-response rejection. Retain allowlisted immutable responses, request parameters, hashes, schema/terms snapshots, observation time, and transformation version; stage atomically and verify offline before promotion. A changing live service is not a snapshot: differing counts or ambiguous pagination must fail publication. The app, not an agent, owns subsequent downloads and resumable runs.

## Remaining gates and truthful reporting

The GIS schema has no explicit license status, issue/effective/expiration dates, source update timestamp, or row-change feed. Do not infer `active`, operating status, renewal state, or closure from membership or disappearance. Report only “publisher-listed childcare center observed at [time]”; preserve unknown status. Source currency, update cadence, license lifecycle, actual ZIP quality, coordinate completeness, and duplicate behavior remain unvalidated because no record-level acquisition was performed.

Before enabling routine pulls: implement privacy/schema/policy preflight and offline fixtures; use a bounded center-only acquisition under the app; verify pagination and reconciliation, then review missing/status/identity metrics before promotion. Start as reporting-only geographic evidence, excluded from identity-matching candidates and unrestricted record exports until the reviewed integration explicitly permits them. State counts must remain licensed-center source evidence, not all childcare businesses, all industries, or percent complete across the United States.
