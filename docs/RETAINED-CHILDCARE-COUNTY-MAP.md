# Retained childcare county map

The standalone business-intelligence map now offers **Retained childcare county points (PA + MD)**. Its right-hand summary displays assigned source-point rows for the selected geography, with Pennsylvania and Maryland source contributions and percentages shown separately. These are source records, not verified active businesses, unique establishments or an estimate of nationwide industry completeness.

## Explicit saved release

`config/retained-childcare-county-enrollment.json` selects derivative run `b660d059-25c4-44fc-8c4a-b94bc87d855e`, manifest SHA-256 `be0798c546d0016d7633c563f73e62734358cd0a8dd0025c28e35a0cdc3298ee`, under display contract 2.0.0. The loader accepts this exact reviewed binding, checks the saved manifest and county index, and exposes only aggregate counts. It does not download, publish, launch a worker or replay source normalization on a map request. The PA-only v1 derivative and its original inspector remain unchanged.

The layer contains 4,930 assigned source points from 4,995 selected PA rows and 1,772 assigned points from 1,772 selected MD rows, across 67 Pennsylvania counties and 24 Maryland county equivalents. A supported county with no assigned points is a measured zero for this selected cohort, not proof of zero businesses. Missing enrollment, mismatched geography, ZIP scope and other states return unavailable/null rather than zero. The complete derivative retains 12,206 source rows, including 4,028 missing-point and 1,476 unknown-CRS gaps. See [the v2 derivative contract](MD-CHILDCARE-COUNTY-SUCCESSOR.md).

Geographic totals are summed from assigned counties, never from the global assigned count or the publisher's state. Each source cohort retains its own selected/assigned totals, disposition counts and county contributions. The panel's percentages divide the selected geography's contribution from that source by all assigned rows from the same source. A cross-state assignment therefore stays attributed to its original source, not the destination state's publisher. This is not the state's share of all U.S. childcare businesses. ZIP membership is not inferred.

The map response carries its actual geography-manifest checksum; the panel uses that response, not a potentially stale catalog. Selected state/county geometry bytes are checked against their declared checksum before this layer is served. Changing a coverage or geography manifest invalidates the map index. The GET endpoint `/api/business-map/retained-childcare-counties` remains under the existing loopback control-plane protection and rejects query parameters.

## Current production compatibility

Coverage 2.11 is explicitly paired with registry 2.15. Its retained registry bytes and Tennessee origin must match; recovered, fresh and absent Tennessee are separate cases. Older supported pairs retain their contracts, while unsupported versions carrying these extensions are rejected. Tennessee ZIP-unavailable records remain in reported-state totals and in valid-point county totals without inferred ZIPs.

Ohio names are verified against retained app/source evidence, with exact row membership, checksum-bound reporting partitions, source lineage and duplicate rejection. They retain `governed_geographic_assignment_eligible: false`, `identity_matching_eligible: false`, local-review-only policy and separate ZIP5/ZIP4 fields. This names path performs local source verification, not acquisition. Ohio is excluded from category-to-county aggregation and its exact source contribution is also subtracted from jurisdiction-aggregated unit/site totals. Reported ZIP evidence is not permission to assign its business entities to a county.

Names and heatmap counts intentionally have different eligible populations: Ohio reported names can be browsed even though they are excluded from the geographic category count. Neither is a complete business universe. The PA/MD saved-point layer does not alter national production pointers or original source observations; derivative creation is not source freshness.

## Historical PA-only verification

Native checks against the current September 10 production release returned 67 PA counties totaling 4,930 assigned points, and 19 Ohio reporting records for ZIP 43215 with geographic assignment disabled. Regression coverage includes exact version/origin pairs, retained-byte drift, cache invalidation, negative exclusion counts, missing unassigned partitions, Tennessee conservation and panel unavailable states. These checks do not prove source currency, matching accuracy or national completeness. No browser visual inspection is claimed.

The final `npm run check` exited successfully: 1,819 tests, 1,808 passed, 11 skipped and zero failures, followed by successful lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/retained-county-map-final-check.log`. TypeScript passed and the production dependency audit reported zero vulnerabilities. The run enabled the retained county, PDF, Iowa, retained-cohort, Overture-runtime, Oklahoma and NH prerequisites used by the preceding release.

Earlier attempts exposed an isolated UI harness missing the new panel mock, followed by lint's synchronous-effect state update rule. Both were corrected before the final clean run. The panel now binds its asynchronous result to the exact map response revision and withholds stale data without synchronous effect writes. The focused retained-data run passed all 29 tests; all 10 focused UI tests passed after the refresh-state correction. These earlier failures are retained in the prior logs, not presented as successful complete checks.

The local app was restored at `http://localhost:3000/`. A non-browser request returned HTTP 200. Authenticated live catalog/display/features checks returned 67 PA counties totaling 4,930 points with matching geography hashes. The new endpoint rejected a missing token with 401 and unexpected query parameters with 400. No operation was submitted by those checks. The refresh scheduler still reported unavailable and was not enabled or reclaimed. No production process or current pointer was changed.

To disable the display, remove its explicit enrollment while retaining the derivative and all source evidence. Code rollback must preserve existing production releases and historical receipts. Do not run a new production build or repeat acquisition merely to revert a display feature.

## PA/MD successor validation

Focused native display and map checks verified the exact v2 binding, Pennsylvania's 4,930 rows and Maryland's 1,772 rows separately. Synthetic cross-state tests verify source-specific denominators and summed geographic counts; an asynchronous response-order test rejects an older response after selection changes. Missing evidence, invalid enrollment, changed manifest, geography mismatch and unsupported ZIP scope retain their failure/unavailable behavior.

`npm run check` passed with 1,832 tests: 1,821 passed, 11 skipped, zero failures, followed by successful lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/md-county-map-full-check.log`. Both native v1 and v2 evidence prerequisites were enabled. TypeScript passed and the production dependency audit reported zero vulnerabilities. Independent read-only review found no blocker. No browser visual QA was performed.

The local preview was restored and returned HTTP 200. Authenticated live display and feature requests verified both cohorts and 91 county features totaling 6,702 rows (PA 4,930; MD 1,772), with matching geography hashes. Missing authentication returned 401 and unexpected query parameters returned 400. No operation was submitted. The scheduler's existing unavailable condition was not changed or reclaimed. The Sites workflow preserved the existing local architecture; no cloud registration, storage or deployment was performed.

To revert to the PA-only display, restore its matching code and enrollment together; changing only the enrollment fails closed. Preserve both derivatives and all source evidence. This display change does not require a national production build or a source refresh.
