# National geography goal status

`national-geography-goal-status` is an immutable, aggregate-only status dataset. It independently verifies the current retained Census geography and ZCTA/county overlay releases plus the exact retained national ZIP summary `national-zip-coverage-20260923121929-ffe55c41`. It performs no network request, changes no production pointer, and contains no ZIP list, sample, or record row.

The status keeps distinct claims separate. Census polygon completeness applies only to the declared nation, state-equivalent, county-equivalent, and 2020 ZCTA layers and their generalized EPSG:4326 geometry. The state and county layers are current at retrieval while ZCTAs are 2020 Census geography, so their vintages are explicitly not aligned. Overlay diagnostics describe generalized polygon intersections, not allocations of businesses, addresses, or people.

The USPS operational denominator remains incomplete and unverified. The retained registry has 48,194 ZIP5 keys, all unverified against a governed current USPS denominator. A same-code 2020 ZCTA exists for 33,791 keys; 14,361 source-reported keys and 41 denominator-only keys lack a same-code ZCTA. One key is the explicit `00000` placeholder. ZIP+4 remains a separate, non-geometric address field.

Build and verify locally:

```text
npm run geography-goal-status:build
npm run geography-goal-status:verify -- data/national-geography-goal-status/releases/<release-id>/manifest.json
```

Build publishes a new immutable release but deliberately creates no `current.json`. The Data Operations panel is protected and read-only. It re-verifies the selected release and source lineage, exposes aggregate claims only, and offers no build, approval, acquisition, or production control.
