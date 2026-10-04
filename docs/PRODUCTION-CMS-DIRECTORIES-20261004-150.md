# Proposed retained-data production reconciliation — October 4, 2026

Plan 150 is a planning-only successor to Plan 149 after the governed national objective-readiness API/UI commit `bec805f`. It carries forward Plan 149's exact four retained selections. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261004-150`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-150.json`
- Plan confirmation SHA-256: `91e5c3a26d4b86c7e6c92be30d2e08b626727c8b688d7a853dbec8098a0a3eeb`
- Plan file SHA-256: `5970cb7f1311a2d1c6d4b04dc460c59664915430f4177fa1dd46efbd202fcb9`
- Planning repository commit: `bec805f`
- Plan 149 predecessor confirmation SHA-256: `4113bd1dcd8a399b40f27c319a8c041cb1ef94c6351b57f3f18acf39007d9382`

The exact four selection pins remain unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). These evidence layers remain source-specific and non-additive; no current-operation or all-business-completeness claim is introduced.

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. The `national-12g` memory profile was selected; available disk was 160,184,807,424 bytes against a required floor of 13,309,329,011 bytes. This plan is unapproved and unexecuted. Its local plan artifact is not included in Git. No acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 149 and earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-150 --expected-plan-sha256 91e5c3a26d4b86c7e6c92be30d2e08b626727c8b688d7a853dbec8098a0a3eeb
```
