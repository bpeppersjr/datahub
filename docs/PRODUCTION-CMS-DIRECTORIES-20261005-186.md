# Proposed retained-data production reconciliation — October 5, 2026

Plan 186 is a planning-only successor to Plan 185 after Co*Tive added an opt-in exact-ZIP source-evidence choropleth to State Completion in commit `9e96e07d8675f037f3597f4a2dbac67a049b8a77`. Dataset availability remains the default. The evidence mode offers all 39 retained source dimensions and maps the share of governed state-assigned same-code ZCTA keys with positive retained source evidence; it explicitly excludes territories and unresolved/non-ZCTA scopes from state heat and does not claim completion, business share, or verified current operation. The immutable state roll-up release remains unchanged. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-186`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-186.json`
- Plan confirmation SHA-256: `86a5f87cf3a003044c20f5d8b1bac5ecb5cb95e838a9cd06782a5f5daa1dd145`
- Plan file SHA-256: `c0300958f77ac4976b23bd098ade17c37fb3d6b640700086739733a289dc05a7`
- Plan 185 predecessor confirmation SHA-256: `8e17e8374b5e91df26d478877dde392462ab6185d4e96f514cd906bb4e3719cc`
- Plan 185 predecessor file SHA-256: `6e61fd852b9fbe553821ffd8180acd0f7d56f1ffe9c38ff010c31c9ec2e67d9f`
- Implementation commit: `9e96e07d8675f037f3597f4a2dbac67a049b8a77`

The four retained-input selection pins are unchanged from Plan 185. They remain separate and nonadditive, and introduce no current-operation, resolved-identity, missing-business, or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 141,093,081,088 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 185 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-186 --expected-plan-sha256 86a5f87cf3a003044c20f5d8b1bac5ecb5cb95e838a9cd06782a5f5daa1dd145
```
