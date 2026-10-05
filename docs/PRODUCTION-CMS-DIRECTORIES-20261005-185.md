# Proposed retained-data production reconciliation — October 5, 2026

Plan 185 is a planning-only successor to Plan 184 after Co*Tive published a pointer-free governed state exact-ZIP industry evidence roll-up in commit `33b41eb6570fc7d3077610ec80e1cfe13c5426d0`. The release binds the exact-ZIP matrix, cohort, temporal qualification, and Census ZCTA jurisdiction crosswalk by SHA-256; conserves 48,194 ZIP keys and 1,879,566 evidence cells; and preserves material cross-state, unresolved-overlay, non-ZCTA, placeholder, and territory scopes without silently assigning them to a state. State Completion displays this 39-dimension evidence separately from its 8/11-dataset availability denominator. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-185`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-185.json`
- Plan confirmation SHA-256: `8e17e8374b5e91df26d478877dde392462ab6185d4e96f514cd906bb4e3719cc`
- Plan file SHA-256: `6e61fd852b9fbe553821ffd8180acd0f7d56f1ffe9c38ff010c31c9ec2e67d9f`
- Plan 184 predecessor confirmation SHA-256: `2475fb44e4e6d17c1eee2a4f2888b47cd7d099e87dbb103dbc91a821f410aec7`
- Plan 184 predecessor file SHA-256: `415303bf4f55ba8f9052d1e51ada2bb1cbb01357c605aa5bcf4b9cc02d431c5e`
- Implementation commit: `33b41eb6570fc7d3077610ec80e1cfe13c5426d0`

The four retained-input selection pins are unchanged from Plan 184. They remain separate and nonadditive, and introduce no current-operation, resolved-identity, missing-business, or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 143,613,562,880 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 184 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-185 --expected-plan-sha256 8e17e8374b5e91df26d478877dde392462ab6185d4e96f514cd906bb4e3719cc
```
