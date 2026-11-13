# South Carolina Corporation Bulk Data contract and schema reference

The 2026-11-13 standalone reference preserves **HOLD**. It documents the paid corporation product and unresolved schema review; it supplies no connector, acquisition, registration, signature, payment or credential authorization. Required source files and acquired records remain zero. South Carolina remains absent from the current offline connector readiness wave, and the October assessment is unchanged.

## Documentary evidence

The [official subscriber agreement](https://scdgs.sc.gov/sites/scdgs/files/Documents/06252025_SC_Subscriber_Agreement.pdf) returned HTTP 200, `application/pdf`, 479,100 bytes, SHA256 `a3f57d654ff03902f7d186f314c792b349f5cfcdd2130c94f34156432ad8edba`. Its footer is Version 2.7, revised 07/19/2023; the URL filename does not establish a later document revision. The coordinating agent supplied the observations; this workstream retained no PDF.

The [current service page](https://scdgs.sc.gov/service/secretary-state-bulk-data-images-and-notary-registration) returned HTTP 200, 96,897 bytes, SHA256 `5826097688ca02daba9a3a38d29ea2e9df4e57e3933f6481e8073da4cac1c3ca`. It requires a completed and signed agreement with original signatures. The agreement documents Corporation Bulk Data at $12,000 per fiscal year plus a $125 subscriber fee, without proration or refunds. Monthly CSV archives `CORP_NAMES.ZIP`, `CORP_TXN.ZIP` and `CORPORATION.ZIP` are pushed on the fifth to the subscriber FTP endpoint. Registration, signature, ACH and transfer credentials are prerequisites; none is completed or authorized here.

Those exact filenames are product documentation, not an executable input manifest, field schema or completeness proof. `CORP_TXN.ZIP` does not establish a complete delta. New-filings and UCC are separate products. Secure transfer, retries, replay, deletions, corrections, release checksums and control totals remain unresolved.

The [business filings portal](https://businessfilings.sc.gov/) returned HTTP 200, 4,111 bytes, SHA256 `86a510c35b38e9ba0832b1f1fdc9a4ad760f0a357c8282bf9afaa81719b97401`. Good Standing concerns legal existence and does not establish current operation. The identity-verification notice concerns applicable online filing login; bulk-delivery applicability is unverified.

## Schema and policy boundaries

Current headers, field dictionary, key lifecycle, entity population, status codebook and address roles remain unverified. Any future permitted projection must keep ZIP5 and ZIP4 as separate strings and exclude registered-agent and person-linked fields until schema and privacy review. Registered-agent, registered-office or mailing addresses do not prove operating sites. Filing standing does not prove operating-establishment status or a statewide business denominator.

The reference records ownership, terms, documentary retention, attribution and unresolved redistribution rights. It grants no licensed source-data rights. Product-specific retention, transformation, derived commercial publication and redistribution require review. Every authority flag is false.

## Offline verification and change boundary

```powershell
node --test runner/sc-corporation-bulk-contract-schema-reference.test.mjs
node scripts/verify-sc-corporation-bulk-contract-schema-reference.mjs
npx eslint runner/sc-corporation-bulk-contract-schema-reference.mjs runner/sc-corporation-bulk-contract-schema-reference.test.mjs scripts/verify-sc-corporation-bulk-contract-schema-reference.mjs
```

The strict loader pins both file bytes and parsed content, rejecting missing fields, additional fields, altered citations or widened authority. Tests verify SC's absence from the current readiness wave and preserve the October assessment SHA256 `777044cc8a92a8cb4808855c9e119ee387a2c4a3f3141282666c3ab411393c3b`. Validation is local and read-only; no runtime download, cancellation or recovery behavior is claimed.

This adds five standalone evidence, loader, test, verifier and documentation files. It changes no app, package, wave, connector registration, production pointer or assessment. There is no migration; rollback removes those five files. New evidence requires a separately reviewed version with updated pins and tests.
