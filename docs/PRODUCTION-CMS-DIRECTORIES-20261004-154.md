# Proposed retained-data production reconciliation — October 4, 2026

Plan 154 is a planning-only successor to Plan 153 after the exact-ZIP industry temporal-qualification view commit `fe9e0d6`. It carries forward the same four retained selections without changing their scope. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261004-154`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-154.json`
- Plan confirmation SHA-256: `d4cf2b5646cb45b19695a6871f166af71ae1492dc197b4ca6e1a9631ec064116`
- Plan file SHA-256: `cf4107f3699c28bc32a7299ddf7f43e16ed438801e28fc0890ac1e9444469dae`
- Plan 153 predecessor confirmation SHA-256: `e915269c622cfac35f5c9fb68869cb8e92c922ff9cc94ee60c213f3d76984a19`
- Implementation commit: `fe9e0d6`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). These layers remain source-specific and non-additive; no current-operation or all-business-completeness claim is introduced.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight registry/resolution/benchmark/coverage build-and-verify stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 156,040,597,504 bytes against the 13,309,329,011-byte requirement. The plan is unapproved and unexecuted. Its local plan artifact is not included in Git. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 153 and earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-154 --expected-plan-sha256 d4cf2b5646cb45b19695a6871f166af71ae1492dc197b4ca6e1a9631ec064116
```
