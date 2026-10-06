# Proposed retained-data production reconciliation — October 6, 2026

Plan 196 is a planning-only successor to Plan 195 after hardening the exact-ZIP v1.9 release lifecycle. New and reused releases now require a full post-install replay before success; live Washington and predecessor evidence is rechecked; dead-owner locks are recovered through identity-checked quarantine; replacement locks are preserved; and semantic closure no longer depends on JSON property order. These controls do not change the 40-dimension evidence contents or make an all-business, completeness, geocode, USPS-operational, or verified-current-operation claim.

- Run ID: `production-cms-directories-20261006-196`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-196.json`
- Plan confirmation SHA-256: `16653314eb80f569ae0a026f70f26058d52eedc3d7eeac7a6689b6297e3b3add`
- Plan file SHA-256: `0f76fe62a4f5c85c52aba5a86cf3b751f2b6e4dc63e344dfc9dfaf19ffaf7312`
- Predecessor plan: `production-cms-directories-20261006-195`
- Implementation commit: the commit containing this document

The retained childcare, Minnesota credential, CMS hospital, and CMS nursing-home selections remain separately pinned and nonadditive. Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 89,962,909,696 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, pointer change, matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 195 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-196 --expected-plan-sha256 16653314eb80f569ae0a026f70f26058d52eedc3d7eeac7a6689b6297e3b3add
```
