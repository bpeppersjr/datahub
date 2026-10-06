# Proposed retained-data production reconciliation — October 6, 2026

Plan 211 is a planning-only successor to Plan 210 after admitting retained City of Chicago current active business-license site evidence, migrating exact-ZIP reporting to 50 dimensions, and making governed profile/site overlaps explicit in the state heatmap.

- Run ID: `production-cms-directories-20261006-211`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-211.json`
- Plan confirmation SHA-256: `ac405e98dca50398873cb5e092610b2f678ffb78359e134bb8b186854b7f0efb`
- Plan file SHA-256: `cff5b8c90d862276631eb579faf42e85d2a49beeecdc8690496bf74bf48f03eb`
- Predecessor plan: `production-cms-directories-20261006-210`
- Implementation commit: the commit containing this document

The pointer-free v2.9 matrix preserves 48,194 ZIP5 rows and contains 50 dimensions and 2,409,700 cells. Its Chicago dimension preserves 1,033 positive ZIPs totaling 42,940 normalized licensed account/site groups, 36,795 measured-zero keys inside the retained source denominator, and 10,366 outside-denominator keys as null. The retained source conserves 54,065 source records and 43,901 source account/site groups as 53,079 accepted rows, 42,940 normalized sites, and 986 quarantined rows across 961 groups.

This is municipal source-defined current-license membership in the selected official view snapshot. It does not establish present or continuous operation, occupancy, public access, unique-business identity, address jurisdiction, or all-business completeness. The dimension overlaps `chicago_license_location_profiles` and is explicitly nonadditive. Record-level evidence remains local-review-only; aggregate use requires provenance and semantic limitations.

The protected ZIP view, national Industry Status, state disposition release, heatmap, state panel, and goal-readiness authority now use the 50-dimension lineage. The state release conserves 60 geographic scopes, 48,194 ZIP rows, 50 dimensions, and 2,409,700 cells. Chicago is the sixth explicit profile/site overlap pair in the heatmap, alongside Alaska, California ABC, District of Columbia, Los Angeles, and Texas. Pair warnings name the counterpart and prohibit additive, unique-business, nationwide-total, or completeness interpretations.

Correcting the stale Chicago dataset registration required a new pointer-free source-policy provenance successor. It preserves 15 sources and 8,011,835 profiles. The selected provenance release is `business-entity-source-policy-provenance-86c0f274be2e5c350c36aabdd301cde101826aebc705dd1cd995f0c8b42c5649`, with manifest SHA-256 `8da166fa132f61213d8544ac50387b01f3bd94242198b50469c53ec236e733ca` and artifact SHA-256 `51113c1bc69589ebfbccd328d87f434216909bb719ae06cfae167aab74b8de25`. Authorization, acquisition, current-operation, active-eligibility, production-enrollment, and pointer-write claims remain false.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 80,075,976,704 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 210 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-211 --expected-plan-sha256 ac405e98dca50398873cb5e092610b2f678ffb78359e134bb8b186854b7f0efb
```
