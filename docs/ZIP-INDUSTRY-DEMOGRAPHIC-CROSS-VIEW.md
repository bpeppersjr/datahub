# ZIP industry and demographic cross-view

Co*Tive exposes an authenticated, bounded, read-only cross-view at:

`GET /api/business-map/zip-industry-demographic-cross-view?zip=00601`

The view composes already-governed local releases for one exact ZIP5. It returns eighteen source-specific industry evidence cells—including separate retained CMS hospital and nursing-home directory-row categories and seven publisher-specific childcare candidate-row dimensions—and, only when the ZIP5 has an exact same-code governed Census ZCTA, the retained 2020 Census population and housing totals. It does not scan full releases per request.

The join is deliberately narrow. A source-reported ZIP5 is not a Census ZCTA or a USPS polygon. ZIP+4 remains separate. A ZIP without a same-code governed ZCTA returns `not-applicable-no-same-code-zcta`; missing or invalid evidence fails closed instead of substituting estimates.

Industry cells retain their source-specific measures, dates, temporal status, release identity, and nonadditive semantics. Childcare publisher candidate rows remain separate units with internal-only export policy; they are not deduplicated businesses or proof of current operation. Out-of-cohort positive source ZIPs and non-ZIP source-quality gaps remain in distinct sidecars. Population and housing are aggregate 2020 Census context only. The contract computes no ratios, cross-industry totals, demographic shares, allocation weights, ZIP GDP, industry GDP, current-operation claim, or USPS-validity claim.

The State Completion workspace separately exposes retained state/local evidence for broad-layer gap jurisdictions. That adjacent evidence remains outside the broad organization denominator and does not change state completion.
