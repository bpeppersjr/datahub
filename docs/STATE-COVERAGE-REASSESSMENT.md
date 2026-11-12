# Coverage reassessment without rewriting source history

The verified transition chain is also the sole authority for schema-3 state-access `reviewed-compatible` applicability. That status reconciles an assessment with a later coverage artifact offline; it leaves the assessment release pin, observation date, policy findings, and authorization unchanged. Exact release equality remains separately exposed. Unknown, incomplete, or modified transition evidence cannot produce compatibility.

## November 12 New York retail-food refresh

`state-coverage-reassessment-20261112-ny-retail-food-refresh` links the September 11 Minnesota credential coverage release `national-business-coverage-views-20260911-040908332Z-f01c882a` to `national-business-coverage-views-20261112-025948835Z-76733954`. The new manifest and 56-row state artifact are pinned to SHA-256 `7fd54a6c1a38f921ceb5b6ad918c74d82f12e2b665e25da08a43f34f1cd3ee7a` and `01a8f8db46b8a899921ab88364bc4e203eb56d7636380ebde5c1eb1998aee7f4`, respectively. Verification follows the retained predecessor chain to the original September 2 eligibility rows used by the discovery and assessment gates.

The verifier compares all 56 state rows, including jurisdiction identities, reported and coordinate-assigned source rosters, and source scope under the current readiness policy. It permits the three reviewed registry and entity-resolution lineage replacements, the New York retail-food source count changes, and the November 11 coverage observation timestamps for New York and Pennsylvania. New York's reported and matching profiles decreased by 622 to 366,395. Its coordinate-assigned profiles decreased by 541 to 70,731. Pennsylvania's state view includes one coordinate-assigned profile from the refreshed source. Only New York's numeric coverage projection changed from September 11.

The transition carries forward the catalog's historical source observations, policy decisions, holds, and authorizations. The November timestamps describe coverage evidence. The counts measure source profiles, and business completeness is unassessed. Rolling back this application change removes recognition of the November transition and causes the source gates to reject it until an explicit review is restored.

## Initial September reviews

The first two reviewed transitions from September 2 coverage `national-business-coverage-views-20260902-115337634Z-ba689784` target the initial September 7 release `national-business-coverage-views-20260907-174411739Z-4169d204` and the completed D.C.-refresh release `national-business-coverage-views-20260907-223035676Z-eaf37740`. Both transitions retain exact manifest and state-artifact SHA-256 pins. Unknown releases, modified files, missing or duplicate jurisdictions, changed identities, and changed reported source rosters require new review.

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

Verification for this extension: seven focused tests and scoped ESLint passed. Both `check-state-business-source-discovery.mjs` and `check-state-business-source-assessments.mjs` passed against the exact new current release. Queue 6 (MI, TN, MA, AZ), Queue 7 (MD, MO, IN, SC) and Queue 8 (LA, MN, AL, WI) selections remain unchanged. The current assessment catalog reports all 50 states plus D.C.: 41 holds, two bounded-connector decisions, eight production-ready retained broad layers, and zero autonomous acquisitions authorized. Historical Queue 4–8 source reviews remain dated September 3; the later validation and retained-source waves preserve their own September 22 observation dates. Full-repository validation is a separate integration step, not implied by these focused checks.
