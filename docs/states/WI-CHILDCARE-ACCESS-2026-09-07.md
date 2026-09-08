# Wisconsin childcare source validation

Observed September 7 local / September 8, 2026 UTC. This is metadata/count research, not an acquired business dataset or an enrolled app worker. No facility records, IDs, contact records, accounts, agreements or bulk files were accessed. The separate Wisconsin DFI corporate-registry hold remains unchanged.

## Verified source and scope

The official [DHS child-care layer](https://dhsgis.wi.gov/server/rest/services/DHS_DCF/Child_Care/MapServer/0?f=pjson) is a public point service for DCF-regulated providers. Live metadata identifies layer 0, `Child_Care_Providers`, Query/pagination/order/statistics support and a 2,000-record limit. Native geometry is Web Mercator 102100/latest3857, not longitude/latitude.

The [server information endpoint](https://dhsgis.wi.gov/server/rest/info?f=pjson) identifies the owning portal as `https://dhsgis.wi.gov/arcgis`. Its [linked item](https://dhsgis.wi.gov/arcgis/sharing/rest/content/items/bdec49075cd84b9d97df3fb50585b632?f=pjson) is public, credits Wisconsin DHS, and binds the public service URL. Its notice disclaims completeness, accuracy and warranties and excludes legal/engineering/surveying uses. Preserve the full notice in any connector preflight; this research does not establish unrestricted redistribution rights. Do not use the internal service address or token endpoint exposed in metadata.

Live aggregate queries at `2026-09-08T03:50:05Z` returned 4,733 source rows: LICENSED GROUP 2,382; LICENSED FAMILY 1,600; PUBLIC SCHOOL PROGRAM 193; REGULAR CERTIFIED 543; PROVISIONAL CERTIFIED 15. A separate [group-only count](https://dhsgis.wi.gov/server/rest/services/DHS_DCF/Child_Care/MapServer/0/query?f=json&where=CategoryType%3D%27LICENSED%20GROUP%27&returnCountOnly=true&returnGeometry=false) confirmed 2,382 at `2026-09-08T03:51:14.645Z`. These are source rows, not independently verified active or unique businesses.

DCF distinguishes [licensed group centers from family care and public-school programs](https://dcf.wisconsin.gov/cclicensing). Begin with exact `CategoryType='LICENSED GROUP'`; do not merge the other categories into a center-only source. Category membership is not proof that an address cannot be residential. DCF describes its search portal as the most current directory; GIS observation time must not be mislabeled as a licensing refresh date.

## Proposed connector boundary

Use only the fixed public layer and explicit fields: `OBJECTID`, `ProvderNumber` (publisher spelling), `LocationNumber`, `FacilityNumber`, `FacilityName`, `LocationLineAddress1`, `LocationLineAddress2`, `City`, `State`, `ZipCode`, `CategoryType`, `Capacity`. Exclude contact-name, telephone and all other unselected fields at request time. Preserve identifiers as source-native strings without inferring license or canonical identity semantics. Keep ZIP5 and ZIP4 separate and retain unavailable postal values as reasoned gaps.

Before requesting rows, implement metadata/notice pinning, category-count preflight and offline conformance fixtures. Coordinate handling needs an explicit reviewed path: either validate attribute datum or request a documented point reprojection with an explicit returned spatial reference. Do not interpret native x/y as lat/lon or create business polygons. The service extent includes zero coordinates, so invalid/missing point handling must be tested rather than assuming every row is assignable.

The app acquisition must use bounded requests, timeouts, byte limits, cancellation, exact ID/page reconciliation and before/after drift checks. No row timestamp/change feed or immutable snapshot contract was established. Publisher-described active membership remains a source claim; ownership, operating status, duplicates, current licensing status, actual ZIP/point quality and refresh stability remain unverified. Keep initial records local-review and reporting-only until reviewed integration permits more.

Observed raw metadata hashes (bytes were read for research, not retained as complete acquisition evidence): item `8566df97303ddf9aa7d6f59564ec31750508f6f604758f700a482e7c7b907ab1` (2,864 bytes); layer `e98c77b7a3ee5a72b4b07d7ade4c2b76e6dbfdee6a075545c67a3e2308a2c7c5` (8,008 bytes); group-count response `c91da33d54ca0a09f8f26d1cada6f657d244466da021bf31b6b51d2c4a3905cf`. These are observation fingerprints, not authorization or reusable fixture artifacts.

An alternate [DATCP retail-food list](https://datcp.wi.gov/Pages/Licenses_Permits/FoodLicenses.aspx) is publisher-advertised as quarterly and updated June 2, 2026, but explicitly excludes facilities licensed by Dane and Milwaukee counties. It was not downloaded or selected; it must not be represented as complete Wisconsin grocery coverage.
