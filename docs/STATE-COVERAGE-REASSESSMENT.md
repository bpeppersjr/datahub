# Coverage reassessment without rewriting source history

`runner/state-coverage-reassessment.mjs` explicitly recognizes two reviewed transitions from September 2 coverage `national-business-coverage-views-20260902-115337634Z-ba689784`: the initial September 7 release `national-business-coverage-views-20260907-174411739Z-4169d204` and the completed D.C.-refresh release `national-business-coverage-views-20260907-223035676Z-eaf37740`. Both transitions retain exact manifest and state-artifact SHA-256 pins; the earlier reviewed release remains supported. Unknown releases, modified files, missing/duplicate jurisdictions, changed identities or changed reported source rosters require new review. This is not a blanket stale-catalog waiver.

The old and new 56-row artifacts have genuine profile-count differences. The reassessment preserves historical and current coverage projections separately, compares reported source rosters, and records the current readiness-policy classification. It does not claim identical data or fresh source-policy evidence. No historical queue, observation date, policy finding, acquisition authorization, or hold is rewritten.

Discovery validation still verifies every original queue content digest. For queues 6, 7 and 8 it substitutes freshly derived coverage projections in in-memory copies and executes the existing rank-selection validators against the exact hash-verified current rows. Their selected states/order remain unchanged. Assessment validation still verifies the historical catalog's content and decision totals; its separate reassessment covers all 33 catalog jurisdictions against the new artifact. Output expressly distinguishes fresh coverage/rank calculations from September 3 source reviews. The state ledger's historical `assessmentCoverageMatchesCurrent:false` remains truthful, not forcibly changed to true.

Source-scope labels come from the current readiness policy, not a new remote-source inspection. The reported source-key roster check is separate. Neither count changes nor stable ranking proves source rights, business operating status, all-business completeness, or record-level export approval. The diagnostic profile-to-nonemployer ratio is retained solely to reproduce existing queue priorities; it is not an industry completeness measure.

Four focused tests cover distinct historical/current counts with unchanged policy authority, malformed jurisdiction sets, unknown release transitions and changed source rosters. Peer review prompted use of the exact pinned rows for rank checks and explicit distinction between policy classification and reported source evidence. The module and command outputs provide reproducible local reassessment evidence; this introduces no new acquisition, source publication, or dataset migration.

Combined D.C. enrollment/reassessment verification passed all 521 repository tests, lint, web/desktop builds, desktop control-plane smoke and TypeScript. The production dependency audit reported zero vulnerabilities. The original freshness failure was resolved with checked new coverage projections and rank validation, not by rewriting old catalog dates or claiming unchanged counts.

## Completed D.C. refresh review

The second transition is `state-coverage-reassessment-20260907-dc-refresh`. Read-only inspection verified the new manifest hash `6add23501019da0e5c503f3a7eaada6ce5e653362866f29741b302fa5ed6beb8` and the 212,091-byte, 56-row state artifact hash `ca25ca31b50144ca1167475b75ca8ca6e3df3f252e8ce4aa7bb137e270133bef`. The historical September 2 manifest/state hashes remain `594e8bcd3add044662815598eba86138e2657562147b3d79357cfb423de6b672` / `6a3d4054953190a2f6f43c94630e2edaf2bd6e6d87039fd7f2b0af56916860a4`; initial September 7 hashes remain `66484ec880b47164d269318039e402fd7e304e4aef8f442e1ecc3b7d509a3d01` / `4d02b711e45a4fd69f633f9f91349712f21066afd50c95926cdb89d01a5bb330`.

The existing comparison passed for all 56 jurisdiction identities, reported source-key rosters and current-readiness-policy classifications, both September 2 → completed refresh and initial September 7 → completed refresh. Against September 2, 30 coverage projections differ, with net +108 reported-address profiles and +25 coordinate-assigned profiles. Against the previously reviewed September 7 snapshot, the actual changes are:

| Jurisdiction | Reported-profile change | Coordinate-profile change |
|---|---:|---:|
| CA | +1 | 0 |
| DC | 0 | +1 |
| MD | +3 | 0 |
| MA | +1 | 0 |
| MI | +1 | 0 |
| MN | +1 | 0 |
| NY | +2 | 0 |
| OH | +1 | 0 |
| PA | −1 | 0 |
| TN | +1 | 0 |
| TX | +1 | 0 |
| VA | +6 | 0 |
| WI | +1 | 0 |
| Net | +18 | +1 |

All 12 changed reported-source counts belong to `dc-dlcp-active-basic-business-licenses`; D.C.'s own reported count remains unchanged while its coordinate-assigned count rises by one. Nonemployer baselines, material ZCTA counts and ZCTAs with record-level evidence are unchanged against the prior September 7 review. These are source-profile changes, not newly verified businesses, source-policy renewals, or industry-completeness estimates. No MA/NJ childcare source is silently added by this transition; a future changed source roster still requires explicit review.

The added tests load both exact retained transitions, recheck the 56-state comparisons and count deltas, preserve historical policy-authority flags, and reject substituting a different manifest path under a reviewed release ID. Discovery/readiness checks must still recompute their historical queue ranks against the new pinned rows. This change performs no source request, dataset publication, schedule activation or catalog-date rewrite.

Verification for this extension: seven focused tests and scoped ESLint passed. Both `check-state-business-source-discovery.mjs` and `check-state-business-source-assessments.mjs` passed against the exact new current release. Queue 6 (MI, TN, MA, AZ), Queue 7 (MD, MO, IN, SC) and Queue 8 (LA, MN, AL, WI) selections remain unchanged. The assessment catalog still reports 33 assessed jurisdictions, 31 holds and zero autonomous acquisitions authorized; historical source reviews remain dated September 3. Full-repository validation is a separate integration step, not implied by these focused checks.
