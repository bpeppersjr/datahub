# Proposed retained-data production reconciliation — October 5, 2026

Plan 167 is a planning-only successor to Plan 166 after the maintained-industry selection was connected to explicit collection planning and the verified 51-jurisdiction by nine-operational-industry evidence summary in commit `0d6621f7c6131241186f863de9de5f7cdfa38442`. It carries forward exactly the same four retained input selections. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-167`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-167.json`
- Plan confirmation SHA-256: `9875ed67e1640eed415fdb23f1c2eb3f67b4567318943e598cf8ff04c6863c5c`
- Plan file SHA-256: `8da39c6ad2b5e3f2f2cfc2c1989bf51ff408266072664cf9e1596efe7142f17d`
- Plan 166 predecessor confirmation SHA-256: `739c7286146e3d7840e1d6e817dfaa3f098d9619f87f1d5154a565f6e45f5192`
- Plan 166 predecessor file SHA-256: `fb2653625d242896b4fb221943ef55db7e2e25a9ab32d98a5bea956260f40adb`
- Implementation commit: `0d6621f7c6131241186f863de9de5f7cdfa38442`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). The sources remain distinct and nonadditive; no current-operation claim or production authority is introduced. The Administration selection supplies an explicit collection-planning default only and does not change these reconciliation inputs.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` memory profile was selected; available disk was 144,320,434,176 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. Its immutable plan artifact is local and is not included in the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 166 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-167 --expected-plan-sha256 9875ed67e1640eed415fdb23f1c2eb3f67b4567318943e598cf8ff04c6863c5c
```
