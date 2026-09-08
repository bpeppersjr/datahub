# Colorado retained local reporting

The reporting adapter consumes the independently replayed [app-owned Colorado release](CO-CHILDCARE-APP.md#verified-retained-completion--september-8-2026) without fetching the source again. A pinned enrollment binds the terminal app receipt; the loader requires recorded native execution mode and verifies the complete acquisition/normalization chain before and after summarization. Native mode is an execution claim, not independent publisher authenticity.

The state-access ledger exposes Colorado's retained source-candidate evidence separately from published national coverage. It preserves publisher cohort size, reported CO address rows, unknown-state rows, distinct reported ZIP5 groups, separate ZIP4 counts and quality gaps. Summaries retain null and other-state buckets rather than replacing missing geography with publisher scope. Missing installed evidence is unavailable, never a measured zero.

Percentages use accepted rows in this retained source cohort as their denominator. They are not percentages of all businesses in Colorado or the country, nor unique facility counts. Provider identifiers remain source identifiers; no deduplication, capacity summation, address verification, operating-status inference, exact geocoding or ZIP/ZCTA boundary assignment is added. County text is not a polygon assignment.

## Verified retained result

- 1,648 acquired and accepted source candidates; zero quarantine.
- All 1,648 source-reported states are CO; 321 distinct reported ZIP5 values.
- Three records with separate ZIP4 fields; all records have syntactically accepted ZIP5 text.
- All 1,648 lack selected coordinates and verified operating status.
- One missing capacity value; 1,647 parsed capacities. No inferred capacity total.
- Source update: September 1, 2026, 15:56:30 UTC. Acquisition completion: September 8, 2026, 22:33:56.084 UTC. These are not operating dates.

The Colorado projection therefore reports 100% of this accepted cohort as CO-addressed while leaving national industry completeness and unique active-business count null. Existing national coverage statuses, production pointers and prior-state evidence remain unchanged. Rollback removes the reporting enrollment for future reads while preserving immutable source and app history.

## Verification

The full repository check passed: 1,377 tests, 1,366 passed, 11 skipped and zero failures, plus lint, builds and desktop control-plane smoke. Type checking passed, production dependency audit reported zero vulnerabilities and all 82 pending production pins stayed unchanged. Log: `data/tmp/co-childcare-reporting-full-check.log`.

The generated report is `data/state-access/reports/20260908224527-ba7c82ad-d6a0-4569-b091-7056ef624e77.json`. Its Colorado cell contains the verified 1,648 candidates and 321 reported ZIP5 groups, with national industry percentage null. CT's 1,390, MD's 1,772 and VT's separate 503-row publisher cohort remain present. Across 51 jurisdictions and 459 industry cells, 202 retain national-dataset evidence, eight direct-state evidence, 59 unmeasured status and 190 missing status. These are evidence-status cell counts, not business completeness percentages. The management page was restored with HTTP 200 after validation.
