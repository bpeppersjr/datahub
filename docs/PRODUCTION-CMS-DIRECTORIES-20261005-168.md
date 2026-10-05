# Proposed retained-data production reconciliation — October 5, 2026

Plan 168 is a planning-only successor to Plan 167 after Co*Tive added a fail-closed, nonblocking readiness status for area outside selected 2020 Census ZCTA polygons in commit `4be28268b8612c193c37f40b2ba0d837c2b251f7`. No residual geometry was published, and the change does not alter the four retained reconciliation inputs. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-168`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-168.json`
- Plan confirmation SHA-256: `cb9e9cfd93e007f2122d6b96083a38cc86b75966579ece162e240fc8a047676b`
- Plan file SHA-256: `6b09a31b17e4c16c4869f4f0a93ac9a97bdf235182477d41ff322f725b02153b`
- Plan 167 predecessor confirmation SHA-256: `9875ed67e1640eed415fdb23f1c2eb3f67b4567318943e598cf8ff04c6863c5c`
- Plan 167 predecessor file SHA-256: `8da39c6ad2b5e3f2f2cfc2c1989bf51ff408266072664cf9e1596efe7142f17d`
- Implementation commit: `4be28268b8612c193c37f40b2ba0d837c2b251f7`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). The sources remain distinct and nonadditive; no current-operation claim or production authority is introduced.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` memory profile was selected; available disk was 144,041,050,112 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. Its immutable plan artifact is local and is not included in the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, residual-geometry publication, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 167 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-168 --expected-plan-sha256 cb9e9cfd93e007f2122d6b96083a38cc86b75966579ece162e240fc8a047676b
```
