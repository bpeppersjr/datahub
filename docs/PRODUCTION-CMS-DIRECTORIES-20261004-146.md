# Proposed retained-data production reconciliation — October 4, 2026

Plan 146 is the planning-only successor prepared after benchmark label finalization commit `580bb10`. It carries forward the exact four retained selections from Plan 145; it does not approve or start production work.

- Run ID: `production-cms-directories-20261004-146`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-146.json`
- Exact confirmation / plan SHA-256: `7d4ddead92e0929685f798832a60d0e1c6366e93cebb75c19e6a0de65eb44519`
- Plan file SHA-256: `02141068d70f3c8fda9af043e756f3ba4e05b10cd3fe3acbc1f5f3d8cc3c5cc8`
- Planning repository commit: `580bb100038938da4ab28d0de6b881ec3f327510`

The four selection pins exactly match Plan 145: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). Childcare reporting rows and Minnesota credentials remain distinct from unique businesses, physical sites, and verified current operations.

The plan contains eight retained-data stages: registry build and verification, entity-resolution build and verification, benchmark build and verification, and coverage-view build and verification. It uses the `national-12g` profile (`--max-old-space-size=12288`).

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. Available disk was 162,066,550,784 bytes against a required floor of 13,309,329,011 bytes. Preflight is read-only; no production run directory was created.

This document and plan are proposed, unapproved, and unexecuted. Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 145 and earlier plans or approvals are superseded without execution. Preparing and preflighting Plan 146 performed no source acquisition, network request, reconciliation stage, production pointer change, or production enrollment. The generated plan remains a local retained artifact and is not included in Git.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-146 --expected-plan-sha256 7d4ddead92e0929685f798832a60d0e1c6366e93cebb75c19e6a0de65eb44519
```
