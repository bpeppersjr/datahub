# Proposed retained-data production reconciliation — October 6, 2026

Plan 206 is a planning-only successor to Plan 205 after admitting California ABC active issued-license physical-site evidence, migrating reporting to 45 dimensions, reconciling NPPES enumeration posture, and fixing exact state/non-state geography conservation in the heatmap response.

- Run ID: `production-cms-directories-20261006-206`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-206.json`
- Plan confirmation SHA-256: `89d9d3212f1ee8e2d610af696e32f04ce23c4c1ed2a07c3bfba4400a614e12c3`
- Plan file SHA-256: `ea930459134a5f3031bc88a44aa4c04ad14b8ba284bef394c2d187d7c046b371`
- Predecessor plan: `production-cms-directories-20261006-205`
- Implementation commit: the commit containing this document

The pointer-free v2.4 matrix preserves 48,194 ZIP5 rows and contains 45 dimensions and 2,168,730 cells. Its California ABC dimension preserves 2,920 positive ZIPs totaling 84,497 normalized physical-site rows, 34,908 measured-zero keys inside the retained source denominator, and 10,366 outside-denominator keys as null. Publisher `ACTIVE` is snapshot status only. It does not establish continuous operation, California all-business completeness, unique businesses, or an additive business count.

The protected ZIP view, national Industry Status, state disposition release, heatmap, state panel, and goal-readiness authority now use the 45-dimension lineage. The state response explicitly conserves 33,455 state/DC keys and 14,739 non-state keys across 60 governed scopes, totaling 48,194. Validation now rejects missing or rebalanced geography counts before rendering.

The supplemental NPPES posture proves current or reactivated enumeration status for 1,958,089 primary-location profiles and retains 130,691 non-primary practice-location profiles as reporting-only. It does not assert that a business or location is open, active-business eligible, or independently verified as currently operating. Active-business counts and completeness remain null.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 84,478,218,240 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 205 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-206 --expected-plan-sha256 89d9d3212f1ee8e2d610af696e32f04ce23c4c1ed2a07c3bfba4400a614e12c3
```
