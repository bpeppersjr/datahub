# Proposed retained-data production reconciliation — October 7, 2026

Plan 230 supersedes planning-only Plan 229 after adding the already-retained CMS hospital and nursing-home exact-ZIP evidence to the read-only adjacent evidence catalog. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-230`
- Plan confirmation SHA-256: `e67b1b15e6145eb763b1e3fcec018c8e2f988e6d1d6968f04a9c4741eab50d96`
- Plan file SHA-256: `fb7ebf7660174e9d53f86477a44079c32712893feab9afbc0c19302de18584cd`
- Predecessor plan: `production-cms-directories-20261007-229`

The application catalog now reports the two CMS cohorts independently: 5,419 hospital directory rows with reported ZIP5 values across 4,716 ZIP keys, and 14,690 nursing-home directory rows with reported ZIP5 values across 8,925 ZIP keys. Both replay the existing pointer-free release and preserve publisher dates and source provenance. The rows are nonadditive directory evidence, not business counts, physical-site counts, verified current operations, public exports, or completeness percentages. No data was reacquired.

Read-only preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 76,455,710,720 bytes against a 13,309,329,011-byte requirement.

No acquisition, network request, reconciliation execution, production enrollment, or mutable source pointer write occurred. Plan 229 and earlier plans are superseded without execution. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-230 --expected-plan-sha256 e67b1b15e6145eb763b1e3fcec018c8e2f988e6d1d6968f04a9c4741eab50d96
```
