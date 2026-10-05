# Proposed retained-data production reconciliation — October 5, 2026

Plan 172 is a planning-only successor to Plan 171 after Co*Tive exposed a bounded national overview of the retained 48,194-ZIP5 by 39-source-dimension evidence matrix in commit `5b19cdeb8bac563a482cb0b45f283d75625f7c5b`. The view validates the hash-pinned manifest, content identity, complete prefix descriptor inventory, and cell conservation without replaying the 691 MB release per request. Its percentages describe the retained evidence cohort, not an authoritative USPS denominator, active-business completeness, or additive industry totals. The four retained reconciliation inputs are unchanged. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-172`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-172.json`
- Plan confirmation SHA-256: `c1986b59c31c893a0bda643e3680d9371b69e2e025bd7fb14ca4c1791847b253`
- Plan file SHA-256: `49f1a4775eebff549f7edeff824a1eaf618079f75c02d425bdc542867bb23f45`
- Plan 171 predecessor confirmation SHA-256: `79e906ef68c2b88d3dff1b9558cf1d647c85bf3b8767fbf62db23b54878135d7`
- Plan 171 predecessor file SHA-256: `777e9f04d7da66df41d4c260a1ce7caf79cdb4b893b92464ab67145f89a76c29`
- Implementation commit: `5b19cdeb8bac563a482cb0b45f283d75625f7c5b`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). The sources remain distinct and nonadditive; no current-operation claim or production authority is introduced.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` memory profile was selected; available disk was 144,051,548,160 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. Its immutable plan artifact is local and is not included in the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 171 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-172 --expected-plan-sha256 c1986b59c31c893a0bda643e3680d9371b69e2e025bd7fb14ca4c1791847b253
```
