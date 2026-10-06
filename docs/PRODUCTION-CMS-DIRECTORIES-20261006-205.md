# Proposed retained-data production reconciliation — October 6, 2026

Plan 205 is a planning-only successor to Plan 204 after admitting cross-source entity-linkage readiness evidence, migrating governed ZIP/national/state reporting to 44 dimensions, correcting complete roster rendering, and adding a bounded Los Angeles publisher-membership reconciliation.

- Run ID: `production-cms-directories-20261006-205`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-205.json`
- Plan confirmation SHA-256: `e99870687cbcaf8171fdc5b3a3cfaa7ddadbc1b6a1e74aeb0bb99b6608e0faad`
- Plan file SHA-256: `e7fa8272065060b2ee0a31977a589955710387c9f65383c7761de65d71fc1920`
- Predecessor plan: `production-cms-directories-20261006-204`
- Implementation commit: the commit containing this document

The pointer-free v2.3 matrix preserves 48,194 ZIP5 rows and contains 44 dimensions and 2,120,536 cells. Its linkage-readiness dimension records retained decisions for 26,919 ZIPs and keeps 21,275 ZIPs with no retained linkage decision null and unmeasured. Five heterogeneous linkage metrics remain separate. Benchmark gating has not passed, identity merges are not applied, and unique-business and current-operating-business counts remain null.

The protected ZIP view, national Industry Status, state disposition release, heatmap, right-side panel, and goal-readiness authority now use the 44-dimension lineage. ZIP and national tables render the full governed roster. Raw linkage states remain separate from derived readiness states and are never presented as businesses, resolved entities, merges, physical sites, or verified current operations.

The Los Angeles reconciliation separately proves publisher active-list membership for 633,232 retained profiles while their row-level status remains null and lifecycle remains unknown. It conserves 633,782 source rows as 633,232 retained profiles plus 550 quarantined rows, split into 465 invalid or unmapped ZIP rows and 85 missing-address rows. Effective temporal classifications remain 21 current, seven non-active, one annual, and one unknown source; active eligibility remains zero and completeness remains null.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 85,279,014,912 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 204 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-205 --expected-plan-sha256 e99870687cbcaf8171fdc5b3a3cfaa7ddadbc1b6a1e74aeb0bb99b6608e0faad
```
