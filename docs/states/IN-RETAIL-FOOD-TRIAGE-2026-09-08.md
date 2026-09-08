# Indiana retail-food source discovery — September 8, 2026

## Outcome

An official Monroe County publication chain resolves to a public facility layer and a separate inspection-enriched layer. This is a county-scoped connector candidate, not a statewide inventory or a verified current grocery-store roster. No establishment records, identifiers or geometry were requested. The investigation used official pages, bounded public item/config/layer metadata and one grouped count query. No accounts, agreements, paid services, records requests or access workarounds were used.

## Jurisdiction and industry scope

[Indiana's retail-food guidance](https://www.in.gov/health/food-protection/retail/how-to-start-a-retail-food-business/) distinguishes retail from wholesale and directs facilities outside state inspection to local health departments. Retail includes grocery stores but also restaurants, vending, mobile operations, institutions and temporary events. Neither a retail permit nor a state-hosted search surface establishes a statewide grocery denominator.

The [Monroe County Food Safety page](https://secure.in.gov/counties/monroe/Departments/health-department/food-safety/) links an [ArcGIS Experience](https://experience.arcgis.com/experience/3553ac491b25400592b18a62d4084972) and says inspection reports are released monthly for the previous month. The linked current-inspections page is labeled April 28, 2025–present; item descriptions say May 2025–present. Preserve that discrepancy until clarified; neither is the facility roster's proven update cadence. The indexed Indiana public inspection-search page was discoverable, but direct browser retrieval returned an internal tool error. This does not prove a provider access refusal or absence of statewide data.

## Verified publication chain

Bounded native metadata requests rejected redirects, used 20-second deadlines and limited decoded bodies to 2,000,000 bytes. All listed responses were public metadata; no feature-row query was made.

1. Experience item `3553ac491b25400592b18a62d4084972`, owner `nangelos_moco_gis`, organization `nYfGJ9xFTKW6VPqW`, public Web Experience. Its resource listing exposed `config/config.json`; that public config embeds dashboard `3850128b5ea6449c821cef625bbd94c6` and a separate historical experience. The historical dataset was not acquired.
2. Dashboard `3850128b5ea6449c821cef625bbd94c6`, same owner/organization, public Dashboard, identifies web map `4d0873c8312c45b587e9418cc52cfba6`.
3. Public web map `4d0873c8312c45b587e9418cc52cfba6` identifies both the facility source and inspection-enriched layer below. Its county/corporate boundary layers were not queried; existing governed geography remains unchanged.

Metadata endpoints follow the verified item URLs, for example [Experience item](https://www.arcgis.com/sharing/rest/content/items/3553ac491b25400592b18a62d4084972?f=json), [dashboard configuration](https://www.arcgis.com/sharing/rest/content/items/3850128b5ea6449c821cef625bbd94c6/data?f=json) and [web-map configuration](https://www.arcgis.com/sharing/rest/content/items/4d0873c8312c45b587e9418cc52cfba6/data?f=json). These observations are discovery evidence, not an immutable, paired connector preflight receipt.

## Facility source candidate

[Item `b6e58e0d6a424856b0e5e3b608ce376a`](https://www.arcgis.com/sharing/rest/content/items/b6e58e0d6a424856b0e5e3b608ce376a?f=json), public Feature Service, is owned by `jbaeten_MoCo_GIS` in the same county organization. Its title is Food Locations for Survey 123. The map labels it Facilities Full List and applies `IsArchived = 0`.

[Layer 0 metadata](https://services1.arcgis.com/nYfGJ9xFTKW6VPqW/arcgis/rest/services/Food_Locations_for_Survey_123/FeatureServer/0?f=json) confirms `serviceItemId`, point geometry, `Query`, `OBJECTID` and maxRecordCount 1000. Facility-selected candidates include `Facility__Name`, `TYPE`, `Facility_Address`, `Facility_City`, `Facility_Zip` (strings, length 75), `LicensedCheck` and `IsArchived` (small integers), `OpeningDate`/`ClosingDate` (dates), `Certificate_Number`, `EXPIRES` (string), `ID` (integer), `facilityID` (big integer). All observed domains are null. There is no selected facility-state field; `Mailing_State` must not be substituted for physical-address state. Owner/contact/certified-person and mailing fields must remain excluded from future acquisition.

Do not use `X`/`y` as latitude/longitude without a verified CRS. The aggregate response identified native wkid 2245/latestWkid 2966; a future point delivery contract needs explicit provider transformation to EPSG:4326 and response verification. ZIP5/ZIP4 must remain separate after source-preserving parsing. No ZIP values or points have yet been inspected.

## Aggregate-only evidence

At 2026-09-08T19:56:09.672Z, one 2,829-byte response grouped all rows by `TYPE,LicensedCheck,IsArchived`, counting `OBJECTID`, with `where=1=1`, `returnGeometry=false` and ordered groups. It returned 25 aggregate groups, summing to 1,108 source rows; 815 have `IsArchived=0`, and 723 have both `LicensedCheck=1` and `IsArchived=0`. These are sums from one response, not paired stability checks or independently established business totals.

Observed category literals are `MOBL`, `Multi-Market`, `PANTRY`, `Pushcart`, `REST`, `SCHL`, `SEAS`, `TEMP`. There is no verified grocery literal. In particular, **do not equate Multi-Market with grocery** merely from its name. Status domains are undocumented: 45 Multi-Market and 529 REST source rows have both flags in the selected combination, but the flags do not independently establish operating businesses or current licenses. No category/status filter is approved by this discovery alone.

## Separate joined layer and privacy boundary

[Item `bb9fbe5e5141444dbdbee7bb9edee056`](https://www.arcgis.com/sharing/rest/content/items/bb9fbe5e5141444dbdbee7bb9edee056?f=json) and [layer 0](https://services1.arcgis.com/nYfGJ9xFTKW6VPqW/arcgis/rest/services/Food_Establishment_Locations_Current/FeatureServer/0?f=json) are public, named Food Establishment Locations Current. Metadata exposes `OBJECTID1` as its OID, an underlying `OBJECTID`, facility fields, inspection dates, joined inspection keys and many narrative/contact fields, including internal-notes field names. The map filters it by `(pdf_rep IS NOT NULL) AND (IsArchived = 0)`. This is not a verified one-row-per-business roster; requiring a published inspection PDF may omit otherwise listed facilities. Prefer investigating the base facility source, not collecting the joined inspection payload by default. No field values from either layer were requested.

## Next bounded prerequisite

Follow-up: [the county use review](IN-MONROE-FOOD-USE-REVIEW-2026-09-08.md) found a published personal/noncommercial limitation and written-permission requirement for reuse. Acquisition activation now requires source-specific clarification, not merely an empty-license-field assessment. [Category research](IN-MONROE-FOOD-CATEGORIES-2026-09-08.md) also resolves the human meaning of Multi-Market without asserting a verified query-code mapping.

Establish the publisher's category and status definitions, license/expiration semantics, roster completeness and identifier stability. Obtain the complete applicable use notice and record a source-specific internal-use decision: the inspected item/layer descriptions and license notices are empty, which neither grants unrestricted redistribution nor establishes a categorical prohibition. The official link chain supports provenance, not all downstream rights.

Then build paired metadata/category-count preflight with exact selected fields, a policy profile and immutable receipts. Any eventual acquisition must be county-scoped, app-owned, paced and independently replayable. It must preserve missing ZIP/point/state evidence and cannot merge inspection events or declare all Indiana ZIPs covered. No app enrollment, download, refresh schedule, national pointer or existing source hold changed in this turn.
