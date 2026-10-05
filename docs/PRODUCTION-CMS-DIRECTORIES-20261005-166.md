# Proposed retained-data production reconciliation — October 5, 2026

Plan 166 is a planning-only successor to Plan 165 after the governed Administration industry-maintenance selector and the clarified Census ZCTA/non-ZCTA industry-status presentation in commit `808985ae6f662fd75ce074289238a5ba330bcd59`. It carries forward exactly the same four retained input selections. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-166`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-166.json`
- Plan confirmation SHA-256: `739c7286146e3d7840e1d6e817dfaa3f098d9619f87f1d5154a565f6e45f5192`
- Plan file SHA-256: `fb2653625d242896b4fb221943ef55db7e2e25a9ab32d98a5bea956260f40adb`
- Plan 165 predecessor confirmation SHA-256: `60fcff8bb308386c32671446aecfd323ee9c3610fa4a08f4416f999027014466`
- Plan 165 predecessor file SHA-256: `ed34916688a68acf743a0429f3f81b7c7bb795633a0e5f5a23acb001b9244b29`
- Implementation commit: `808985ae6f662fd75ce074289238a5ba330bcd59`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). The sources remain distinct and nonadditive; no current-operation claim or production authority is introduced. The Administration selection is inert maintenance intent and does not change these plan inputs.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` memory profile was selected; available disk was 145,640,296,448 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. Its immutable plan artifact is local and is not included in the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 165 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-166 --expected-plan-sha256 739c7286146e3d7840e1d6e817dfaa3f098d9619f87f1d5154a565f6e45f5192
```
