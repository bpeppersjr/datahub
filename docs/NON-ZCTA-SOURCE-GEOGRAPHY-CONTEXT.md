# Non-ZCTA source geography context

`non-zcta-source-geography-context@1.0.0` is a pointer-free, local-review-only derivative of three retained governed inputs: the exact ZIP denominator-gap cohort, the selected business-entity geography-relationship release, and the retained Census state-equivalent roster. It performs no network request and is not production-enrolled.

The release contains exactly 14,402 non-ZCTA ZIP5 cohort rows in 100 ZIP2 partitions. Source-reported two-letter address codes and separately retained point-assigned state FIPS are evidence about contributing business profiles only. They are never promoted into ZIP-to-state assignment, ZIP geometry, a ZIP centroid, or a state heatmap denominator. Codes absent from the Census state-equivalent roster remain uninterpreted reported tokens.

The immutable summary conserves 14,361 source-contributed and 41 denominator-only non-ZCTA keys. Of these, 8,871 have relationship profiles: 8,673 have one reported code and 198 have multiple codes. The remaining 5,531 have no relationship-profile context. One-code rows divide into 8,456 state/DC-roster codes, 126 territory-roster codes, and 91 codes outside that roster. Separate point evidence covers 336 keys and 441 profiles; 335 keys agree with at least one reported code and one conflicts.

Every row keeps state assignment, cardinal/central grouping, polygon, centroid, USPS class and validity, park, tribal or Native, private-land, population, and business-completeness fields null. The release claims `map_blocked:false`, `heatmap_integration:false`, and `state_denominator_integration:false`. It does not classify any ZIP as private, special-purpose, military, park, or tribal territory.

Build and verification replay retained bytes only:

```powershell
npm run non-zcta-source-context:build -- 2026-10-06T00:00:00.000Z
npm run non-zcta-source-context:verify
```
