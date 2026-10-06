# Proposed retained-data production reconciliation — October 6, 2026

Plan 207 is a planning-only successor to Plan 206 after admitting District of Columbia active issued-license physical-site evidence, migrating reporting to 46 dimensions, adding governed Colorado registration-status posture, correcting the NPPES pointer posture, and conserving every national Industry Status dimension across six temporal semantics.

- Run ID: `production-cms-directories-20261006-207`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-207.json`
- Plan confirmation SHA-256: `b079920835919fbdf196f9f2f4f54a65dd8d82dbefa073488844be5231a3492c`
- Plan file SHA-256: `cb3647983d395fd9bf1ba10d479d5cd7298a1773b3aa4140396dc11cb171652d`
- Predecessor plan: `production-cms-directories-20261006-206`
- Implementation commit: the commit containing this document

The pointer-free v2.5 matrix preserves 48,194 ZIP5 rows and contains 46 dimensions and 2,216,924 cells. Its District of Columbia license dimension preserves 3,125 positive ZIPs totaling 54,910 normalized physical-site rows, 34,703 measured-zero keys inside the retained source denominator, and 10,366 outside-denominator keys as null. Publisher `Active` is snapshot status only. It does not establish continuous operation, District-wide all-business completeness, unique businesses, or an additive business count. The dimension is explicitly nonadditive with the existing District profile evidence.

The protected ZIP view, national Industry Status, state disposition release, heatmap, state panel, and goal-readiness authority now use the 46-dimension lineage. The state release conserves 60 geographic scopes, 48,194 ZIP rows, 46 dimensions, and 2,216,924 cells. National Industry Status conserves all 46 dimensions across current, nonactive, unmapped, annual, linkage, and snapshot semantic buckets; it does not convert source availability into business completeness.

The supplemental Colorado posture conserves 2,164,812 source rows: 2,164,811 published rows and one quarantine row. It separately preserves 1,019,372 `Good Standing` and 1,145,439 `Delinquent` records, with 2,150,360 eligible US-address records and 14,451 records without an eligible ZIP. These source-native statuses do not establish current operation, active-business eligibility, all-business counts, or completeness.

Temporal reporting schema v1.2 preserves NPPES as pointer-pinned local evidence rather than pointer-free evidence. It reports 1,958,089 current or reactivated primary-location enumeration profiles and 130,691 non-primary practice-location profiles as reporting-only. It does not assert that a business or location is open, active-business eligible, or independently verified as currently operating. Active-business counts and completeness remain null.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 83,647,795,200 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 206 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-207 --expected-plan-sha256 b079920835919fbdf196f9f2f4f54a65dd8d82dbefa073488844be5231a3492c
```
