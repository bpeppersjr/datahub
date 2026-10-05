# Proposed retained-data production reconciliation — October 5, 2026

Plan 177 is a planning-only successor to Plan 176 after Co*Tive exposed the exact release IDs, manifest hashes, and build timestamps for the national exact-ZIP matrix, geography cohort, and entity-resolution evidence in commit `dfba4bf75c79bf3bf73ca61ff519641a3d3b3f4c`. The displayed national status is now directly traceable to its three immutable governed releases. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-177`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-177.json`
- Plan confirmation SHA-256: `0c7cbedd20982330e9f20df914ed70ce5e71c15f63d2865b11d88c6731031231`
- Plan file SHA-256: `191abea377065e7edec9b1c5aead7956b6ed8589118d1b00882963cda31b622e`
- Plan 176 predecessor confirmation SHA-256: `4b13a30fca02bbaf361e76d593165ae12f9faa8d8c38c525011b12175ad192a3`
- Plan 176 predecessor file SHA-256: `cf65d250d61a8f7f232ff69d92f4dedd86c128d89ea0524437d680bdf16cf5c7`
- Implementation commit: `dfba4bf75c79bf3bf73ca61ff519641a3d3b3f4c`

The four retained-input selection pins are unchanged from Plan 176. They remain separate and nonadditive, and introduce no current-operation, resolved-identity, missing-business, or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 143,777,587,200 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 176 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-177 --expected-plan-sha256 0c7cbedd20982330e9f20df914ed70ce5e71c15f63d2865b11d88c6731031231
```
