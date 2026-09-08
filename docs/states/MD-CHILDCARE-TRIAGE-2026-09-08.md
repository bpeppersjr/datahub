# Maryland childcare metadata validation — September 8, 2026

## Verified discovery, not enrolled acquisition

The [public GIS service](https://services.arcgis.com/njFNhDsUCentVYJW/arcgis/rest/services/ChildCare_All_Active_Providers_May_20_2024/FeatureServer) describes all MSDE-licensed childcare providers as of February 13, 2026 and credits MSDE. Its name contains May 2024, but neither that name nor its later edit timestamp is the source observation date. It points to Check Child Care Maryland for a current list and says the data came from Maryland EXCELS. Do not infer center-only scope or current operations.

Direct, bounded anonymous metadata requests succeeded after browser-tool metadata retrieval failures; no access refusal was bypassed. The [item record](https://www.arcgis.com/sharing/rest/content/items/3d31d1b53831477ea54ff6020f64219f?f=pjson) identifies item `3d31d1b53831477ea54ff6020f64219f`, public access and organization `njFNhDsUCentVYJW`. The [organization record](https://www.arcgis.com/sharing/rest/portals/njFNhDsUCentVYJW?f=pjson) identifies ArcGIS Online for Maryland and links Maryland iMAP and the state open-data portal.

The item notice permits distribution with the metadata entry retained unmodified and requires State of Maryland attribution in derived-data metadata. It also disclaims accuracy, warranties, liability and maintenance responsibility. The organization page separately carries an authorized-use/monitoring notice and links an ArcGIS Online use policy. The [linked policy](https://geodata.md.gov/documents/PolicyforEsriArcGISOnline.pdf) returned HTTP 503 during inspection. Its complete applicability to anonymous public-data consumption remains unverified; this is not a finding that Maryland public data is prohibited or that a paid account is required. No account, agreement or external request was submitted.

## Layer contract observations

The [layer metadata](https://services.arcgis.com/njFNhDsUCentVYJW/ArcGIS/rest/services/ChildCare_All_Active_Providers_May_20_2024/FeatureServer/0) identifies `Childcare_Providers`, points in EPSG:3857, `OBJECTID`, maximum 2,000 records per response, and support for statistics, ordering and pagination. Metadata includes facility/DBA names, license number, provider type, street/city/state, integer ZIP, API latitude/longitude and geocoder output fields.

Do not use the one-character `Status` field as a licensing-status filter: its semantics were not established, and it appears alongside geocoder outputs. Provider-type domains are absent, so the exact center/home predicate is not yet validated. `Zip_Code` is an integer, not a ZIP5/ZIP4 pair. `PostalExt` occurs among geocoder-derived attributes and must not silently replace a missing source ZIP4. API coordinates and projected point geometry are distinct source representations; any future collector must choose a documented latitude/longitude basis rather than invent business polygons.

Direct request evidence: item JSON 3,374 bytes; organization JSON 17,989 bytes; layer JSON 36,277 bytes. Each request used a 30-second deadline, two-million-byte ceiling, no credentials, no redirects and no retries. Layer `dataLastEditDate` was `1779911324252`; this editing metadata does not supersede the stated February snapshot date.

Next: resolve the linked public-use-policy context, then validate provider-type aggregate counts and the selected-field contract before row acquisition. Preserve original metadata/attribution, exclude phone/contact and unnecessary geocoder attributes, and distinguish a dated licensed-provider cohort from active unique businesses. No facility rows, identifier inventory, aggregate query, bulk export, app operation, schedule or national promotion was executed during this investigation.

## Bounded aggregate follow-up

The [Maryland Office of Enterprise Data](https://doit.maryland.gov/About-DoIT/Offices/Pages/officeofenterprisedata.aspx) explicitly describes public use, analysis and export of state GIS open data by businesses and residents. Together with the item's public sharing and data-specific distribution notice, this supports limited anonymous metadata/aggregate checks; it is not a claim of agency account privileges or blanket facility-data export approval. The linked agency-policy PDF still returned 503, and no authenticated system was accessed.

An aggregate-only query grouped `Provider_Type` and counted `OBJECTID`, with `returnGeometry=false`. At `2026-09-08T17:33:24.372Z`, its 1,023-byte result reported:

| Literal source category | Rows |
|---|---:|
| Child Care Center | 1,772 |
| Family Child Care | 3,863 |
| Large Family Child Care | 184 |
| LOC | 184 |
| Public Prekindergarten | 495 |
| School-Age Only | 669 |
| null provider type | 85 |

The total is 7,252 source rows, not unique businesses. The initial local diagnostic rejected the null category; a subsequent bounded diagnostic preserved it explicitly. No facility record or geometry was requested. `LOC` semantics remain unknown; it and other categories must not be silently included in a center-only cohort. The observed exact center predicate is `Provider_Type='Child Care Center'`, pending paired metadata/count checks in a tested preflight. These one-time aggregate observations do not establish an atomic snapshot or supersede the source's February vintage.

## Selected-field follow-up

A bounded [layer metadata](https://services.arcgis.com/njFNhDsUCentVYJW/ArcGIS/rest/services/ChildCare_All_Active_Providers_May_20_2024/FeatureServer/0?f=json) read at `2026-09-08T17:51:12.518Z` returned 23,544 bytes. Original selected names are `OBJECTID` (OID), `Facility_Name`, `DBA_Name`, `License_Number`, `Provider_Type`, `Street_Address`, `City`, `State`, `Full_Address` (String, length 8000), `Zip_Code` (Integer), and `Latitude_API`/`Longitude_API` (Double). Domains are null. No facility records or new aggregate counts were requested.

Select exact field names, not aliases: `USER_*` fields duplicate aliases and `USER_Latitude_API`/`USER_Longitude_API` are Integer rather than the original Double fields. Exclude phone and unnecessary geocoder fields. The source coordinate datum is not documented; a future geometry query could request `outSR=4326` and validate its returned CRS under the [ArcGIS query contract](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/), rather than silently labeling unknown API coordinates WGS84. Integer `Zip_Code` supplies no ZIP4; do not substitute geocoder `PostalExt`. The February 13 cohort date and remaining preflight/notice gates remain in force.

## Public-use context and preflight contract decision

The official Office of Enterprise Data page was rechecked on September 8 and continues to describe public GIS data analysis and export. The indexed [DoIT GIS account-onboarding agreement](https://doit.maryland.gov/services/data/Documents/DoIT_Service_Agreement_Geospatial_Products_GIS_Online_ProDesktop_Accounts_Onboarding_1_2025.pdf) places the organization policy in account administration context, but direct document retrieval returned 403 and was not retried. That contextual evidence does not prove the unseen policy excludes anonymous users. It also does not establish that anonymous public-data use requires an agency account, fee or additional agreement.

A fresh bounded item check at `2026-09-08T18:43:51.029Z` returned 3,105 bytes and confirmed public sharing, the complete distribution/attribution notice and the February 13, 2026 cohort description. Follow-up identity/schema checks at `18:44:41.807Z` and `18:44:42.140Z` confirmed the item owner, organization, service link and nine exact selected fields now captured in `config/connectors/md-childcare-preflight.json`. A final key-inventory check supported safe unchanged item retention without admitting facility data or unexpected secret-bearing properties. These were metadata checks, not facility downloads. A browser safe-URL error was tool-side, not a provider refusal.

Decision: implement the public metadata/count prerequisite using the explicit item notice and state public-use documentation. Preserve the organization-policy applicability uncertainty as provenance; do not turn it into an invented universal account or legal-approval requirement. This particular policy profile stays metadata-only because its implementation does not acquire facility rows. A future internal source-candidate collector must preserve unchanged metadata, attribution, uncertainty and privacy limits, but need not pretend a licensed-source row proves current operations, premises or identity.

The preflight requests item, layer, count, count, layer, item, with the exact center predicate. It must reject changed notices/schema/counts, facility/ID/geometry payloads, redirects, oversized bodies and HTTP-200 ArcGIS errors. Paired stability is not transactional snapshot isolation. Collection, normalization and app enrollment remain separate implementation steps; no source/current pointer or national production is changed by preflight.
