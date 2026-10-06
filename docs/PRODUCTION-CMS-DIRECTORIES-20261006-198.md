# Proposed retained-data production reconciliation — October 6, 2026

Plan 198 is a planning-only successor to Plan 197 after adding a scalable, fail-closed adjacent exact-ZIP evidence catalog and hardening the pointer-free Census residual-readiness publisher. The catalog independently replays each pinned local verifier and reports retained evidence in the application's Industry Status section without changing the immutable 40-dimension matrix.

- Run ID: `production-cms-directories-20261006-198`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-198.json`
- Plan confirmation SHA-256: `97c0d4f53dd4707982f51d004f5010bfde8eceea06188904f70bb82ebd259870`
- Plan file SHA-256: `93617694fcd7b5364f19196e5c8a43cf1bec3001501a147302ad1a3a2f7e5625`
- Predecessor plan: `production-cms-directories-20261006-197`
- Implementation commit: the commit containing this document

The catalog currently contains two nonadditive evidence streams. Minnesota residential-construction credentials conserve 11,456 publisher credential rows, including 11,455 ZIP5-bearing rows across 961 ZIP5 keys and one missing-ZIP row. National CMS NPPES pharmacy non-primary address evidence conserves 420 reported address rows across 377 ZIP5 keys; 369 source rows retain a separate ZIP+4 field, which is neither joined to ZIP5 nor aggregated. Neither stream represents confirmed businesses, physical sites, comprehensive industry coverage, independently verified current operations, or geocoded entities. Both remain outside production enrollment and the national exact-ZIP matrix.

The residual-readiness publisher now rejects linked or incompatible output ancestry, uses exclusive publication locks and atomic staging, preserves collisions for inspection, verifies identical reuse, and checks the completed release after publication. Registered release bytes remain unchanged. The readiness release still publishes zero residual polygons, cannot block the existing map, and makes no park, tribal or Native territory, private-land, population, ZIP-validity, or business-gap claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 89,881,821,184 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, pointer change, matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 197 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-198 --expected-plan-sha256 97c0d4f53dd4707982f51d004f5010bfde8eceea06188904f70bb82ebd259870
```
