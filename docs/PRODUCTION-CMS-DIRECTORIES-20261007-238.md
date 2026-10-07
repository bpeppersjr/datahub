# Proposed retained-data production reconciliation — October 7, 2026

Plan 238 supersedes planning-only Plan 237 after retaining and independently verifying a metadata-only readiness receipt for Arizona's official childcare provider tables. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-238`
- Plan confirmation SHA-256: `2402fe91018305ee1be28b576b9ea16e98d576892d96822f8b3095e658fa81db`
- Plan file SHA-256: `a98cfb775c0e6770b55727b7e0bd883a79ba2e3481f36fa0b4958f9914775850`
- Predecessor plan: `production-cms-directories-20261007-237`

Arizona Department of Health Services publishes monthly Provider and Facility Database workbooks for child care centers and group homes. One exact GET of the official data catalog and two exact HEAD requests for the September 2026 workbooks were performed. The catalog response was validated in memory and discarded; no workbook body was requested. The retained receipt records the centers workbook as 296,959 bytes and the group-homes workbook as 47,316 bytes, both last modified September 3, 2026 at 18:57:46 UTC.

The immutable metadata receipt is independently verified under manifest SHA-256 `950fb3baca262a65380790bbf5edb467f952e2a5be85ee85f7b2d39c993ad4c1`. It preserves ADHS's warning that some active facilities may be unintentionally omitted during migration to a new licensing management system. Zero provider rows were acquired. Statewide completeness, current operation, ZIP validity, production admission, and current-pointer publication remain unclaimed or disabled.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 74,257,334,272 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, workbook download, provider-row acquisition, production enrollment, credential operation, public export, or mutable source pointer write occurred. Plan 237 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-238 --expected-plan-sha256 2402fe91018305ee1be28b576b9ea16e98d576892d96822f8b3095e658fa81db
```
