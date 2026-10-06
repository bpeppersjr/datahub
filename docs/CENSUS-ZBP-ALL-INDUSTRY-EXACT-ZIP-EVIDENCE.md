# Census ZBP 2023 all-industry exact-ZIP adjacent evidence

This closed, local-only projection admits one bounded measure from the retained 2023 Census ZIP Codes Business Patterns release: employer establishments from the publisher's direct all-industry NAICS row `------`. It never adds NAICS hierarchy rows. The projection is adjacent evidence only; it is not enrolled in the application catalog, the national reporting denominator, or any runtime pointer.

The verifier pins and replays the selected ZBP pointer and immutable source manifest, all twelve derived source artifact descriptors and hashes, the ZBP policy, the selected Census geography dependency, and the registered ZIP profile-index registration, manifest, and closed artifact inventory. It parses all 2,974,116 retained detail rows solely to select the 34,954 direct `------` rows, then joins them to the 37,828-row ZIP/ZCTA union.

Each output row keeps ZIP5 separate from a null ZIP4, the source coverage status, booleans for published ZBP and same-code 2020 ZCTA evidence, source-native values and suppression flags, source evidence, and provenance. A published direct total of zero is `measured-zero`. A missing, suppressed, or unpublished value is null and unmeasured; it is never converted to zero.

The conserved coverage contract is 37,828 union rows: 34,954 published ZBP ZIP codes, 33,791 same-code ZCTAs, 30,917 with both, 4,037 ZBP without a same-code ZCTA, and 2,874 ZCTA without published ZBP. In this retained release all 34,954 published direct totals are positive, no direct total is zero, and the 2,874 ZCTA-only rows are unmeasured. These aggregates describe reference-year employer establishments, not named businesses, current operations, current USPS validity, GDP, or completeness.

Run `npm run zbp:all-industry-exact-zip:verify`. The command performs no network requests, writes no release or pointer, and emits only its verification summary.
