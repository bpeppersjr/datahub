# National IRS EO supplemental industry evidence

`national-irs-eo-supplemental-industry-evidence@1.0.0` is an immutable, pointer-free, local-review-only view of the selected IRS EO registry overlay. It preserves all 48,194 governed ZIP keys and exactly 1,955,841 exact-EIN current-extract organization memberships, including 36,950 ZIPs with positive membership evidence.

The evidence kind is `supplemental-non-active-reporting-membership` and the operational industry is `tax-exempt-organizations`. The records are filing-address evidence only. They are not unique-business, current-operation, physical-site, every-nonprofit, completeness, USPS-validity, or additive business counts. ZIP5 and ZIP+4 remain separate; this release does not aggregate ZIP+4.

Two jurisdiction views remain deliberately separate. `geography-disposition-scopes.json` rolls the exact ZIP evidence into the existing governed 60-scope disposition: 51 state/DC scopes, five territory scopes, and four special scopes. It does not use ZIP prefixes, reported filing-address state, fractional allocation, or multi-state allocation. `reported-jurisdictions.json` preserves the overlay's 56 publisher-reported filing-address jurisdictions solely as a comparison and never overwrites the governed disposition.

The selected source posting is 2026-08-11 and was retrieved on 2026-09-03. Under the 75-day internal review policy it is stale at the 2026-11-12 assessment. The bound assessment observed a newer 2026-10-13 posting and a source-page claim of 1,975,975 cumulative records, but downloaded zero entity rows. That is recorded only as `refresh-available-not-collected`; no newer membership is inferred.

The release contains 100 deterministic ZIP2 gzip JSONL partitions, a national summary, the governed 60-scope artifact, the 56-row reported-jurisdiction artifact, and a hash-bound manifest. Rebuild and verify locally with `npm run irs-eo-supplemental-industry:build` and `npm run irs-eo-supplemental-industry:verify`. Neither operation performs network access, acquisition, pointer writes, or production enrollment.
