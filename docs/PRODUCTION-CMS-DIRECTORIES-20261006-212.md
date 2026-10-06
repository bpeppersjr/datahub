# Proposed retained-data production reconciliation — October 6, 2026

Plan 212 is a planning-only successor to Plan 211 after correcting the New York retail-food dataset registration to its already-retained September 7 release and rebuilding the pointer-free source-policy provenance inventory. It does not authorize or perform production work.

- Run ID: `production-cms-directories-20261006-212`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-212.json`
- Plan confirmation SHA-256: `2f947625b18bc7cec67f41fc7178ff66286694fdeed916d9b9ad007f2aec21ee`
- Plan file SHA-256: `7a44ccc8cd2166465e6a1604881239ed75776775f7305b0ddee1a4c76e572716`
- Predecessor plan: `production-cms-directories-20261006-211`
- Implementation commit: the commit containing this document

The New York registration now selects retained release `ny-retail-food-stores-20260907-134303353Z-c3167a89`, manifest SHA-256 `0c263a3a76edc73a4519f6f945e450951acc454118e193b1e69395d02ce3e815`. It conserves 24,281 source license records, 24,230 provisional physical sites, 24,280 ZIP-evidence addresses, 22,999 usable platform geocodes, 1,500 source ZIPs, and zero quarantined records. The source snapshot date remains September 30, 2025; registration repair does not make it current or prove operation, occupancy, public access, ownership, completeness, or a unique-business count.

The successor source-policy inventory preserves 15 sources and 8,011,835 profiles. Its selected release is `business-entity-source-policy-provenance-0295e9953251c911ff91e649bc7226098644d6bcd12a99f787681bf0570ce09d`, with manifest SHA-256 `51bbf629fdb1fa55efb60ca6fc0fad67a779f0016c9ecbc74bf668dc3cb13355` and artifact SHA-256 `b2943263ee1b29fd2bc13373037b322b7505e0af408bb17d4528cc00a2686871`. Authorization, acquisition, current-operation, active-eligibility, production-enrollment, and pointer-write claims remain false.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The same retained childcare, Minnesota credential, CMS hospital, and CMS nursing-home selections remain pinned. The `national-12g` profile was selected; available disk was 80,038,928,384 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 211 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-212 --expected-plan-sha256 2f947625b18bc7cec67f41fc7178ff66286694fdeed916d9b9ad007f2aec21ee
```
