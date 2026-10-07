# Current-matrix broad-organization authorization wave

This separate immutable `broad-organization-current-matrix-authorization-wave@1.0.0` release is derived from the independently verified current matrix-gap projection. Wave 1 selects the ten smallest historical backlog priorities that remain among the 40 current gaps: IL, MS, AR, KY, HI, KS, NV, UT, WA, and OK. Wave 2 selects the next ten: AL, AZ, CA, GA, ID, IN, LA, MA, MD, and ME. Wave 3 selects MI, MN, MO, MT, NC, ND, NH, NJ, NM, and OH. Wave 4 selects the final ten: RI, SC, SD, TN, VA, VT, WI, WV, WY, and NE. Each wave after the first is cryptographically bound to the immediately prior published and verified wave; verification follows the chain back to wave one. AK, DC, and TX are not selected because their broad layers are currently admitted. Conservation is wave 2: 10 prior + 10 selected + 20 remaining; wave 3: 20 + 10 + 10; wave 4: 30 + 10 + 0. No historical backlog, authorization program, or first-wave packet is rewritten.

Every state and gate item is explicitly `approval-only` and `HOLD`. Full assessment snapshots, gate provenance, and required exclusions are preserved. The packet grants no acquisition authority and performs no source, network, pointer, or production action.

The current October 7 chain binds projection `broad-organization-matrix-gap-projection-2026-10-07T05-23-37.982Z-2de794ce5041`. Its releases are wave 1 `broad-organization-current-matrix-authorization-wave-2026-10-07T05-23-37.982Z-b24bf77e7a7f`, wave 2 `broad-organization-current-matrix-authorization-wave-2026-10-07T05-23-37.982Z-783dd5b4b76b`, wave 3 `broad-organization-current-matrix-authorization-wave-2026-10-07T05-23-37.982Z-55a39892e289`, and wave 4 `broad-organization-current-matrix-authorization-wave-2026-10-07T05-23-37.982Z-daecfc439b83`. Verification follows the full chain and conserves all 40 current gaps.

The existing authenticated current-chain management view also derives a separate **Weakest comparable diagnostic batch** after it verifies the complete four-wave chain and its source projection. This does not create a release, endpoint, query, action, or alternate wave order. Of the 40 current gaps, 31 have arithmetic-valid source-profile comparisons bound to the same `national-business-coverage-views-20260902-115337634Z-ba689784` release and nine are unavailable. Unavailable values are not zero and are excluded from ranking. Sorting the 31 comparable ratios ascending, with jurisdiction code as the deterministic tie breaker, yields TN, VA, AZ, RI, NJ, OH, VT, SC, MA, and NH. The ratio is reported source profiles divided by the 2023 Census nonemployer baseline. That baseline is not an all-business denominator and the ratio is not business completeness. The diagnostic batch remains `HOLD` and grants no source action, contact, payment, download, record request, acquisition, network request, pointer change, or production authority.

Build and verify a release locally:

```powershell
npm run broad-org-current-wave:build
npm run broad-org-current-wave:build -- --wave 2
npm run broad-org-current-wave:build -- --wave 3
npm run broad-org-current-wave:build -- --wave 4
npm run broad-org-current-wave:verify -- --manifest data/broad-organization-current-matrix-authorization-wave/releases/<release-id>/manifest.json
```
