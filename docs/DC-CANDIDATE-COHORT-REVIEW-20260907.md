# D.C. refresh: candidate cohort review

Comparison on September 7 found exactly one changed source among 25 candidate/production pairs: `dcBasicBusinessLicenses`. The other 24 manifest hashes match production, not merely their release names. D.C. changes from `dc-basic-business-licenses-20260903-004027713Z-3c6b5055` to the verified candidate `dc-basic-business-licenses-20260907-175749194Z-aec3b0ac`. Its source snapshot is September 7 rather than September 2. No source repull is needed.

| D.C. measure | Production | Candidate |
| --- | ---: | ---: |
| Source activity rows | 70,156 | 70,276 |
| Source customer groups | 67,509 | 67,606 |
| Accepted activity rows | 57,378 | 57,418 |
| Provisional licensed sites | 54,892 | 54,910 |
| Quarantined rows | 12,778 | 12,858 |
| Quarantine rate | 18.2137% | 18.2964% |
| Source-geocoded sites | 42,743 | 42,744 |
| Source coordinate conflict sites | 1 | 0 |
| Outside-D.C. premises | 10,837 | 10,855 |
| Source ZIP codes | 3,123 | 3,125 |

D.C.-premise count remains 44,055; the net 18-site increase is outside-District premises under the publisher-jurisdiction scope. These net changes are not claims that precisely 18 new businesses opened. Individual additions, removals and changed fields require record comparison. The candidate retains source-defined active-license semantics, quarantines unpublishable names/addresses, and does not authorize record-level export or prove all-business completeness.

The isolated reconciliation plan `candidate-dc-refresh-20260907-01` pins all 25 candidate inputs and local baselines, with SHA-256 `f1efaddb3498d4b2a6749890847bc96f747993064b696eda3bafe1d99bc16600`. It runs registry build/verify, resolution build/verify, benchmark build/verify and coverage build/verify into a separate run directory. It is computational rebuilding from retained local inputs, not acquisition. Production pointers remain unchanged. Available disk observed before planning was 341,812,244,480 bytes; this observation is not a reserved-space guarantee.

Preflight inspection caught the production controller's previously fixed status bug duplicated in the candidate controller: its benchmark output check also required a published prefix. The candidate controller now accepts exactly `awaiting-independent-labels` for benchmark samples while other datasets retain their own published-status checks. Tests use the actual benchmark status in successful chains and reject published-prefix benchmark samples or unlabelled registry output. No independent-label gate is relaxed.

The plan is not a completed reconciliation or promotion receipt. Inspect `data/reconciliations/runs/candidate-dc-refresh-20260907-01/receipt.json` for execution outcome. Do not start another run merely because observation takes time; the standalone controller owns execution. Prior candidates, source downloads and production reporting releases remain retained.

## Subsequent completion review

### Verified production reporting completion

`production-dc-refresh-20260907-01` finished `SUCCEEDED` at `2026-09-07T22:30:39.435Z`. All eight build/verify stages exited zero. Independent post-run checks matched the eight log byte counts and SHA-256 hashes, all four current-pointer hashes and all four output-manifest hashes against the receipt. The controller and child processes exited and `data/reconciliations/controller.lock` was released. Receipt SHA-256: `5a1cd26d36e5e407fd0a255c3174b3db86d664ddf985c5b8e5442f267212d227`.

The registry is `national-business-registry-20260907-201119931Z-caaed124`, manifest SHA-256 `93f2c13c246142629509b32ce5bcefeec5310fda85f1df082d82209255d70df4`. All registry coverage fields match the earlier verified candidate, including 33,979,582 source records and 8,011,835 provisional sites. These are not deduplicated active-business counts.

The resulting coverage release is `national-business-coverage-views-20260907-223035676Z-eaf37740`, manifest SHA-256 `6add23501019da0e5c503f3a7eaada6ce5e653362866f29741b302fa5ed6beb8`. It reports 995,293 coordinate-assigned profiles, 7,016,542 profiles without valid coordinate assignment and 28,073 explicit gap views. Its 48,190 ZIP views are a source/baseline union, not an authoritative current USPS ZIP denominator. The benchmark still awaits independent labels; matching accuracy and nationwide completeness remain unapproved. MA/NJ childcare releases are retained separately and are not included in this 25-source rebuild.

This was an app-owned local rebuild using retained source evidence, not acquisition. Historical paragraphs below describe the earlier dispatch/promotion state; they do not override this terminal receipt. Future state-coverage reassessment must explicitly account for the new coverage release rather than silently replacing historical pins.

### Source promotion after completion

Fresh cutover plan `data/migrations/normalized-us-postal-fields-v1/cutover-dc-refresh-20260907-01.json`, SHA-256 `882452f49b709aed47d15ad219f67765d91b35732f05815ff8a0d8b192674aa3`, verified 539 artifacts totaling 18,769,220,742 bytes across 25 retained candidate sources. Only D.C. differed from the production source pointers. Cutover `20260907200813125-4b81b029-4922-4e1f-8c03-09ac625b3730` finished `COMMITTED`, revision 53. Subsequent hash checks matched all 25 production source pointers to the plan's candidate pins. Prior releases and cutover rollback evidence remain retained; no source was redownloaded.

This source promotion does not instantly replace registry, resolution, benchmark or coverage releases. Production reconciliation plan `production-dc-refresh-20260907-01`, SHA-256 `ec3ea805251e086e576898d448211856a5e7a8746bccd9f037b2067f3fee3587`, targets the promoted inputs. Its execution receipt must prove completion before claiming refreshed reporting. Independent benchmark labels remain a separate unmet accuracy gate; no automatic entity merging or whole-country completeness claim is authorized.

That app-owned production run started at 2026-09-07T20:11:10.836Z. The controller (PID 19040) and registry-build child (PID 14996) were confirmed live after dispatch. Receipt: `data/reconciliations/production-runs/production-dc-refresh-20260907-01/receipt.json`. This is a dated running observation, not a completion claim. Do not restart because it takes time or edit its pinned inputs while it is active. All 626 tests, lint, web/desktop builds, desktop smoke and TypeScript passed before dispatch; the production dependency audit reported zero vulnerabilities.

The app-owned run finished `SUCCEEDED` on September 7 at 19:30:15.929Z, with all eight stages exiting zero. The subsequent read-only review reproduced the byte counts and SHA-256 hashes of all eight stage logs and the hashes of all four build manifests against the receipt. It did not independently rehash all multi-gigabyte artifacts; their verification is evidenced by the completed verifier stages and retained logs. No source was repulled for this reconciliation or review.

The completed candidate reporting artifacts remain isolated from production reporting. Following the source promotion recorded above, production reconciliation remains necessary. The benchmark still requires independent labels; successful benchmark artifact verification does not establish match accuracy or authorize entity merging. Preserve the prior cohort and rollback evidence. Do not reuse a stale cutover plan or describe the net source changes as newly opened businesses.

Implementation verification passed all 524 repository tests, lint, web/desktop builds, desktop smoke and TypeScript. The production dependency audit reported zero vulnerabilities. The local app was restored after checks. This supports the controller fix, not a claim that the newly planned cohort has finished or passed independent-label review.
