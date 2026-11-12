# National business lifecycle industry-ZIP evidence

This immutable pointer-free release projects the registered dense lifecycle-by-ZIP evidence through the closed lifecycle operational-industry crosswalk. It preserves all 48,194 governed ZIP5 keys, their four cohort classifications, all 8,011,213 source memberships, lifecycle and review counts, and sparse source provenance.

Every ZIP row contains all nine operational industries, including explicit zero membership where the retained lifecycle sources provide no mapped evidence. Thirteen sources are mapped. EPA ECHO and USDA FSIS remain explicitly unmapped because their regulated cohorts are not equivalent to one operational business segment; their 1,525,063 memberships remain conserved separately rather than being discarded or forced into an industry.

The release contains 100 bounded gzip JSONL partitions by two-digit ZIP prefix, an empty outside-cohort gzip artifact, and a summary artifact. The builder binds the registered lifecycle ZIP release and closed crosswalk by exact hashes. The verifier independently replays every source partition, recomputes every output byte, checks the closed inventory, and rejects tampering.

Memberships are source-relative and nonadditive across sources and industries. They are not unique or active businesses, verified current operations, USPS ZIP assignments, or completeness percentages. ZIP+4 remains separate. The release performs no network request, acquisition, production enrollment or pointer write.

```text
npm run business-lifecycle-industry-zip:build
npm run business-lifecycle-industry-zip:verify
node --test runner/national-business-lifecycle-industry-zip-evidence.test.mjs
```

## Protected runtime API

The read-only runtime hard-pins the registration, manifest, crosswalk, summary and closed 100-partition inventory. It uses stable bounded non-link reads. A summary request reads only the compact summary artifact; an exact-ZIP request decompresses only its two-digit ZIP partition with strict compressed, decoded and line bounds.

- `GET /api/business-map/lifecycle-industry-zip-summary` returns the national summary.
- `GET /api/business-map/lifecycle-industry-zip?zip=00501` returns one exact governed ZIP row or an explicit outside-cohort result.

The API distinguishes a governed zero-profile row from a ZIP absent from the governed cohort. Neither status establishes zero businesses or an invalid ZIP. Returned industry counts remain nonadditive source-relative memberships, not unique businesses, completeness, current operations, USPS assignments or ZIP+4 evidence.
