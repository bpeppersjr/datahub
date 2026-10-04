# Proposed retained-data production reconciliation — October 4, 2026

Plan 153 is a planning-only successor to Plan 152 after the national exact-ZIP industry evidence matrix v1.8 serialization correction commit `a1f1680`. It carries forward Plan 152's exact four retained selections. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261004-153`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-153.json`
- Plan confirmation SHA-256: `e915269c622cfac35f5c9fb68869cb8e92c922ff9cc94ee60c213f3d76984a19`
- Plan file SHA-256: `18ebec186ad9e33377aa64e58a624c75435207f16a71608f3fa2e50bf10df830`
- Plan 152 predecessor confirmation SHA-256: `889f287b8c1dbd663d4ada31311ed4e9847ee281a42c03fd2eb15bc3030a321e`
- Implementation commit: `a1f1680`

The exact four selection pins remain unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). These source-specific layers remain non-additive; no current-operation or all-business-completeness claim is introduced.

Exact-plan preflight returned `READY`, revalidated all four pins, reported eight stages (registry build/verify, resolution build/verify, benchmark build/verify, coverage build/verify), zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. The `national-12g` memory profile was selected; available disk was 156,117,786,624 bytes against a required floor of 13,309,329,011 bytes. The plan remains unapproved and unexecuted. Its local plan artifact is not included in Git. No acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 152 and earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-153 --expected-plan-sha256 e915269c622cfac35f5c9fb68869cb8e92c922ff9cc94ee60c213f3d76984a19
```
