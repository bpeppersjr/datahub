# Proposed retained-data production reconciliation — October 5, 2026

Plan 169 is a planning-only successor to Plan 168 after Co*Tive added an exact retained-access-evidence percentage and temporal-review distribution for every operational industry in commit `9d57193af606cd340d094dcce675890feedc239a`. The percentage uses the fixed 51-jurisdiction state/DC scope and is explicitly not a percentage of businesses or nationwide industry completeness. The four retained reconciliation inputs are unchanged. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-169`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-169.json`
- Plan confirmation SHA-256: `0b7d643dd3eb3bfab35c5f1dd6b0f4c2e27bf475ee260cff62f4f4bee38c3927`
- Plan file SHA-256: `ca4f0eafef3aab970702d36ba4590dff355fd6262d0e866185543f29f149b975`
- Plan 168 predecessor confirmation SHA-256: `cb9e9cfd93e007f2122d6b96083a38cc86b75966579ece162e240fc8a047676b`
- Plan 168 predecessor file SHA-256: `6b09a31b17e4c16c4869f4f0a93ac9a97bdf235182477d41ff322f725b02153b`
- Implementation commit: `9d57193af606cd340d094dcce675890feedc239a`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). The sources remain distinct and nonadditive; no current-operation claim or production authority is introduced.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` memory profile was selected; available disk was 144,067,158,016 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. Its immutable plan artifact is local and is not included in the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 168 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-169 --expected-plan-sha256 0b7d643dd3eb3bfab35c5f1dd6b0f4c2e27bf475ee260cff62f4f4bee38c3927
```
