# Proposed retained-data production reconciliation — October 5, 2026

Plan 164 is a planning-only successor to Plan 163 after the governed flat-business export was hardened in commit `b7c4931855c5f03479850d2b95b0ba6ae9ee3b52`. It carries forward exactly the four selected inputs from Plan 163. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-164`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-164.json`
- Plan confirmation SHA-256: `56f25c73910a219b6ff46a9d2cec36958a15c9007a88f00dc3b2bdf926ac86c8`
- Plan file SHA-256: `38f9271f3dc8d5408e5143ac48956e7338f452416bcefde64b12c3f0936801b1`
- Plan 163 predecessor confirmation SHA-256: `64bde08a3624c81a26c164883c9b3b044deb498a40b3ff7751bb05912bc9c2ff`
- Plan 163 predecessor file SHA-256: `d9d9725d5727b83f3bfa6724a76a88bb368425440d032c7dbb721d6be485bd86`
- Implementation commit: `b7c4931855c5f03479850d2b95b0ba6ae9ee3b52`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). The sources remain distinct and nonadditive; no current-operation claim or production authority is introduced.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` memory profile was selected; available disk was 147,111,567,360 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. Its immutable plan artifact is local and is not included in the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 163 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-164 --expected-plan-sha256 56f25c73910a219b6ff46a9d2cec36958a15c9007a88f00dc3b2bdf926ac86c8
```
