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
