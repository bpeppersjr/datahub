# Proposed retained-data production reconciliation — October 5, 2026

Plan 175 is a planning-only successor to Plan 174 after Co*Tive bound the national exact-ZIP overview to the retained entity-resolution evidence release in commit `678f8fd6357c4c34cd752b155c0a174ddd9b8366`. The view now reports 26,919 ZIPs with candidate resolution evidence and 21,275 ZIPs with no decision, conserving the 48,194-key retained cohort. Candidate groups remain unapplied; the benchmark gate has not passed. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-175`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-175.json`
- Plan confirmation SHA-256: `44c01d64c36361b673230cd30c82bdce63c1b9a7b351d030d1da3de5410d582b`
- Plan file SHA-256: `25aed0800b416cffe5c9aec4524325f9410d502910a7f397122185ff231ab6bc`
- Plan 174 predecessor confirmation SHA-256: `9c5d3e94bbdee2b11e5584888c29f68a0abe41f926f8b989ac05885f2ae6b77d`
- Plan 174 predecessor file SHA-256: `75f1c7366948110a57070c3b16ce079b27749eceee429628ab7224eaf7247353`
- Implementation commit: `678f8fd6357c4c34cd752b155c0a174ddd9b8366`

The four retained-input selection pins are unchanged from Plan 174. They remain separate and nonadditive, and introduce no current-operation, resolved-identity, or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 143,782,383,616 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 174 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-175 --expected-plan-sha256 44c01d64c36361b673230cd30c82bdce63c1b9a7b351d030d1da3de5410d582b
```
