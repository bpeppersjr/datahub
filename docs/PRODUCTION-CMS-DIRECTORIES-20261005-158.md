# Proposed retained-data production reconciliation — October 5, 2026

Plan 158 is a planning-only successor to Plan 157 after the lifecycle evidence binding in commit `fd79d11b0879f8a7bd7e55372ead3f12fabdb257`. It carries forward exactly the same four retained selections and does not change their scope. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-158`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-158.json`
- Plan confirmation SHA-256: `8f78623a26b83821926fa6db13f03ef05db18faf36d6e2be743a051e32377292`
- Plan file SHA-256: `1cb9d9f34357cb705660f704c77ae3939df367c154c64999765b8d8717f5ecf2`
- Plan 157 predecessor confirmation SHA-256: `a9166264f2310fe42499ff79392b509c6e2c34078219f46e4cef4050fb497359`
- Plan 157 predecessor file SHA-256: `74213407e5b538c1c82c33187de5b9d2bd59220e2b62b2ada07ba67743b1963a`
- Implementation commit: `fd79d11b0879f8a7bd7e55372ead3f12fabdb257`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). Each source remains separate, source-bounded, and nonadditive. Lifecycle evidence remains a qualification layer only: it does not establish current operation, change source authority, or alter the selected reconciliation inputs.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight registry/resolution/benchmark/coverage build-and-verify stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 151,379,259,392 bytes against the 13,309,329,011-byte requirement. The plan is unapproved and unexecuted. Its immutable plan artifact remains a local retained artifact and is not part of the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 157 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-158 --expected-plan-sha256 8f78623a26b83821926fa6db13f03ef05db18faf36d6e2be743a051e32377292
```
