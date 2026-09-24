# EPA ECHO source-defined active-program-facility coverage

This retained-only governed aggregate replays the exact pinned EPA ECHO Exporter release with source update time `2026-08-30T06:36:03.000Z`, retrieval time `2026-09-03T00:24:18.917Z`, and pinned Census ZIP/ZCTA geography. It makes no network requests and remains separate and nonadditive to generic business totals.

The source-defined cohort contains 1,517,826 accepted facility records with `FAC_ACTIVE_FLAG=Y` across all 51 states/DC and five territories. The records have 38,401 positive reported ZIP5 values within a 41,584-row governed ZIP union; 3,183 rows are denominator-only. No accepted record reports ZIP+4. Census ZCTA membership is statistical geography rather than current USPS validity.

`FAC_ACTIVE_FLAG=Y` means at least one associated ICIS-Air, ICIS-NPDES, RCRAInfo, or SDWIS permit or facility is active in ECHO as of the retained source release. It does not establish present-day general business operation, active status in every associated program, public access, current hours, legal significance, ownership, or nationwide completeness. Program-association counts overlap and must not be summed.

All accepted rows retain source coordinates, but 67,404 have an explicit centroid warning and 5,154 lack populated accuracy meters. The aggregate therefore makes no usable premise-geocode claim and never substitutes coordinate-derived ZIP for the reported physical ZIP.

Only aggregates are published. Names, addresses, coordinates, geometry, FRS and program identifiers, report URLs, quarantine records, and raw records are prohibited.
