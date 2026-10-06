# Proposed retained-data production reconciliation — October 6, 2026

Plan 197 is a planning-only successor to Plan 196 after three local governance additions: the exact-ZIP v1.9 builder removed public injected-input writers and added intra-prefix cancellation; a pointer-free Census residual-readiness release bound the exact retained state/ZCTA inputs without publishing polygons; and Minnesota retained residential-construction credential evidence was projected and exposed as a read-only industry-status block. The Minnesota evidence conserves 11,456 credential rows, including 11,455 ZIP5-bearing rows across 961 ZIP5 keys and one missing-ZIP row. It remains local-review-only, nonadditive, outside the 40-dimension matrix, and does not represent businesses, sites, geocodes, completeness, or verified current operation.

- Run ID: `production-cms-directories-20261006-197`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-197.json`
- Plan confirmation SHA-256: `d5b382c57a32db62306a1be37fb17a968e4ca8727514f411a57c6cb5e06b76db`
- Plan file SHA-256: `f02cbaf7cb2b51c32314342f6832d488eeca3c4a11dd953885182e36a99a6a18`
- Predecessor plan: `production-cms-directories-20261006-196`
- Implementation commit: the commit containing this document

The residual readiness release conserves 56 state-equivalents and 33,791 ZCTAs while publishing zero residual polygon features and null residual area. It does not classify ZIPs, parks, tribal or Native territory, private land, population, business geography, or business gaps, and it cannot block the existing map.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 89,948,315,648 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, pointer change, matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 196 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-197 --expected-plan-sha256 d5b382c57a32db62306a1be37fb17a968e4ca8727514f411a57c6cb5e06b76db
```
