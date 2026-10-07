# Childcare source discovery — first ten-state attention batch

Observed October 7, 2026. This is source-discovery evidence only: no provider rows were acquired, no source contact or credential action occurred, and no source is enrolled in national reporting by this document.

| State | Official source | Machine-readable posture | Current disposition |
| --- | --- | --- | --- |
| AK | [Alaska AKCCIS provider search](https://findccprovider.health.alaska.gov/) | Interactive search; no documented bulk/API | Hold. Publisher warns displayed information is only current through September 20, 2024 and updates are temporarily paused; click-through terms and split state/Anchorage licensing also require review. |
| AL | [Alabama DHR daycare search](https://apps.dhr.alabama.gov/daycare/daycare_search) | ASP.NET search; no documented export/API | Hold. No dataset license, extract timestamp, cadence, supported API, or stable schema was found. |
| AR | [Arkansas childcare portal](https://daycare.arkansas.gov/) | Salesforce-backed interactive search; no documented bulk/API | Hold. Statewide provider search exists, but export/schema/cadence and licensed-only population semantics are undocumented. |
| AZ | [Arizona provider and facility databases](https://www.azdhs.gov/licensing/index.php#databases) | Official downloadable tables; monthly publication described | Strong candidate. Prefer the official monthly tables with run-date/schema checks; the related ArcGIS layer appears materially older and should not be treated as the primary feed. |
| CA | [California Community Care Licensing Facilities](https://lab.data.ca.gov/dataset/community-care-licensing-facilities2) | CSV, GeoJSON, XLSX, geodatabase, shapefile/KML, and ArcGIS service advertised | Candidate after contract work. Must filter child-care program types, pin the current resource, validate ZIP availability and decode status values before acquisition. |
| DC | [OSSE Child Development Facilities Listing](https://osse.dc.gov/publication/child-development-facilities-listing) | Statewide monthly PDF; no documented bulk/API | Hold. Presentation-oriented PDF, changing attachment URLs, no explicit status field, and no dataset-specific machine contract. |
| DE | [Delaware Licensed Child Care Providers and Facilities](https://data.delaware.gov/api/views/iuzd-3dbt) | Official Socrata dataset/API | Selected first. Canonical metadata declares official provenance, Public Domain license, current information, daily publication, street-address geography, and fields for license, name, type, address, ZIP, enforcement, capacity, and point. Metadata preflight implemented; record acquisition remains disabled. |
| FL | [Florida listing of all child care providers](https://www.myflfamilies.com/documents/Listing%20of%20all%20child%20care%20providers.xlsx) | Official statewide XLSX publication | Candidate. On observation the official file returned XLSX, 2,146,163 bytes, and Last-Modified October 2, 2026. Schema, licensing terms, publication cadence, status semantics, and privacy selection still require a governed preflight before body acquisition. |
| GA | [Georgia DECAL Provider Data Export](https://families.decal.ga.gov/Provider/Data) | Official CSV export backed by `POST /Provider/Export` | Strong candidate after contract work. Official dictionary documents provider number, name, physical address, city/state/ZIP and types; exact request selections, response schema, publisher timing, privacy exclusions, and repeatable row conservation must be pinned. |
| HI | [Hawaii DHS Child Care Program](https://humanservices.hawaii.gov/bessd/child-care-program/) | Contractor-maintained searchable list; no documented official bulk/API | Hold. The state plan points to PATCH for ZIP-searchable licensed/registered providers while the state consumer site remains under development; no supported bulk contract, license, schema, or cadence was found. |

## Priority

1. Delaware: exact official/public-domain metadata contract now verified and retained; next stage is a separately governed bounded row-acquisition design.
2. Arizona: validate the current downloadable-table link, content type, run date, selected fields, and reuse terms.
3. Georgia: validate the official export POST contract and dictionary against a zero-row/schema or explicitly authorized bounded sample.
4. California and Florida: complete schema/status/privacy contracts before any body acquisition.
5. Alaska, Alabama, Arkansas, District of Columbia, and Hawaii: retain as explicit access gaps until a supported machine-readable contract is available.

Absence from these sources must remain unknown, not a closure, inactive-business decision, invalid ZIP decision, or statewide completeness claim.
