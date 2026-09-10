# Retained childcare county map

The standalone business-intelligence map now offers **Retained childcare county points (PA)**. Its right-hand summary displays assigned source-point rows and the selected county's share of all assigned Pennsylvania points. These are source records, not verified active businesses, unique establishments or an estimate of nationwide industry completeness.

## Explicit saved release

`config/retained-childcare-county-enrollment.json` selects derivative run `35c6318f-aa0b-4d21-acd4-9581dd660db4`, manifest SHA-256 `68dfec10cde09b9e2be0fff07a7e4395ea12dc30f5207096af83755e7972887c`. The loader accepts this exact reviewed binding, checks the saved manifest and county index, and exposes only aggregate counts. It does not download, publish, launch a worker or replay source normalization on a map request.

The layer contains 4,930 assigned source points from 4,995 selected PA rows across 67 Census counties. A county with no assigned points is a measured zero for this selected cohort, not proof of zero businesses. Missing enrollment, mismatched geography, ZIP scope and other states return unavailable/null rather than zero. The complete derivative retains 12,206 source rows, including explicit missing-point, unknown-CRS and not-enabled gaps. See [the derivative contract](RETAINED-CHILDCARE-COUNTY-RELATIONS.md).

The map response carries its actual geography-manifest checksum; the panel uses that response, not a potentially stale catalog. Selected state/county geometry bytes are checked against their declared checksum before this layer is served. Changing a coverage or geography manifest invalidates the map index. The GET endpoint `/api/business-map/retained-childcare-counties` remains under the existing loopback control-plane protection and rejects query parameters.

## Current production compatibility

Coverage 2.11 is explicitly paired with registry 2.15. Its retained registry bytes and Tennessee origin must match; recovered, fresh and absent Tennessee are separate cases. Older supported pairs retain their contracts, while unsupported versions carrying these extensions are rejected. Tennessee ZIP-unavailable records remain in reported-state totals and in valid-point county totals without inferred ZIPs.

Ohio names are verified against retained app/source evidence, with exact row membership, checksum-bound reporting partitions, source lineage and duplicate rejection. They retain `governed_geographic_assignment_eligible: false`, `identity_matching_eligible: false`, local-review-only policy and separate ZIP5/ZIP4 fields. This names path performs local source verification, not acquisition. Ohio is excluded from category-to-county aggregation and its exact source contribution is also subtracted from jurisdiction-aggregated unit/site totals. Reported ZIP evidence is not permission to assign its business entities to a county.

Names and heatmap counts intentionally have different eligible populations: Ohio reported names can be browsed even though they are excluded from the geographic category count. Neither is a complete business universe. The PA saved-point layer does not alter national production pointers or original source observations; derivative creation is not source freshness.

## Verification and rollback

Native checks against the current September 10 production release returned 67 PA counties totaling 4,930 assigned points, and 19 Ohio reporting records for ZIP 43215 with geographic assignment disabled. Regression coverage includes exact version/origin pairs, retained-byte drift, cache invalidation, negative exclusion counts, missing unassigned partitions, Tennessee conservation and panel unavailable states. These checks do not prove source currency, matching accuracy or national completeness. No browser visual inspection is claimed.

The final `npm run check` exited successfully: 1,819 tests, 1,808 passed, 11 skipped and zero failures, followed by successful lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/retained-county-map-final-check.log`. TypeScript passed and the production dependency audit reported zero vulnerabilities. The run enabled the retained county, PDF, Iowa, retained-cohort, Overture-runtime, Oklahoma and NH prerequisites used by the preceding release.

Earlier attempts exposed an isolated UI harness missing the new panel mock, followed by lint's synchronous-effect state update rule. Both were corrected before the final clean run. The panel now binds its asynchronous result to the exact map response revision and withholds stale data without synchronous effect writes. The focused retained-data run passed all 29 tests; all 10 focused UI tests passed after the refresh-state correction. These earlier failures are retained in the prior logs, not presented as successful complete checks.

The local app was restored at `http://localhost:3000/`. A non-browser request returned HTTP 200. Authenticated live catalog/display/features checks returned 67 PA counties totaling 4,930 points with matching geography hashes. The new endpoint rejected a missing token with 401 and unexpected query parameters with 400. No operation was submitted by those checks. The refresh scheduler still reported unavailable and was not enabled or reclaimed. No production process or current pointer was changed.

To disable the display, remove its explicit enrollment while retaining the derivative and all source evidence. Code rollback must preserve existing production releases and historical receipts. Do not run a new production build or repeat acquisition merely to revert a display feature.

The next geographic expansion is specified in [Maryland's retained county successor design](MD-CHILDCARE-COUNTY-DERIVATION-DESIGN.md). It uses verified acquisition-time metadata and a separate versioned processing policy; no Maryland overlay is activated by this map release.
