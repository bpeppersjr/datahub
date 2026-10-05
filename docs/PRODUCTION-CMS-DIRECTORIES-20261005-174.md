# Proposed retained-data production reconciliation — October 5, 2026

Plan 174 is a planning-only successor to Plan 173 after Co*Tive exposed the national exact-ZIP matrix's temporal evidence totals and explicit unmaterialized-industry boundary in commit `f11285a52c08f1ab47563a674ecccf6d745af138`. The application now distinguishes source-referenced evidence whose current operation remains unverified from evidence whose source reference is unresolved. Industries outside the 39 retained source dimensions remain unavailable, not measured zero. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-174`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-174.json`
- Plan confirmation SHA-256: `9c5d3e94bbdee2b11e5584888c29f68a0abe41f926f8b989ac05885f2ae6b77d`
- Plan file SHA-256: `75f1c7366948110a57070c3b16ce079b27749eceee429628ab7224eaf7247353`
- Plan 173 predecessor confirmation SHA-256: `4fabc19859f0afdfd8d3104e987274f1238cb9a785d12eac25b7008e2797a531`
- Plan 173 predecessor file SHA-256: `f5cfd78f8325c6c19b0fc9c0c196b5929958c73c870da9eabe067edd404657d9`
- Implementation commit: `f11285a52c08f1ab47563a674ecccf6d745af138`

The exact four retained-input selection pins are unchanged from Plan 173. They remain separate and nonadditive, and introduce no current-operation or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 144,024,993,792 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 173 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-174 --expected-plan-sha256 9c5d3e94bbdee2b11e5584888c29f68a0abe41f926f8b989ac05885f2ae6b77d
```
