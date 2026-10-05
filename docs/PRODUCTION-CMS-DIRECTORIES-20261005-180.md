# Proposed retained-data production reconciliation — October 5, 2026

Plan 180 is a planning-only successor to Plan 179 after Co*Tive exposed publisher-status meaning beside every mapped national industry dimension in commit `a84c71741cdd23623c8775231f33b12d88308bf0`. The national view now distinguishes 22 dimensions with publisher-defined current status, eight non-active-reporting dimensions, and nine unmapped dimensions, while preserving that publisher-defined current does not verify general business operation. Each mapped row also displays its exact publisher status term. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-180`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-180.json`
- Plan confirmation SHA-256: `e439df539f78cddbf62c3cf49178898578c1c75d915ff62b8dbe4bccae9027f8`
- Plan file SHA-256: `16b29d724b7eff1c50db5e01b1efe2ab9eaf4a76877e3c77aa7da7ce919ba03e`
- Plan 179 predecessor confirmation SHA-256: `5e8f73248e7f35ffe79ded214731cfe2355cc006eb2e980691358324b9d1d9aa`
- Plan 179 predecessor file SHA-256: `26a8a618fcab904e1dafb96f9ff9d14d5dc94d1f3934a0feb16d2c6f1613fc1b`
- Implementation commit: `a84c71741cdd23623c8775231f33b12d88308bf0`

The four retained-input selection pins are unchanged from Plan 179. They remain separate and nonadditive, and introduce no current-operation, resolved-identity, missing-business, or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 143,768,821,760 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 179 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-180 --expected-plan-sha256 e439df539f78cddbf62c3cf49178898578c1c75d915ff62b8dbe4bccae9027f8
```
