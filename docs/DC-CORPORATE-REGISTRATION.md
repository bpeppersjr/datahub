# District of Columbia Corporate Registration

This bounded connector covers the official District of Columbia Department of Licensing and Consumer Protection (DLCP) [Corporate Registration catalog item](https://opendata.dc.gov/datasets/DCGIS::corporate-registration) and its no-geometry [DCGIS Corporate Registration table](https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Business_Licensing_and_Grants_WebMercator/FeatureServer/0). The catalog item ID is 5238c4fd99c843a1bd7679a243747a8c.

The connector is deliberately not a live row downloader. Its network preflight admits one exact layer-metadata request and six exact aggregate/count-only requests. Redirects, alternate hosts or paths, response overages, schema drift, vocabulary drift, truncated aggregates, and non-reconciling controls fail closed. The preflight never requests feature records. The acquireDcCorporateRegistrationLive function is default-denied and unimplemented.

## Observed contract

At the 2026-09-03 observation, the official table exposed 503,371 rows and 503,366 distinct FILE_NUMBER values across all historical and current registrations. The difference is retained as a control rather than silently treated as unique. The two exact source-defined active statuses contained 115,469 rows and 115,469 distinct file numbers:

- Active - In Good Standing: 115,318
- Active - Not in Good Standing: 151

The complete status vocabulary was Active - In Good Standing, Active - Not in Good Standing, Consolidated, Converted, Dissolved, Domesticated, Inactive - Cancelled, Merged, Revoked, Terminated, and Withdrawn. The preflight also requires the exact 18-value MODELTYPE vocabulary and reconciles both grouped distributions to the total row count. The observed maximum DCS_LAST_MOD_DTTM was 2026-09-03T11:53:39.000Z. Counts are observations, not a claimed publication cadence or delta contract. The layer advertises neither change synchronization nor historical-moment queries, and the publisher declares no recurring checksum, tombstone feed, or deletion contract. Each future candidate release therefore requires a fresh preflight and a complete active fixture; local SHA-256 manifests detect artifact changes but do not supply missing upstream tombstones.

The privacy-selected 24-field contract preserves FILE_NUMBER as a candidate key, exact status, LOCALE, MODELTYPE, business name and suffix, the four source business-address lines, city/state/country, ZIPCODE, relevant registration/report dates, DCS_LAST_MOD_DTTM, and OBJECTID/GLOBALID provenance. The upstream BUSNIESS_ADDRESS_LINE spelling is preserved because it is part of the official schema. EMAIL and every RA_ registered-agent field are forbidden even if they exist in a catalog description or later appear in source metadata.

## Entity and privacy boundary

An acknowledged offline build accepts only an operator-supplied JSONL/NDJSON fixture with exactly those 24 fields and only the two exact active statuses. It rejects duplicate FILE_NUMBER identities case-insensitively, historical rows, unsupported model types, missing names or identifiers, malformed dates, invalid U.S. postal codes, extra fields, person/contact/agent fields, and active fixture counts that do not equal the fresh preflight.

Each accepted row creates one provisional organization record. The business address is corporate-registration administrative evidence only. It does not create a site or establishment and does not assert occupancy, operation, ownership, geometry, or geocode. U.S. ZIP+4 source values are split into five-digit zip_code/postal_code and a separate four-digit zip4; joined normalized ZIP+4 values are invalid. Because names may identify natural persons and addresses may be residences, both selected source rows and normalized record-level records stay internal or local-review-only.

## Offline release controls

The exact acknowledgement is:

    I-APPROVE-DC-CORPORATE-REGISTRATION-OFFLINE-LOCAL-REVIEW-BUILD

The caller supplies a fresh validated preflight receipt, a bounded regular non-symlink and non-hardlinked JSONL fixture inside Datahub, an output root inside Datahub, and optionally a UUID run ID and cancellation signal. Compressed size, decoded size, per-line size, and row count are separately bounded. The build writes only to OUTPUT/.staging/RUN_UUID/, hashes the original fixture, writes gzip selected-source and normalized JSONL artifacts, a quality summary and preflight receipt, emits a checksum manifest last, then independently verifies checksums, exact reproducibility, row identity, privacy selection, ZIP separation, provenance, counts, and semantic boundaries. It atomically promotes a verified run to a checksum-bound, non-overwriting release directory; filesystem immutability is not asserted. Failed staging is removed. It never creates current.json or changes production, registry, coverage, or Heatmap state.

## Rights and attribution

Public metadata and aggregate queries are anonymous and carry no stated access fee. The District's [Terms and Conditions of Use for District Data](https://dc.gov/page/terms-and-conditions-use-district-data) state that catalog data is CC0/public domain unless otherwise noted and request credit. The District's [Transparency, Open Government and Open Data Directive](https://dc.gov/page/transparency-open-government-and-open-data-directive) requires catalog datasets to be available in an open, machine-processable format through an open API. Current harvested item metadata has also identified CC BY 4.0, so this connector applies the conservative rule: any approved derivative must attribute DLCP/Open Data DC and include item ID, maximum source-modified timestamp, selected-schema fingerprint, artifact checksum, and the applicable terms/license notice. District logos must not imply endorsement.

Those source permissions do not override this connector's privacy gate. Record-level redistribution remains disabled pending a separate privacy, license, and data-quality approval. Production, business-registry, coverage, and Heatmap integration all remain false.
