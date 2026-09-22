# CMS NPPES community/retail pharmacy projection

Co*Tive Collector now has a local-only, versioned projection from the retained `cms-nppes-organizations` release. It selects Entity Type `2` organization rows containing taxonomy `3336C0003X` (NUCC Community/Retail Pharmacy) and publishes the normalized provider-reported name, NPI, primary practice address, separate ZIP5/ZIP4 fields, source taxonomy assertions, temporal fields, and provenance.

The projection does not use the legacy raw pharmacy job and does not acquire a new source. It verifies the NPPES current pointer, manifest, and every source artifact used (the ten NPI-prefix organization partitions, the no-valid-ZIP partition, and the governed ZIP coverage artifact) before scanning. Its manifest is written last in a run-scoped staging directory; the projection pointer is atomically updated only after artifact checksums are recorded.

The current retained build is available at:

`data/business-sources/cms-nppes-community-retail-pharmacies/current.json`

The audited September 2026 release contains 89,077 unique organization NPIs and 90,074 retail-taxonomy slot occurrences. The difference is 997 repeated taxonomy-slot occurrences across 629 records; it must not be reported as additional pharmacies. Of the unique rows, 63,468 have the retail taxonomy marked primary, 89,074 have a normalized primary U.S. address, 78,524 have a ZIP4, 88,899 carry an exact governed 2020 ZCTA membership, 175 have a source ZIP5 without a polygon, and 3 have no normalized primary location. Mail-order is a separate source-taxonomy assertion only: 852 organizations and 867 taxonomy occurrences carry `3336M0002X`.

`derived/state-aggregates.json` includes all 50 states, D.C., and the five territories. `derived/zip5-aggregates.jsonl` includes 38,686 governed ZIP-union rows, of which 15,376 are positive reported pharmacy ZIP5 values; 15,256 positive ZIP5 values have exact ZCTA membership and 120 are nonpolygon. ZIP4 is never joined to ZIP5, and no pharmacy geocode is produced.

The public normalized projection explicitly leaves unique-business, current-operation, physical-site, governed-geocode, nationwide-completeness, NABP/NCPDP, drive-through, network-affiliation, and parent-company claims null or false. Parent organization text, when retained, is source-reported text only and is not an ownership relationship.

Use `npm run pharmacy:nppes:verify` to re-check the projection and its exact dependency hashes. The authenticated read-only endpoint `/api/business-map/pharmacies` and the distinct Heatmap mode expose bounded names/NPI/address browsing and aggregate evidence. Pharmacy rows do not increment generic business totals or the generic NPPES health-care category.
