# National business lifecycle industry-ZIP evidence v1.1

Version 1.1 refines retained v1.0 with exact-lineage EPA ECHO operational-segment evidence. V1.0 remains immutable history. All 48,194 ZIP5 rows, cohort classifications, 8,011,213 source memberships, lifecycle counts and review counts remain conserved.

EPA has 1,517,826 facility memberships. Segment evidence identifies a 294,477-record mapped union and 296,595 nonadditive assignments; 2,107 records are multisegment. Another 25,035 mapped records contain unresolved codes. The remaining 1,223,349 EPA records retain an unresolved segment disposition. FSIS remains fully unmapped.

Industry assignment counts are source evidence, not unique businesses: retail 484,508; health care 2,118,021; financial services 101,618; transportation 2,242,612; construction 93,917; childcare 177; sales-tax outlets 885,097; local licenses 856,795; tax-exempt organizations zero. Current operation and completeness remain unverified.

The pointer-free release has 100 gzip ZIP-prefix partitions, an empty outside-cohort artifact and a summary. Its verifier replays every input/output byte and rejects drift.

```text
npm run business-lifecycle-industry-zip:build
npm run business-lifecycle-industry-zip:verify
node --test runner/national-business-lifecycle-industry-zip-evidence-v1-1.test.mjs
```

No network request, acquisition, pointer write or production enrollment occurs. ZIP+4 remains separate and no USPS denominator is inferred.

## Protected runtime API

The selected v1.1 runtime hard-pins the registration, release manifest, summary, all 100 ZIP-prefix partitions, and the exact EPA manifest and dense ZIP artifact lineage. `GET /api/business-map/lifecycle-industry-zip-summary` reads only the compact summary. `GET /api/business-map/lifecycle-industry-zip?zip=00501` decompresses only the selected two-digit partition and returns a governed positive row, governed zero-profile row, or outside-cohort result.

The runtime reports `source_membership_count`, the deduplicated `mapped_source_record_union_count`, the disjoint `unresolved_source_record_count`, and the intentionally nonadditive `industry_assignment_count` separately. EPA multisegment and partially-unmapped counts are overlapping annotations, not extra memberships. All reads are bounded, stable and link-rejecting; schema, lifecycle, review, union, assignment and EPA refinement drift fails closed.
