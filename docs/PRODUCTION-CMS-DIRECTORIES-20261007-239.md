# Proposed retained-data production reconciliation — October 7, 2026

Plan 239 supersedes planning-only Plan 238 after retaining and independently verifying a metadata-only readiness receipt for Georgia DECAL's official Provider Data Export contract. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-239`
- Plan confirmation SHA-256: `486217ff5457ccde4efbd2f914470bcd10a3ad869c301525e6ec408415a1652f`
- Plan file SHA-256: `9573a9283102a032d866a1613adc138b527c1443b501fc5ad153db0bd1ccbb49`
- Predecessor plan: `production-cms-directories-20261007-238`

The Georgia Department of Early Care and Learning publishes a public Provider Data Export page and data dictionary. A bounded preflight performed exactly three GET requests: the official export page, its current same-origin application bundle, and the official data-dictionary PDF. The application contract identifies `POST /Provider/Export`, its four request fields, CSV-blob response, and licensed program-type codes 100 (Child Care Learning Centers) and 102 (Family Child Care Learning Homes). The export POST was not called and no provider-detail route was requested.

The official 209,120-byte dictionary is retained only by observation metadata and SHA-256 `565c5862037ae94ec2f6bcfec05763eaa0993bae061ec36c44b1c03dcfbeeaab`. It documents provider number, name, physical address, city, state, ZIP, licensed capacity, program type, and provider type. Administrator, email, phone, and mailing-address fields are outside the selected projection. The dictionary is dated July 1, 2020, so current schema compatibility remains unverified and no row acquisition is admitted.

The immutable preflight receipt is independently verified under manifest SHA-256 `7ed4f71c446d390339174fd4109fd5696a0463cc747ae7a64b2d82bb42046638`. Zero provider rows, export POSTs, provider-detail requests, addresses, contacts, ZIP observations, or coordinates were acquired. Current operation, statewide completeness, current dictionary compatibility, ZIP validity, production admission, and current-pointer publication remain unclaimed or disabled.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,971,990,528 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, provider export, provider-row acquisition, production enrollment, credential operation, public export, or mutable source pointer write occurred. Plan 238 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-239 --expected-plan-sha256 486217ff5457ccde4efbd2f914470bcd10a3ad869c301525e6ec408415a1652f
```
