# Proposed retained-data production reconciliation — October 5, 2026

Plan 176 is a planning-only successor to Plan 175 after Co*Tive exposed retained ZIP-assignment and source-quality gaps in the national industry overview in commit `41ce806b964f2445fcd4aaa7bf85164ef3b3fb85`. The view now reports three out-of-cohort source records, three source-quality gap groups, and 4,399,806 address rows without an eligible ZIP5 across nine source dimensions. These remain source-row quality and assignment gaps, not missing-business counts. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-176`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-176.json`
- Plan confirmation SHA-256: `4b13a30fca02bbaf361e76d593165ae12f9faa8d8c38c525011b12175ad192a3`
- Plan file SHA-256: `cf65d250d61a8f7f232ff69d92f4dedd86c128d89ea0524437d680bdf16cf5c7`
- Plan 175 predecessor confirmation SHA-256: `44c01d64c36361b673230cd30c82bdce63c1b9a7b351d030d1da3de5410d582b`
- Plan 175 predecessor file SHA-256: `25aed0800b416cffe5c9aec4524325f9410d502910a7f397122185ff231ab6bc`
- Implementation commit: `41ce806b964f2445fcd4aaa7bf85164ef3b3fb85`

The four retained-input selection pins are unchanged from Plan 175. They remain separate and nonadditive, and introduce no current-operation, resolved-identity, missing-business, or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 143,779,921,920 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 175 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-176 --expected-plan-sha256 4b13a30fca02bbaf361e76d593165ae12f9faa8d8c38c525011b12175ad192a3
```
