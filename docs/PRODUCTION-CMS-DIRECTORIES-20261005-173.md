# Proposed retained-data production reconciliation — October 5, 2026

Plan 173 is a planning-only successor to Plan 172 after Co*Tive bound the national exact-ZIP overview to the immutable geography cohort and exposed 33,791 same-code Census ZCTA keys alongside 14,403 retained ZIP5 keys without a same-code Census polygon in commit `bc20d3d0a16a50fafc2146cc55cec8e89c255b66`. The non-ZCTA cohort remains separated into 14,361 source-contributed keys, 41 denominator-only keys, and the explicit `00000` placeholder; it is not classified as invalid postal geography. The four retained reconciliation inputs are unchanged. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-173`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-173.json`
- Plan confirmation SHA-256: `4fabc19859f0afdfd8d3104e987274f1238cb9a785d12eac25b7008e2797a531`
- Plan file SHA-256: `f5cfd78f8325c6c19b0fc9c0c196b5929958c73c870da9eabe067edd404657d9`
- Plan 172 predecessor confirmation SHA-256: `c1986b59c31c893a0bda643e3680d9371b69e2e025bd7fb14ca4c1791847b253`
- Plan 172 predecessor file SHA-256: `49f1a4775eebff549f7edeff824a1eaf618079f75c02d425bdc542867bb23f45`
- Implementation commit: `bc20d3d0a16a50fafc2146cc55cec8e89c255b66`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). The sources remain distinct and nonadditive; no current-operation claim or production authority is introduced.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` memory profile was selected; available disk was 144,040,579,072 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. Its immutable plan artifact is local and is not included in the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 172 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-173 --expected-plan-sha256 4fabc19859f0afdfd8d3104e987274f1238cb9a785d12eac25b7008e2797a531
```
