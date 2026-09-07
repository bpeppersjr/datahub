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

Implementation verification passed all 524 repository tests, lint, web/desktop builds, desktop smoke and TypeScript. The production dependency audit reported zero vulnerabilities. The local app was restored after checks. This supports the controller fix, not a claim that the newly planned cohort has finished or passed independent-label review.
