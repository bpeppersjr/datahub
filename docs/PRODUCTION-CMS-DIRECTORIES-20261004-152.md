# Proposed retained-data production reconciliation — October 4, 2026

Plan 152 is a planning-only successor to Plan 151 after the status-derived ZIP industry measure and v1.7 provenance correction commit `21a14fe1447c164beed902e4125abcffb7fec52e`. It carries forward Plan 151's exact four retained selections. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261004-152`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-152.json`
- Plan confirmation SHA-256: `889f287b8c1dbd663d4ada31311ed4e9847ee281a42c03fd2eb15bc3030a321e`
- Plan file SHA-256: `6abf5fb5af4c632307e6611d84ec9ece76cffead88525bb4ab799730adb20ce1`
- Plan 151 predecessor confirmation SHA-256: `e0da2d3cdeff0118b42423af5631696a6afd0968a1b0a6b408d2fc2155fb2fdc`
- Implementation commit: `21a14fe1447c164beed902e4125abcffb7fec52e`

The exact four selection pins remain unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). These evidence layers remain source-specific and non-additive; no current-operation or all-business-completeness claim is introduced.

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages—registry build/verify, resolution build/verify, benchmark build/verify, and coverage build/verify—zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. The `national-12g` memory profile was selected; available disk was 157,871,575,040 bytes against a required floor of 13,309,329,011 bytes. This plan is unapproved and unexecuted. Its local plan artifact is not included in Git. No acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 151 and earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-152 --expected-plan-sha256 889f287b8c1dbd663d4ada31311ed4e9847ee281a42c03fd2eb15bc3030a321e
```
