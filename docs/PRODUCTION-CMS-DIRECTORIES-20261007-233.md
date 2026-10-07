# Proposed retained-data production reconciliation — October 7, 2026

Plan 233 supersedes planning-only Plan 232 after recording the official USDA Organic INTEGRITY public API contract, credential requirement, rate limit, attribution, and terms in the governed connector. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-233`
- Plan confirmation SHA-256: `3985d8c1ef88e617d05e74e4027950bb96bb3a96675307eefa9d3af3d5f35778`
- Plan file SHA-256: `37b16cd8b04263f7514e3f863555c47fc2dac4ffae8a295a19466c82a526ccfa`
- Predecessor plan: `production-cms-directories-20261007-232`

The USDA connector now names `DATA_GOV_API_KEY` as an environment-or-local-secret-store-only reference and pins the official API documentation, terms, base URL, six documented methods, and default 1,000-request-per-hour limit. API execution remains disabled, credential presence remains unknown, no credential was created or read, and zero API record requests were made. Production admission and live workbook acquisition remain disabled. The policy records the required USDA API attribution and continues to exclude contact, phone, email, client, agent/person, website, and free-text fields.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 76,110,725,120 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, production enrollment, credential operation, API record request, or mutable source pointer write occurred. Plan 232 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-233 --expected-plan-sha256 3985d8c1ef88e617d05e74e4027950bb96bb3a96675307eefa9d3af3d5f35778
```
