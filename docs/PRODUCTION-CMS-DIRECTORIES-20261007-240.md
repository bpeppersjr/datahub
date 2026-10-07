# Proposed retained-data production reconciliation — October 7, 2026

Plan 240 supersedes planning-only Plan 239 after retaining and independently verifying a metadata-only readiness receipt for Florida DCF's official Listing of all child care providers workbook. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-240`
- Plan confirmation SHA-256: `6272019030b2e9d5247b7008b11ce59388d1ba8780a8d8514a188ea6480acc06`
- Plan file SHA-256: `8f44869d7b3ae29eae53140491c09951923b01c472b15613efa6326a6a2d7112`
- Predecessor plan: `production-cms-directories-20261007-239`

Florida Department of Children and Families publishes an official page linking the statewide workbook and a separate official page stating that provider profiles include name, address, license number, provider type, capacity, operating days and hours, and services offered. The bounded preflight performed two exact page GETs and one exact workbook HEAD. The workbook body, provider search, and provider-detail routes were not requested.

The observed workbook is 2,146,163 bytes, has the XLSX media type, and reports a last-modified time of October 2, 2026 at 19:02:00 UTC. The official pages do not establish a workbook schema, license/status vocabulary, provider-type codebook, contact-field boundary, publication cadence, snapshot-date contract, reuse grant, or row controls. All eight gates remain explicit and acquisition stays disabled.

The immutable preflight receipt is independently verified under manifest SHA-256 `657cc30403ce47e8bcdf998f9532d312ce4d2f20cc0fd891240d747d3606b668`. Zero provider rows, workbook-body requests, provider-search requests, provider-detail requests, addresses, contacts, ZIP observations, or coordinates were acquired. Current operation, statewide completeness, schema verification, ZIP validity, production admission, and current-pointer publication remain unclaimed or disabled.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,942,978,560 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, workbook download, provider-row acquisition, production enrollment, credential operation, public export, or mutable source pointer write occurred. Plan 239 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-240 --expected-plan-sha256 6272019030b2e9d5247b7008b11ce59388d1ba8780a8d8514a188ea6480acc06
```
