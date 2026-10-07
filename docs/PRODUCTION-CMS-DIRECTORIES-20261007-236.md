# Proposed retained-data production reconciliation — October 7, 2026

Plan 236 supersedes planning-only Plan 235 after adding immutable raw-snapshot retention and independent verification to the bounded USDA Organic INTEGRITY API intake. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-236`
- Plan confirmation SHA-256: `b665d85a1a75e09823e6b8cd80c05b250f8b683f8c990fbe0abcdcf2c3572bfb`
- Plan file SHA-256: `394b529123a23202fe2424f310099786f137a55bcf3c17ffc45a457ebe5387e6`
- Predecessor plan: `production-cms-directories-20261007-235`

After a separately authorized API request, the connector can now retain the exact bounded ZIP archive, a privacy-safe receipt, and a manifest in a unique run directory. The writer binds byte counts and SHA-256 hashes, refuses reused run IDs and paths outside datahub, writes through a visible staging directory, and makes no XML-schema, normalized-record, production-admission, or current-pointer claim. An independent reader reopens the artifacts, checks containment and hashes, reinspects ZIP/XML structure, validates receipt/archive binding, and rejects tampering.

The capability remains fixture-tested only. Production API execution remains disabled, the connector remains unenrolled, and no credential was created, read, stored, logged, or transmitted. No live API request occurred. A real XML schema remains unverified, so no API normalization was implemented or claimed.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 75,420,626,944 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, production enrollment, credential operation, API request, or mutable source pointer write occurred. Plan 235 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-236 --expected-plan-sha256 b665d85a1a75e09823e6b8cd80c05b250f8b683f8c990fbe0abcdcf2c3572bfb
```
