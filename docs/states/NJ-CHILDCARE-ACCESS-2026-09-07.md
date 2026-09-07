# New Jersey licensed childcare: bounded source handoff

## Decision and scope

Proceed to a bounded NJDEP connector preflight and offline contract tests. This assessment is not an enrolled connector, a completed acquisition, or a measured industry-coverage increase. No bulk file was downloaded, no schedule enabled, and no production pointer changed. Existing national datasets should not be repulled for this work.

The current [DCF Office of Licensing page](https://www.nj.gov/dcf/divisions-offices/ool/) distinguishes licensed centers (six or more children under 13, less than 24-hour care) from separately registered family-home care. [Provider guidance](https://www.nj.gov/dcf/providers-contractors/licensing-and-billing/index.shtml) notes licensing exemptions. A licensed-center dataset cannot establish coverage of all childcare businesses.

[NJDEP metadata](https://njdep.maps.arcgis.com/sharing/rest/content/items/0bc9fe070d4c49e1a6555c3fdea15b8a/info/metadata/metadata.xml?format=default&output=html) describes a monthly DCF-derived active licensed-center layer, including facilities operating in public schools; proposed centers are omitted before license issuance. This differs from the Massachusetts center-based source's exclusions. Mapping-service data may be newer than downloadable archives. Its guidance use is not a definitive environmental receptor evaluation or independent operating-business verification.

## Independently observed delivery contract

On September 7, 2026, direct HTTPS reads of the [production layer](https://mapsdep.nj.gov/arcgis/rest/services/Features/Structures/MapServer/4?f=pjson), count query and [item metadata](https://njdep.maps.arcgis.com/sharing/rest/content/items/0bc9fe070d4c49e1a6555c3fdea15b8a?f=json) returned HTTP 200 without credentials. Do not substitute the separately indexed test server.

- Item `0bc9fe070d4c49e1a6555c3fdea15b8a`, owner `NJDEPBGIS`, public access, points to the production MapServer layer 4.
- Layer name: Child Care Centers; point geometry; capabilities Map, Query, Data. Maximum response records: 2,000; pagination, ordering and statistics are advertised.
- Service geometry reference: WKID 102100/latest 3857. The field catalog has 30 fields, including OBJECTID and Shape.
- Count-only result: 4,075. Aggregate min/max `download_date` both returned epoch 1786463205000 (2026-08-11T15:46:45.000Z), with 4,075 non-null date values. Item modification is separately 1758741707000 (2025-09-24T19:21:47.000Z). Neither is the observation time or a center's operating date; field-date semantics require preservation, not reinterpretation.
- One selected-field validation query returned one record with exactly the 21 requested attributes, NJ state, a ZIP5-shaped string, and finite coordinates in WGS84 (wkid/latestWkid 4326). A broad NJ coordinate envelope passed; this is not a boundary-membership test or proof all rows have usable coordinates. No returned record was published or retained as an acquired dataset.

Proposed selected attributes: OBJECTID, center_id, center_name, address, address2, city, county, state, zip, licensed_capacity, age_range, months_operational, sessions, license_approval_date, license_renewal_date, foips, location_reference_desc, coord_source_type_desc, coord_sys_desc, coord_source_org_desc, download_date. Fields are case-sensitive: current API names are mostly lowercase despite historical metadata's uppercase examples.

Exclude owner, director, center_phone and center_email at query time. Environmental-link identifiers and alternate coordinate fields are not needed for the initial business-location scope. Preserve source license identifiers as strings; uniqueness and lifecycle are unverified. No source status-code field was observed, so active-layer membership must remain a scoped source assertion. Do not manufacture parent-company, network, current occupancy or open-business status.

## Policy and preservation requirements

The item's NJDEP distribution terms require metadata to accompany reproduction/redistribution, preservation of coordinate-reference integrity, and prescribed NJDEP credit/disclaimer for derived publications. They disclaim accuracy, endorsement and unrestricted third-party rights. Retain complete publisher metadata and terms with an acquired release; the implementation must carry the required notice rather than replacing it with generic attribution. Keep native CRS evidence and record any derived coordinate transformation explicitly. Normalized business entities need latitude/longitude only, not polygons. Initial selected source artifacts should remain internal and normalized records local-review-only; export approval remains separate.

The peer observed HTTP 403 on the DCF-linked Child Care Explorer and stopped that route. Historical Socrata and indexed static-list references were not established as current acquisition interfaces; a tool-open failure does not prove retirement. The independently public NJDEP service is a separate published source, not an access-control workaround.

## Next bounded implementation

1. Pin production host/layer/item identity, the selected schema and preserved metadata/terms; implement metadata/count/date preflight before any dependent acquisition.
2. Validate stable ID inventory, bounded selected-field batches and before/after count/date evidence. Do not assume MA-specific editingInfo fields exist or that pagination alone provides a transactional snapshot.
3. Apply conservative pacing, bounded retries/body sizes/GET length, explicit redirect rejection and cooperative cancellation. Preserve failed-run evidence and prior releases.
4. Test source-scope, identifier duplication, nullable/invalid dates, split ZIP5/ZIP4, geocodes, FOIPS distinctions, private-field exclusion, quarantine and publication checks with offline fixtures.
5. Once validated, enroll a separate NJ source in the childcare industry; Co*Tive owns collection. National integration must expose scope differences and unmeasured gaps rather than comparing unlike source counts as completeness percentages.

All work in this increment is source assessment. There is no runtime migration; removing this note does not change stored data or running jobs.

Repository verification passed: full tests, lint, web/desktop builds, desktop smoke and TypeScript; the production dependency audit found zero vulnerabilities. These checks cover the unchanged software, not an implemented New Jersey connector.
