# Credential category comparison across states

The local coverage dashboard now consumes the verified Minnesota credential reporting release in a separate category-comparison view. This is reporting evidence alongside the national business dataset, not incorporation into its registry, identity matching, site counts or completeness totals. Existing state/ZIP aggregate browsing remains available.

## Evidence and operation

`config/credential-coverage-enrollment.json` pins release `30cd9c0e-0a8d-467c-b416-150453e1513f` by its exact manifest SHA-256, `558182417940580140fbc4640e80ac177b6a9c1886a435f06ae8130b1f258b75`. `loadCredentialCoverageEnrollment` verifies the full derived/source chain, reads and hashes credential rows through the existing bounded reader, aggregates them, then rechecks the chain and enrollment. An unavailable configured release is unavailable—not zero and not an instruction to download it again.

The existing authenticated, loopback-only `GET /api/retained-credentials` endpoint accepts:

- `view=categories` for category/state comparisons, or `view=postal` (the legacy default) for state/ZIP aggregates;
- an optional `state` from the 50 states or D.C.;
- an optional fixed `category` in category mode only;
- bounded `offset` and `limit` pagination, with a maximum page size of 100.

Unknown, duplicate or malformed filters fail before loading evidence. The app coalesces concurrent verification of the same view but does not cache completed evidence between later requests. No fetch, scheduler activation, acquisition, source-pointer write or national build occurs. Responses contain only aggregate counts and bounded provenance identifiers/hashes—not record names, addresses, source paths or contacts. Record-level browsing and map placement are not introduced by this change.

The dashboard preserves its existing layout and adds comparison/category selectors, resets pagination when filters change, clears stale results, and cancels obsolete client requests. Missing evidence and verification errors never render numeric zeros. Empty pages, zero denominators and zero rows in an installed cohort remain distinct. The user can still select reported state/ZIP totals without using the new reporting release.

## Denominators and geography

`credential-coverage@1.0.0` validates each typed reporting record, rejects duplicate source-row identities and caps a supplied cohort at 250,000 rows. Same-license records with distinct source-row IDs remain distinct. The matrix has exactly 50 state rows plus D.C., each with the five supported credential categories. A separate outside/unresolved bucket conserves territories, unrecognized states and unavailable state values; it is not silently included in the 50-state/D.C. denominator.

| Percentage | Denominator |
| --- | --- |
| Within-state category percentage | All accepted credential rows reporting that state |
| State share of a category | Accepted rows in that category reporting any of the 50 states or D.C. |
| State share of the scoped cohort | All accepted rows reporting any of the 50 states or D.C. |

Filters and pagination do not shrink these denominators. A zero denominator returns null and displays “—”. A zero count means zero rows in the **supplied retained cohort**, not a measured absence of businesses or credentials in the real world. The registrations category has no rows because that separate cohort is not included; this does not certify zero registrations. Unique-business count, physical-site count and national completeness remain null.

Publisher jurisdiction is MN. Classification uses the reported address state, not the publisher's state and not an inferred operating location. ZIP5 and ZIP4 remain separate, missing ZIPs are counted, and no county/ZCTA/USPS validity, source geocode, physical-site membership or business polygon is manufactured.

## Observed installed evidence — September 8, 2026

Independent loading confirms 11,456 accepted credential rows, all reporting one of the 50 states or D.C., with one missing ZIP5. The view represents 51 jurisdictions even though only 34 have rows in this cohort. Category totals are 10,835 building contractors, 425 remodelers, 139 roofers and 57 manufactured-home installers.

For example, 110 roofer rows report MN: approximately 1.009% of the 10,899 MN-address credential rows and 79.137% of the 139 roofer rows across this cohort's 50-state/D.C. addresses. Neither number measures Minnesota's share of all U.S. roofing businesses. These differing denominators are visible as separate columns.

## Rollback and remaining work

Revert the added UI mode and API branch and remove the new coverage enrollment/modules after checking active app operations. Preserve all original and derived data. The old postal view remains compatible; no published national pointer migration needs rollback. Full national registry/coverage/map/export integration still requires explicit credential evidence types and eligibility rules. No pending production code/configuration pin is changed by this view.

## Validation

Fourteen focused tests passed, covering conservation, all 51 jurisdictions, outside/unresolved rows, category/state fractions, same-license row separation, cancellation, invalid filters, pagination, unavailable/tampered enrollment and concurrent request coalescing. The exact retained-data test ran on this machine; it explicitly skips when its internal fixture is absent and never acquires a replacement.

The restored local API returned 401 without authentication and 200 for the authenticated MN/roofer selection, matching the 110 rows and both percentages above. Its response pinned the expected reporting-manifest hash and kept national integration false. The management route compiled and returned HTTP 200. No browser interaction or visual QA was performed; the existing layout and local-only hosting choice were preserved.

`npm run check` passed with 1,190 tests (1,179 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop smoke. TypeScript passed, the production audit reported zero vulnerabilities, and all 82 pending production code/config pins remained unchanged. No new source download or national promotion was dispatched.
