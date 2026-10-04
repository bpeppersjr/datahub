# Proposed retained-data production reconciliation — October 4, 2026

Plan 145 is the planning-only successor prepared after benchmark label import workflow commit `cdbfe41`. It carries forward the exact four retained selections from Plan 144; it does not approve or start production work.

- Run ID: `production-cms-directories-20261004-145`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-145.json`
- Exact confirmation / plan SHA-256: `fcb4e7bc4c8fa42bb6f401eacb67db32e1d57e2fce0128a69146ec117436c3e9`
- Plan file SHA-256: `67939b8b9b6ecd4c66a1e630927bd72a74b33bc008296ea3376dca01f0b4b467`
- Planning repository commit: `cdbfe41b62dcc293e0152aa7d43e0dc96ab0593e`

The four selection pins exactly match Plan 144: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). Childcare reporting rows and Minnesota credentials remain distinct from unique businesses, physical sites, and verified current operations.

The plan contains eight retained-data stages: registry build and verification, entity-resolution build and verification, benchmark build and verification, and coverage-view build and verification. It uses the `national-12g` profile (`--max-old-space-size=12288`).

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. Available disk was 155,901,607,936 bytes against a required floor of 13,309,329,011 bytes. Preflight is read-only; no production run directory was created.

This document and plan are proposed, unapproved, and unexecuted. Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 144 and earlier plans or approvals are superseded without execution. Preparing and preflighting Plan 145 performed no source acquisition, network request, reconciliation stage, production pointer change, or production enrollment. The generated plan remains a local retained artifact and is not included in Git.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-145 --expected-plan-sha256 fcb4e7bc4c8fa42bb6f401eacb67db32e1d57e2fce0128a69146ec117436c3e9
```
