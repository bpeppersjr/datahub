# Proposed retained-data production reconciliation — October 6, 2026

Plan 200 is a planning-only successor to Plan 199 after adding a protected exact-ZIP lookup for the registered non-ZCTA context release, an optional fail-independent ZIP-inspector panel, and a governed Census Nonemployer Statistics 2023 county-industry adjacent projection.

- Run ID: `production-cms-directories-20261006-200`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-200.json`
- Plan confirmation SHA-256: `84518fc787d064be25e27d302d63d998915e1ba4bea57d787d5c42e1b31bc6ec`
- Plan file SHA-256: `8520650fe93a8f61ebd6101e7c7eb10a10e78d54e61e72a6583412f98757ecec`
- Predecessor plan: `production-cms-directories-20261006-199`
- Implementation commit: the commit containing this document

The non-ZCTA lookup accepts exactly one ZIP5, verifies the closed registration, manifest bytes and hash, release identity, selected ZIP2 artifact declaration, partition bytes and hash, row count and ordering, and closed row contract before returning one row or a bounded absence result. Its protected endpoint permits only an empty GET, returns no bulk data, uses `no-store`, and fails with a generic error. The optional ZIP-inspector panel is abortable and stale-safe; unavailable or corrupt context cannot block the map or other ZIP evidence. Displayed codes remain source-reported tokens and Census-roster membership observations, never ZIP-to-state assignments or special-purpose classifications.

The Census Nonemployer adjacent projection preserves 6,286 direct county/NAICS status cells across 3,143 counties. Of those cells, 6,151 are directly published, 6,141 have usable values, 10 retain flagged raw values with null usable measures, and 135 remain absent and null. Direct 2022 NAICS 23 cells total 2,917,626 usable 2023 nonemployer establishments; direct NAICS 62441 cells total 533,398. The projection rejects ZIP or ZIP+4 fields, ZCTA allocation, geography crosswalks, geocoding, hierarchy substitution, current-operation assertions, completeness claims, production enrollment, matrix admission, and exact-ZIP catalog admission.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 89,806,401,536 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable pointer change, national matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 199 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-200 --expected-plan-sha256 84518fc787d064be25e27d302d63d998915e1ba4bea57d787d5c42e1b31bc6ec
```
