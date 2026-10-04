# ZIP industry and demographic cross-view

Co*Tive exposes an authenticated, bounded, read-only cross-view at:

`GET /api/business-map/zip-industry-demographic-cross-view?zip=00601`

The view composes already-governed local releases for one exact ZIP5. It returns thirty-five source-specific industry evidence cells—including separate retained CMS hospital and nursing-home directory-row categories, seven publisher-specific childcare candidate-row dimensions, eight retained registry-location-profile cohorts, and nine publisher-specific broad-organization address-row dimensions. The broad-organization source set is the pinned eight-publisher v1.0 release (CO, CT, DE, FL, IA, NY, OR, PA); Oregon legal registrations and assumed-name brands are separate. Only when the ZIP5 has an exact same-code governed Census ZCTA does it return retained 2020 Census population and housing totals. It does not scan full releases per request.

The join is deliberately narrow. A source-reported ZIP5 is not a Census ZCTA or a USPS polygon. ZIP+4 remains separate. A ZIP without a same-code governed ZCTA returns `not-applicable-no-same-code-zcta`; missing or invalid evidence fails closed instead of substituting estimates.

Industry cells retain their source-specific measures, dates, temporal status, release identity, and nonadditive semantics. The eight registry-profile cells preserve per-ZIP source-native status-kind counts; their source reference date is separated from source-observation timestamps and no refresh time is claimed. Childcare publisher candidate rows remain separate units with internal-only export policy; broad-organization counts are source-reported address rows and not businesses, sites, or current operations. DE remains local-review-only. Out-of-cohort positive source ZIPs, broad source-address rows without eligible ZIP5, and the non-ZIP Maryland childcare `invalid-source-zip-range` exception remain three distinct gap categories. Population and housing are aggregate 2020 Census context only. The contract computes no ratios, cross-industry totals, demographic shares, allocation weights, ZIP GDP, industry GDP, current-operation claim, or USPS-validity claim.

The State Completion workspace separately exposes retained state/local evidence for broad-layer gap jurisdictions. That adjacent evidence remains outside the broad organization denominator and does not change state completion.
