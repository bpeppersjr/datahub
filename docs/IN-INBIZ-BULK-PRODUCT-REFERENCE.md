# Indiana INBiz bulk-product documentation reference

The November 13, 2026 reference remains **HOLD**. It preserves public documentation for Indiana Business Entity Bulk Data without verifying the current schema, resolving scope semantics, approving a connector or authorizing acquisition. Required source files and acquired records are both zero; every authority flag is false. No account, login, order, payment, contact or source-file request occurred in this workstream. The PDF was not retained.

## Evidence and uncertainty

The [INBiz bulk services page](https://inbiz.in.gov/Inbiz/BulkDataServices/Index) requires an INBiz account. It describes a file generated on the first of each month covering businesses registered by the previous month end. The download-and-updates option uses the same baseline with 12 months of access: $9,500 for the baseline and $500 per selected monthly update. Updates describe entity changes and new filings. These observations do not establish an unattended API, compatible schema or replay contract.

The [official regulatory analysis](https://www.in.gov/sos/business/files/Regulatory-Analysis-Business-Entity-Bulk-Data-Fees-LSA-25-155-OMB-2025-01R.pdf) describes an $8,000 one-time baseline, USB delivery, a $9,500 subscription baseline and $500 monthly differentials. Its all-registered narrative conflicts with active-only wording in the comparison table. Both claims remain recorded and unresolved. The analysis does not prove current order terms or final rule adoption; USB and download delivery also require clarification.

Retrieval observations supplied by the coordinating agent are explicitly attributed in the evidence JSON:

| Document | HTTP / type | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| INBiz page | 200 / text/html | 11,011 | `ed3b935285f5f551fe82e72d5ec3eb20b7c56b493d547f612001b20dcdca0fe4` |
| Regulatory analysis | 200 / application/pdf | 295,871 | `5aad275d271e21bc1399646b274e3420ef71c792372debbe78eed361cedc71ef` |

## Preserved boundaries

Qualifications from the immutable October assessment remain explicitly identified as prior evidence. General partnerships and sole proprietors are excluded from that registration scope. Registry standing and biennial reporting do not establish operating activity or complete statewide business coverage.

Principal-office addresses, registered-agent addresses and person-linked fields have distinct roles. Neither office nor agent filings independently prove an operating establishment. Keep ZIP5 and ZIP4 separate and suppressed or missing addresses unknown. Preserve the distinction between eligible residential-address suppression and CMRA disclosure; do not infer categorical CMRA withholding. The current redaction schema and person-free projection remain unverified.

Before any future connector or acquisition, resolve the scope conflict, schema and Business-ID lifecycle, status codebook, address roles, privacy, differential ordering/tombstones/corrections/replay, baseline compatibility, release counts and checksums, delivery terms, automation permission and intended-use rights. This reference grants none of those approvals.

## Local verification

The standalone evidence is `config/state-business-source-assessments/in-bulk-product-reference-2026-11-13.json`. The loader pins its file and canonical-content digests and rejects missing/extra fields, altered citations, scope resolution and authority escalation through immutable content verification. It only reads local evidence; no runtime operation or connector is registered.

```powershell
node --test runner/in-inbiz-bulk-product-reference.test.mjs
node scripts/verify-in-inbiz-bulk-product-reference.mjs
npx eslint runner/in-inbiz-bulk-product-reference.mjs runner/in-inbiz-bulk-product-reference.test.mjs scripts/verify-in-inbiz-bulk-product-reference.mjs
```

Tests confirm IN remains absent from the readiness wave and the October assessment retains SHA-256 `985bee2a6e3c1e46b01451c038f5336d1404d333c381f0b85d5148b73e9a99f7`. App code, the readiness wave, package scripts and prior assessments are unchanged. There is no migration or runtime behavior change. Rollback consists of reverting only the five standalone reference files added by this workstream; preserve the prior assessment and wave.
