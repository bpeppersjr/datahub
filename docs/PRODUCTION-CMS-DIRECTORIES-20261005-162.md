# Proposed retained-data production reconciliation — October 5, 2026

Plan 162 is a planning-only successor to Plan 161 after the reporting-only site policy-provenance correction in commit `ff1332fa0f60662d563ca5c1a0898e8ebc37c82d`. It carries forward exactly the same four retained selections without changing their scope. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-162`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-162.json`
- Plan confirmation SHA-256: `a20369df4cb51a193d7c792418b600bd70f1ae283ca93789fd4476c9886856eb`
- Plan file SHA-256: `f7aef03a662797cbf524269e66dd5a4f4b9fdb9fb6ea3025b6798c28a028b1fa`
- Plan 161 predecessor confirmation SHA-256: `a56702b8ee33feba6bb4bfa224234a8d5ad7fa2902fa2f9afbdcea3d4703a15e`
- Plan 161 predecessor file SHA-256: `86f00e323277b3b0623c2474e57373a0d251143a332bbb181e4185de9c6a5155`
- Implementation commit: `ff1332fa0f60662d563ca5c1a0898e8ebc37c82d`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). These sources remain separate, source-bounded, and nonadditive. The reporting-only cohort remains outside the selected reconciliation inputs and does not establish operation or production authority.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 148,118,212,608 bytes against the 13,309,329,011-byte requirement. The plan is unapproved and unexecuted. Its immutable plan artifact remains local and is not included in the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 161 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-162 --expected-plan-sha256 a20369df4cb51a193d7c792418b600bd70f1ae283ca93789fd4476c9886856eb
```
