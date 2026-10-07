# Proposed retained-data production reconciliation — October 7, 2026

Plan 246 supersedes planning-only Plan 245 after implementing and testing a bounded, privacy-selected California CDSS childcare DataStore acquisition engine. The engine is not yet wired to a durable Co*Tive application operation, was not executed against provider pages, and remains disabled for production admission. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-246`
- Plan confirmation SHA-256: `36f9f2c63766729ce42c1accd196ae2d7fffd9068f8b92d29d8de6719131d3cc`
- Plan file SHA-256: `bb84b0ec808550331aea131485bb150ea166b5fa45f9829d23282084ef2a256a`
- Predecessor plan: `production-cms-directories-20261007-245`
- Acquisition connector SHA-256: `c13d87ef87d3742cc293cc7787fcc2e562bfd6198fe664ef89177a4f6c4e96dc`
- Internal source policy SHA-256: `2a4c2cdb1f4981494b52ec9669e5505101600d1f3e02627f222b081b851635a5`

The engine uses deterministic `_id` ordering, 500-row pages, fixed resource identities, fixed field projection, an 83-request ceiling, one request at a time, native request spacing, bounded response and total bytes, before/after source totals, strict increasing row IDs, durable prerequisite and page-retention hooks, cancellation, and complete page/row conservation for the two pinned resource totals.

The query projection excludes `licensee`, `facility_administrator`, and `facility_telephone_number`. Returned keys outside the allowlist—including person and contact fields—fail the acquisition. The engine preserves source-native facility status and file date but does not claim current operation, physical-site verification, ZIP validity, atomic snapshot isolation, public export, or production admission.

Synthetic transport tests exercised all 39,184 expected rows across 79 pages and 83 requests. They also proved rejection of private-field exposure, source-total drift, non-increasing row IDs, HTTP failure, and cancellation before a subsequent page after the active retention hook drains. No live provider-page request or provider-row acquisition occurred.

The remaining implementation boundary is explicit: wire this engine to an application-owned operation with durable storage, disk checks, job receipts, restart/recovery semantics, and independent acquired-release verification; then implement and govern normalization before any execution or admission.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,918,189,568 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, provider-page request, provider-row acquisition, production enrollment, credential operation, public export, or mutable source pointer write occurred. Plan 245 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-246 --expected-plan-sha256 36f9f2c63766729ce42c1accd196ae2d7fffd9068f8b92d29d8de6719131d3cc
```
