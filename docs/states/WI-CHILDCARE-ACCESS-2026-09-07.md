# Wisconsin childcare: bounded source validation

Observed September 7, 2026. This is a new industry-source assessment, not a change to historical state business-registration holds. No bulk acquisition, connector enrollment, schedule, or production pointer changed. The preceding goal turn made verified implementation and app-dispatch progress; the existing childcare rebuild remains a separate live application process.

## Publisher evidence

The [official DHS layer](https://dhsgis.wi.gov/server/rest/services/DHS_DCF/Child_Care/MapServer/0) identifies DCF-regulated childcare locations. Direct JSON metadata requests succeeded: point geometry, Query capability, 2,000 maximum records and statistical queries. The object identifier is declared by the `OBJECTID` OID field even though an `objectIdField` property was absent. Preserve the publisher's misspelled `ProvderNumber` field literally at acquisition.

A grouped count query by `CategoryType` returned 4,733 records: 2,382 LICENSED GROUP, 1,600 LICENSED FAMILY, 543 REGULAR CERTIFIED, 193 PUBLIC SCHOOL PROGRAM and 15 PROVISIONAL CERTIFIED. These are observed service rows, not verified businesses or a nationwide denominator. A first connector should select exactly LICENSED GROUP; other categories require separate scope/privacy review.

One ordered group-only query requested selected business/address/identifier fields and WGS84 geometry, with `resultRecordCount=1`. It returned one row and `exceededTransferLimit=true`, demonstrating a deliberately incomplete probe. Its identifiers were strings with leading zeroes, address line 2 was null, name/city had trailing padding and ZIP contained five digits. Stored latitude/longitude and transformed point coordinates differed at floating-point precision. No contact name or telephone field was requested. The sample is not archived business data and must not serve as a release or authenticity receipt.

The [ArcGIS item](https://www.arcgis.com/home/item.html?id=0f8e25b2fe314ed88feb97ebed47bfe8), discovered by public item search, resolves to that exact layer and owner `DHS_GIS`. Its modified value is `1755108537000`, which is portal metadata timing, not a verified data observation date. Do not append a zero to the item identifier: that superficially plausible variant did not resolve. Service metadata names a different service item identifier; retain and verify both roles rather than equating them.

The layer's [item metadata](https://dhsgis.wi.gov/server/rest/services/DHS_DCF/Child_Care/MapServer/0/iteminfo) credits Wisconsin DHS and disclaims completeness/accuracy. The portal item links the [GIS disclaimer](https://data.dhsgis.wi.gov/pages/gis-data-disclaimer), read in the rendered official page: liability and warranty exclusions, possible staleness, no implied endorsement, Wisconsin-law and third-party-rights conditions. These notices are not an independently reviewed redistribution license. Initial downstream output should remain local-review-only with attribution and retained notices. No agreement button, account or contact submission was used.

## Implementation contract and remaining gates

1. Build a metadata-only preflight before acquisition. Pin host, layer, item-to-layer identity, selected field schema, disclaimer evidence, category selection and count; enforce bounded bytes/deadlines, HTTP status/ArcGIS errors and source-specific retry policy. There is no observed row-level status/date field; do not fabricate freshness or operational status from the layer description.
2. Exclude `LocationContactFullName` and `LocationPrimaryPhoneNumber` at the request boundary. Never request `outFields=*`. Keep family/certified categories outside this first scope. Public-school programs must remain distinct, as in the MA/NJ scope comparison.
3. Preserve provider, location and facility identifiers as separate typed source strings. Uniqueness and cross-release stability remain unverified; use source-release-row provisional candidates until measured. Do not infer ownership or one provider equals one premises.
4. Acquire one selected state view, not one download per ZIP. Plan a stable ID roster with selected counts before/after, bounded batches, duplicate/missing ID and transfer-limit checks. If drift is detected, retain failed evidence without publishing; a mutable service is not automatically an atomic snapshot.
5. Normalize address ZIP5 and optional ZIP4 separately. Preserve original values and source observation time. Choose and document a coordinate basis and discrepancy tolerance; business entities get only latitude/longitude, never attached polygons. Missing coordinates remain gaps.
6. Add offline privacy/schema-drift, padded/null fields, leading-zero identifiers, pagination/truncation, retry/deadline/cancellation and immutable publication tests. Measure actual selected-record acceptance before counting coverage. After these gates, Co*Tive workers own acquisition; agents do not supervise downloads.

This assessment establishes a feasible bounded preflight candidate, not a ready downloader, current-business proof or increased production coverage. Complete reproducible metadata/terms retention is the next software step.
