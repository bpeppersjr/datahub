# Proposed retained-data production reconciliation — October 7, 2026

Plan 235 supersedes planning-only Plan 234 after implementing and fixture-testing a bounded USDA Organic INTEGRITY all-operations archive acquisition primitive. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-235`
- Plan confirmation SHA-256: `79012a55d351c580c4ef924464124d4112c922dc79e08dde805a5e166b4fc574`
- Plan file SHA-256: `6c3a689186491a7299396d2df77c6cd3aae52f9b5b8033d6709d8d12f3b43c8e`
- Predecessor plan: `production-cms-directories-20261007-234`

The connector now has a default-denied, exact-acknowledgement, credential-gated request primitive for the documented `GetAllOperationsPublicData` endpoint. It enforces response and expanded-archive byte limits, a file-count limit, safe XML-only archive paths, redirect denial, content-type checks, cancellation, and privacy-safe receipts that never retain the API key. Tests use an in-memory fixture transport only.

Production API execution remains disabled, the connector remains unenrolled, the configured record-request count remains zero, and no credential was created, read, stored, logged, or transmitted. The implementation does not change business, industry, ZIP, or map completeness claims.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 75,423,338,496 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, production enrollment, credential operation, API request, or mutable source pointer write occurred. Plan 234 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-235 --expected-plan-sha256 79012a55d351c580c4ef924464124d4112c922dc79e08dde805a5e166b4fc574
```
