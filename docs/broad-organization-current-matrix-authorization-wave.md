# Current-matrix broad-organization authorization wave

Each immutable `broad-organization-current-matrix-authorization-wave@1.0.0` release derives ten consecutive priorities from the independently verified 40-gap projection. Each wave after the first binds the immediately prior published wave by release ID, manifest SHA-256, and artifact SHA-256.

The November 12 cohort binds matrix `national-goal-completion-20261112051711-1b351542`, backlog `broad-organization-acquisition-backlog-2026-11-12T05-17-11.911Z-145f1512454f`, and projection `broad-organization-matrix-gap-projection-2026-11-12T05-17-11.911Z-eb4723fed2ff`.

| Wave | States in backlog priority order | Prior, selected, remaining | Release ID |
| --- | --- | --- | --- |
| 1 | CA, ID, IL, OH, KY, NC, NH, OK, HI, MA | 0, 10, 30 | `broad-organization-current-matrix-authorization-wave-2026-11-12T05-17-11.911Z-c95d07a80964` |
| 2 | MD, ME, MI, MN, MS, ND, NJ, NV, SC, TN | 10, 10, 20 | `broad-organization-current-matrix-authorization-wave-2026-11-12T05-17-11.911Z-990ed23316a5` |
| 3 | VA, VT, WI, WV, AZ, IN, KS, LA, MO, MT | 20, 10, 10 | `broad-organization-current-matrix-authorization-wave-2026-11-12T05-17-11.911Z-ec4fb306ac88` |
| 4 | RI, SD, WY, AL, AR, GA, NE, NM, UT, WA | 30, 10, 0 | `broad-organization-current-matrix-authorization-wave-2026-11-12T05-17-11.911Z-aaef539e2656` |

All 40 states and 371 gate items remain `approval-only` and `HOLD`. The releases carry full assessment snapshots, gate provenance, and required exclusions. Acquisition authorization, source actions, network requests, pointer changes, and production authority remain false or zero.

The authenticated empty GET at `/api/data-operations/broad-organization-current-authorization-chain` replays all four newest waves and their matrix, backlog, and projection lineage. It returns HTTP 503 when newest artifacts are missing, corrupt, ambiguous, or bound to different inputs. Explicit historical manifests can be verified against `config/broad-organization-authorization-retained-history.json`.

The **Weakest comparable diagnostic batch** intersects the 40 current gap codes with historical source-profile comparisons from coverage release `national-business-coverage-views-20260902-115337634Z-ba689784`, retained in checksum-pinned projection `broad-organization-matrix-gap-projection-2026-10-07T05-23-37.982Z-2de794ce5041`. Thirty-one gaps have verified comparable values and nine are unavailable. Sorting the comparable ratios ascending, using the jurisdiction code to break ties, yields TN, VA, AZ, RI, NJ, OH, VT, SC, MA, and NH. Each ratio divides reported source profiles by the 2023 Census nonemployer baseline. The current backlog determines wave order, and the current matrix determines coverage. The diagnostic batch remains `HOLD`.

Build and verify a release locally:

```powershell
npm run broad-org-current-wave:build
npm run broad-org-current-wave:build -- --wave 2
npm run broad-org-current-wave:build -- --wave 3
npm run broad-org-current-wave:build -- --wave 4
npm run broad-org-current-wave:verify -- --manifest data/broad-organization-current-matrix-authorization-wave/releases/<release-id>/manifest.json
```
