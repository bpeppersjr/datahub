# Proposed retained-data production reconciliation — October 6, 2026

Plan 204 is a planning-only successor to Plan 203 after admitting Census ZBP 2023 all-industry employer-establishment evidence and migrating exact-ZIP, national, goal-authority, and state views to a governed 43-dimension contract.

- Run ID: `production-cms-directories-20261006-204`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-204.json`
- Plan confirmation SHA-256: `1b569c7ff8c167686ce5a4acc5b2e3def3c211353bd02943d242988e342bac1c`
- Plan file SHA-256: `a32cfc2a02b142d52de902af6538e45336564184a10dfe68e16f63761806f422`
- Predecessor plan: `production-cms-directories-20261006-203`
- Implementation commit: the commit containing this document

The pointer-free exact-ZIP v2.2 matrix preserves 48,194 ZIP5 rows and contains 43 dimensions and 2,072,342 cells. Its Census ZBP 2023 dimension retains 34,954 published positive ZIP aggregates totaling 8,356,295 employer establishments, 2,874 same-code ZCTA keys for which ZBP did not publish a row, and 10,366 cohort keys outside the ZBP/ZCTA evidence union.

The ZBP raw states remain distinct from derived evidence states. Neither null class is coerced to zero or absence. The dimension is an annual, noncurrent, nonadditive employer-establishment aggregate—not named businesses, unique businesses, physical sites, an all-business denominator, GDP, USPS validity, or current operations.

The protected selected-ZIP route, national Industry Status, goal-readiness authority, state disposition release, state heatmap, and right-side state panel now use the versioned 43-dimension lineage. Historical v1.9, v2.0, and v2.1 releases and validators remain intact. The state successor conserves 60 scopes, 43 dimensions, and 2,072,342 cells while exposing exactly 51 state/DC scopes to the map.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 86,699,798,528 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 203 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-204 --expected-plan-sha256 1b569c7ff8c167686ce5a4acc5b2e3def3c211353bd02943d242988e342bac1c
```
